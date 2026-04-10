-- Migration 045: Auto-update parent delivered_admt when batch status changes
-- ─────────────────────────────────────────────────────────────────────────────
-- Partili dosyalarda bir alt parti tamamlandığında (veya iptal edildiğinde)
-- ana dosyanın delivered_admt alanı otomatik olarak güncellenir.
-- Bu değer müşteri raporlarında ve detay sayfasında "Teslim Edilen" olarak görünür.

-- ── 1. Trigger function ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_update_parent_delivered_admt()
RETURNS TRIGGER AS $$
BEGIN
  -- Sadece alt partiler için (parent_file_id mevcut)
  IF NEW.parent_file_id IS NOT NULL THEN
    UPDATE trade_files
    SET delivered_admt = (
      SELECT COALESCE(SUM(b.tonnage_mt), 0)
      FROM trade_files b
      WHERE b.parent_file_id = NEW.parent_file_id
        AND b.status = 'completed'
    )
    WHERE id = NEW.parent_file_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. Trigger ───────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_update_parent_delivered_admt ON trade_files;

CREATE TRIGGER trg_update_parent_delivered_admt
AFTER UPDATE OF status ON trade_files
FOR EACH ROW
EXECUTE FUNCTION fn_update_parent_delivered_admt();

-- ── 3. Mevcut veriler için tek seferlik güncelleme ───────────────────────────
-- Var olan partili dosyaların delivered_admt'sini tamamlanan partilerden hesapla
UPDATE trade_files p
SET delivered_admt = sub.total
FROM (
  SELECT
    parent_file_id,
    COALESCE(SUM(CASE WHEN status = 'completed' THEN tonnage_mt ELSE 0 END), 0) AS total
  FROM trade_files
  WHERE parent_file_id IS NOT NULL
  GROUP BY parent_file_id
) sub
WHERE p.id = sub.parent_file_id
  AND sub.total > 0;
