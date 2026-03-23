-- ─── User permissions & soft-delete ──────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS permissions TEXT[],
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ;

-- RPC: admin_update_permissions
CREATE OR REPLACE FUNCTION public.admin_update_permissions(
  target_id       UUID,
  new_permissions TEXT[]
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Permission denied: admin only'; END IF;
  UPDATE profiles SET permissions = new_permissions WHERE id = target_id;
END;
$$;

-- RPC: admin_delete_user (soft-delete: deactivate + mark deleted)
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Permission denied: admin only'; END IF;
  UPDATE profiles SET is_active = false, deleted_at = now() WHERE id = target_id;
END;
$$;
