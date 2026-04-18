-- Migration 056: Add logo_url to customers, suppliers, service_providers
ALTER TABLE customers         ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE suppliers         ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS logo_url text;
