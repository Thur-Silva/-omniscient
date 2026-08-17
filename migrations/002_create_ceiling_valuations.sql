-- Histórico de preços teto calculados, por usuário.
--
-- Uma linha por cálculo: guarda o resultado (teto por ação, margem de
-- segurança, preço de mercado naquele momento) e a memória completa do que foi
-- usado — as premissas (assumptions) e a decomposição ano a ano (breakdown).
-- Nada é reestimado: o que a tela calculou fica registrado como estava,
-- inclusive os g sobrescritos pelo usuário e o limite de 3% na perpetuidade.

create table if not exists ceiling_valuation (
  id            uuid primary key default gen_random_uuid(),
  user_id       text        not null,
  ticker        text        not null,
  market_price  numeric(18,2),
  ceiling_price numeric(18,2) not null,
  safety_margin numeric(8,6),
  assumptions   jsonb       not null,
  breakdown     jsonb       not null,
  created_at    timestamptz not null default now(),

  -- Invariantes do modelo de valuation: preço teto positivo, mercado positivo
  -- quando houver, e margem sempre menor que 1 (é 1 − mercado/teto).
  check (ceiling_price > 0),
  check (market_price is null or market_price > 0),
  check (safety_margin is null or safety_margin < 1)
);

comment on table ceiling_valuation is
  'Cada preço teto calculado, com as premissas e a memória de cálculo daquele momento.';

comment on column ceiling_valuation.user_id is
  'Dono do cálculo: id do usuário do Clerk. Cada conta vê só o seu histórico.';

comment on column ceiling_valuation.assumptions is
  'Premissas utilizadas: lucro líquido, payout, ROE, k, ações, g de cada ano e g perpétuo pedido.';

comment on column ceiling_valuation.breakdown is
  'Memória de cálculo: anos projetados com g e k, valores presentes, perpetuidade (g limitado a 3%) e teto.';

comment on column ceiling_valuation.safety_margin is
  'Fração de desconto contra o preço de mercado; null quando não havia preço para comparar.';

-- O histórico é lido por usuário, do cálculo mais recente para o mais antigo.
create index if not exists ceiling_valuation_user_created_idx
  on ceiling_valuation (user_id, created_at desc);