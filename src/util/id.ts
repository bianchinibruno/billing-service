let contador = 0;

// Gerador de id simples e determinístico por processo, suficiente para memória e
// testes. Uma implementação com Postgres usaria uuid do banco.
export function novoId(prefixo: string): string {
  contador += 1;
  return `${prefixo}_${contador}`;
}
