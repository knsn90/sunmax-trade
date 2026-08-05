-- ─── Performans: RLS auth_initplan + sorgu-ilişkili FK indexleri ──────────────
--
-- Bağlam: Disk IO bütçesi tükenme uyarısı. İki düşük-riskli iyileştirme:
--   1) RLS politikalarında auth.uid() her SATIRDA yeniden hesaplanıyordu →
--      (select auth.uid()) ile sarınca Postgres bir kez (InitPlan) hesaplar.
--      Mantık birebir korunur, yalnızca auth.uid() sarılır.
--   2) Sorguda (join/filter) kullanılan foreign key'lere kapsayıcı index.
--      NOT: created_by/approved_by/posted_by gibi audit-only FK'lere index
--      EKLENMEZ — hiç sorgulanmadıkları için sadece write IO artırırlardı.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) RLS auth_initplan optimizasyonu (ALTER POLICY — kesintisiz) ────────────
ALTER POLICY profiles_select ON public.profiles
  USING (is_super_admin_global() OR (id = (select auth.uid())) OR (tenant_id = current_tenant_id()));

ALTER POLICY profiles_update_own ON public.profiles
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

ALTER POLICY tfn_delete ON public.trade_file_notes
  USING ((select auth.uid()) IS NOT NULL);

ALTER POLICY tfn_insert ON public.trade_file_notes
  WITH CHECK ((select auth.uid()) IS NOT NULL);

ALTER POLICY user_logins_select ON public.user_logins
  USING (is_super_admin() OR (is_admin() AND (tenant_id = current_tenant_id())) OR (user_id = (select auth.uid())));

ALTER POLICY user_tenants_select ON public.user_tenants
  USING ((user_id = (select auth.uid())) OR is_super_admin_global());

-- ── 2) Sorgu-ilişkili FK indexleri ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_accounts_parent_id             ON public.accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_accounts_company_id            ON public.accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_customers_parent_customer_id   ON public.customers(parent_customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_consignee_customer_id ON public.invoices(consignee_customer_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_period_id      ON public.journal_entries(period_id);
CREATE INDEX IF NOT EXISTS idx_legacy_transactions_customer_id ON public.legacy_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_legacy_transactions_supplier_id ON public.legacy_transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_packing_lists_customer_id      ON public.packing_lists(customer_id);
CREATE INDEX IF NOT EXISTS idx_packing_lists_consignee_customer_id ON public.packing_lists(consignee_customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_bank_account_id       ON public.payments(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_price_list_product_id          ON public.price_list(product_id);
CREATE INDEX IF NOT EXISTS idx_price_list_supplier_id         ON public.price_list(supplier_id);
CREATE INDEX IF NOT EXISTS idx_proformas_consignee_customer_id ON public.proformas(consignee_customer_id);
CREATE INDEX IF NOT EXISTS idx_trade_files_product_id         ON public.trade_files(product_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant_id         ON public.user_tenants(tenant_id);
