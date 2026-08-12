import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../src/app.js';
import { GatewayMock } from '../src/pagamento/gateway-mock.js';

// A peça central do case: cobrar a mesma fatura duas vezes (um retry legítimo,
// ex.: timeout de rede) NÃO pode debitar duas vezes. É o bug que o sandbox do
// qe-kit tem de propósito; aqui ele está corrigido, e o teste prova.

let app: FastifyInstance;
let gateway: GatewayMock;

async function faturaAberta() {
  const plano = (
    await app.inject({
      method: 'POST',
      url: '/planos',
      payload: { nome: 'Pro', valorCentavos: 10000, intervalo: 'mensal' },
    })
  ).json();
  const cliente = (
    await app.inject({ method: 'POST', url: '/clientes', payload: { nome: 'Carla' } })
  ).json();
  return (
    await app.inject({
      method: 'POST',
      url: '/assinaturas',
      payload: { clienteId: cliente.id, planoId: plano.id },
    })
  ).json().fatura;
}

beforeEach(() => {
  gateway = new GatewayMock();
  app = construirApp({ gateway });
});

describe('idempotência de cobrança', () => {
  it('um retry da cobrança não debita duas vezes', async () => {
    const fatura = await faturaAberta();
    const cobrar = () => app.inject({ method: 'POST', url: `/faturas/${fatura.id}/cobrar` });

    const primeira = await cobrar();
    const segunda = await cobrar(); // retry com a mesma fatura

    expect(primeira.json().status).toBe('paga');
    expect(segunda.json().status).toBe('paga');
    // A prova: o gateway registrou UM débito, não dois.
    expect(gateway.debitosRealizados).toBe(1);
    // E as duas respostas apontam a mesma cobrança do gateway.
    expect(segunda.json().gatewayRef).toBe(primeira.json().gatewayRef);
  });

  it('cobrar uma fatura já paga é no-op e não toca o gateway', async () => {
    const fatura = await faturaAberta();
    await app.inject({ method: 'POST', url: `/faturas/${fatura.id}/cobrar` });
    const debitosAposPrimeira = gateway.debitosRealizados;

    const repetida = await app.inject({ method: 'POST', url: `/faturas/${fatura.id}/cobrar` });
    expect(repetida.statusCode).toBe(200);
    expect(repetida.json().status).toBe('paga');
    expect(gateway.debitosRealizados).toBe(debitosAposPrimeira);
  });
});
