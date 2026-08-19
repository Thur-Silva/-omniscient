-- Sexta régua: fluxo de caixa da firma descontado ao WACC.
--
-- As cinco anteriores descontam fluxo do acionista (ou nem descontam, no caso do
-- Bazin e do número de Graham). Esta desconta o caixa que sobra para todos os
-- investidores — acionista e credor — ao custo médio ponderado de capital, e só
-- então subtrai a dívida líquida para chegar ao valor da ação.
--
-- A lista é fechada de propósito, então acrescentar método é acrescentar valor
-- permitido aqui. Nada nos registros existentes muda.

alter table ceiling_valuation
  drop constraint if exists ceiling_valuation_method_check;

alter table ceiling_valuation
  add constraint ceiling_valuation_method_check
  check (
    method in (
      'fcd-2-fases',
      'fcff-wacc',
      'ddm-gordon',
      'bazin',
      'renda-residual',
      'numero-graham'
    )
  );
