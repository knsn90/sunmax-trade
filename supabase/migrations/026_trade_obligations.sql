-- ============================================================================
-- 026_trade_obligations.sql
--
-- Trade-File–based obligation & payment tracking system.
--
-- DESIGN PHILOSOPHY
-- ─────────────────
-- PAYMENT TRACKING only — NO automatic journal entries.
-- Accounting (journal_entries) is managed independently.
-- Trade files track WHO owes WHAT, not the accounting side.
--
-- KEY TABLES
--   trade_obligations   – what each party owes, per trade file
--   payments            – global receipts / disbursements (party-level)
--   payment_allocations – links a payment to one or more obligations
-- ============================================================================

-- ─── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE obligation_party  AS ENUM ('customer', 'supplier');
CREATE TYPE obligation_type   AS ENUM ('advance', 'final', 'adjustment');
CREATE TYPE obligation_status AS ENUM ('pending', 'partial', 'settled', 'cancelled');
CREATE TYPE payment_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE allocation_status AS ENUM ('active', 'reversed');

-- ─── trade_files: add advance_rate ───────────────────────────────────────────
ALTER TABLE trade_files
  ADD COLUMN IF NOT EXISTS advance_rate NUMERIC(5,2) DEFAULT 0
    CHECK (advance_rate >= 0 AND advance_rate <= 100);

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE: trade_obligations
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE trade_obligations (
  id               uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_file_id    uuid              NOT NULL REFERENCES trade_files(id) ON DELETE RESTRICT,
  party            obligation_party  NOT NULL,
  customer_id      uuid              REFERENCES customers(id),
  supplier_id      uuid              REFERENCES suppliers(id),
  type             obligation_type   NOT NULL,
  amount           numeric(18,4)     NOT NULL CHECK (amount > 0),
  currency         currency_code     NOT NULL DEFAULT 'USD',
  paid_amount      numeric(18,4)     NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  balance          numeric(18,4)     GENERATED ALWAYS AS (amount - paid_amount) STORED,
  status           obligation_status NOT NULL DEFAULT 'pending',
  due_date         date,
  notes            text              DEFAULT '',
  created_by       uuid              REFERENCES profiles(id),
  created_at       timestamptz       NOT NULL DEFAULT now(),
  updated_at       timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT chk_obligation_party CHECK (
    (party = 'customer' AND customer_id IS NOT NULL AND supplier_id IS NULL) OR
    (party = 'supplier' AND supplier_id IS NOT NULL AND customer_id IS NULL)
  ),
  CONSTRAINT chk_paid_lte_amount CHECK (paid_amount <= amount),
  UNIQUE (trade_file_id, party, type)
);

