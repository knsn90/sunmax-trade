-- ============================================================================
-- Migration 048: Multi-Tenant Architecture
-- Mevcut veri KORUNUR — tüm mevcut kayıtlar varsayılan tenant'a atanır.
-- Bağımsız çalışır: gerekli fonksiyonları kendi içinde tanımlar.
-- ============================================================================

-- ════════════════════════════════════════════════════════════
-- ADIM 0: Temel yardımcı fonksiyonlar (zaten varsa atlar)
-- ════════════════════════════════════════════════════════════

-- update_updated_at: timestamp trigger fonksiyonu
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ════════════════════════════════════════════════════════════
-- ADIM 1: tenants tablosu (firma tablosu)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  tax_id          TEXT NOT NULL DEFAULT '',
  address         TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  -- Görsel özelleştirme
  logo_url        TEXT NOT NULL DEFAULT '',
  login_bg_url    TEXT NOT NULL DEFAULT '',
  favicon_url     TEXT NOT NULL DEFAULT '',
  primary_color   TEXT NOT NULL DEFAULT '#dc2626',
  -- Domain & aktiflik
  custom_domain   TEXT NOT NULL DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  -- Meta
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: sadece yoksa oluştur
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_updated_at_tenants'
  ) THEN
    CREATE TRIGGER set_updated_at_tenants
      BEFORE UPDATE ON tenants
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- ADIM 2: Mevcut company_settings'ten varsayılan tenant oluştur
-- ════════════════════════════════════════════════════════════

INSERT INTO tenants (name, tax_id, address, phone, email, logo_url, primary_color)
SELECT
  COALESCE(NULLIF(TRIM(company_name), ''), 'Varsayılan Firma'),
  COALESCE(NULLIF(TRIM(tax_id), ''), ''),
  COALESCE(NULLIF(TRIM(address_line1), ''), ''),
  COALESCE(NULLIF(TRIM(phone), ''), ''),
  COALESCE(NULLIF(TRIM(email), ''), ''),
  COALESCE(NULLIF(TRIM(logo_url), ''), ''),
  '#dc2626'
FROM company_settings
LIMIT 1;

-- Eğer company_settings boşsa en azından bir tenant olsun
INSERT INTO tenants (name, primary_color)
SELECT 'Varsayılan Firma', '#dc2626'
WHERE NOT EXISTS (SELECT 1 FROM tenants);

-- ════════════════════════════════════════════════════════════
-- ADIM 3: profiles tablosuna tenant_id + is_super_admin ekle
-- ════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tenant_id     UUID REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_tenant_idx ON profiles(tenant_id);

-- Mevcut tüm kullanıcıları varsayılan tenant'a ata
UPDATE profiles
SET tenant_id = (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1)
WHERE tenant_id IS NULL;

-- Süper admin ata
UPDATE profiles
SET is_super_admin = true,
    role = 'admin',
    tenant_id = NULL
WHERE email = 'saberalinejad2@gmail.com';

-- ════════════════════════════════════════════════════════════
-- ADIM 4: Tüm iş tablolarına tenant_id ekle
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  default_tenant_id UUID;
  tbl TEXT;
  -- Bu tablolarda immutability/audit trigger'ları olabilir;
  -- UPDATE sırasında geçici olarak tüm trigger'lar devre dışı bırakılır.
  protected_tables TEXT[] := ARRAY[
    'journal_lines', 'journal_entries',
    'transactions', 'bank_transactions'
  ];
