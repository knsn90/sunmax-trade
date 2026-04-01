-- ============================================================================
-- 026_trade_obligations.sql
--
-- Trade-File–based obligation & payment system.
--
-- DESIGN PHILOSOPHY
-- ─────────────────
-- The system is CONTRACT-FIRST, not invoice-first.
-- Every trade file generates obligations automatically.
-- Invoices remain optional (documents only — do not drive cash flows).
--
-- KEY TABLES
--   trade_obligations   – what each party owes, per trade file
--   payments            – global receipts / disbursements (party-level)
--   payment_allocations – links a payment to one or more obligations
--
-- JOURNAL ENTRY PATTERNS (auto-generated, never manual)
--
--   ADVANCE — customer:
--     DR  1100  Accounts Receivable             [party = customer]
--     CR  2300  Deferred Revenue
--
--   ADVANCE — supplier:
--     DR  1310  Advance to Suppliers
--     CR  2010  Accounts Payable                [party = supplier]
--
--   FINAL — customer (revenue recognition):
--     DR  2300  Deferred Revenue                [reverse advance portion]
--     DR  1100  Accounts Receivable             [remaining balance]
--     CR  4010  Sales Revenue                   [full sale amount]
--
--   FINAL — supplier (COGS recognition):
--     DR  5000  Cost of Goods Sold              [full purchase amount]
--     CR  1310  Advance to Suppliers            [reverse advance portion]
--     CR  2010  Accounts Payable                [remaining balance]
--
--   PAYMENT RECEIVED (from customer):
--     DR  1010  Cash – USD
--     CR  1100  Accounts Receivable             [party = customer]
--
--   PAYMENT MADE (to supplier):
--     DR  2010  Accounts Payable                [party = supplier]
--     CR  1010  Cash – USD
--
-- ============================================================================

-- ─── New accounts ─────────────────────────────────────────────────────────────
-- 1310 Advance to Suppliers: asset created when we pre-pay a supplier.
-- 2300 Deferred Revenue: liability until final tonnage confirms the sale.

INSERT INTO accounts (code, name, account_type, normal_balance, is_system)
VALUES
  ('1310', 'Advance to Suppliers', 'asset',     'debit',  true),
  ('2300', 'Deferred Revenue',     'liability', 'credit', true)
ON CONFLICT (code) DO NOTHING;

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE obligation_party  AS ENUM ('customer', 'supplier');
CREATE TYPE obligation_type   AS ENUM ('advance', 'final', 'adjustment');
CREATE TYPE obligation_status AS ENUM ('pending', 'partial', 'settled', 'cancelled');
CREATE TYPE payment_direction AS ENUM ('inbound', 'outbound');  -- received / paid
CREATE TYPE allocation_status AS ENUM ('active', 'reversed');

-- ─── trade_files: add advance_rate ───────────────────────────────────────────
-- advance_rate: percentage of total contract value due on contract creation.
-- e.g. 15.00 = 15%.  Applies to both the customer side and the supplier side.

