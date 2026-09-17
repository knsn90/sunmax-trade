-- ─── Navlun para birimi: trade_files.freight_currency ───────────────────────
--
-- Sorun: freight_cost tek bir sayıydı, para birimi yoktu. Satış/alış farklı
-- para birimlerinde olduğunda (ör. satış EUR, alış USD) navlunun hangi birimde
-- olduğu belirsizdi ve formda seçilemiyordu.
--
-- Çözüm: freight_currency kolonu eklenir. Mevcut kayıtlarda varsayılan 'USD'
-- (geriye dönük güvenli — eski navlunlar zaten USD varsayılıyordu).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE trade_files
  ADD COLUMN IF NOT EXISTS freight_currency text NOT NULL DEFAULT 'USD';

COMMENT ON COLUMN trade_files.freight_currency IS 'Navlun (freight_cost) para birimi: USD | EUR | TRY | AED | GBP';