BEGIN
  SELECT id INTO default_tenant_id FROM tenants ORDER BY created_at ASC LIMIT 1;

  FOR tbl IN SELECT unnest(ARRAY[
    'customers', 'suppliers', 'service_providers', 'products', 'product_categories',
    'trade_files', 'proformas', 'invoices', 'packing_lists', 'packing_list_items',
    'transactions', 'kasalar', 'bank_accounts', 'account_transfers', 'price_list',
    'trade_file_notes', 'trade_file_attachments', 'attachments',
    'trade_obligations', 'accounts', 'journal_entries', 'journal_lines',
    'accounting_periods', 'bank_transactions', 'reconciliation_matches',
    'payment_allocations', 'payments', 'legacy_transactions', 'legacy_import_batches',
    'transport_plans', 'transport_plates', 'transport_notifications',
    'company_settings', 'audit_logs', 'user_logins'
  ]) LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = tbl AND table_schema = 'public'
    ) THEN
      -- Kolon ekle
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE',
        tbl
      );

      -- Korumalı tablolarda KULLANICI trigger'larını geçici kapat
      -- (DISABLE TRIGGER USER: sadece custom trigger'lar, sistem FK trigger'ları değil)
      IF tbl = ANY(protected_tables) THEN
        EXECUTE format('ALTER TABLE %I DISABLE TRIGGER USER', tbl);
      END IF;

      -- tenant_id ata
      EXECUTE format('UPDATE %I SET tenant_id = $1 WHERE tenant_id IS NULL', tbl)
        USING default_tenant_id;

      -- Kullanıcı trigger'larını geri aç
      IF tbl = ANY(protected_tables) THEN
        EXECUTE format('ALTER TABLE %I ENABLE TRIGGER USER', tbl);
      END IF;

      -- NOT NULL zorla
      EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', tbl);

      -- Index ekle
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)',
        tbl || '_tenant_idx', tbl
      );
      RAISE NOTICE '✓ tenant_id eklendi: %', tbl;
    ELSE
      RAISE NOTICE '⚠ Tablo bulunamadı, atlandı: %', tbl;
    END IF;
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════
-- ADIM 5: UNIQUE kısıtlamaları tenant_id'yi kapsayacak şekilde güncelle
-- ════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_code_key') THEN
    ALTER TABLE customers DROP CONSTRAINT customers_code_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_code_tenant_uniq') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_code_tenant_uniq UNIQUE (code, tenant_id);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_code_key') THEN
    ALTER TABLE suppliers DROP CONSTRAINT suppliers_code_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_code_tenant_uniq') THEN
    ALTER TABLE suppliers ADD CONSTRAINT suppliers_code_tenant_uniq UNIQUE (code, tenant_id);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_providers_code_key') THEN
    ALTER TABLE service_providers DROP CONSTRAINT service_providers_code_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'svc_providers_code_tenant_uniq') THEN
    ALTER TABLE service_providers ADD CONSTRAINT svc_providers_code_tenant_uniq UNIQUE (code, tenant_id);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_code_key') THEN
    ALTER TABLE products DROP CONSTRAINT products_code_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_code_tenant_uniq') THEN
    ALTER TABLE products ADD CONSTRAINT products_code_tenant_uniq UNIQUE (code, tenant_id);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- ADIM 6: Yardımcı fonksiyonlar
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(is_super_admin, false) FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.user_has_role(required_roles user_role[])
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = ANY(required_roles)
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- is_admin / is_manager_or_admin / can_write_transactions — mevcut değilse oluştur
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin','manager') AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_transactions()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND (
        role IN ('admin','manager')
        OR (permissions IS NOT NULL AND 'accounting' = ANY(permissions))
      )
      AND is_active = true
  );
$$;

-- Login sayfası için: domain → tenant bilgisi (authenticated olmadan)
CREATE OR REPLACE FUNCTION public.resolve_tenant_by_domain(p_domain TEXT)
RETURNS TABLE (
  id            UUID,
  name          TEXT,
  logo_url      TEXT,
  login_bg_url  TEXT,
  primary_color TEXT,
  favicon_url   TEXT
) AS $$
  SELECT id, name, logo_url, login_bg_url, primary_color, favicon_url
  FROM tenants
  WHERE LOWER(TRIM(custom_domain)) = LOWER(TRIM(p_domain))
    AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ID ile tenant public bilgisi
CREATE OR REPLACE FUNCTION public.get_tenant_public_info(p_tenant_id UUID)
RETURNS TABLE (
  id            UUID,
  name          TEXT,
  logo_url      TEXT,
  login_bg_url  TEXT,
  primary_color TEXT,
  favicon_url   TEXT
) AS $$
  SELECT id, name, logo_url, login_bg_url, primary_color, favicon_url
  FROM tenants
  WHERE id = p_tenant_id AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Anonymous erişim ver
