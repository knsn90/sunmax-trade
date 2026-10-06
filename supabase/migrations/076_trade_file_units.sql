-- ─── Dosya bazlı birimler: sayım birimi + miktar birimi ─────────────────────
--
-- Ambalaj listesindeki COUNT UNIT (Reels/Bales/Packages/Cartons) ve QTY UNIT (ADMT/MT) seçimleri
-- dosyada saklanmıyordu; her belgede ürün birimine göre tahmin edilip tekrar seçiliyordu.
-- Sipariş detayından bir kez seçilir, ambalaj listesi / ticari fatura / proforma buna göre üretilir.
-- NULL = seçilmemiş → ürün biriminden türetilir (geriye dönük güvenli).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE trade_files
  ADD COLUMN IF NOT EXISTS count_unit TEXT CHECK (count_unit IN ('Reels','Bales','Packages','Cartons')),
  ADD COLUMN IF NOT EXISTS qty_unit   TEXT CHECK (qty_unit   IN ('ADMT','MT'));

COMMENT ON COLUMN trade_files.count_unit IS 'Ambalaj sayım birimi: Reels | Bales | Packages | Cartons (NULL = üründen türet)';
COMMENT ON COLUMN trade_files.qty_unit   IS 'Miktar birimi: ADMT | MT (NULL = üründen türet)';
