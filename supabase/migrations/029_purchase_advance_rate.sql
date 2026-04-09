-- Add purchase_advance_rate column to trade_files
-- Tracks the advance payment rate that must be paid TO the supplier
ALTER TABLE trade_files
  ADD COLUMN IF NOT EXISTS purchase_advance_rate numeric(5,2) DEFAULT 0;