GRANT EXECUTE ON FUNCTION public.resolve_tenant_by_domain(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_public_info(UUID) TO anon;

-- ════════════════════════════════════════════════════════════
-- ADIM 7: Tüm RLS politikalarını sil ve yeniden yaz
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  tbl  TEXT;
  pol  TEXT;
  tbls TEXT[] := ARRAY[
    'profiles','company_settings','bank_accounts','customers','suppliers',
    'service_providers','products','product_categories','trade_files','proformas',
    'invoices','packing_lists','packing_list_items','transactions','attachments',
    'tenants','kasalar','account_transfers','price_list','trade_file_notes',
    'trade_file_attachments','trade_obligations','accounts','journal_entries',
    'journal_lines','accounting_periods','payment_allocations','payments',
    'legacy_transactions','legacy_import_batches','reconciliation_matches',
    'bank_transactions','audit_logs','user_logins','transport_plans',
    'transport_plates','transport_notifications'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = tbl AND table_schema = 'public'
    ) THEN
      FOR pol IN
        SELECT policyname FROM pg_policies WHERE tablename = tbl AND schemaname = 'public'
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol, tbl);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- ── RLS: tenants tablosu ──────────────────────────────────────────────────────
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants_select" ON tenants
  FOR SELECT TO authenticated
  USING (is_super_admin() OR id = current_tenant_id());

CREATE POLICY "tenants_insert" ON tenants
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "tenants_update" ON tenants
  FOR UPDATE TO authenticated
  USING (is_super_admin() OR (is_admin() AND id = current_tenant_id()))
  WITH CHECK (is_super_admin() OR (is_admin() AND id = current_tenant_id()));

CREATE POLICY "tenants_delete" ON tenants
  FOR DELETE TO authenticated
  USING (is_super_admin());

-- ── RLS: profiles ─────────────────────────────────────────────────────────────
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR id = auth.uid()
    OR tenant_id = current_tenant_id()
  );

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_admin_update" ON profiles
  FOR UPDATE TO authenticated
  USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR is_admin());

-- ── RLS: company_settings ─────────────────────────────────────────────────────
CREATE POLICY "settings_select_auth" ON company_settings
  FOR SELECT TO authenticated
  USING (is_super_admin() OR tenant_id = current_tenant_id());

CREATE POLICY "settings_select_anon" ON company_settings
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "settings_write" ON company_settings
  FOR ALL TO authenticated
  USING (is_super_admin() OR (is_admin() AND tenant_id = current_tenant_id()))
  WITH CHECK (is_super_admin() OR (is_admin() AND tenant_id = current_tenant_id()));

-- ── RLS: bank_accounts & kasalar ─────────────────────────────────────────────
CREATE POLICY "bank_accounts_select" ON bank_accounts
  FOR SELECT TO authenticated
  USING (is_super_admin() OR tenant_id = current_tenant_id());

CREATE POLICY "bank_accounts_write" ON bank_accounts
  FOR ALL TO authenticated
  USING (is_super_admin() OR (is_admin() AND tenant_id = current_tenant_id()))
  WITH CHECK (is_super_admin() OR (is_admin() AND tenant_id = current_tenant_id()));

CREATE POLICY "kasalar_select" ON kasalar
  FOR SELECT TO authenticated
  USING (is_super_admin() OR tenant_id = current_tenant_id());

CREATE POLICY "kasalar_write" ON kasalar
  FOR ALL TO authenticated
  USING (is_super_admin() OR (is_manager_or_admin() AND tenant_id = current_tenant_id()))
  WITH CHECK (is_super_admin() OR (is_manager_or_admin() AND tenant_id = current_tenant_id()));

-- ── RLS: transactions & account_transfers ────────────────────────────────────
CREATE POLICY "txns_select" ON transactions
  FOR SELECT TO authenticated
  USING (is_super_admin() OR tenant_id = current_tenant_id());

CREATE POLICY "txns_insert" ON transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    (is_super_admin() OR can_write_transactions())
    AND (is_super_admin() OR tenant_id = current_tenant_id())
  );

CREATE POLICY "txns_update" ON transactions
  FOR UPDATE TO authenticated
  USING (is_super_admin() OR (can_write_transactions() AND tenant_id = current_tenant_id()));

CREATE POLICY "txns_delete" ON transactions
  FOR DELETE TO authenticated
  USING (is_super_admin() OR (is_admin() AND tenant_id = current_tenant_id()));

