-- Migration 050: Master/referans veriler tüm tenant'lara açık
-- ─────────────────────────────────────────────────────────────────────────────
-- suppliers, products, service_providers gibi master veriler tenant bağımsız
-- okunabilir olmalı. Operasyonel veri (trade_files, transactions vb.) izole
-- kalmaya devam eder.
-- ─────────────────────────────────────────────────────────────────────────────

-- Mevcut tenant-izoleli SELECT politikalarını kaldır
DROP POLICY IF EXISTS "suppliers_tenant_select"         ON suppliers;
DROP POLICY IF EXISTS "products_tenant_select"          ON products;
DROP POLICY IF EXISTS "service_providers_tenant_select" ON service_providers;

-- Tüm giriş yapmış kullanıcılar master veriyi okuyabilir
CREATE POLICY "suppliers_global_select" ON suppliers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "products_global_select" ON products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_providers_global_select" ON service_providers
  FOR SELECT TO authenticated USING (true);

-- YAZI politikaları (INSERT/UPDATE/DELETE) değişmedi —
-- her tenant yalnızca kendi kaydını oluşturup düzenleyebilir.
