-- ─── Geçmiş dosyalar: ambalaj listesi bilgilerini sipariş detayına işle ──────────────
--
-- Sipariş detayındaki Tır Plakaları / Vagon tablosu ve belge alanları, mevcut dosyalarda boştu;
-- bilgiler yalnızca ambalaj listesindeydi. Bu geçiş, dosya başına TEK ambalaj listesinden
-- (onaylı olan; yoksa en yüksek ADMT'li; yoksa en yeni) şunları doldurur:
--   • transport_plates : araç satırları (plaka, kap, ADMT, brüt) — yalnızca henüz plakası olmayan planlara
--   • trade_files      : yükleme türü, sayım/miktar birimi, CB No (SEPTİ), sigorta, brüt, paket
-- Aynı dosyadaki birden fazla liste aynı yükün sürümleridir (çift sayım olmasın diye biri seçilir).
-- Tamamen boş satırlar (plaka yok, değer 0) atlanır. İdempotent: ikinci çalıştırma hiçbir şey değiştirmez.
-- ─────────────────────────────────────────────────────────────────────────────────────

-- 1) Planı olmayan dosyalara taşıma planı
INSERT INTO transport_plans (trade_file_id, tenant_id)
SELECT c.trade_file_id, t.tenant_id
FROM (
  SELECT DISTINCT ON (trade_file_id) *
  FROM packing_lists
  WHERE deleted_at IS NULL AND trade_file_id IS NOT NULL
  ORDER BY trade_file_id, (doc_status = 'approved') DESC, total_admt DESC, pl_date DESC, created_at DESC
) c
JOIN trade_files t ON t.id = c.trade_file_id
WHERE t.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM packing_list_items i WHERE i.packing_list_id = c.id AND trim(i.vehicle_plate) <> '')
  AND NOT EXISTS (SELECT 1 FROM transport_plans tp WHERE tp.trade_file_id = c.trade_file_id);

-- 2) Henüz plakası olmayan planlara araç satırları
INSERT INTO transport_plates (transport_plan_id, tenant_id, plate_no, reels, admt, gross_weight_kg, sort_order)
SELECT tp.id, tp.tenant_id, upper(trim(i.vehicle_plate)), i.reels, i.admt, i.gross_weight_kg,
       (row_number() OVER (PARTITION BY tp.id ORDER BY i.item_order) - 1)::int
FROM (
  SELECT DISTINCT ON (trade_file_id) *
  FROM packing_lists
  WHERE deleted_at IS NULL AND trade_file_id IS NOT NULL
  ORDER BY trade_file_id, (doc_status = 'approved') DESC, total_admt DESC, pl_date DESC, created_at DESC
) c
JOIN packing_list_items i ON i.packing_list_id = c.id
JOIN transport_plans tp ON tp.trade_file_id = c.trade_file_id
WHERE trim(i.vehicle_plate) <> ''
  AND NOT EXISTS (SELECT 1 FROM transport_plates x WHERE x.transport_plan_id = tp.id);

-- 3) Dosya alanları (yalnızca boşları doldur; yükleme türü kayıtlı belgeyi izler)
UPDATE trade_files t SET
  transport_mode  = c.transport_mode::text::transport_mode,
  count_unit      = COALESCE(t.count_unit, CASE WHEN c.unit_label IN ('Reels','Bales','Packages','Cartons') THEN c.unit_label END),
  qty_unit        = COALESCE(t.qty_unit,   CASE WHEN c.qty_unit   IN ('ADMT','MT') THEN c.qty_unit END),
  septi_ref       = CASE WHEN COALESCE(t.septi_ref,'') = '' THEN NULLIF(c.cb_no,'') ELSE t.septi_ref END,
  insurance_tr    = CASE WHEN COALESCE(t.insurance_tr,'') = '' AND COALESCE(t.insurance_ir,'') = ''
                         THEN NULLIF(c.insurance_no,'') ELSE t.insurance_tr END,
  gross_weight_kg = CASE WHEN COALESCE(t.gross_weight_kg,0) = 0 AND c.total_gross_kg > 0 THEN c.total_gross_kg ELSE t.gross_weight_kg END,
  packages        = CASE WHEN COALESCE(t.packages,0) = 0 AND c.total_reels > 0 THEN c.total_reels ELSE t.packages END
FROM (
  SELECT DISTINCT ON (trade_file_id) *
  FROM packing_lists
  WHERE deleted_at IS NULL AND trade_file_id IS NOT NULL
  ORDER BY trade_file_id, (doc_status = 'approved') DESC, total_admt DESC, pl_date DESC, created_at DESC
) c
WHERE c.trade_file_id = t.id AND t.deleted_at IS NULL;
