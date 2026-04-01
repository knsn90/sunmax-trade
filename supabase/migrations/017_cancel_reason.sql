-- Add cancel_reason column to trade_files
ALTER TABLE trade_files
  ADD COLUMN IF NOT EXISTS cancel_reason text;
