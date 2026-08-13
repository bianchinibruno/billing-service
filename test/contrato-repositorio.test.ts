import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { RepositorioMemoria } from '../src/repositorio/memoria.js';
import { RepositorioPostgres, aplicarSchema } from '../src/repositorio/postgres.js';
import type { Repositorio } from '../src/repositorio/repositorio.js';

// Um contrato, duas implementações. Estas asserções rodam idênticas contra a
// versão em memória (sempre) e contra Postgres (quando DATABASE_URL está
// setada). Se uma implementação divergir da outra, o mesmo teste pega — é o que
// dá confiança de trocar memória por banco sem mudar a regra de negócio.

const DATABASE_URL = process.env.DATABASE_URL;

function contrato(nome: string, criar: () => Promise<Repositorio>, limpar?: () => Promise<void>) {
  describe(`contrato do repositório — ${nome}`, () => {
    let repo: Repositorio;

    beforeEach(async () => {
      if (limpar) await limpar();
      repo = await criar();
    });

    it('salva e obtém um plano com round-trip dos campos', async () => {
      await repo.salvarPlano({ id: 'plano_1', nome: 'Pro', valorCentavos: 4990, intervalo: 'mensal' });
      const p = await repo.obterPlano('plano_1');
      expect(p?.nome).toBe('Pro');
      expect(p?.valorCentavos).toBe(4990);
      expect(p?.intervalo).toBe('mensal');
    });

    it('obter registro inexistente retorna undefined', async () => {
      expect(await repo.obterPlano('nao_existe')).toBeUndefined();
      expect(await repo.obterFatura('nao_existe')).toBeUndefined();
    });

    it('salva e atualiza uma fatura (aberta -> paga)', async () => {
      await repo.salvarPlano({ id: 'plano_2', nome: 'X', valorCentavos: 100, intervalo: 'mensal' });
      await repo.salvarCliente({ id: 'cli_2', nome: 'Ana' });
      await repo.salvarAssinatura({
        id: 'assin_2',
        clienteId: 'cli_2',
        planoId: 'plano_2',
        status: 'ativa',
        criadaEm: new Date().toISOString(),
      });
      await repo.salvarFatura({
        id: 'fat_2',
        assinaturaId: 'assin_2',
        valorCentavos: 100,
        status: 'aberta',
        criadaEm: new Date().toISOString(),
      });

      const f = await repo.obterFatura('fat_2');
      expect(f?.status).toBe('aberta');
      expect(f?.valorCentavos).toBe(100);

      await repo.salvarFatura({ ...f!, status: 'paga', gatewayRef: 'ch_1' });
      const f2 = await repo.obterFatura('fat_2');
      expect(f2?.status).toBe('paga');
      expect(f2?.gatewayRef).toBe('ch_1');
    });

    it('registrarEventoSeNovo: primeira vez true, repetida false', async () => {
      expect(await repo.registrarEventoSeNovo('evt_1')).toBe(true);
      expect(await repo.registrarEventoSeNovo('evt_1')).toBe(false);
    });
  });
}

// Em memória: sempre. Cada teste recebe uma instância limpa.
contrato('memória', async () => new RepositorioMemoria());

// Postgres: só quando DATABASE_URL está setada (no CI, contra um Postgres real;
// localmente, via docker-compose). Sem ela, este bloco é pulado, e os testes
// unitários seguem verdes sem exigir Docker.
describe.skipIf(!DATABASE_URL)('driver postgres', () => {
  let pool: Pool;
  let repo: RepositorioPostgres;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await aplicarSchema(pool);
    repo = new RepositorioPostgres(pool);
  });
  afterAll(async () => {
    if (pool) await pool.end();
  });

  const limpar = async () => {
    await pool.query('truncate faturas, assinaturas, clientes, planos, eventos_processados cascade');
  };

  contrato('postgres', async () => repo, limpar);

  it('dedup de webhook sob concorrência: exatamente um insert vence', async () => {
    await limpar();
    // 20 tentativas concorrentes de registrar o MESMO evento. Só uma pode
    // vencer — é a garantia atômica do INSERT ... ON CONFLICT que a versão em
    // memória, single-threaded, não consegue provar de verdade.
    const resultados = await Promise.all(
      Array.from({ length: 20 }, () => repo.registrarEventoSeNovo('evt_concorrente')),
    );
    const vitorias = resultados.filter(Boolean).length;
    expect(vitorias).toBe(1);
  });
});
