-- ============================================================
-- Migration 052: Doküman tablolarına otomatik tenant_id trigger'ı
--
-- Sorun: proformas, invoices, packing_lists servisleri INSERT'te
-- tenant_id göndermediği için RLS INSERT policy'si red ediyor.
-- Çözüm: BEFORE INSERT trigger → tenant_id'yi parent trade_file'dan kopyala.
-- ============================================================

-- ── Ortak trigger fonksiyonu (proformas, invoices, packing_lists) ──
CREATE OR REPLACE FUNCTION fn_set_doc_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id
    INTO   NEW.tenant_id
    FROM   trade_files
    WHERE  id = NEW.trade_file_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Proformas ──
DROP TRIGGER IF EXISTS trg_proformas_tenant_id ON proformas;
CREATE TRIGGER trg_proformas_tenant_id
  BEFORE INSERT ON proformas
  FOR EACH ROW EXECUTE FUNCTION fn_set_doc_tenant_id();

-- ── Invoices ──
DROP TRIGGER IF EXISTS trg_invoices_tenant_id ON invoices;
CREATE TRIGGER trg_invoices_tenant_id
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION fn_set_doc_tenant_id();

-- ── Packing Lists ──
DROP TRIGGER IF EXISTS trg_packing_lists_tenant_id ON packing_lists;
CREATE TRIGGER trg_packing_lists_tenant_id
  BEFORE INSERT ON packing_lists
  FOR EACH ROW EXECUTE FUNCTION fn_set_doc_tenant_id();

-- ── Packing List Items (parent packing_list'ten al) ──
CREATE OR REPLACE FUNCTION fn_set_packing_item_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id
    INTO   NEW.tenant_id
    FROM   packing_lists
    WHERE  id = NEW.packing_list_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_packing_list_items_tenant_id ON packing_list_items;
CREATE TRIGGER trg_packing_list_items_tenant_id
  BEFORE INSERT ON packing_list_items
  FOR EACH ROW EXECUTE FUNCTION fn_set_packing_item_tenant_id();
