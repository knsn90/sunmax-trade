-- Add logo_url column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '';
