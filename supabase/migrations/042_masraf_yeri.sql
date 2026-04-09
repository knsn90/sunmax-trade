-- 042: Masraf (Bank/Transfer/Sarraf Fee) fields on transactions
-- Tracks monetary fees (wire fees, bank commissions, money changer fees)
-- stored alongside the main transaction for expense reporting.

alter table transactions
  add column if not exists masraf_turu     text           not null default '',
  add column if not exists masraf_tutar    numeric(18,4)  not null default 0,
  add column if not exists masraf_currency text           not null default 'USD',
  add column if not exists masraf_rate     numeric(18,6)  not null default 1,
  add column if not exists masraf_usd      numeric(18,4)  not null default 0;
