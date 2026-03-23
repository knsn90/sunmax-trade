-- Add delivery_time and vessel_details_confirmation to proformas
ALTER TABLE proformas
  ADD COLUMN IF NOT EXISTS delivery_time TEXT,
  ADD COLUMN IF NOT EXISTS vessel_details_confirmation TEXT;
