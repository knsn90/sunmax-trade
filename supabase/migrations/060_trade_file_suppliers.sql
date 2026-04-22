-- ============================================================================
-- 060_trade_file_suppliers.sql
--
-- Multi-supplier support for a single trade file.
--
-- A trade file (satış dosyası) can now be backed by up to 5 suppliers.
-- Each row carries its own quantity, purchase price, currency and FX rate
-- at the time of purchase (for base-currency cost reporting).
--
-- Backward compatibility:
--   - trade_files.supplier_id still tracks the *primary* supplier (position=1).
--   - Existing single-supplier trade files are migrated on the fly by copying
--     (supplier_id, tonnage_mt, purchase_price, purchase_currency) into a
--     single trade_file_suppliers row.
-- ============================================================================

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trade_file_suppliers (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trade_file_id   uuid          NOT NULL REFERENCES trade_files(id) ON DELETE CASCADE,
  supplier_id     uuid          NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  position        smallint      NOT NULL DEFAULT 1
                                   CHECK (position BETWEEN 1 AND 5),
  quantity_mt     numeric(12,3) NOT NULL CHECK (quantity_mt > 0),
  purchase_price  numeric(12,4) NOT NULL CHECK (purchase_price >= 0),
  currency        currency_code NOT NULL DEFAULT 'USD',
  fx_rate         numeric(18,6) NOT NULL DEFAULT 1
                                   CHECK (fx_rate > 0),
  freight_cost    numeric(14,4) NOT NULL DEFAULT 0 CHECK (freight_cost >= 0),
  notes           text          NOT NULL DEFAULT '',
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (trade_file_id, position)
);

CREATE INDEX IF NOT EXISTS idx_tfs_trade_file ON trade_file_suppliers (trade_file_id);
CREATE INDEX IF NOT EXISTS idx_tfs_supplier   ON trade_file_suppliers (supplier_id);
CREATE INDEX IF NOT EXISTS idx_tfs_tenant     ON trade_file_suppliers (tenant_id);

-- ── updated_at trigger ────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_tfs_updated_at ON trade_file_suppliers;
CREATE TRIGGER trg_tfs_updated_at
  BEFORE UPDATE ON trade_file_suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── tenant_id auto-fill trigger (same pattern as 057) ────────────────────────
DROP TRIGGER IF EXISTS trg_tfs_tenant_id ON trade_file_suppliers;
CREATE TRIGGER trg_tfs_tenant_id
  BEFORE INSERT ON trade_file_suppliers
  FOR EACH ROW EXECUTE FUNCTION fn_set_entity_tenant_id();

-- ── Enforce max 5 suppliers per trade_file_id ─────────────────────────────────
CREATE OR REPLACE FUNCTION fn_trade_file_suppliers_max_5()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM trade_file_suppliers
    WHERE trade_file_id = NEW.trade_file_id
  ) >= 5 THEN
    RAISE EXCEPTION 'A trade file cannot have more than 5 suppliers'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tfs_max_5 ON trade_file_suppliers;
CREATE TRIGGER trg_tfs_max_5
  BEFORE INSERT ON trade_file_suppliers
  FOR EACH ROW EXECUTE FUNCTION fn_trade_file_suppliers_max_5();

-- ── Keep trade_files.supplier_id in sync with position=1 row ──────────────────
CREATE OR REPLACE FUNCTION fn_sync_primary_supplier()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  tf_id uuid := COALESCE(NEW.trade_file_id, OLD.trade_file_id);
  primary_row RECORD;
BEGIN
  SELECT supplier_id, purchase_price, currency
    INTO primary_row
    FROM trade_file_suppliers
    WHERE trade_file_id = tf_id
    ORDER BY position ASC
    LIMIT 1;

  IF FOUND THEN
    UPDATE trade_files
      SET supplier_id       = primary_row.supplier_id,
          purchase_price    = primary_row.purchase_price,
          purchase_currency = primary_row.currency::text
      WHERE id = tf_id
        AND (
          supplier_id                IS DISTINCT FROM primary_row.supplier_id OR
          purchase_price             IS DISTINCT FROM primary_row.purchase_price OR
          purchase_currency::text    IS DISTINCT FROM primary_row.currency::text
        );
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_tfs_sync_primary ON trade_file_suppliers;
CREATE TRIGGER trg_tfs_sync_primary
  AFTER INSERT OR UPDATE OR DELETE ON trade_file_suppliers
  FOR EACH ROW EXECUTE FUNCTION fn_sync_primary_supplier();

-- ── RLS (same pattern as trade_obligations) ──────────────────────────────────
ALTER TABLE trade_file_suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tfs_select" ON trade_file_suppliers;
CREATE POLICY "tfs_select" ON trade_file_suppliers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tfs_write" ON trade_file_suppliers;
CREATE POLICY "tfs_write" ON trade_file_suppliers
  FOR ALL TO authenticated
  USING (can_write_transactions())
  WITH CHECK (can_write_transactions());

-- ── Back-fill: mevcut trade_files kayıtları için birincil tedarikçi satırı ───
-- NOT: trade_files.purchase_currency text olarak eklenmiş olabiliyor
-- (Studio'dan manuel); bu yüzden text'e çevirip tekrar currency_code'a cast'liyoruz.
INSERT INTO trade_file_suppliers
  (tenant_id, trade_file_id, supplier_id, position, quantity_mt,
   purchase_price, currency, fx_rate)
SELECT
  tf.tenant_id,
  tf.id,
  tf.supplier_id,
  1,
  GREATEST(tf.tonnage_mt, 0.001),
  COALESCE(tf.purchase_price, 0),
  COALESCE(
    NULLIF(tf.purchase_currency::text, ''),
    tf.currency::text,
    'USD'
  )::currency_code,
  1
FROM trade_files tf
LEFT JOIN trade_file_suppliers tfs ON tfs.trade_file_id = tf.id
WHERE tf.supplier_id IS NOT NULL
  AND tfs.id IS NULL;
