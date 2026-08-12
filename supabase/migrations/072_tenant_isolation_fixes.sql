-- ─── Güvenlik/izolasyon düzeltmeleri ─────────────────────────────────────────

-- 1) product_categories: tenant_id auto-set trigger'ı EKSİKTİ → INSERT, RLS
--    WITH CHECK (tenant_id = current_tenant_id()) ihlali veriyordu ("new row
--    violates row-level security policy"). Diğer tablolarla aynı trigger eklendi.
DROP TRIGGER IF EXISTS trg_product_categories_tenant_id ON public.product_categories;
CREATE TRIGGER trg_product_categories_tenant_id
  BEFORE INSERT ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION fn_set_entity_tenant_id();

-- 2) trade_file_notes: geniş eski politikalar (USING true / auth.uid() IS NOT NULL)
--    cross-tenant okuma/yazmaya izin veriyordu. Kaldırıldı; tenant-scoped
--    (trade_file_notes_tenant_*) politikalar + trg_tfn_tenant_id kalıyor.
DROP POLICY IF EXISTS tfn_select ON public.trade_file_notes;
DROP POLICY IF EXISTS tfn_insert ON public.trade_file_notes;
DROP POLICY IF EXISTS tfn_delete ON public.trade_file_notes;

-- 3) trade_file_suppliers: SELECT USING(true) + write policy tenant kontrolsüz
--    (can_write_transactions) → cross-tenant sızıntı. Tenant'a daraltıldı.
--    (Tüm satırlarda tenant_id dolu + tenant trigger var → güvenli.)
DROP POLICY IF EXISTS tfs_select ON public.trade_file_suppliers;
DROP POLICY IF EXISTS tfs_write  ON public.trade_file_suppliers;
CREATE POLICY tfs_tenant_select ON public.trade_file_suppliers
  FOR SELECT TO authenticated
  USING ((select is_super_admin_global()) OR (tenant_id = current_tenant_id()));
CREATE POLICY tfs_tenant_write ON public.trade_file_suppliers
  FOR ALL TO authenticated
  USING ((select is_super_admin()) OR (can_write_transactions() AND tenant_id = current_tenant_id()))
  WITH CHECK ((select is_super_admin()) OR (can_write_transactions() AND tenant_id = current_tenant_id()));
