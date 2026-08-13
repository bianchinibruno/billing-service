import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import type { Assinatura, Cliente, Fatura, Plano } from '../dominio/tipos.js';
import type { Repositorio } from './repositorio.js';

// Implementação Postgres do repositório. Mesma interface que a versão em
// memória — o serviço de billing não sabe qual das duas está em uso.
export class RepositorioPostgres implements Repositorio {
  constructor(private readonly pool: Pool) {}

  async salvarPlano(p: Plano): Promise<void> {
    await this.pool.query(
      `insert into planos (id, nome, valor_centavos, intervalo) values ($1,$2,$3,$4)
       on conflict (id) do update set nome=$2, valor_centavos=$3, intervalo=$4`,
      [p.id, p.nome, p.valorCentavos, p.intervalo],
    );
  }
  async obterPlano(id: string): Promise<Plano | undefined> {
    const r = await this.pool.query(
      'select id, nome, valor_centavos, intervalo from planos where id=$1',
      [id],
    );
    const row = r.rows[0];
    return row && { id: row.id, nome: row.nome, valorCentavos: row.valor_centavos, intervalo: row.intervalo };
  }

  async salvarCliente(c: Cliente): Promise<void> {
    await this.pool.query(
      `insert into clientes (id, nome) values ($1,$2)
       on conflict (id) do update set nome=$2`,
      [c.id, c.nome],
    );
  }
  async obterCliente(id: string): Promise<Cliente | undefined> {
    const r = await this.pool.query('select id, nome from clientes where id=$1', [id]);
    const row = r.rows[0];
    return row && { id: row.id, nome: row.nome };
  }

  async salvarAssinatura(a: Assinatura): Promise<void> {
    await this.pool.query(
      `insert into assinaturas (id, cliente_id, plano_id, status, criada_em) values ($1,$2,$3,$4,$5)
       on conflict (id) do update set status=$4`,
      [a.id, a.clienteId, a.planoId, a.status, a.criadaEm],
    );
  }
  async obterAssinatura(id: string): Promise<Assinatura | undefined> {
    const r = await this.pool.query(
      'select id, cliente_id, plano_id, status, criada_em from assinaturas where id=$1',
      [id],
    );
    const row = r.rows[0];
    return (
      row && {
        id: row.id,
        clienteId: row.cliente_id,
        planoId: row.plano_id,
        status: row.status,
        criadaEm: new Date(row.criada_em).toISOString(),
      }
    );
  }

  async salvarFatura(f: Fatura): Promise<void> {
    await this.pool.query(
      `insert into faturas (id, assinatura_id, valor_centavos, status, gateway_ref, criada_em)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do update set status=$4, gateway_ref=$5`,
      [f.id, f.assinaturaId, f.valorCentavos, f.status, f.gatewayRef ?? null, f.criadaEm],
    );
  }
  async obterFatura(id: string): Promise<Fatura | undefined> {
    const r = await this.pool.query(
      'select id, assinatura_id, valor_centavos, status, gateway_ref, criada_em from faturas where id=$1',
      [id],
    );
    const row = r.rows[0];
    return (
      row && {
        id: row.id,
        assinaturaId: row.assinatura_id,
        valorCentavos: row.valor_centavos,
        status: row.status,
        gatewayRef: row.gateway_ref ?? undefined,
        criadaEm: new Date(row.criada_em).toISOString(),
      }
    );
  }

  // A garantia atômica de idempotência de webhook: o INSERT ... ON CONFLICT DO
  // NOTHING só insere se o event_id ainda não existe. rowCount === 1 significa
  // que esta chamada foi a que registrou o evento; qualquer chamada concorrente
  // com o mesmo id recebe rowCount 0. É o que a versão em memória não prova.
  async registrarEventoSeNovo(eventId: string): Promise<boolean> {
    const r = await this.pool.query(
      'insert into eventos_processados (event_id) values ($1) on conflict (event_id) do nothing',
      [eventId],
    );
    return r.rowCount === 1;
  }
}

// Aplica o schema (idempotente — todas as tabelas usam IF NOT EXISTS).
export async function aplicarSchema(pool: Pool): Promise<void> {
  const caminho = fileURLToPath(new URL('./schema.sql', import.meta.url));
  await pool.query(readFileSync(caminho, 'utf8'));
}