CREATE POLICY "transfers_select" ON account_transfers
  FOR SELECT TO authenticated
  USING (is_super_admin() OR tenant_id = current_tenant_id());

CREATE POLICY "transfers_write" ON account_transfers
  FOR ALL TO authenticated
  USING (is_super_admin() OR (can_write_transactions() AND tenant_id = current_tenant_id()))
  WITH CHECK (is_super_admin() OR (can_write_transactions() AND tenant_id = current_tenant_id()));

-- ── RLS: audit_logs ──────────────────────────────────────────────────────────
CREATE POLICY "audit_select" ON audit_logs
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (is_admin() AND tenant_id = current_tenant_id()));

-- ── RLS: user_logins ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_logins' AND table_schema = 'public') THEN
    EXECUTE 'CREATE POLICY "user_logins_select" ON user_logins FOR SELECT TO authenticated USING (is_super_admin() OR user_id = auth.uid())';
  END IF;
END $$;

-- ── RLS: Standart iş tabloları ───────────────────────────────────────────────
DO $$
DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'customers', 'suppliers', 'service_providers', 'products', 'product_categories',
    'trade_files', 'proformas', 'invoices', 'packing_lists', 'packing_list_items',
    'price_list', 'trade_file_notes', 'trade_file_attachments', 'attachments',
    'trade_obligations', 'accounts', 'journal_entries', 'journal_lines',
    'accounting_periods', 'payment_allocations', 'payments',
    'legacy_transactions', 'legacy_import_batches', 'reconciliation_matches',
    'bank_transactions', 'transport_plans', 'transport_plates', 'transport_notifications'
  ]) LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = tbl AND table_schema = 'public'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id())',
        tbl || '_tenant_select', tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK ((is_super_admin() OR is_manager_or_admin()) AND (is_super_admin() OR tenant_id = current_tenant_id()))',
        tbl || '_tenant_insert', tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (is_super_admin() OR (is_manager_or_admin() AND tenant_id = current_tenant_id()))',
        tbl || '_tenant_update', tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (is_super_admin() OR (is_admin() AND tenant_id = current_tenant_id()))',
        tbl || '_tenant_delete', tbl
      );
    END IF;
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════
-- ADIM 8: handle_new_user trigger güncelle
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, tenant_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'viewer',
    (NEW.raw_user_meta_data->>'tenant_id')::UUID
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ════════════════════════════════════════════════════════════
-- ADIM 9: Admin RPC'leri — tenant-aware
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  target_id UUID,
  new_role   user_role
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF NOT is_super_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = target_id AND tenant_id = current_tenant_id()
    ) THEN
      RAISE EXCEPTION 'Cross-tenant operation denied';
    END IF;
  END IF;
  UPDATE profiles SET role = new_role WHERE id = target_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_user_active(
  target_id  UUID,
  new_active BOOLEAN
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  IF NOT is_super_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = target_id AND tenant_id = current_tenant_id()
    ) THEN
      RAISE EXCEPTION 'Cross-tenant operation denied';
    END IF;
  END IF;
  UPDATE profiles SET is_active = new_active WHERE id = target_id;
END;
$$;

-- ════════════════════════════════════════════════════════════
-- ADIM 10: Süper admin firma değiştirme RPC
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.super_admin_switch_tenant(p_tenant_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Sadece süper admin firma geçişi yapabilir';
  END IF;
  IF p_tenant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tenants WHERE id = p_tenant_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Geçersiz firma ID';
  END IF;
  UPDATE profiles SET tenant_id = p_tenant_id WHERE id = auth.uid();
END;
$$;

-- ════════════════════════════════════════════════════════════
-- TAMAMLANDI — Özet
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  tenant_count  INTEGER;
  profile_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO tenant_count  FROM tenants;
  SELECT COUNT(*) INTO profile_count FROM profiles;
  RAISE NOTICE '═══════════════════════════════════════';
  RAISE NOTICE 'Multi-tenant migration tamamlandı!';
  RAISE NOTICE 'Tenant sayısı : %', tenant_count;
  RAISE NOTICE 'Profil sayısı : %', profile_count;
  RAISE NOTICE '═══════════════════════════════════════';
END $$;
