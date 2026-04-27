-- ── 061 Soft Delete (Çöp Kutusu) ────────────────────────────────────────────
-- Adds deleted_at column to key tables so records can be soft-deleted
-- and later restored or permanently removed.

ALTER TABLE trade_files   ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE invoices      ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE packing_lists ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE proformas     ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE transactions  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
ALTER TABLE account_transfers ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Indexes for fast trash queries
CREATE INDEX IF NOT EXISTS idx_trade_files_deleted_at   ON trade_files(deleted_at)   WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at      ON invoices(deleted_at)       WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_packing_lists_deleted_at ON packing_lists(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proformas_deleted_at     ON proformas(deleted_at)      WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at  ON transactions(deleted_at)   WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_account_transfers_deleted_at ON account_transfers(deleted_at) WHERE deleted_at IS NOT NULL;