ALTER TABLE trade_files
  ADD COLUMN IF NOT EXISTS advance_rate   NUMERIC(5,2) DEFAULT 0
    CHECK (advance_rate >= 0 AND advance_rate <= 100);

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE: trade_obligations
--
-- One record per (trade_file × party × type).
-- Typical lifecycle for a single trade file:
--
--   status = sale   →  advance obligation (customer)  created automatically
--   status = sale   →  advance obligation (supplier)  created automatically
--   delivered_admt set → final obligation (customer)  created automatically
--   delivered_admt set → final obligation (supplier)  created automatically
--
-- paid_amount and status are maintained by the
-- fn_sync_obligation_balance trigger (fires on payment_allocations).
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE trade_obligations (
  id               uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_file_id    uuid              NOT NULL REFERENCES trade_files(id) ON DELETE RESTRICT,

  -- Which party owes (or is owed)
  party            obligation_party  NOT NULL,
  customer_id      uuid              REFERENCES customers(id),
  supplier_id      uuid              REFERENCES suppliers(id),

  -- advance / final / adjustment
  type             obligation_type   NOT NULL,

  -- The full amount of this obligation
  amount           numeric(18,4)     NOT NULL CHECK (amount > 0),
  currency         currency_code     NOT NULL DEFAULT 'USD',

  -- Running balance — maintained by trigger, do NOT write directly
  paid_amount      numeric(18,4)     NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  balance          numeric(18,4)     GENERATED ALWAYS AS (amount - paid_amount) STORED,

  -- Lifecycle
  status           obligation_status NOT NULL DEFAULT 'pending',
  due_date         date,
  notes            text              DEFAULT '',

  -- Corresponding journal entry (auto-created on insert)
  journal_entry_id uuid              REFERENCES journal_entries(id),

  -- Audit
  created_by       uuid              REFERENCES profiles(id),
  created_at       timestamptz       NOT NULL DEFAULT now(),
  updated_at       timestamptz       NOT NULL DEFAULT now(),

  -- Exactly one party FK must be populated
  CONSTRAINT chk_obligation_party CHECK (
    (party = 'customer' AND customer_id IS NOT NULL AND supplier_id IS NULL) OR
    (party = 'supplier' AND supplier_id IS NOT NULL AND customer_id IS NULL)
  ),

  -- paid_amount never exceeds amount
  CONSTRAINT chk_paid_lte_amount CHECK (paid_amount <= amount),

  -- Only one advance and one final per (trade_file, party)
  UNIQUE (trade_file_id, party, type)
);

