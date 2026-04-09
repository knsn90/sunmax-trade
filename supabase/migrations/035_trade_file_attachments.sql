create table if not exists trade_file_attachments (
  id uuid primary key default gen_random_uuid(),
  trade_file_id uuid not null references trade_files(id) on delete cascade,
  name text not null,
  file_type text,
  file_size_bytes bigint,
  dropbox_url text,
  dropbox_path text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table trade_file_attachments enable row level security;
create policy "auth users can manage attachments" on trade_file_attachments
  for all using (auth.role() = 'authenticated');
create index on trade_file_attachments(trade_file_id, created_at desc);
