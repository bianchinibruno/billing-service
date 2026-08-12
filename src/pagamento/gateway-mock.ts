import type {
  GatewayPagamento,
  PedidoCobranca,
  ResultadoCobranca,
} from './gateway.js';

// Gateway de pagamento simulado. Existe para dar controle total sobre os
// cenários que um gateway real não deixa provocar sob demanda: falha de
// cobrança, retry, cobrança duplicada. É onde mora o valor de QA deste projeto.
//
// Duas garantias importantes:
// 1. Idempotência: a mesma idempotencyKey nunca gera dois débitos — retornar o
//    resultado da primeira cobrança. É o comportamento que um gateway sério tem
//    e que o serviço de billing depende para tornar o retry seguro.
// 2. Contagem de débitos: o mock registra quantas cobranças de fato aconteceram,
//    para os testes provarem que um retry não debitou duas vezes.
export class GatewayMock implements GatewayPagamento {
  private porChave = new Map<string, ResultadoCobranca>();
  private contadorRef = 0;
  private recusarProxima = false;

  // Total de débitos efetivamente realizados (chaves distintas cobradas).
  // Um retry com a mesma chave não incrementa — é o que o teste verifica.
  debitosRealizados = 0;

  // Configura a próxima cobrança (de chave nova) para ser recusada. Usado nos
  // testes de falha de pagamento.
  recusarProximaCobranca(): void {
    this.recusarProxima = true;
  }

  async cobrar(pedido: PedidoCobranca): Promise<ResultadoCobranca> {
    const existente = this.porChave.get(pedido.idempotencyKey);
    if (existente) {
      // Idempotência: mesma chave, mesmo resultado, sem novo débito.
      return existente;
    }

    const status = this.recusarProxima ? 'recusada' : 'aprovada';
    this.recusarProxima = false;

    const resultado: ResultadoCobranca = {
      gatewayRef: `ch_${++this.contadorRef}`,
      status,
    };
    this.porChave.set(pedido.idempotencyKey, resultado);
    if (status === 'aprovada') {
      this.debitosRealizados += 1;
    }
    return resultado;
  }
}
