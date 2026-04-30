-- ============================================================================
-- 062_fix_notes_rls.sql
--
-- trade_file_notes RLS politikasını düzelt.
-- Eski politika auth.role() kullanıyordu — INSERT için WITH CHECK gerekir.
-- ============================================================================

ALTER TABLE trade_file_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth users can manage notes" ON trade_file_notes;

CREATE POLICY "tfn_select" ON trade_file_notes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tfn_insert" ON trade_file_notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "tfn_delete" ON trade_file_notes
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
