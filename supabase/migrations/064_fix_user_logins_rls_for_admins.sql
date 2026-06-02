-- user_logins: adminler kendi tenant'larındaki tüm girişleri görebilsin
-- Önceki politika sadece super_admin'e veya kendi kaydına izin veriyordu
DROP POLICY IF EXISTS user_logins_select ON user_logins;

CREATE POLICY user_logins_select ON user_logins
  FOR SELECT
  USING (
    is_super_admin()
    OR (is_admin() AND tenant_id = current_tenant_id())
    OR (user_id = auth.uid())
  );
