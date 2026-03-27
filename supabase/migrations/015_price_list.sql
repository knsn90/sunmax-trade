-- Price List table: tracks supplier prices per product over time
CREATE TABLE IF NOT EXISTS price_list (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id   uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  price         numeric(18,4) NOT NULL,
  currency      text NOT NULL DEFAULT 'USD',
  price_date    date NOT NULL,
  valid_until   date,
  notes         text,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE price_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_authenticated" ON price_list
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
