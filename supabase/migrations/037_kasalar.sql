create table if not exists kasalar (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'TRY',
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table kasalar enable row level security;
create policy "auth users manage kasalar" on kasalar
  for all using (auth.role() = 'authenticated');

alter table transactions
  add column if not exists kasa_id uuid references kasalar(id) on delete set null;
create index if not exists transactions_kasa_id_idx on transactions(kasa_id);
