-- Migration 014: Product categories

CREATE TABLE product_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  color      TEXT NOT NULL DEFAULT '#6b7280',
  sort_order INT  NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON product_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL;

CREATE INDEX idx_products_category ON products(category_id);