CREATE INDEX idx_tob_trade_file ON trade_obligations (trade_file_id);
CREATE INDEX idx_tob_customer   ON trade_obligations (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_tob_supplier   ON trade_obligations (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX idx_tob_status     ON trade_obligations (status);

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE: payments
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE payments (
  id                   uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_date         date              NOT NULL DEFAULT CURRENT_DATE,
  direction            payment_direction NOT NULL,
  customer_id          uuid              REFERENCES customers(id),
  supplier_id          uuid              REFERENCES suppliers(id),
  amount               numeric(18,4)     NOT NULL CHECK (amount > 0),
  currency             currency_code     NOT NULL DEFAULT 'USD',
  exchange_rate        numeric(18,6)     NOT NULL DEFAULT 1.0 CHECK (exchange_rate > 0),
  amount_usd           numeric(18,4)     NOT NULL CHECK (amount_usd >= 0),
  unallocated_amount   numeric(18,4)     NOT NULL DEFAULT 0 CHECK (unallocated_amount >= 0),
  status               payment_status    NOT NULL DEFAULT 'open',
  reference_no         text              DEFAULT '',
  payment_method       text              DEFAULT '',
  bank_account_id      uuid              REFERENCES bank_accounts(id),
  notes                text              DEFAULT '',
  created_by           uuid              REFERENCES profiles(id),
  created_at           timestamptz       NOT NULL DEFAULT now(),
  updated_at           timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT chk_payment_party CHECK (
    (customer_id IS NOT NULL AND supplier_id IS NULL) OR
    (supplier_id IS NOT NULL AND customer_id IS NULL)
  ),
  CONSTRAINT chk_payment_direction CHECK (
    (direction = 'inbound'  AND customer_id IS NOT NULL) OR
    (direction = 'outbound' AND supplier_id IS NOT NULL)
  )
);

CREATE INDEX idx_pay_date     ON payments (payment_date DESC);
CREATE INDEX idx_pay_customer ON payments (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_pay_supplier ON payments (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX idx_pay_status   ON payments (status);

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE: payment_allocations
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE payment_allocations (
  id            uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id    uuid              NOT NULL REFERENCES payments(id)          ON DELETE RESTRICT,
  obligation_id uuid              NOT NULL REFERENCES trade_obligations(id) ON DELETE RESTRICT,
  amount        numeric(18,4)     NOT NULL CHECK (amount > 0),
  status        allocation_status NOT NULL DEFAULT 'active',
  notes         text              DEFAULT '',
  allocated_at  timestamptz       NOT NULL DEFAULT now(),
  created_by    uuid              REFERENCES profiles(id),
  created_at    timestamptz       NOT NULL DEFAULT now(),
  UNIQUE (payment_id, obligation_id)
);

CREATE INDEX idx_palloc_payment    ON payment_allocations (payment_id);
CREATE INDEX idx_palloc_obligation ON payment_allocations (obligation_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- TRIGGER: fn_create_advance_obligations
-- Fires when trade_file enters 'sale' status with advance_rate > 0.
-- Creates customer + supplier advance obligations (NO journal entries).
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_create_advance_obligations()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_advance_sale     numeric(18,4);
  v_advance_purchase numeric(18,4);
BEGIN
  IF NEW.status <> 'sale'
  OR NEW.advance_rate IS NULL OR NEW.advance_rate = 0
  OR NEW.selling_price IS NULL OR NEW.purchase_price IS NULL
  OR COALESCE(NEW.tonnage_mt, 0) = 0 OR NEW.supplier_id IS NULL
  THEN RETURN NEW; END IF;

  -- Idempotency: skip if already created
  IF EXISTS (SELECT 1 FROM trade_obligations WHERE trade_file_id = NEW.id AND type = 'advance') THEN
    RETURN NEW;
  END IF;

  v_advance_sale     := ROUND(NEW.selling_price  * NEW.tonnage_mt * NEW.advance_rate / 100, 4);
  v_advance_purchase := ROUND(NEW.purchase_price * NEW.tonnage_mt * NEW.advance_rate / 100, 4);

  INSERT INTO trade_obligations (trade_file_id, party, customer_id, type, amount, currency, created_by)
  VALUES (NEW.id, 'customer', NEW.customer_id, 'advance', v_advance_sale, NEW.currency, auth.uid());

  INSERT INTO trade_obligations (trade_file_id, party, supplier_id, type, amount, currency, created_by)
  VALUES (NEW.id, 'supplier', NEW.supplier_id, 'advance', v_advance_purchase, NEW.currency, auth.uid());

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_advance_obligations
  AFTER UPDATE ON trade_files
  FOR EACH ROW EXECUTE FUNCTION fn_create_advance_obligations();

-- ══════════════════════════════════════════════════════════════════════════════
-- TRIGGER: fn_create_final_obligations
-- Fires when delivered_admt is first set. Creates final obligations.
-- (NO journal entries)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_create_final_obligations()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
    INSERT INTO trade_obligations (trade_file_id, party, customer_id, type, amount, currency, created_by)
    VALUES (NEW.id, 'customer', NEW.customer_id, 'final', v_final_customer, NEW.currency, auth.uid());
  END IF;

  IF v_final_supplier > 0 THEN
    INSERT INTO trade_obligations (trade_file_id, party, supplier_id, type, amount, currency, created_by)
    VALUES (NEW.id, 'supplier', NEW.supplier_id, 'final', v_final_supplier, NEW.currency, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_final_obligations
  AFTER UPDATE ON trade_files
  FOR EACH ROW EXECUTE FUNCTION fn_create_final_obligations();

-- ══════════════════════════════════════════════════════════════════════════════
-- TRIGGER: fn_init_payment_unallocated
-- On payment INSERT: set unallocated_amount = amount (no journal entry).
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_init_payment_unallocated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE payments SET unallocated_amount = NEW.amount WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_init_payment_unallocated
  AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION fn_init_payment_unallocated();

-- ══════════════════════════════════════════════════════════════════════════════
-- TRIGGER: fn_sync_obligation_balance
-- Recomputes paid_amount + status on obligation after allocation change.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_sync_obligation_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_ob_id      uuid;
  v_total_paid numeric(18,4);
  v_amount     numeric(18,4);
  v_new_status obligation_status;
BEGIN
  v_ob_id := CASE TG_OP WHEN 'DELETE' THEN OLD.obligation_id ELSE NEW.obligation_id END;
  SELECT COALESCE(SUM(a.amount) FILTER (WHERE a.status='active'),0), ob.amount
  INTO v_total_paid, v_amount
  FROM trade_obligations ob
  LEFT JOIN payment_allocations a ON a.obligation_id=ob.id
  WHERE ob.id=v_ob_id GROUP BY ob.amount;
  v_new_status := CASE WHEN v_total_paid=0 THEN 'pending'
                       WHEN v_total_paid>=v_amount THEN 'settled' ELSE 'partial' END;
  UPDATE trade_obligations SET paid_amount=v_total_paid, status=v_new_status, updated_at=now()
  WHERE id=v_ob_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sync_obligation_balance
  AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION fn_sync_obligation_balance();

-- ══════════════════════════════════════════════════════════════════════════════
-- TRIGGER: fn_sync_payment_unallocated
-- Recomputes unallocated_amount + status on payment after allocation change.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_sync_payment_unallocated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_pay_id      uuid;
  v_total_alloc numeric(18,4);
  v_pay_amount  numeric(18,4);
  v_new_status  payment_status;
BEGIN
  v_pay_id := CASE TG_OP WHEN 'DELETE' THEN OLD.payment_id ELSE NEW.payment_id END;
  SELECT COALESCE(SUM(a.amount) FILTER (WHERE a.status='active'),0), p.amount
  INTO v_total_alloc, v_pay_amount
  FROM payments p LEFT JOIN payment_allocations a ON a.payment_id=p.id
  WHERE p.id=v_pay_id GROUP BY p.amount;
  v_new_status := CASE WHEN v_total_alloc=0 THEN 'open'
                       WHEN v_total_alloc>=v_pay_amount THEN 'paid' ELSE 'partial' END;
  UPDATE payments SET unallocated_amount=GREATEST(v_pay_amount-v_total_alloc,0),
    status=v_new_status, updated_at=now() WHERE id=v_pay_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sync_payment_unallocated
  AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION fn_sync_payment_unallocated();

-- ─── updated_at triggers ──────────────────────────────────────────────────────
CREATE TRIGGER trg_tob_updated_at
  BEFORE UPDATE ON trade_obligations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_pay_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE trade_obligations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tob_select" ON trade_obligations FOR SELECT TO authenticated USING (true);
CREATE POLICY "tob_write"  ON trade_obligations FOR ALL    TO authenticated
  USING (can_write_transactions()) WITH CHECK (can_write_transactions());

CREATE POLICY "pay_select" ON payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "pay_write"  ON payments FOR ALL    TO authenticated
  USING (can_write_transactions()) WITH CHECK (can_write_transactions());

CREATE POLICY "pa_select" ON payment_allocations FOR SELECT TO authenticated USING (true);
CREATE POLICY "pa_write"  ON payment_allocations FOR ALL    TO authenticated
  USING (can_write_transactions()) WITH CHECK (can_write_transactions());

-- ══════════════════════════════════════════════════════════════════════════════
-- VIEWS
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_trade_file_obligations AS
SELECT tf.id AS trade_file_id, tf.file_no, tf.currency, tf.advance_rate,
  COALESCE(MAX(CASE WHEN ob.party='customer' AND ob.type='advance' THEN ob.amount END),0)      AS cust_advance_amount,
  COALESCE(MAX(CASE WHEN ob.party='customer' AND ob.type='advance' THEN ob.paid_amount END),0) AS cust_advance_paid,
  COALESCE(MAX(CASE WHEN ob.party='customer' AND ob.type='final'   THEN ob.amount END),0)      AS cust_final_amount,
  COALESCE(MAX(CASE WHEN ob.party='customer' AND ob.type='final'   THEN ob.paid_amount END),0) AS cust_final_paid,
  COALESCE(MAX(CASE WHEN ob.party='supplier' AND ob.type='advance' THEN ob.amount END),0)      AS supp_advance_amount,
  COALESCE(MAX(CASE WHEN ob.party='supplier' AND ob.type='advance' THEN ob.paid_amount END),0) AS supp_advance_paid,
  COALESCE(MAX(CASE WHEN ob.party='supplier' AND ob.type='final'   THEN ob.amount END),0)      AS supp_final_amount,
  COALESCE(MAX(CASE WHEN ob.party='supplier' AND ob.type='final'   THEN ob.paid_amount END),0) AS supp_final_paid,
  COALESCE(SUM(CASE WHEN ob.party='customer' THEN ob.amount END),0)      AS cust_total,
  COALESCE(SUM(CASE WHEN ob.party='customer' THEN ob.paid_amount END),0) AS cust_total_paid,
  COALESCE(SUM(CASE WHEN ob.party='supplier' THEN ob.amount END),0)      AS supp_total,
  COALESCE(SUM(CASE WHEN ob.party='supplier' THEN ob.paid_amount END),0) AS supp_total_paid
FROM trade_files tf
LEFT JOIN trade_obligations ob ON ob.trade_file_id=tf.id
GROUP BY tf.id, tf.file_no, tf.currency, tf.advance_rate;

CREATE OR REPLACE VIEW v_open_obligations AS
SELECT ob.id, ob.type, ob.party, ob.status, tf.file_no, tf.currency,
  c.name AS customer_name, s.name AS supplier_name,
  ob.amount, ob.paid_amount, ob.balance, ob.due_date, ob.created_at
FROM trade_obligations ob
JOIN trade_files tf ON tf.id=ob.trade_file_id
LEFT JOIN customers c ON c.id=ob.customer_id
LEFT JOIN suppliers s ON s.id=ob.supplier_id
WHERE ob.status IN ('pending','partial')
ORDER BY ob.due_date NULLS LAST, ob.created_at;

CREATE OR REPLACE VIEW v_unallocated_payments AS
SELECT p.id, p.payment_date, p.direction,
  c.name AS customer_name, s.name AS supplier_name,
  p.amount, p.currency, p.unallocated_amount, p.reference_no, p.status
FROM payments p
LEFT JOIN customers c ON c.id=p.customer_id
LEFT JOIN suppliers s ON s.id=p.supplier_id
WHERE p.unallocated_amount > 0
ORDER BY p.payment_date DESC;
