import type { Assinatura, Cliente, Fatura, Plano } from '../dominio/tipos.js';

// Interface do repositório. O serviço depende só disto — a implementação em
// memória (testes, dev) e uma futura em Postgres (produção) são
// intercambiáveis sem tocar na regra de negócio.
export interface Repositorio {
  salvarPlano(plano: Plano): Promise<void>;
  obterPlano(id: string): Promise<Plano | undefined>;

  salvarCliente(cliente: Cliente): Promise<void>;
  obterCliente(id: string): Promise<Cliente | undefined>;

  salvarAssinatura(assinatura: Assinatura): Promise<void>;
  obterAssinatura(id: string): Promise<Assinatura | undefined>;

  salvarFatura(fatura: Fatura): Promise<void>;
  obterFatura(id: string): Promise<Fatura | undefined>;

  // Registro de idempotência de webhooks: marca um eventId como processado e
  // responde se ele já havia sido processado antes. A operação é atômica por
  // contrato — é o que impede um webhook reentregue de aplicar o efeito duas
  // vezes.
  registrarEventoSeNovo(eventId: string): Promise<boolean>;
}
