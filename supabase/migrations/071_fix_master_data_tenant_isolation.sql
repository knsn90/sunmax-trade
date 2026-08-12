-- ─── Güvenlik: master data cross-tenant sızıntısı düzeltmesi ──────────────────
--
-- SORUN: products / suppliers / service_providers SELECT politikaları
-- `USING (true)` idi (050_master_data_global_read.sql) → HER tenant, diğer
-- tenant'ların ürün/tedarikçi/hizmet sağlayıcılarını görebiliyordu.
-- (INSERT/UPDATE/DELETE zaten tenant-scoped'du.)
--
-- ÇÖZÜM: SELECT'i de tenant'a daralt (super admin hariç). Tüm satırların
-- tenant_id'si dolu olduğu doğrulandı → kimsenin kendi verisi gizlenmez.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS products_global_select ON public.products;
CREATE POLICY products_tenant_select ON public.products
  FOR SELECT TO authenticated
  USING ((select is_super_admin_global()) OR (tenant_id = current_tenant_id()));

DROP POLICY IF EXISTS suppliers_global_select ON public.suppliers;
CREATE POLICY suppliers_tenant_select ON public.suppliers
  FOR SELECT TO authenticated
  USING ((select is_super_admin_global()) OR (tenant_id = current_tenant_id()));

DROP POLICY IF EXISTS service_providers_global_select ON public.service_providers;
CREATE POLICY service_providers_tenant_select ON public.service_providers
  FOR SELECT TO authenticated
  USING ((select is_super_admin_global()) OR (tenant_id = current_tenant_id()));
