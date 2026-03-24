-- ============================================================================
-- Tır/Tren Planlama ve Plaka Bildirim Modülü
-- ============================================================================

CREATE TABLE transport_plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_file_id     UUID NOT NULL REFERENCES trade_files(id) ON DELETE CASCADE,
  loading_date      DATE,
  freight_company   TEXT DEFAULT '',
  notes             TEXT DEFAULT '',
  customs_approval  BOOLEAN NOT NULL DEFAULT false,
  tir_carnet        BOOLEAN NOT NULL DEFAULT false,
  t1_document       BOOLEAN NOT NULL DEFAULT false,
  created_by        UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_transport_plan_file UNIQUE (trade_file_id)
);

CREATE TABLE transport_plates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transport_plan_id UUID NOT NULL REFERENCES transport_plans(id) ON DELETE CASCADE,
  plate_no          TEXT NOT NULL CHECK (length(trim(plate_no)) > 0),
  driver_name       TEXT DEFAULT '',
  plate_status      TEXT NOT NULL DEFAULT 'active'
                      CHECK (plate_status IN ('active','cancelled','changed')),
  replacement_plate TEXT DEFAULT '',
  cancel_reason     TEXT DEFAULT '',
  sort_order        INTEGER DEFAULT 0,
  notified_groups   TEXT[] DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transport_notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transport_plan_id UUID NOT NULL REFERENCES transport_plans(id) ON DELETE CASCADE,
  target_group      TEXT NOT NULL
                      CHECK (target_group IN ('customs','warehouse','port','company')),
  notification_text TEXT NOT NULL DEFAULT '',
  send_status       TEXT NOT NULL DEFAULT 'pending'
                      CHECK (send_status IN ('pending','sent','resent')),
  sent_at           TIMESTAMPTZ,
  sent_by           UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_notif_plan_group UNIQUE (transport_plan_id, target_group)
);

-- Indexes
CREATE INDEX idx_transport_plans_file    ON transport_plans(trade_file_id);
CREATE INDEX idx_transport_plans_date    ON transport_plans(loading_date);
CREATE INDEX idx_transport_plates_plan   ON transport_plates(transport_plan_id);
CREATE INDEX idx_transport_notifs_plan   ON transport_notifications(transport_plan_id);

-- updated_at triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON transport_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON transport_plates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON transport_notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE transport_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_plates ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tp_select"  ON transport_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "tp_insert"  ON transport_plans FOR INSERT TO authenticated WITH CHECK (is_manager_or_admin());
CREATE POLICY "tp_update"  ON transport_plans FOR UPDATE TO authenticated USING (is_manager_or_admin());
CREATE POLICY "tp_delete"  ON transport_plans FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "tpl_select" ON transport_plates FOR SELECT TO authenticated USING (true);
CREATE POLICY "tpl_insert" ON transport_plates FOR INSERT TO authenticated WITH CHECK (is_manager_or_admin());
CREATE POLICY "tpl_update" ON transport_plates FOR UPDATE TO authenticated USING (is_manager_or_admin());
CREATE POLICY "tpl_delete" ON transport_plates FOR DELETE TO authenticated USING (is_manager_or_admin());

CREATE POLICY "tn_select"  ON transport_notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "tn_insert"  ON transport_notifications FOR INSERT TO authenticated WITH CHECK (is_manager_or_admin());
CREATE POLICY "tn_update"  ON transport_notifications FOR UPDATE TO authenticated USING (is_manager_or_admin());
