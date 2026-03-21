-- ============================================================================
-- SunMax Trade Management — Row Level Security Policies
-- ============================================================================
-- Run AFTER 001_complete_schema.sql

-- Helper: check if current user has one of the specified roles
CREATE OR REPLACE FUNCTION public.user_has_role(required_roles user_role[])
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = ANY(required_roles) AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN AS $$
BEGIN RETURN user_has_role(ARRAY['admin']::user_role[]); END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_manager_or_admin() RETURNS BOOLEAN AS $$
BEGIN RETURN user_has_role(ARRAY['admin', 'manager']::user_role[]); END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.can_write_transactions() RETURNS BOOLEAN AS $$
BEGIN RETURN user_has_role(ARRAY['admin', 'manager', 'accountant']::user_role[]); END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE proformas ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE packing_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE packing_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- All authenticated can read all business data
DO $$ 
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'profiles','company_settings','bank_accounts','customers','suppliers',
    'service_providers','products','trade_files','proformas','invoices',
    'packing_lists','packing_list_items','transactions','attachments'
  ]) LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', t || '_select', t);
  END LOOP;
END $$;

-- Admin-only tables
CREATE POLICY "settings_write" ON company_settings FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "banks_write" ON bank_accounts FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Manager+ write, admin delete (standard pattern for most tables)
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'customers','suppliers','service_providers','products',
    'trade_files','proformas','invoices','packing_lists'
  ]) LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (is_manager_or_admin())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (is_manager_or_admin())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (is_admin())', t || '_delete', t);
  END LOOP;
END $$;

-- Packing list items follow parent
CREATE POLICY "pl_items_write" ON packing_list_items FOR ALL TO authenticated USING (is_manager_or_admin()) WITH CHECK (is_manager_or_admin());

-- Transactions: accountants can also write
CREATE POLICY "txns_insert" ON transactions FOR INSERT TO authenticated WITH CHECK (can_write_transactions());
CREATE POLICY "txns_update" ON transactions FOR UPDATE TO authenticated USING (can_write_transactions());
CREATE POLICY "txns_delete" ON transactions FOR DELETE TO authenticated USING (is_admin());

-- Attachments
CREATE POLICY "attach_insert" ON attachments FOR INSERT TO authenticated WITH CHECK (is_manager_or_admin());
CREATE POLICY "attach_delete" ON attachments FOR DELETE TO authenticated USING (is_admin());

-- Profiles: users can update own, admins can update any
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_admin_update" ON profiles FOR UPDATE TO authenticated USING (is_admin());

-- Audit logs: admin read-only (writes via SECURITY DEFINER trigger)
CREATE POLICY "audit_admin_read" ON audit_logs FOR SELECT TO authenticated USING (is_admin());
