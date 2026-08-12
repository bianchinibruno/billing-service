import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../src/app.js';
import { GatewayMock } from '../src/pagamento/gateway-mock.js';

// Fluxos base do serviço, com asserções fortes: status exato, valor exato e a
// transição de estado — nada de toBeDefined.

let app: FastifyInstance;
let gateway: GatewayMock;

async function cenario() {
  const plano = (
    await app.inject({
      method: 'POST',
      url: '/planos',
      payload: { nome: 'Pro', valorCentavos: 4990, intervalo: 'mensal' },
    })
  ).json();
  const cliente = (
    await app.inject({ method: 'POST', url: '/clientes', payload: { nome: 'Ana' } })
  ).json();
  const { assinatura, fatura } = (
    await app.inject({
      method: 'POST',
      url: '/assinaturas',
      payload: { clienteId: cliente.id, planoId: plano.id },
    })
  ).json();
  return { plano, cliente, assinatura, fatura };
}

beforeEach(() => {
  gateway = new GatewayMock();
  app = construirApp({ gateway });
});

describe('assinatura', () => {
  it('cria assinatura ativa e fatura aberta no valor do plano', async () => {
    const { assinatura, fatura } = await cenario();
    expect(assinatura.status).toBe('ativa');
    expect(fatura.status).toBe('aberta');
    expect(fatura.valorCentavos).toBe(4990);
    expect(fatura.assinaturaId).toBe(assinatura.id);
  });

  it('recusa assinatura de cliente inexistente com 404 e código estável', async () => {
    const plano = (
      await app.inject({
        method: 'POST',
        url: '/planos',
        payload: { nome: 'Pro', valorCentavos: 4990, intervalo: 'mensal' },
      })
    ).json();
    const res = await app.inject({
      method: 'POST',
      url: '/assinaturas',
      payload: { clienteId: 'cli_inexistente', planoId: plano.id },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().erro).toBe('CLIENTE_NAO_ENCONTRADO');
  });
});

describe('cobrança aprovada', () => {
  it('cobra a fatura, marca como paga e mantém a assinatura ativa', async () => {
    const { assinatura, fatura } = await cenario();
    const res = await app.inject({ method: 'POST', url: `/faturas/${fatura.id}/cobrar` });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('paga');
    expect(res.json().gatewayRef).toMatch(/^ch_/);
    expect(gateway.debitosRealizados).toBe(1);

    const assin = (await app.inject({ method: 'GET', url: `/assinaturas/${assinatura.id}` })).json();
    expect(assin.status).toBe('ativa');
  });
});
