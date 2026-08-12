import { ErroDominio } from '../dominio/erros.js';
import type {
  Assinatura,
  Cliente,
  Fatura,
  Intervalo,
  Plano,
} from '../dominio/tipos.js';
import type { GatewayPagamento } from '../pagamento/gateway.js';
import type { Repositorio } from '../repositorio/repositorio.js';
import { novoId } from '../util/id.js';

export interface EventoWebhook {
  eventId: string;
  tipo: 'pagamento.aprovado' | 'pagamento.recusado';
  faturaId: string;
  gatewayRef?: string;
}

// Serviço de billing: os casos de uso. Depende de interfaces (Repositorio,
// GatewayPagamento), nunca de implementações concretas.
export class ServicoBilling {
  constructor(
    private readonly repo: Repositorio,
    private readonly gateway: GatewayPagamento,
  ) {}

  async criarPlano(nome: string, valorCentavos: number, intervalo: Intervalo): Promise<Plano> {
    if (!nome?.trim()) throw new ErroDominio('ENTRADA_INVALIDA', 'nome é obrigatório');
    if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
      throw new ErroDominio('ENTRADA_INVALIDA', 'valorCentavos deve ser inteiro positivo');
    }
    const plano: Plano = { id: novoId('plano'), nome, valorCentavos, intervalo };
    await this.repo.salvarPlano(plano);
    return plano;
  }

  async criarCliente(nome: string): Promise<Cliente> {
    if (!nome?.trim()) throw new ErroDominio('ENTRADA_INVALIDA', 'nome é obrigatório');
    const cliente: Cliente = { id: novoId('cli'), nome };
    await this.repo.salvarCliente(cliente);
    return cliente;
  }

  // Assina um cliente a um plano: cria a assinatura ativa e a primeira fatura em
  // aberto, no valor do plano.
  async assinar(clienteId: string, planoId: string): Promise<{ assinatura: Assinatura; fatura: Fatura }> {
    const cliente = await this.repo.obterCliente(clienteId);
    if (!cliente) throw new ErroDominio('CLIENTE_NAO_ENCONTRADO', `cliente ${clienteId} não existe`);
    const plano = await this.repo.obterPlano(planoId);
    if (!plano) throw new ErroDominio('PLANO_NAO_ENCONTRADO', `plano ${planoId} não existe`);

    const agora = new Date().toISOString();
    const assinatura: Assinatura = {
      id: novoId('assin'),
      clienteId,
      planoId,
      status: 'ativa',
      criadaEm: agora,
    };
    const fatura: Fatura = {
      id: novoId('fat'),
      assinaturaId: assinatura.id,
      valorCentavos: plano.valorCentavos,
      status: 'aberta',
      criadaEm: agora,
    };
    await this.repo.salvarAssinatura(assinatura);
    await this.repo.salvarFatura(fatura);
    return { assinatura, fatura };
  }

  // Cobra uma fatura. É idempotente por construção:
  // - se a fatura já está paga, retorna sem tocar no gateway (o retry é no-op);
  // - a chave de idempotência da cobrança é o próprio id da fatura, então mesmo
  //   que a chamada chegue duas vezes ao gateway, ele não debita duas vezes.
  async cobrarFatura(faturaId: string): Promise<Fatura> {
    const fatura = await this.repo.obterFatura(faturaId);
    if (!fatura) throw new ErroDominio('FATURA_NAO_ENCONTRADA', `fatura ${faturaId} não existe`);

    if (fatura.status === 'paga') {
      return fatura;
    }

    const resultado = await this.gateway.cobrar({
      idempotencyKey: fatura.id,
      valorCentavos: fatura.valorCentavos,
    });

    if (resultado.status === 'aprovada') {
      fatura.status = 'paga';
      fatura.gatewayRef = resultado.gatewayRef;
      await this.repo.salvarFatura(fatura);
      await this.moverAssinatura(fatura.assinaturaId, 'ativa');
    } else {
      fatura.status = 'falha';
      await this.repo.salvarFatura(fatura);
      await this.moverAssinatura(fatura.assinaturaId, 'inadimplente');
    }
    return fatura;
  }

  // Processa um webhook do gateway. Idempotente em duas camadas:
  // - dedup por eventId: um evento reentregue não é processado de novo;
  // - checagem de estado: um evento que confirma o que a fatura já reflete não
  //   muda nada. As duas juntas tornam a reentrega de webhook segura.
  async processarWebhook(evento: EventoWebhook): Promise<{ duplicado: boolean }> {
    if (!evento.eventId?.trim()) {
      throw new ErroDominio('ENTRADA_INVALIDA', 'eventId é obrigatório');
    }
    const novo = await this.repo.registrarEventoSeNovo(evento.eventId);
    if (!novo) {
      return { duplicado: true };
    }

    const fatura = await this.repo.obterFatura(evento.faturaId);
    if (!fatura) throw new ErroDominio('FATURA_NAO_ENCONTRADA', `fatura ${evento.faturaId} não existe`);

    if (fatura.status === 'paga') {
      // Já está no estado final; o webhook não tem o que fazer.
      return { duplicado: false };
    }

    if (evento.tipo === 'pagamento.aprovado') {
      fatura.status = 'paga';
      fatura.gatewayRef = evento.gatewayRef;
      await this.repo.salvarFatura(fatura);
      await this.moverAssinatura(fatura.assinaturaId, 'ativa');
    } else {
      fatura.status = 'falha';
      await this.repo.salvarFatura(fatura);
      await this.moverAssinatura(fatura.assinaturaId, 'inadimplente');
    }
    return { duplicado: false };
  }

  private async moverAssinatura(assinaturaId: string, status: Assinatura['status']): Promise<void> {
    const assinatura = await this.repo.obterAssinatura(assinaturaId);
    if (!assinatura) return;
    assinatura.status = status;
    await this.repo.salvarAssinatura(assinatura);
  }
}
