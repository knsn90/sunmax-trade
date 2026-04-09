create table if not exists trade_file_notes (
  id uuid primary key default gen_random_uuid(),
  trade_file_id uuid not null references trade_files(id) on delete cascade,
  content text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table trade_file_notes enable row level security;
create policy "auth users can manage notes" on trade_file_notes
  for all using (auth.role() = 'authenticated');
create index on trade_file_notes(trade_file_id, created_at desc);
