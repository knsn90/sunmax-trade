-- ─── Satış faturası USD kuru ────────────────────────────────────────────────
--
-- Sorun: syncSaleInvoiceTransaction her zaman amount_usd = total, exchange_rate = 1
-- yazıyordu — fatura EUR/TRY/AED olsa bile. €100k fatura → $100k alacak/gelir.
--
-- Mevcut invoices.exchange_rate kolonu TRY-cinsinden (muhasebe yevmiye trigger'ını
-- besler) — USD dönüşümü için kullanılamaz. Bu yüzden ayrı bir USD kur kolonu.
--
-- Konvansiyon: 1 USD = kaç invoice.currency (open.er-api / useRateFor ile aynı).
-- Fatura anında dondurulur; toUSD(total, currency, usd_exchange_rate) ile amount_usd.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS usd_exchange_rate numeric(18,6) NOT NULL DEFAULT 1.0
    CONSTRAINT chk_invoice_usd_rate_positive CHECK (usd_exchange_rate > 0);

COMMENT ON COLUMN invoices.usd_exchange_rate IS
  '1 USD = kaç invoice.currency — satış faturası anında dondurulur, amount_usd hesabı için';
