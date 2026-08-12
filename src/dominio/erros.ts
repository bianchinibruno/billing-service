// Erros de domínio com código estável. O código (não a mensagem) é o contrato
// que os testes e a camada HTTP verificam — mensagem muda, código não.

export type CodigoErro =
  | 'PLANO_NAO_ENCONTRADO'
  | 'CLIENTE_NAO_ENCONTRADO'
  | 'ASSINATURA_NAO_ENCONTRADA'
  | 'FATURA_NAO_ENCONTRADA'
  | 'ENTRADA_INVALIDA';

export class ErroDominio extends Error {
  constructor(
    readonly codigo: CodigoErro,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroDominio';
  }
}
