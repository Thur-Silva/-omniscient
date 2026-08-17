-- Um preço teto por ativo por usuário: salvar de novo atualiza, não duplica.
--
-- Antes do índice único, cada save criava um registro novo para o mesmo
-- ticker. A migração primeiro apaga os duplicados antigos — fica a linha mais
-- recente de cada (user_id, ticker) — e então trava a regra no banco para o
-- `on conflict` do repositório poder atuar.

-- A comparação por (created_at, id) é uma ordem total: mesmo com carimbo de
-- tempo idêntico, um registro perde para o outro e o índice único não falha.
delete from ceiling_valuation a
  using ceiling_valuation b
 where a.user_id = b.user_id
   and a.ticker  = b.ticker
   and (a.created_at, a.id) < (b.created_at, b.id);

create unique index if not exists ceiling_valuation_user_ticker_idx
  on ceiling_valuation (user_id, ticker);

comment on index ceiling_valuation_user_ticker_idx is
  'Salvar o mesmo ativo atualiza o registro existente em vez de criar outro.';