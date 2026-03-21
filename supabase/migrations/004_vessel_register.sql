-- Add vessel_name and register_no to trade_files
ALTER TABLE trade_files ADD COLUMN IF NOT EXISTS vessel_name TEXT DEFAULT '';
ALTER TABLE trade_files ADD COLUMN IF NOT EXISTS register_no TEXT DEFAULT '';
