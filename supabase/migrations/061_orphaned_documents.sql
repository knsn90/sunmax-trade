-- Ticaret dosyası silindiğinde ilgili belgeler "eşlenmedi" olarak işaretlenebilsin diye
-- trade_file_id nullable yapılıyor ve is_orphaned kolonu ekleniyor.

-- invoices: trade_file_id nullable
ALTER TABLE invoices ALTER COLUMN trade_file_id DROP NOT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_orphaned BOOLEAN NOT NULL DEFAULT FALSE;

-- proformas: trade_file_id nullable
ALTER TABLE proformas ALTER COLUMN trade_file_id DROP NOT NULL;
ALTER TABLE proformas ADD COLUMN IF NOT EXISTS is_orphaned BOOLEAN NOT NULL DEFAULT FALSE;

-- packing_lists: trade_file_id nullable
ALTER TABLE packing_lists ALTER COLUMN trade_file_id DROP NOT NULL;
ALTER TABLE packing_lists ADD COLUMN IF NOT EXISTS is_orphaned BOOLEAN NOT NULL DEFAULT FALSE;

-- transactions: trade_file_id zaten nullable, sadece is_orphaned ve ON DELETE SET NULL ekleniyor
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_orphaned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_trade_file_id_fkey;
ALTER TABLE transactions ADD CONSTRAINT transactions_trade_file_id_fkey
  FOREIGN KEY (trade_file_id) REFERENCES trade_files(id) ON DELETE SET NULL;
