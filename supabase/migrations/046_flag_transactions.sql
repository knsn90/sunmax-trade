-- Add flagging support to transactions
-- Allows marking invoices with disputes/issues for later reconciliation

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS flagged   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_note text;

COMMENT ON COLUMN transactions.flagged   IS 'True if this transaction has been flagged for reconciliation';
COMMENT ON COLUMN transactions.flag_note IS 'Note describing the issue with this transaction';
