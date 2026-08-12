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

Repositório e gateway são interfaces. As implementações — memória e um mock de pagamento — são
trocáveis por Postgres e um gateway real sem tocar na regra de negócio.

## 3. Stack

| Tecnologia | Por quê |
|---|---|
| TypeScript | Contrato de tipos no domínio de dinheiro, onde erro silencioso custa caro |
| Fastify | HTTP leve, com `inject()` para testar sem subir servidor de rede |
| Vitest | Suíte rápida; o mesmo ferramental usado nos testes de integração |
| Repositório em memória | Testes e dev sem infra; a interface deixa o Postgres entrar depois |
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

- **Persistência em memória nesta fase.** Escolhida para o projeto rodar e ser testado sem infra. O
  custo: não exercita concorrência real de banco ainda — por isso o Postgres com testcontainers está
  no roadmap, não fingido como pronto.
- **Gateway mock em vez de Stripe.** O valor de QA está em controlar a falha; a integração real é um
  segundo passo. O mock existe atrás da mesma interface que um adaptador Stripe implementaria.
- **Sem fila/assíncrono ainda.** Cobrança é síncrona nesta fatia; a régua de cobrança (dunning) e o
  processamento assíncrono entram no roadmap.

## 6. Testes

Suíte no nível de serviço + HTTP (`app.inject()`), com asserções fortes — valor exato, status e
código de erro, contagem de débitos — nunca `toBeDefined`.

- `idempotencia.test.ts` — um retry da cobrança **não debita duas vezes**; cobrar fatura já paga é
  no-op.
- `webhook.test.ts` — webhook reentregue (mesmo `eventId`) processado uma vez; recusa deixa a
  assinatura inadimplente.
- `falha-pagamento.test.ts` — cobrança recusada → fatura em falha, assinatura inadimplente, zero
  débito.
- `billing.test.ts` — fluxos base e validações.

**Prova de regressão** (a régua que o [qe-kit](https://github.com/bianchinibruno/qe-kit) aplica): com
a idempotência quebrada de propósito, o teste falha com `expected 2 to be 1`; com o código correto,
passa. Um teste que não falha quando o código está errado não prova nada.

```bash
npm install
npm test
npm run typecheck
npm run dev    # sobe em http://localhost:3000
```

## 7. Segurança

- Entrada validada na fronteira (tipos, valor positivo) antes de virar estado.
- Dedup de webhook impede reprocessamento por reentrega.
- **No roadmap:** acesso por assinatura (quem não paga não acessa), verificação de assinatura do
  webhook (HMAC) e checagem de dono nos recursos — os testes de autorização entram junto.

## 8. Deploy

Roda local com `npm run dev`. Containerização e deploy (com Postgres) estão no roadmap — marcados como
não-prontos de propósito, porque "deploy funcionando" só conta quando está funcionando.

## 9. Métricas

Nesta fase, a métrica é a **prova de regressão** da idempotência (falha com o bug, passa sem). O
número de performance antes→depois entra quando o teste de carga com k6 for adicionado — o mesmo
padrão do projeto `api-escala`.

## 10. Próximos passos

- Persistência em Postgres com testes de integração via testcontainers (concorrência real).
- Régua de cobrança (dunning): retry programado, downgrade/cancelamento por inadimplência.
- Upgrade/downgrade de plano com cobrança proporcional.
- Autorização por assinatura e verificação HMAC de webhook, com testes de segurança.
- Teste de carga (k6) no endpoint de cobrança, com número antes→depois.
- Pipeline de CI com os guards de qualidade.

---

> Este README segue a estrutura de case do documento que orientou o portfólio: problema, arquitetura,
> stack justificada, decisões, trade-offs, testes, segurança, deploy, métricas e próximos passos.
