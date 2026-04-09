-- ============================================================================
-- 028_cascade_delete_trade_file.sql
--
-- Change trade_obligations.trade_file_id FK from ON DELETE RESTRICT
-- to ON DELETE CASCADE so that deleting a trade_file automatically
-- removes its obligations and their allocations.
--
-- CASCADE chain:
--   trade_files  →  trade_obligations  →  payment_allocations
-- ============================================================================

-- Step 1: payment_allocations → trade_obligations (already RESTRICT)
--         Change to CASCADE so allocations are removed when an obligation is removed.
ALTER TABLE payment_allocations
  DROP CONSTRAINT payment_allocations_obligation_id_fkey;

ALTER TABLE payment_allocations
  ADD CONSTRAINT payment_allocations_obligation_id_fkey
    FOREIGN KEY (obligation_id)
    REFERENCES trade_obligations(id)
    ON DELETE CASCADE;

-- Step 2: trade_obligations → trade_files (currently RESTRICT)
--         Change to CASCADE so obligations are removed when a trade file is removed.
ALTER TABLE trade_obligations
  DROP CONSTRAINT trade_obligations_trade_file_id_fkey;

ALTER TABLE trade_obligations
  ADD CONSTRAINT trade_obligations_trade_file_id_fkey
    FOREIGN KEY (trade_file_id)
    REFERENCES trade_files(id)
    ON DELETE CASCADE;
