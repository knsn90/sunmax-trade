-- ─── Login / Logout event tracking ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_logins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event      TEXT NOT NULL CHECK (event IN ('login', 'logout')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_logins_user    ON user_logins(user_id);
CREATE INDEX idx_user_logins_created ON user_logins(created_at DESC);

ALTER TABLE user_logins ENABLE ROW LEVEL SECURITY;

-- Only admins can read; insert allowed for authenticated (self-log)
CREATE POLICY "logins_admin_read"   ON user_logins FOR SELECT    TO authenticated USING (is_admin());
CREATE POLICY "logins_self_insert"  ON user_logins FOR INSERT    TO authenticated WITH CHECK (user_id = auth.uid());