CREATE INDEX idx_tob_trade_file  ON trade_obligations (trade_file_id);
CREATE INDEX idx_tob_customer    ON trade_obligations (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_tob_supplier    ON trade_obligations (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX idx_tob_status      ON trade_obligations (status);

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE: payments
--
-- Global ledger of money received from customers (inbound)
-- or sent to suppliers (outbound).  NOT bound to any specific trade file
-- at creation — binding happens via payment_allocations.
--
-- unallocated_amount is maintained by the
-- fn_sync_payment_unallocated trigger on payment_allocations.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE payments (
  id                   uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_date         date              NOT NULL DEFAULT CURRENT_DATE,
  direction            payment_direction NOT NULL,   -- inbound = received, outbound = paid

  -- Exactly one of these is set (mirrors party_type pattern in transactions)
  customer_id          uuid              REFERENCES customers(id),
  supplier_id          uuid              REFERENCES suppliers(id),

  -- Amount in original currency
  amount               numeric(18,4)     NOT NULL CHECK (amount > 0),
  currency             currency_code     NOT NULL DEFAULT 'USD',
  exchange_rate        numeric(18,6)     NOT NULL DEFAULT 1.0 CHECK (exchange_rate > 0),
  amount_usd           numeric(18,4)     NOT NULL CHECK (amount_usd >= 0),

  -- How much of this payment has NOT yet been linked to an obligation
  -- Starts equal to amount, decremented by payment_allocations
  unallocated_amount   numeric(18,4)     NOT NULL DEFAULT 0 CHECK (unallocated_amount >= 0),

  -- Status computed from unallocated_amount (maintained by trigger)
  status               payment_status    NOT NULL DEFAULT 'open',  -- open/partial/paid

  -- Operational metadata
  reference_no         text              DEFAULT '',
  payment_method       text              DEFAULT '',   -- wire, cheque, cash …
  bank_account_id      uuid              REFERENCES bank_accounts(id),
  notes                text              DEFAULT '',

  -- Corresponding journal entry (auto-created on insert)
  journal_entry_id     uuid              REFERENCES journal_entries(id),

  -- Audit
  created_by           uuid              REFERENCES profiles(id),
  created_at           timestamptz       NOT NULL DEFAULT now(),
  updated_at           timestamptz       NOT NULL DEFAULT now(),

  -- One party per payment
  CONSTRAINT chk_payment_party CHECK (
    (customer_id IS NOT NULL AND supplier_id IS NULL) OR
    (supplier_id IS NOT NULL AND customer_id IS NULL)
  ),

  -- Inbound payments must link to a customer, outbound to a supplier
  CONSTRAINT chk_payment_direction CHECK (
    (direction = 'inbound'  AND customer_id IS NOT NULL) OR
    (direction = 'outbound' AND supplier_id IS NOT NULL)
  )
);

CREATE INDEX idx_pay_date       ON payments (payment_date DESC);
CREATE INDEX idx_pay_customer   ON payments (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_pay_supplier   ON payments (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX idx_pay_status     ON payments (status);

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE: payment_allocations
--
-- Joins a payment to one (or more) obligations.
-- One payment can cover multiple obligations.
-- One obligation can be covered by multiple payments.
--
-- After INSERT/UPDATE/DELETE here, two triggers fire:
--   fn_sync_obligation_balance  – recalculates paid_amount + status on obligation
--   fn_sync_payment_unallocated – recalculates unallocated_amount + status on payment
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE payment_allocations (
  id               uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id       uuid              NOT NULL REFERENCES payments(id)          ON DELETE RESTRICT,
  obligation_id    uuid              NOT NULL REFERENCES trade_obligations(id) ON DELETE RESTRICT,
  amount           numeric(18,4)     NOT NULL CHECK (amount > 0),
  status           allocation_status NOT NULL DEFAULT 'active',
  notes            text              DEFAULT '',
  allocated_at     timestamptz       NOT NULL DEFAULT now(),
  created_by       uuid              REFERENCES profiles(id),
  created_at       timestamptz       NOT NULL DEFAULT now(),

  UNIQUE (payment_id, obligation_id)   -- one allocation record per pair
);

CREATE INDEX idx_palloc_payment    ON payment_allocations (payment_id);
CREATE INDEX idx_palloc_obligation ON payment_allocations (obligation_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- HELPER: fn_get_account_id
-- Returns account.id for a given code.  Raises if not found.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_get_account_id(p_code text)
RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM accounts WHERE code = p_code AND is_active = true;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Account code % not found or inactive.', p_code;
  END IF;
  RETURN v_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: fn_post_obligation_journal
--
-- Creates and immediately posts the double-entry journal entry for a
-- trade_obligation record.  Called from fn_create_obligation_journal trigger.
--
-- Entry patterns (see top of file for full list).
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_post_obligation_journal(p_ob_id uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  ob          trade_obligations%ROWTYPE;
  tf          trade_files%ROWTYPE;
  v_je_id     uuid;
  v_desc      text;
  v_ln        smallint := 1;

  -- account ids (resolved once)
  ac_ar       uuid;   -- 1100 Accounts Receivable
  ac_ap       uuid;   -- 2010 Accounts Payable
  ac_adv_sup  uuid;   -- 1310 Advance to Suppliers
  ac_def_rev  uuid;   -- 2300 Deferred Revenue
  ac_revenue  uuid;   -- 4010 Sales Revenue
  ac_cogs     uuid;   -- 5000 Cost of Goods Sold

  -- advance amounts already booked (needed for final reversal)
  v_prev_advance_amount numeric(18,4) := 0;
BEGIN
  SELECT * INTO ob FROM trade_obligations WHERE id = p_ob_id;
  SELECT * INTO tf FROM trade_files        WHERE id = ob.trade_file_id;

  ac_ar      := fn_get_account_id('1100');
  ac_ap      := fn_get_account_id('2010');
  ac_adv_sup := fn_get_account_id('1310');
  ac_def_rev := fn_get_account_id('2300');
  ac_revenue := fn_get_account_id('4010');
  ac_cogs    := fn_get_account_id('5000');

  v_desc := format('%s %s — %s (%s)',
    initcap(ob.type::text), initcap(ob.party::text),
    tf.file_no, ob.currency);

  -- ── Create journal entry header ──────────────────────────────────────────
  INSERT INTO journal_entries
    (entry_date, description, source_type, source_id, currency, status)
  VALUES
    (now()::date, v_desc, 'trade_obligation', ob.id, ob.currency, 'draft')
  RETURNING id INTO v_je_id;

  -- ── Build lines by obligation type × party ────────────────────────────────

  IF ob.type = 'advance' AND ob.party = 'customer' THEN
    -- DR Accounts Receivable
    INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, debit,        party_type, party_id)
    VALUES (v_je_id, v_ln, ac_ar,      v_desc, ob.amount, 'customer', ob.customer_id);
    v_ln := v_ln + 1;
    -- CR Deferred Revenue
    INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, credit)
    VALUES (v_je_id, v_ln, ac_def_rev, v_desc, ob.amount);

  ELSIF ob.type = 'advance' AND ob.party = 'supplier' THEN
    -- DR Advance to Suppliers
    INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, debit)
    VALUES (v_je_id, v_ln, ac_adv_sup, v_desc, ob.amount);
    v_ln := v_ln + 1;
    -- CR Accounts Payable
    INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, credit,       party_type, party_id)
    VALUES (v_je_id, v_ln, ac_ap,      v_desc, ob.amount, 'supplier', ob.supplier_id);

  ELSIF ob.type = 'final' AND ob.party = 'customer' THEN
    -- Look up the advance amount already booked for this side
    SELECT amount INTO v_prev_advance_amount
    FROM trade_obligations
    WHERE trade_file_id = ob.trade_file_id
      AND party = 'customer' AND type = 'advance';
    v_prev_advance_amount := COALESCE(v_prev_advance_amount, 0);

    -- Total sale = advance + final (ob.amount is the REMAINING balance)
    -- DR Deferred Revenue (reverse prior advance)
    INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, debit)
    VALUES (v_je_id, v_ln, ac_def_rev, v_desc || ' – reverse advance', v_prev_advance_amount);
    v_ln := v_ln + 1;
    -- DR Accounts Receivable (the unpaid final balance)
    INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, debit,        party_type, party_id)
    VALUES (v_je_id, v_ln, ac_ar,      v_desc, ob.amount, 'customer', ob.customer_id);
    v_ln := v_ln + 1;
    -- CR Sales Revenue (full contract value)
    INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, credit)
    VALUES (v_je_id, v_ln, ac_revenue, v_desc, v_prev_advance_amount + ob.amount);

  ELSIF ob.type = 'final' AND ob.party = 'supplier' THEN
    -- Look up the advance amount already booked for this side
    SELECT amount INTO v_prev_advance_amount
    FROM trade_obligations
    WHERE trade_file_id = ob.trade_file_id
      AND party = 'supplier' AND type = 'advance';
    v_prev_advance_amount := COALESCE(v_prev_advance_amount, 0);

    -- DR Cost of Goods Sold (full purchase cost)
    INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, debit)
    VALUES (v_je_id, v_ln, ac_cogs,    v_desc, v_prev_advance_amount + ob.amount);
    v_ln := v_ln + 1;
    -- CR Advance to Suppliers (reverse prior advance)
    INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, credit)
    VALUES (v_je_id, v_ln, ac_adv_sup, v_desc || ' – reverse advance', v_prev_advance_amount);
    v_ln := v_ln + 1;
    -- CR Accounts Payable (remaining balance to pay)
    INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, credit,       party_type, party_id)
    VALUES (v_je_id, v_ln, ac_ap,      v_desc, ob.amount, 'supplier', ob.supplier_id);

  END IF;

  -- ── Post the entry (enforces balance check via existing trigger) ──────────
  UPDATE journal_entries SET status = 'posted' WHERE id = v_je_id;

  -- ── Link JE back to obligation ────────────────────────────────────────────
  UPDATE trade_obligations SET journal_entry_id = v_je_id WHERE id = p_ob_id;

  RETURN v_je_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: fn_post_payment_journal
