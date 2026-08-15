-- ─── Birim fiyat kolonları: 2 → 4 ondalık ───────────────────────────────────
--
-- Sorun: purchase_price / selling_price / unit_price kolonları numeric(12,2) idi.
-- m²/kg bazlı ürünlerde birim fiyat 0,1638 → 0,16 olarak yuvarlanıp saklanıyordu
-- (ör. Tissue cam tülü, fluff pulp). Bu, dosya bazlı Kâr/Zarar ekranında üst KPI
-- ile alt "Net Kâr" arasında sapmaya yol açmıştı (rapor fatura-bazlı hesaba
-- çevrilerek düzeltildi, ama kolonun kendisi hâlâ kayıplıydı).
--
-- Çözüm: birim FİYAT kolonlarını numeric(14,4)'e genişlet. Para TOPLAMI kolonları
-- (amount, total, subtotal = numeric(14,2)) doğru — para 2 ondalık kalır, dokunulmaz.
-- Bu genişletme kayıpsız ve geriye dönük güvenli (mevcut 2-ondalık değerler aynen sığar).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE trade_files  ALTER COLUMN purchase_price TYPE numeric(14,4);
ALTER TABLE trade_files  ALTER COLUMN selling_price  TYPE numeric(14,4);
ALTER TABLE invoices     ALTER COLUMN unit_price      TYPE numeric(14,4);
ALTER TABLE proformas    ALTER COLUMN unit_price      TYPE numeric(14,4);

COMMENT ON COLUMN trade_files.purchase_price IS 'Birim alış fiyatı (numeric(14,4) — m²/kg bazlı ürünlerde 4 ondalık hassasiyet)';
COMMENT ON COLUMN trade_files.selling_price  IS 'Birim satış fiyatı (numeric(14,4) — m²/kg bazlı ürünlerde 4 ondalık hassasiyet)';
COMMENT ON COLUMN invoices.unit_price        IS 'Fatura birim fiyatı (numeric(14,4))';
COMMENT ON COLUMN proformas.unit_price       IS 'Proforma birim fiyatı (numeric(14,4))';
