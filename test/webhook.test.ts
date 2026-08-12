import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../src/app.js';
import { GatewayMock } from '../src/pagamento/gateway-mock.js';

// Webhook: o gateway reentrega eventos. Um evento reentregue (mesmo eventId) não
// pode aplicar o efeito duas vezes, e uma recusa tem de deixar a assinatura
// inadimplente.

let app: FastifyInstance;

async function faturaEAssinatura() {
  const plano = (
    await app.inject({
      method: 'POST',
      url: '/planos',
      payload: { nome: 'Pro', valorCentavos: 10000, intervalo: 'mensal' },
    })
  ).json();
  const cliente = (
    await app.inject({ method: 'POST', url: '/clientes', payload: { nome: 'Davi' } })
  ).json();
  const { assinatura, fatura } = (
    await app.inject({
      method: 'POST',
      url: '/assinaturas',
      payload: { clienteId: cliente.id, planoId: plano.id },
    })
  ).json();
  return { assinatura, fatura };
}

beforeEach(() => {
  app = construirApp({ gateway: new GatewayMock() });
});

describe('idempotência de webhook', () => {
  it('um webhook reentregue com o mesmo eventId é processado uma vez só', async () => {
    const { assinatura, fatura } = await faturaEAssinatura();
    const evento = {
      eventId: 'evt_1',
      tipo: 'pagamento.aprovado',
      faturaId: fatura.id,
      gatewayRef: 'ch_externo_1',
    };

    const primeira = await app.inject({ method: 'POST', url: '/webhooks/pagamento', payload: evento });
    const segunda = await app.inject({ method: 'POST', url: '/webhooks/pagamento', payload: evento });

    expect(primeira.json().duplicado).toBe(false);
    expect(segunda.json().duplicado).toBe(true); // a reentrega foi detectada

    const assin = (await app.inject({ method: 'GET', url: `/assinaturas/${assinatura.id}` })).json();
    expect(assin.status).toBe('ativa');
  });

  it('webhook de recusa deixa a fatura em falha e a assinatura inadimplente', async () => {
    const { assinatura, fatura } = await faturaEAssinatura();
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/pagamento',
      payload: { eventId: 'evt_2', tipo: 'pagamento.recusado', faturaId: fatura.id },
    });
    expect(res.json().duplicado).toBe(false);

    const assin = (await app.inject({ method: 'GET', url: `/assinaturas/${assinatura.id}` })).json();
    expect(assin.status).toBe('inadimplente');
  });
});
