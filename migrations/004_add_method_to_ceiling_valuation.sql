-- Método usado no cálculo salvo.
--
-- O sistema passou a ter cinco réguas de preço teto (FCD em 2 fases, dividendos
-- descontados, Bazin, renda residual e número de Graham), escolhidas pela
-- natureza do ativo. Sem registrar qual delas produziu o número, o histórico fica
-- ambíguo: o mesmo ativo tem tetos diferentes por método, e reabrir um cálculo
-- salvo aplicaria a régua errada às premissas guardadas.
--
-- Os registros anteriores foram todos calculados pelo FCD em duas fases, único
-- método que existia então, e é esse o valor padrão da coluna.

alter table ceiling_valuation
  add column if not exists method text not null default 'fcd-2-fases';

-- Lista fechada: método fora do catálogo é erro de escrita, não dado.
alter table ceiling_valuation
  drop constraint if exists ceiling_valuation_method_check;

alter table ceiling_valuation
  add constraint ceiling_valuation_method_check
  check (method in ('fcd-2-fases', 'ddm-gordon', 'bazin', 'renda-residual', 'numero-graham'));

comment on column ceiling_valuation.method is
  'Régua de preço teto usada no cálculo. Registros anteriores à coluna são fcd-2-fases.';
