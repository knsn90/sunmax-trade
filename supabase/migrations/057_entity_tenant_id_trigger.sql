-- ============================================================
-- Migration 057: customers / suppliers / service_providers /
--                trade_files / products tabloları için
--                otomatik tenant_id BEFORE INSERT trigger'ı
--
-- Sorun: Bu tabloların service katmanı INSERT'e tenant_id eklemediği
--        için RLS INSERT policy "tenant_id = current_tenant_id()"
--        şartını karşılayamıyor → "new row violates row-level
--        security policy" hatası.
--
-- Çözüm: BEFORE INSERT trigger fonksiyonu tenant_id NULL gelirse
--        auth kullanıcısının current_tenant_id()'si ile doldurur.
-- ============================================================

-- ── Ortak trigger fonksiyonu ──────────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_entity_tenant_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ── customers ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_customers_tenant_id ON customers;
CREATE TRIGGER trg_customers_tenant_id
  BEFORE INSERT ON customers
  FOR EACH ROW EXECUTE FUNCTION fn_set_entity_tenant_id();

-- ── suppliers ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_suppliers_tenant_id ON suppliers;
CREATE TRIGGER trg_suppliers_tenant_id
  BEFORE INSERT ON suppliers
  FOR EACH ROW EXECUTE FUNCTION fn_set_entity_tenant_id();

-- ── service_providers ─────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_service_providers_tenant_id ON service_providers;
CREATE TRIGGER trg_service_providers_tenant_id
  BEFORE INSERT ON service_providers
  FOR EACH ROW EXECUTE FUNCTION fn_set_entity_tenant_id();

-- ── trade_files ───────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_trade_files_tenant_id ON trade_files;
CREATE TRIGGER trg_trade_files_tenant_id
  BEFORE INSERT ON trade_files
  FOR EACH ROW EXECUTE FUNCTION fn_set_entity_tenant_id();

-- ── products ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_products_tenant_id ON products;
CREATE TRIGGER trg_products_tenant_id
  BEFORE INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION fn_set_entity_tenant_id();

-- ── transactions (INSERT olmayabilir ama ekleyelim) ───────────
DROP TRIGGER IF EXISTS trg_transactions_tenant_id ON transactions;
CREATE TRIGGER trg_transactions_tenant_id
  BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION fn_set_entity_tenant_id();

-- ── kasalar ───────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_kasalar_tenant_id ON kasalar;
CREATE TRIGGER trg_kasalar_tenant_id
  BEFORE INSERT ON kasalar
  FOR EACH ROW EXECUTE FUNCTION fn_set_entity_tenant_id();

-- ── bank_accounts ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_bank_accounts_tenant_id ON bank_accounts;
CREATE TRIGGER trg_bank_accounts_tenant_id
  BEFORE INSERT ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION fn_set_entity_tenant_id();