--
-- Creates and posts the journal entry for a payment record.
-- Called from fn_create_payment_journal trigger (AFTER INSERT on payments).
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_post_payment_journal(p_pay_id uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  pay      payments%ROWTYPE;
  v_je_id  uuid;
  v_desc   text;
  ac_cash  uuid;
  ac_ar    uuid;
  ac_ap    uuid;
BEGIN
  SELECT * INTO pay FROM payments WHERE id = p_pay_id;

  ac_cash := fn_get_account_id('1010');
  ac_ar   := fn_get_account_id('1100');
  ac_ap   := fn_get_account_id('2010');

  v_desc := format('Payment %s — %s %s',
    CASE pay.direction WHEN 'inbound' THEN 'received' ELSE 'made' END,
    pay.currency, pay.amount);

  INSERT INTO journal_entries
    (entry_date, description, source_type, source_id, currency, status)
  VALUES
    (pay.payment_date, v_desc, 'payment', pay.id, pay.currency, 'draft')
  RETURNING id INTO v_je_id;

  IF pay.direction = 'inbound' THEN
    -- DR Cash
    INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, debit)
    VALUES (v_je_id, 1, ac_cash, v_desc, pay.amount_usd);
    -- CR Accounts Receivable
    INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, credit,  party_type, party_id)
    VALUES (v_je_id, 2, ac_ar,   v_desc, pay.amount_usd, 'customer', pay.customer_id);
  ELSE
    -- DR Accounts Payable
    INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, debit,   party_type, party_id)
    VALUES (v_je_id, 1, ac_ap,   v_desc, pay.amount_usd, 'supplier', pay.supplier_id);
    -- CR Cash
    INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, credit)
    VALUES (v_je_id, 2, ac_cash, v_desc, pay.amount_usd);
  END IF;

  UPDATE journal_entries SET status = 'posted' WHERE id = v_je_id;
  UPDATE payments SET journal_entry_id = v_je_id WHERE id = p_pay_id;

  RETURN v_je_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGER FUNCTION: fn_create_advance_obligations
