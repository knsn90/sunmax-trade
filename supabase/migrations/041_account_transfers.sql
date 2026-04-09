create table if not exists account_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_date date not null,
  description text not null default '',
  amount numeric(18,4) not null,
  currency text not null default 'USD',
  exchange_rate numeric(18,6) not null default 1,
  amount_usd numeric(18,4) not null default 0,
  from_type text not null check (from_type in ('kasa', 'bank')),
  from_id uuid not null,
  to_type text not null check (to_type in ('kasa', 'bank')),
  to_id uuid not null,
  reference_no text not null default '',
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists account_transfers_from_idx on account_transfers(from_type, from_id);
create index if not exists account_transfers_to_idx   on account_transfers(to_type, to_id);
create index if not exists account_transfers_date_idx on account_transfers(transfer_date);

alter table account_transfers enable row level security;
create policy "tenant_all" on account_transfers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
