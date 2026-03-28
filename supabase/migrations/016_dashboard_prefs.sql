-- Add dashboard_prefs column to profiles for cross-device layout persistence
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS dashboard_prefs jsonb;
