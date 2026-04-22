-- Add active_currencies column to company_settings
-- Stores the list of currencies enabled for this tenant
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS active_currencies text[] NOT NULL DEFAULT ARRAY['USD','EUR','TRY','AED','GBP'];
