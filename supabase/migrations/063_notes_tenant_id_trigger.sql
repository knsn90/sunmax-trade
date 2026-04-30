-- ============================================================================
-- 063_notes_tenant_id_trigger.sql
--
-- trade_file_notes tablosuna eksik tenant_id trigger'ı ekle.
-- Migration 048 tenant_id NOT NULL yaptı ama trigger eklenmemişti.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_tfn_tenant_id ON trade_file_notes;
CREATE TRIGGER trg_tfn_tenant_id
  BEFORE INSERT ON trade_file_notes
  FOR EACH ROW EXECUTE FUNCTION fn_set_entity_tenant_id();
