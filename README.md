# billing-service

[![ci](https://github.com/bianchinibruno/billing-service/actions/workflows/ci.yml/badge.svg)](https://github.com/bianchinibruno/billing-service/actions/workflows/ci.yml)

Backend de assinaturas e cobrança, **construído para ser testado**. O foco não é ter muitos
endpoints — é tratar corretamente o que quebra em cobrança de verdade: idempotência, reentrega de
webhook, falha de pagamento e retry. É um domínio onde um erro não vira reclamação, vira prejuízo.

> Projeto de portfólio em construção. Esta primeira fatia entrega o núcleo de assinatura, cobrança e
> webhook rodando e testado. O roadmap ao final diz o que já existe e o que vem.

## 1. Problema

Sistemas de cobrança falham de formas específicas e caras: a rede cai depois do débito e o cliente
reenvia a requisição (débito em dobro); o gateway reentrega o mesmo webhook (efeito aplicado duas
vezes); um pagamento é recusado e a assinatura precisa reagir. Este serviço modela esse domínio com
essas falhas como cidadãs de primeira classe — cada uma tem um teste que prova o tratamento.

## 2. Arquitetura

Camadas com dependências apontando para dentro (a regra de negócio não conhece HTTP nem banco):

```
HTTP (Fastify)  ──►  Serviço de billing  ──►  Repositório (interface)
                          │                        └─ memória | (futuro) Postgres
                          └────────────────►  Gateway de pagamento (interface)
                                                   └─ mock | (futuro) gateway real
```

Repositório e gateway são interfaces. O repositório tem **duas implementações reais** — memória
(testes/dev) e Postgres (produção) — cobertas pelo mesmo contrato de teste. O gateway é um mock
configurável, trocável por um adaptador real sem tocar na regra de negócio.

## 3. Stack

| Tecnologia | Por quê |
|---|---|
| TypeScript | Contrato de tipos no domínio de dinheiro, onde erro silencioso custa caro |
| Fastify | HTTP leve, com `inject()` para testar sem subir servidor de rede |
| Vitest | Suíte rápida; o mesmo ferramental usado nos testes de integração |
| Repositório: memória + Postgres | Memória para testes/dev sem infra; Postgres (via `pg`) para produção, atrás da mesma interface |
| Gateway de pagamento mock | Controle total sobre falha/retry/duplicata — cenários que um gateway real não deixa provocar sob demanda |

Valores monetários são **sempre inteiros em centavos** — dinheiro em ponto flutuante é fonte
garantida de erro de arredondamento.

## 4. Decisões técnicas

- **Idempotência em duas camadas (defense-in-depth).** O serviço não recobra uma fatura já paga, e o
  gateway deduplica pela chave de idempotência (o id da fatura). Um retry é seguro mesmo que uma das
  camadas falhe.
- **Dedup de webhook por `eventId`.** O repositório registra eventos processados de forma atômica; um
  webhook reentregue é detectado e vira no-op.
- **Erro de domínio com código estável.** O código do erro (não a mensagem) é o contrato verificado
  por testes e pela camada HTTP — mensagem muda, código não.

## 5. Trade-offs

- **Dois drivers de persistência, um contrato.** Memória e Postgres implementam a mesma interface e
  passam pela mesma suíte de contrato. Memória mantém os testes rápidos e o dev sem infra; Postgres é
  o caminho de produção e prova a concorrência que a memória não consegue. O custo é manter dois
  drivers — pago de propósito, porque é o que dá o teste rápido **e** a garantia real.
- **Gateway mock em vez de Stripe.** O valor de QA está em controlar a falha; a integração real é um
  segundo passo. O mock existe atrás da mesma interface que um adaptador Stripe implementaria.
- **Sem fila/assíncrono ainda.** Cobrança é síncrona nesta fatia; a régua de cobrança (dunning) e o
  processamento assíncrono entram no roadmap.

## 6. Testes

Duas camadas da pirâmide, com asserções fortes — valor exato, status e código de erro, contagem de
débitos — nunca `toBeDefined`.

**Serviço + HTTP** (`app.inject()`, roda sem infra):
- `idempotencia.test.ts` — um retry da cobrança **não debita duas vezes**; cobrar fatura já paga é
  no-op.
- `webhook.test.ts` — webhook reentregue (mesmo `eventId`) processado uma vez; recusa deixa a
  assinatura inadimplente.
- `falha-pagamento.test.ts` — cobrança recusada → fatura em falha, assinatura inadimplente, zero
  débito.
- `billing.test.ts` — fluxos base e validações.

**Integração contra Postgres real** (`contrato-repositorio.test.ts`):
- Um **contrato, dois drivers**: as mesmas asserções rodam contra memória e contra Postgres,
  provando que as implementações se comportam igual.
- **Dedup sob concorrência**: 20 inserts concorrentes do mesmo evento de webhook, exatamente um
  vence — a garantia atômica do `INSERT ... ON CONFLICT` que a versão em memória não consegue provar.
- Rodam contra um Postgres real: um *service container* no CI, `docker-compose` localmente. Sem
  `DATABASE_URL`, pulam graciosamente e a suíte unitária segue verde sem exigir Docker.

**Prova de regressão** (a régua que o [qe-kit](https://github.com/bianchinibruno/qe-kit) aplica): com
a idempotência quebrada de propósito, o teste falha com `expected 2 to be 1`; com o código correto,
passa. Um teste que não falha quando o código está errado não prova nada.

```bash
npm install
npm test                        # unitários; integração pula sem DATABASE_URL
npm run typecheck

# integração contra Postgres real, local:
docker compose up -d db
DATABASE_URL=postgres://billing:billing@localhost:5432/billing npm test

npm run dev                     # em memória; com DATABASE_URL, usa Postgres
```

## 7. Segurança

- Entrada validada na fronteira (tipos, valor positivo) antes de virar estado.
- Dedup de webhook impede reprocessamento por reentrega.
- **No roadmap:** acesso por assinatura (quem não paga não acessa), verificação de assinatura do
  webhook (HMAC) e checagem de dono nos recursos — os testes de autorização entram junto.

## 8. Deploy

Roda local com `npm run dev` (em memória) ou com `DATABASE_URL` apontando para um Postgres. O schema
é aplicado no boot. Containerização da app e deploy em nuvem estão no roadmap — marcados como
não-prontos de propósito, porque "deploy funcionando" só conta quando está funcionando.

## 9. Métricas

Nesta fase, a métrica é a **prova de regressão** da idempotência (falha com o bug, passa sem). O
número de performance antes→depois entra quando o teste de carga com k6 for adicionado — o mesmo
padrão do projeto `api-escala`.

## 10. Próximos passos

- Régua de cobrança (dunning): retry programado, downgrade/cancelamento por inadimplência.
- Upgrade/downgrade de plano com cobrança proporcional.
- Autorização por assinatura e verificação HMAC de webhook, com testes de segurança.
- Teste de carga (k6) no endpoint de cobrança, com número antes→depois.
- Pipeline de CI com os guards de qualidade.

---

> Este README segue a estrutura de case do documento que orientou o portfólio: problema, arquitetura,
> stack justificada, decisões, trade-offs, testes, segurança, deploy, métricas e próximos passos.
