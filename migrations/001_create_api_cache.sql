-- Cache de servidor para as fontes externas (brapi, fundamentos de FII).
--
-- Duas tabelas porque são duas responsabilidades: api_snapshot guarda O QUE a
-- fonte devolveu (para servir quando a cota estourar), api_fetch_log guarda
-- QUANDO ela foi consultada (para a janela de 10 minutos).

create table if not exists api_snapshot (
  source_key      text primary key,
  payload         jsonb       not null,
  upstream_status integer     not null,
  byte_size       integer     not null,
  captured_at     timestamptz not null default now()
);

comment on table api_snapshot is
  'Último corpo bem-sucedido de cada fonte externa. Serve de fallback quando a fonte falha ou recusa.';

create table if not exists api_fetch_log (
  source_key           text        primary key,
  last_attempt_at      timestamptz not null default now(),
  last_success_at      timestamptz,
  last_status          integer,
  consecutive_failures integer     not null default 0,
  -- Contadores só para observabilidade: quanto o cache está economizando.
  upstream_calls       bigint      not null default 0,
  cache_hits           bigint      not null default 0,
  stale_hits           bigint      not null default 0
);

comment on table api_fetch_log is
  'Quando cada fonte foi consultada. A janela de 10 minutos é global por chave, não por usuário.';

-- A varredura por idade acontece em toda leitura de snapshot.
create index if not exists api_snapshot_captured_at_idx
  on api_snapshot (captured_at desc);
