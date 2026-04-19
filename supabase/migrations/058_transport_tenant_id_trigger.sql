-- ============================================================
-- Migration 058: transport tablolarına otomatik tenant_id trigger
--
-- Sorun: transportService INSERT'te tenant_id göndermediği için
-- RLS INSERT policy "tenant_id = current_tenant_id()" koşulunu
-- geçemiyor → "new row violates row-level security policy" hatası.
--
-- Çözüm: BEFORE INSERT trigger → tenant_id'yi parent tablodan kopyala.
-- ============================================================

-- ── transport_plans → trade_files'dan tenant_id al ────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_transport_plan_tenant_id()
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

DROP TRIGGER IF EXISTS trg_transport_plans_tenant_id ON transport_plans;
CREATE TRIGGER trg_transport_plans_tenant_id
  BEFORE INSERT ON transport_plans
  FOR EACH ROW EXECUTE FUNCTION fn_set_transport_plan_tenant_id();

-- ── transport_plates → transport_plans'dan tenant_id al ───────────────────────
CREATE OR REPLACE FUNCTION fn_set_transport_plate_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id
    INTO   NEW.tenant_id
    FROM   transport_plans
    WHERE  id = NEW.transport_plan_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_transport_plates_tenant_id ON transport_plates;
CREATE TRIGGER trg_transport_plates_tenant_id
  BEFORE INSERT ON transport_plates
  FOR EACH ROW EXECUTE FUNCTION fn_set_transport_plate_tenant_id();

-- ── transport_notifications → transport_plans'dan tenant_id al ───────────────
CREATE OR REPLACE FUNCTION fn_set_transport_notif_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id
    INTO   NEW.tenant_id
    FROM   transport_plans
    WHERE  id = NEW.transport_plan_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_transport_notifications_tenant_id ON transport_notifications;
CREATE TRIGGER trg_transport_notifications_tenant_id
  BEFORE INSERT ON transport_notifications
  FOR EACH ROW EXECUTE FUNCTION fn_set_transport_notif_tenant_id();
