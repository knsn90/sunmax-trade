-- ─── Taşıma plakalarına yük detayları: kap adedi, ADMT, brüt kg ─────────────
--
-- Sipariş detayındaki Tır Plakaları / Vagon No listesi, ambalaj listesindeki gibi satır satır
-- (plaka, kap adedi, ADMT, brüt kg) girilebilir; yeni ambalaj listesi bu satırlarla hazır açılır.
-- Tipler packing_list_items ile birebir aynı (reels INTEGER, admt/gross NUMERIC(12,3)).
-- Mevcut kayıtlar 0 ile başlar (geriye dönük güvenli).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE transport_plates
  ADD COLUMN IF NOT EXISTS reels           INTEGER       NOT NULL DEFAULT 0 CHECK (reels >= 0),
  ADD COLUMN IF NOT EXISTS admt            NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (admt >= 0),
  ADD COLUMN IF NOT EXISTS gross_weight_kg NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (gross_weight_kg >= 0);

COMMENT ON COLUMN transport_plates.reels IS 'Kap / bobin adedi (ambalaj listesi satırına aktarılır)';
COMMENT ON COLUMN transport_plates.admt IS 'Araç başına ADMT (ambalaj listesi satırına aktarılır)';
COMMENT ON COLUMN transport_plates.gross_weight_kg IS 'Araç başına brüt kg (ambalaj listesi satırına aktarılır)';
