// Modelo de domínio do billing-service. Valores monetários sempre em centavos
// (inteiro) — dinheiro em ponto flutuante é fonte garantida de erro de
// arredondamento.

export type Intervalo = 'mensal' | 'anual';

export interface Plano {
  id: string;
  nome: string;
  valorCentavos: number;
  intervalo: Intervalo;
}

export interface Cliente {
  id: string;
  nome: string;
}

export type StatusAssinatura = 'ativa' | 'inadimplente' | 'cancelada';

export interface Assinatura {
  id: string;
  clienteId: string;
  planoId: string;
  status: StatusAssinatura;
  criadaEm: string;
}

export type StatusFatura = 'aberta' | 'paga' | 'falha';

export interface Fatura {
  id: string;
  assinaturaId: string;
  valorCentavos: number;
  status: StatusFatura;
  gatewayRef?: string;
  criadaEm: string;
}
