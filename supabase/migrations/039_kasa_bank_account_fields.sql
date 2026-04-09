-- Migration 039: Add professional accounting fields to kasalar and bank_accounts

-- Bank accounts: currency, account number, branch, opening balance, account type
alter table bank_accounts
  add column if not exists currency          text    not null default 'USD',
  add column if not exists account_number    text    not null default '',
  add column if not exists branch_name       text    not null default '',
  add column if not exists branch_code       text    not null default '',
  add column if not exists opening_balance   numeric not null default 0,
  add column if not exists opening_balance_date date,
  add column if not exists account_type      text    not null default 'checking';

-- Kasalar: account code, opening balance, responsible person
alter table kasalar
  add column if not exists account_code          text    not null default '',
  add column if not exists opening_balance        numeric not null default 0,
  add column if not exists opening_balance_date   date,
  add column if not exists responsible            text    not null default '';