--
-- Fires AFTER UPDATE on trade_files.
-- When status transitions to 'sale' AND advance_rate > 0
-- AND both selling_price + purchase_price are set:
--   → Creates customer advance obligation
--   → Creates supplier advance obligation
--   → Posts journal entries for both
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_create_advance_obligations()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_advance_sale     numeric(18,4);
  v_advance_purchase numeric(18,4);
  v_ob_id            uuid;
BEGIN
  -- Only fire on sale status entry, with prices and advance rate
  IF NEW.status <> 'sale'
  OR OLD.status = 'sale'           -- already was sale — avoid re-trigger
  OR NEW.advance_rate IS NULL
  OR NEW.advance_rate = 0
  OR NEW.selling_price  IS NULL
  OR NEW.purchase_price IS NULL
  OR NEW.tonnage_mt = 0
  OR NEW.supplier_id IS NULL
  THEN RETURN NEW;
  END IF;

  v_advance_sale     := ROUND(NEW.selling_price  * NEW.tonnage_mt * NEW.advance_rate / 100, 4);
  v_advance_purchase := ROUND(NEW.purchase_price * NEW.tonnage_mt * NEW.advance_rate / 100, 4);

  -- ── Customer advance obligation ─────────────────────────────────────────
  INSERT INTO trade_obligations
    (trade_file_id, party, customer_id, type, amount, currency, created_by)
  VALUES
    (NEW.id, 'customer', NEW.customer_id, 'advance', v_advance_sale, NEW.currency, auth.uid())
  RETURNING id INTO v_ob_id;

  PERFORM fn_post_obligation_journal(v_ob_id);

  -- ── Supplier advance obligation ─────────────────────────────────────────
  INSERT INTO trade_obligations
    (trade_file_id, party, supplier_id, type, amount, currency, created_by)
  VALUES
    (NEW.id, 'supplier', NEW.supplier_id, 'advance', v_advance_purchase, NEW.currency, auth.uid())
  RETURNING id INTO v_ob_id;

  PERFORM fn_post_obligation_journal(v_ob_id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_advance_obligations
  AFTER UPDATE ON trade_files
  FOR EACH ROW EXECUTE FUNCTION fn_create_advance_obligations();

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGER FUNCTION: fn_create_final_obligations
--
-- Fires AFTER UPDATE on trade_files.
-- When delivered_admt is set (non-null, > 0) for the first time:
--   → Calculates final amounts on real tonnage
--   → Subtracts advance already booked
--   → Creates customer final obligation
--   → Creates supplier final obligation
--   → Posts journal entries (reverses advance + recognises revenue/COGS)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_create_final_obligations()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_sale_total        numeric(18,4);
  v_purchase_total    numeric(18,4);
  v_adv_customer      numeric(18,4) := 0;
  v_adv_supplier      numeric(18,4) := 0;
  v_final_customer    numeric(18,4);
  v_final_supplier    numeric(18,4);
  v_ob_id             uuid;
BEGIN
  -- Only fire when delivered_admt transitions from NULL/0 to a real value
  IF NEW.delivered_admt IS NULL
  OR NEW.delivered_admt = 0
  OR (OLD.delivered_admt IS NOT NULL AND OLD.delivered_admt > 0)  -- already set
  OR NEW.selling_price  IS NULL
  OR NEW.purchase_price IS NULL
  THEN RETURN NEW;
  END IF;

  -- Total contract values on REAL tonnage
  v_sale_total     := ROUND(NEW.selling_price  * NEW.delivered_admt, 4);
  v_purchase_total := ROUND(NEW.purchase_price * NEW.delivered_admt, 4);

  -- Advance already booked
  SELECT COALESCE(amount, 0) INTO v_adv_customer
  FROM trade_obligations
  WHERE trade_file_id = NEW.id AND party = 'customer' AND type = 'advance';

  SELECT COALESCE(amount, 0) INTO v_adv_supplier
  FROM trade_obligations
  WHERE trade_file_id = NEW.id AND party = 'supplier' AND type = 'advance';

  -- Final obligation = total − advance  (what remains to be paid)
  v_final_customer := v_sale_total     - v_adv_customer;
  v_final_supplier := v_purchase_total - v_adv_supplier;

  -- Guard: if advance already covered or exceeded the total, skip (or create 0-balance)
  IF v_final_customer <= 0 THEN v_final_customer := 0; END IF;
  IF v_final_supplier <= 0 THEN v_final_supplier := 0; END IF;

  -- ── Customer final obligation ────────────────────────────────────────────
  IF v_final_customer > 0 THEN
    INSERT INTO trade_obligations
      (trade_file_id, party, customer_id, type, amount, currency, created_by)
    VALUES
      (NEW.id, 'customer', NEW.customer_id, 'final', v_final_customer, NEW.currency, auth.uid())
    RETURNING id INTO v_ob_id;
    PERFORM fn_post_obligation_journal(v_ob_id);
  END IF;

  -- ── Supplier final obligation ────────────────────────────────────────────
  IF v_final_supplier > 0 THEN
    INSERT INTO trade_obligations
      (trade_file_id, party, supplier_id, type, amount, currency, created_by)
    VALUES
      (NEW.id, 'supplier', NEW.supplier_id, 'final', v_final_supplier, NEW.currency, auth.uid())
    RETURNING id INTO v_ob_id;
    PERFORM fn_post_obligation_journal(v_ob_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_final_obligations
  AFTER UPDATE ON trade_files
  FOR EACH ROW EXECUTE FUNCTION fn_create_final_obligations();

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGER FUNCTION: fn_sync_obligation_balance
--
-- Fires AFTER INSERT/UPDATE/DELETE on payment_allocations.
-- Recomputes paid_amount and status on the affected obligation.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_sync_obligation_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_ob_id      uuid;
  v_total_paid numeric(18,4);
  v_amount     numeric(18,4);
  v_new_status obligation_status;
BEGIN
  v_ob_id := CASE TG_OP WHEN 'DELETE' THEN OLD.obligation_id ELSE NEW.obligation_id END;

  SELECT
    COALESCE(SUM(a.amount) FILTER (WHERE a.status = 'active'), 0),
    ob.amount
  INTO v_total_paid, v_amount
  FROM trade_obligations ob
  LEFT JOIN payment_allocations a ON a.obligation_id = ob.id
  WHERE ob.id = v_ob_id
  GROUP BY ob.amount;

  v_new_status :=
    CASE
      WHEN v_total_paid = 0             THEN 'pending'
      WHEN v_total_paid >= v_amount     THEN 'settled'
      ELSE                                   'partial'
    END;

  UPDATE trade_obligations
  SET paid_amount = v_total_paid,
      status      = v_new_status,
      updated_at  = now()
  WHERE id = v_ob_id;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sync_obligation_balance
  AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION fn_sync_obligation_balance();

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGER FUNCTION: fn_sync_payment_unallocated
--
-- Fires AFTER INSERT/UPDATE/DELETE on payment_allocations.
-- Recomputes unallocated_amount and status on the affected payment.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_sync_payment_unallocated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_pay_id        uuid;
  v_total_alloc   numeric(18,4);
  v_pay_amount    numeric(18,4);
  v_new_status    payment_status;
BEGIN
  v_pay_id := CASE TG_OP WHEN 'DELETE' THEN OLD.payment_id ELSE NEW.payment_id END;

  SELECT
    COALESCE(SUM(a.amount) FILTER (WHERE a.status = 'active'), 0),
    p.amount
  INTO v_total_alloc, v_pay_amount
  FROM payments p
  LEFT JOIN payment_allocations a ON a.payment_id = p.id
  WHERE p.id = v_pay_id
  GROUP BY p.amount;

  v_new_status :=
    CASE
      WHEN v_total_alloc = 0           THEN 'open'
      WHEN v_total_alloc >= v_pay_amount THEN 'paid'
      ELSE                                  'partial'
    END;

  UPDATE payments
  SET unallocated_amount = GREATEST(v_pay_amount - v_total_alloc, 0),
      status             = v_new_status,
      updated_at         = now()
  WHERE id = v_pay_id;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sync_payment_unallocated
  AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION fn_sync_payment_unallocated();

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGER FUNCTION: fn_create_payment_journal
--
-- Fires AFTER INSERT on payments.
-- Immediately creates and posts the payment journal entry.
-- Also initialises unallocated_amount = amount.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_create_payment_journal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Set initial unallocated = full amount
  UPDATE payments SET unallocated_amount = NEW.amount WHERE id = NEW.id;
  -- Post the journal entry
  PERFORM fn_post_payment_journal(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_payment_journal
  AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION fn_create_payment_journal();

-- ─── updated_at triggers ──────────────────────────────────────────────────────
CREATE TRIGGER trg_tob_updated_at
  BEFORE UPDATE ON trade_obligations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_pay_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE trade_obligations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations  ENABLE ROW LEVEL SECURITY;

-- trade_obligations: all read, accountant+ write
CREATE POLICY "tob_select" ON trade_obligations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tob_write"  ON trade_obligations
  FOR ALL    TO authenticated
  USING (can_write_transactions()) WITH CHECK (can_write_transactions());

-- payments: all read, accountant+ write
CREATE POLICY "pay_select" ON payments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pay_write"  ON payments
  FOR ALL    TO authenticated
  USING (can_write_transactions()) WITH CHECK (can_write_transactions());

-- payment_allocations: all read, accountant+ write
CREATE POLICY "pa_select" ON payment_allocations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pa_write"  ON payment_allocations
  FOR ALL    TO authenticated
  USING (can_write_transactions()) WITH CHECK (can_write_transactions());

-- ═══════════════════════════════════════════════════════════════════════════════
-- REPORTING VIEW: v_trade_file_obligations
--
-- Per-trade-file summary: advance + final obligations, paid amounts,
-- and remaining balance for both customer and supplier sides.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_trade_file_obligations AS
SELECT
  tf.id                AS trade_file_id,
  tf.file_no,
  tf.currency,
  tf.advance_rate,
  -- Customer side
  COALESCE(MAX(CASE WHEN ob.party = 'customer' AND ob.type = 'advance'
                    THEN ob.amount END), 0)  AS cust_advance_amount,
  COALESCE(MAX(CASE WHEN ob.party = 'customer' AND ob.type = 'advance'
                    THEN ob.paid_amount END), 0) AS cust_advance_paid,
  COALESCE(MAX(CASE WHEN ob.party = 'customer' AND ob.type = 'final'
                    THEN ob.amount END), 0)  AS cust_final_amount,
  COALESCE(MAX(CASE WHEN ob.party = 'customer' AND ob.type = 'final'
                    THEN ob.paid_amount END), 0) AS cust_final_paid,
  -- Supplier side
  COALESCE(MAX(CASE WHEN ob.party = 'supplier' AND ob.type = 'advance'
                    THEN ob.amount END), 0)  AS supp_advance_amount,
  COALESCE(MAX(CASE WHEN ob.party = 'supplier' AND ob.type = 'advance'
                    THEN ob.paid_amount END), 0) AS supp_advance_paid,
  COALESCE(MAX(CASE WHEN ob.party = 'supplier' AND ob.type = 'final'
                    THEN ob.amount END), 0)  AS supp_final_amount,
  COALESCE(MAX(CASE WHEN ob.party = 'supplier' AND ob.type = 'final'
                    THEN ob.paid_amount END), 0) AS supp_final_paid,
  -- Totals
  COALESCE(SUM(CASE WHEN ob.party = 'customer' THEN ob.amount     END), 0) AS cust_total,
  COALESCE(SUM(CASE WHEN ob.party = 'customer' THEN ob.paid_amount END), 0) AS cust_total_paid,
  COALESCE(SUM(CASE WHEN ob.party = 'supplier' THEN ob.amount     END), 0) AS supp_total,
  COALESCE(SUM(CASE WHEN ob.party = 'supplier' THEN ob.paid_amount END), 0) AS supp_total_paid
FROM trade_files tf
LEFT JOIN trade_obligations ob ON ob.trade_file_id = tf.id
GROUP BY tf.id, tf.file_no, tf.currency, tf.advance_rate;

-- ═══════════════════════════════════════════════════════════════════════════════
-- REPORTING VIEW: v_open_obligations
--
-- All non-settled obligations with trade file and party details.
-- Primary dashboard view for cash-flow tracking.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_open_obligations AS
SELECT
  ob.id,
  ob.type,
  ob.party,
  ob.status,
  tf.file_no,
  tf.currency,
  c.company_name  AS customer_name,
  s.company_name  AS supplier_name,
  ob.amount,
  ob.paid_amount,
  ob.balance,
  ob.due_date,
  ob.created_at
FROM trade_obligations ob
JOIN trade_files tf ON tf.id = ob.trade_file_id
LEFT JOIN customers  c ON c.id = ob.customer_id
LEFT JOIN suppliers  s ON s.id = ob.supplier_id
WHERE ob.status IN ('pending', 'partial')
ORDER BY ob.due_date NULLS LAST, ob.created_at;

-- ═══════════════════════════════════════════════════════════════════════════════
-- REPORTING VIEW: v_unallocated_payments
--
-- Payments that have unallocated funds — needs matching to obligations.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_unallocated_payments AS
SELECT
  p.id,
  p.payment_date,
  p.direction,
  c.company_name  AS customer_name,
  s.company_name  AS supplier_name,
  p.amount,
  p.currency,
  p.unallocated_amount,
  p.reference_no,
  p.status
FROM payments p
LEFT JOIN customers  c ON c.id = p.customer_id
LEFT JOIN suppliers  s ON s.id = p.supplier_id
WHERE p.unallocated_amount > 0
ORDER BY p.payment_date DESC;
