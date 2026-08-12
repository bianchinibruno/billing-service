import Fastify, { type FastifyInstance } from 'fastify';
import { ErroDominio } from './dominio/erros.js';
import { GatewayMock } from './pagamento/gateway-mock.js';
import type { GatewayPagamento } from './pagamento/gateway.js';
import { RepositorioMemoria } from './repositorio/memoria.js';
import type { Repositorio } from './repositorio/repositorio.js';
import { ServicoBilling } from './servico/billing.js';

export interface Deps {
  repo?: Repositorio;
  gateway?: GatewayPagamento;
}

// Constrói a app sem escutar em porta, para os testes usarem `app.inject()`.
// As dependências são injetáveis para o teste poder inspecionar o gateway mock.
export function construirApp(deps: Deps = {}): FastifyInstance {
  const repo = deps.repo ?? new RepositorioMemoria();
  const gateway = deps.gateway ?? new GatewayMock();
  const servico = new ServicoBilling(repo, gateway);

  const app = Fastify({ logger: false });

  // Traduz erro de domínio para status HTTP, preservando o código estável.
  const mapaStatus: Record<string, number> = {
    ENTRADA_INVALIDA: 400,
    PLANO_NAO_ENCONTRADO: 404,
    CLIENTE_NAO_ENCONTRADO: 404,
    ASSINATURA_NAO_ENCONTRADA: 404,
    FATURA_NAO_ENCONTRADA: 404,
  };
  app.setErrorHandler((erro, _req, reply) => {
    if (erro instanceof ErroDominio) {
      return reply.code(mapaStatus[erro.codigo] ?? 400).send({ erro: erro.codigo, mensagem: erro.message });
    }
    return reply.code(500).send({ erro: 'ERRO_INTERNO' });
  });

  app.post('/planos', async (req, reply) => {
    const b = req.body as { nome?: string; valorCentavos?: number; intervalo?: 'mensal' | 'anual' };
    const plano = await servico.criarPlano(b?.nome ?? '', b?.valorCentavos ?? 0, b?.intervalo ?? 'mensal');
    return reply.code(201).send(plano);
  });

  app.post('/clientes', async (req, reply) => {
    const b = req.body as { nome?: string };
    const cliente = await servico.criarCliente(b?.nome ?? '');
    return reply.code(201).send(cliente);
  });

  app.post('/assinaturas', async (req, reply) => {
    const b = req.body as { clienteId?: string; planoId?: string };
    const r = await servico.assinar(b?.clienteId ?? '', b?.planoId ?? '');
    return reply.code(201).send(r);
  });

  app.post('/faturas/:id/cobrar', async (req, reply) => {
    const { id } = req.params as { id: string };
    const fatura = await servico.cobrarFatura(id);
    return reply.code(200).send(fatura);
  });

  app.post('/webhooks/pagamento', async (req, reply) => {
    const b = req.body as {
      eventId?: string;
      tipo?: 'pagamento.aprovado' | 'pagamento.recusado';
      faturaId?: string;
      gatewayRef?: string;
    };
    const r = await servico.processarWebhook({
      eventId: b?.eventId ?? '',
      tipo: b?.tipo ?? 'pagamento.aprovado',
      faturaId: b?.faturaId ?? '',
      gatewayRef: b?.gatewayRef,
    });
    return reply.code(200).send(r);
  });

  app.get('/assinaturas/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const assinatura = await repo.obterAssinatura(id);
    if (!assinatura) return reply.code(404).send({ erro: 'ASSINATURA_NAO_ENCONTRADA' });
    return reply.code(200).send(assinatura);
  });

  return app;
}
