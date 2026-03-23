-- ─── Fix: Admin can update any profile role/status ────────────────────────────
-- Drop old policies and recreate with explicit WITH CHECK
DROP POLICY IF EXISTS "profiles_admin_update" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

-- Users can update only their own non-role columns
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins can update any profile (role, is_active, full_name, etc.)
CREATE POLICY "profiles_admin_update" ON profiles
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ─── RPC: update_user_role (SECURITY DEFINER bypasses RLS) ────────────────────
CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  target_id   UUID,
  new_role    user_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;
  UPDATE profiles SET role = new_role WHERE id = target_id;
END;
$$;

-- ─── RPC: admin_toggle_user_active ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_toggle_user_active(
  target_id  UUID,
  new_active BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;
  UPDATE profiles SET is_active = new_active WHERE id = target_id;
END;
$$;
