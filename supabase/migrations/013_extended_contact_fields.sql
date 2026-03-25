-- Migration 013: Extended fields for customers, suppliers, and products

-- Customers: add city, tax_id, website, payment_terms
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS city           TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tax_id         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS website        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_terms  TEXT NOT NULL DEFAULT '';

-- Suppliers: add tax_id, website, address, payment_terms, swift_code, iban
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS tax_id         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS website        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_terms  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS swift_code     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS iban           TEXT NOT NULL DEFAULT '';

-- Service Providers: add address
ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';

-- Products: add description, origin_country, species, grade
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS description    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS origin_country TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS species        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS grade          TEXT NOT NULL DEFAULT '';
