-- ─── Yükümlülük tetikleyicileri: çift kayıt hatasını gider ───────────────────────────
--
-- Sorun: trade_obligations (trade_file_id, party, type) üzerinde UNIQUE kısıt var; ama
--   • fn_create_final_obligations: delivered_admt boştan/sıfırdan dolu değere GEÇTİĞİ HER SEFERİNDE
--     'final' yükümlülüğü ekliyordu. Teslim miktarı silinip yeniden girildiğinde (veya parti
--     toplamı null → değer olduğunda) "duplicate key ... trade_obligations_trade_file_id_party_type_key"
--     hatası veriyor ve dosya güncellemesi tamamen reddediliyordu.
--   • fn_create_advance_obligations: aynı riskin yarışa açık hali (EXISTS kontrolü + INSERT).
--
-- Çözüm: INSERT ... ON CONFLICT (trade_file_id, party, type) DO UPDATE ... WHERE paid_amount = 0
--   → kayıt zaten varsa ve HİÇ ÖDEME yapılmamışsa tutar güncel değere çekilir (balance generated);
--     ödeme yapılmışsa mevcut kayıt korunur. Hata yok, mantık aynı.
-- ─────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_create_advance_obligations()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_advance_sale     numeric(18,4);
  v_advance_purchase numeric(18,4);
BEGIN
  IF NEW.status <> 'sale'
  OR NEW.advance_rate IS NULL OR NEW.advance_rate = 0
  OR NEW.selling_price IS NULL OR NEW.purchase_price IS NULL
  OR COALESCE(NEW.tonnage_mt, 0) = 0 OR NEW.supplier_id IS NULL
  THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM trade_obligations WHERE trade_file_id = NEW.id AND type = 'advance') THEN
    RETURN NEW;
  END IF;

  v_advance_sale     := ROUND(NEW.selling_price  * NEW.tonnage_mt * NEW.advance_rate / 100, 4);
  v_advance_purchase := ROUND(NEW.purchase_price * NEW.tonnage_mt * NEW.advance_rate / 100, 4);

  INSERT INTO trade_obligations
    (trade_file_id, party, customer_id, type, amount, currency, created_by, tenant_id)
  VALUES
    (NEW.id, 'customer', NEW.customer_id, 'advance', v_advance_sale, NEW.currency, auth.uid(), NEW.tenant_id)
  ON CONFLICT (trade_file_id, party, type) DO NOTHING;

  INSERT INTO trade_obligations
    (trade_file_id, party, supplier_id, type, amount, currency, created_by, tenant_id)
  VALUES
    (NEW.id, 'supplier', NEW.supplier_id, 'advance', v_advance_purchase, NEW.currency, auth.uid(), NEW.tenant_id)
  ON CONFLICT (trade_file_id, party, type) DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_create_final_obligations()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_sale_total     numeric(18,4);
  v_purchase_total numeric(18,4);
  v_adv_customer   numeric(18,4) := 0;
  v_adv_supplier   numeric(18,4) := 0;
  v_final_customer numeric(18,4);
  v_final_supplier numeric(18,4);
BEGIN
  IF NEW.delivered_admt IS NULL OR NEW.delivered_admt = 0
  OR (OLD.delivered_admt IS NOT NULL AND OLD.delivered_admt > 0)
  OR NEW.selling_price IS NULL OR NEW.purchase_price IS NULL
  THEN RETURN NEW; END IF;

  v_sale_total     := ROUND(NEW.selling_price  * NEW.delivered_admt, 4);
  v_purchase_total := ROUND(NEW.purchase_price * NEW.delivered_admt, 4);

  SELECT COALESCE(amount,0) INTO v_adv_customer FROM trade_obligations
    WHERE trade_file_id=NEW.id AND party='customer' AND type='advance';
  SELECT COALESCE(amount,0) INTO v_adv_supplier FROM trade_obligations
    WHERE trade_file_id=NEW.id AND party='supplier' AND type='advance';

  v_final_customer := GREATEST(v_sale_total - v_adv_customer, 0);
  v_final_supplier := GREATEST(v_purchase_total - v_adv_supplier, 0);

  IF v_final_customer > 0 THEN
    INSERT INTO trade_obligations
      (trade_file_id, party, customer_id, type, amount, currency, created_by, tenant_id)
    VALUES
      (NEW.id, 'customer', NEW.customer_id, 'final', v_final_customer, NEW.currency, auth.uid(), NEW.tenant_id)
    ON CONFLICT (trade_file_id, party, type)
      DO UPDATE SET amount = EXCLUDED.amount, currency = EXCLUDED.currency
      WHERE trade_obligations.paid_amount = 0;
  END IF;

  IF v_final_supplier > 0 THEN
    INSERT INTO trade_obligations
      (trade_file_id, party, supplier_id, type, amount, currency, created_by, tenant_id)
    VALUES
      (NEW.id, 'supplier', NEW.supplier_id, 'final', v_final_supplier, NEW.currency, auth.uid(), NEW.tenant_id)
    ON CONFLICT (trade_file_id, party, type)
      DO UPDATE SET amount = EXCLUDED.amount, currency = EXCLUDED.currency
      WHERE trade_obligations.paid_amount = 0;
  END IF;

  RETURN NEW;
END;
$function$;
