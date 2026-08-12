// Contrato do gateway de pagamento. O serviço de billing depende só disto; o
// mock (testes/dev) e um futuro adaptador de gateway real (Stripe, etc.) são
// intercambiáveis.

export interface PedidoCobranca {
  // Chave de idempotência estável para esta cobrança. O gateway garante que a
  // mesma chave não gera dois débitos — é o que torna o retry seguro.
  idempotencyKey: string;
  valorCentavos: number;
}

export type StatusCobranca = 'aprovada' | 'recusada';

export interface ResultadoCobranca {
  gatewayRef: string;
  status: StatusCobranca;
}

export interface GatewayPagamento {
  cobrar(pedido: PedidoCobranca): Promise<ResultadoCobranca>;
}
