-- Migration 038: Link transactions to bank_accounts
alter table transactions
  add column if not exists bank_account_id uuid references bank_accounts(id) on delete set null;

create index if not exists transactions_bank_account_id_idx
  on transactions(bank_account_id);
