-- Add ETA delay tracking fields to trade_files
ALTER TABLE trade_files
  ADD COLUMN IF NOT EXISTS revised_eta DATE,
  ADD COLUMN IF NOT EXISTS delay_notes TEXT;

COMMENT ON COLUMN trade_files.revised_eta IS 'Revised ETA after a delay has been noted (original ETA preserved in eta column)';
COMMENT ON COLUMN trade_files.delay_notes IS 'Reason / notes for the delay';
