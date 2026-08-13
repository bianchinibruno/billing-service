-- Schema do billing-service. Valores monetários em centavos (integer).

create table if not exists planos (
  id             text primary key,
  nome           text not null,
  valor_centavos integer not null,
  intervalo      text not null
);

create table if not exists clientes (
  id   text primary key,
  nome text not null
);

create table if not exists assinaturas (
  id         text primary key,
  cliente_id text not null references clientes (id),
  plano_id   text not null references planos (id),
  status     text not null,
  criada_em  timestamptz not null
);

create table if not exists faturas (
  id             text primary key,
  assinatura_id  text not null references assinaturas (id),
  valor_centavos integer not null,
  status         text not null,
  gateway_ref    text,
  criada_em      timestamptz not null
);

-- Registro de idempotência de webhooks. A PK em event_id é o que dá a garantia
-- atômica: um INSERT ... ON CONFLICT DO NOTHING concorrente só deixa uma linha
-- entrar, mesmo com várias instâncias do serviço processando a reentrega ao
-- mesmo tempo. É a garantia que a versão em memória não consegue provar.
create table if not exists eventos_processados (
  event_id      text primary key,
  processado_em timestamptz not null default now()
);
