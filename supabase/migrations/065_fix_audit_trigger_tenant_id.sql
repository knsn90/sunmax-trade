-- audit_trigger_fn() güncelleme:
-- Migration 048 audit_logs'a tenant_id ekledi fakat trigger güncellenemedi.
-- Bu yüzden yeni loglar tenant_id=NULL ile yazılıyor ve RLS hiçbirini göstermiyordu.

CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Önce etkilenen satırdan tenant_id al (tüm iş tablolarında mevcut)
  -- Yoksa kullanıcının profil tenant_id'sini kullan
  IF TG_OP = 'DELETE' THEN
    v_tenant_id := COALESCE(
      (to_jsonb(OLD)->>'tenant_id')::uuid,
      (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    );
    INSERT INTO audit_logs(user_id, action, table_name, record_id, old_values, tenant_id)
    VALUES (auth.uid(), 'delete', TG_TABLE_NAME, OLD.id, to_jsonb(OLD), v_tenant_id);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    v_tenant_id := COALESCE(
      (to_jsonb(NEW)->>'tenant_id')::uuid,
      (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    );
    INSERT INTO audit_logs(user_id, action, table_name, record_id, new_values, tenant_id)
    VALUES (auth.uid(), 'create', TG_TABLE_NAME, NEW.id, to_jsonb(NEW), v_tenant_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_tenant_id := COALESCE(
      (to_jsonb(NEW)->>'tenant_id')::uuid,
      (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    );
    INSERT INTO audit_logs(user_id, action, table_name, record_id, old_values, new_values, tenant_id)
    VALUES (auth.uid(), 'update', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW), v_tenant_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mevcut tenant_id=NULL kayıtları düzelt (geriye dönük):
-- Her kaydı kendi verisindeki tenant_id ile eşleştirmeye çalış
-- Kendi tablosundaki veriyi bularak tenant_id'yi tahmin et
UPDATE audit_logs al
SET tenant_id = (
  SELECT p.tenant_id
  FROM profiles p
  WHERE p.id = al.user_id
  LIMIT 1
)
WHERE al.tenant_id IS NULL
  AND al.user_id IS NOT NULL;
