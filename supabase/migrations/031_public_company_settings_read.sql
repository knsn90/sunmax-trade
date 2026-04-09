-- Allow anonymous (unauthenticated) users to read company_settings.
-- This is needed so the login page can display the company logo and name
-- before the user has authenticated.
CREATE POLICY "company_settings_anon_select"
  ON company_settings
  FOR SELECT
  TO anon
  USING (true);
