-- ─── Güvenlik: app_settings RLS kilidi ───────────────────────────────────────
--
-- ÖNCE: app_settings üzerinde birden çok USING(true) politikası vardı →
-- HER tenant'tan HER authenticated kullanıcı tüm ayarları (Anthropic API
-- anahtarı dahil) okuyup yazabiliyordu (cross-tenant sır sızıntısı).
--
-- Artık AI çağrıları `anthropic-proxy` edge function üzerinden gidiyor ve
-- anahtar sunucu-sırrı (ANTHROPIC_API_KEY) olarak duruyor — client'ın
-- app_settings'e erişmesine gerek YOK. Tablo yalnızca super admin'e açılır.
-- (Service role / migration'lar RLS'i baypas eder; yönetim oradan yapılır.)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_write  ON public.app_settings;
DROP POLICY IF EXISTS app_settings_select ON public.app_settings;
DROP POLICY IF EXISTS "read"   ON public.app_settings;
DROP POLICY IF EXISTS "insert" ON public.app_settings;
DROP POLICY IF EXISTS "update" ON public.app_settings;
DROP POLICY IF EXISTS "delete" ON public.app_settings;

CREATE POLICY app_settings_superadmin_all ON public.app_settings
  FOR ALL TO authenticated
  USING ((select is_super_admin_global()))
  WITH CHECK ((select is_super_admin_global()));
