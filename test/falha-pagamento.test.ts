import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../src/app.js';
import { GatewayMock } from '../src/pagamento/gateway-mock.js';

// Falha de pagamento: quando o gateway recusa a cobrança, a fatura vai para
// falha e a assinatura para inadimplente — a transição que sustenta a régua de
// cobrança (dunning) que virá depois.

let app: FastifyInstance;
let gateway: GatewayMock;

beforeEach(() => {
  gateway = new GatewayMock();
  app = construirApp({ gateway });
});

describe('falha de pagamento', () => {
  it('cobrança recusada marca fatura em falha e assinatura inadimplente', async () => {
    const plano = (
      await app.inject({
        method: 'POST',
        url: '/planos',
        payload: { nome: 'Pro', valorCentavos: 10000, intervalo: 'mensal' },
      })
    ).json();
    const cliente = (
      await app.inject({ method: 'POST', url: '/clientes', payload: { nome: 'Eva' } })
    ).json();
    const { assinatura, fatura } = (
      await app.inject({
        method: 'POST',
        url: '/assinaturas',
        payload: { clienteId: cliente.id, planoId: plano.id },
      })
    ).json();

    gateway.recusarProximaCobranca();
    const res = await app.inject({ method: 'POST', url: `/faturas/${fatura.id}/cobrar` });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('falha');
    expect(gateway.debitosRealizados).toBe(0); // recusa não debita

    const assin = (await app.inject({ method: 'GET', url: `/assinaturas/${assinatura.id}` })).json();
    expect(assin.status).toBe('inadimplente');
  });
});
