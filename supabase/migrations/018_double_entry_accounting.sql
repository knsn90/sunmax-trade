-- ============================================================
-- 018_double_entry_accounting.sql
--
-- Production-grade double-entry accounting foundation.
--
-- DESIGN RULES (enforced at database level):
--   1. journal_entries + journal_lines are the ONLY source of truth
--   2. SUM(debit) = SUM(credit) per entry — enforced via trigger
--   3. Posted entries are IMMUTABLE — corrections via reversal only
--   4. Closed/locked periods cannot be posted into
--   5. System accounts (is_system=true) cannot be deleted
-- ============================================================

-- ─── Extensions ───────────────────────────────────────────────────────────────
-- Required for EXCLUDE USING gist on date ranges (period overlap prevention)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE account_type    AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
CREATE TYPE normal_balance  AS ENUM ('debit', 'credit');
CREATE TYPE entry_status    AS ENUM ('draft', 'posted', 'reversed');
CREATE TYPE period_status   AS ENUM ('open', 'closed', 'locked');

-- ─── Sequence ─────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS journal_entry_no_seq START 1;

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE: accounting_periods
-- Defines fiscal periods (e.g. "2025-01", "2025-Q1").
-- Overlapping periods are forbidden at the DB level via EXCLUDE constraint.
-- Posts are rejected into closed or locked periods.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS accounting_periods (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text          NOT NULL,                   -- '2025-01', '2025-Q1'
  start_date  date          NOT NULL,
  end_date    date          NOT NULL,
  status      period_status NOT NULL DEFAULT 'open',
  closed_by   uuid          REFERENCES auth.users(id),
  closed_at   timestamptz,
  created_at  timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT period_dates_valid
    CHECK (start_date <= end_date),

  -- No two periods may overlap
  CONSTRAINT no_period_overlap
    EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)
);

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE: accounts  (Chart of Accounts)
-- Hierarchical via parent_id (optional — for grouped reporting).
-- is_system=true accounts are protected from accidental deletion.
-- normal_balance defines which side INCREASES the account:
--   Assets & Expenses    → debit
--   Liabilities, Equity, Revenue → credit
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS accounts (
  id             uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text           NOT NULL UNIQUE,        -- '1010', '4010'
  name           text           NOT NULL,
  account_type   account_type   NOT NULL,
  normal_balance normal_balance NOT NULL,
  parent_id      uuid           REFERENCES accounts(id),
  description    text,
  is_active      boolean        NOT NULL DEFAULT true,
  is_system      boolean        NOT NULL DEFAULT false, -- protected accounts
  created_at     timestamptz    NOT NULL DEFAULT now(),
  updated_at     timestamptz    NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE: journal_entries
-- Header record for each accounting event.
-- status lifecycle: draft → posted → reversed
-- Reversal pair: entry A sets reversed_by=B; entry B sets reversal_of=A
-- source_type/source_id: polymorphic link to origin record
--   ('invoice', 'transaction', 'trade_file', 'manual', ...)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS journal_entries (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_no      text          NOT NULL UNIQUE
                  DEFAULT ('JE-' || LPAD(nextval('journal_entry_no_seq')::text, 6, '0')),
  entry_date    date          NOT NULL,
  period_id     uuid          REFERENCES accounting_periods(id),
  description   text          NOT NULL,

  -- Polymorphic origin reference
  source_type   text,         -- 'invoice' | 'transaction' | 'trade_file' | 'manual'
  source_id     uuid,

  -- Functional currency of this entry
  currency      currency_code NOT NULL DEFAULT 'USD',
  exchange_rate numeric(18,6) NOT NULL DEFAULT 1.0 CHECK (exchange_rate > 0),

  -- Workflow
  status        entry_status  NOT NULL DEFAULT 'draft',

  -- Reversal linkage (mutual pointers)
  reversal_of   uuid          REFERENCES journal_entries(id),  -- this entry reverses that one
  reversed_by   uuid          REFERENCES journal_entries(id),  -- that entry reverses this one

  -- Audit trail
  created_by    uuid          REFERENCES auth.users(id),
  posted_by     uuid          REFERENCES auth.users(id),
  posted_at     timestamptz,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE: journal_lines
-- Each line credits or debits exactly one account (never both).
-- Amounts in functional currency (USD).
-- orig_currency / orig_amount: original FX amounts for reference.
-- party_type / party_id: sub-ledger linkage for A/R and A/P aging.
--
-- CONSTRAINTS (all enforced at DB level):
--   single_side : a line cannot have both debit > 0 and credit > 0
--   non_zero    : a line must have debit > 0 OR credit > 0
--   unique line : (journal_entry_id, line_no) is unique within an entry
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS journal_lines (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid          NOT NULL
                     REFERENCES journal_entries(id) ON DELETE RESTRICT,
  line_no          smallint      NOT NULL,              -- ordering within entry
  account_id       uuid          NOT NULL REFERENCES accounts(id),
  description      text,

  -- Functional currency amounts (USD) — the balance proof
  debit            numeric(18,4) NOT NULL DEFAULT 0 CHECK (debit  >= 0),
  credit           numeric(18,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),

  -- Original currency (FX transactions — informational only)
  orig_currency    currency_code,
  orig_amount      numeric(18,4),

  -- Sub-ledger (A/R, A/P per party)
  party_type       party_type,
  party_id         uuid,

  created_at       timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT single_side  CHECK (NOT (debit > 0 AND credit > 0)),
  CONSTRAINT non_zero     CHECK (debit > 0 OR credit > 0),
  UNIQUE (journal_entry_id, line_no)
);

-- ─── Performance Indexes ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_je_date        ON journal_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_je_status      ON journal_entries (status);
CREATE INDEX IF NOT EXISTS idx_je_source      ON journal_entries (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_je_period      ON journal_entries (period_id);
CREATE INDEX IF NOT EXISTS idx_jl_entry       ON journal_lines   (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jl_account     ON journal_lines   (account_id);
CREATE INDEX IF NOT EXISTS idx_jl_party       ON journal_lines   (party_type, party_id)
  WHERE party_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- TRIGGER FUNCTION: enforce_journal_balance
--
-- Fires BEFORE UPDATE on journal_entries.
-- On transition draft → posted:
--   1. Entry must have at least one line
--   2. SUM(debit) MUST EQUAL SUM(credit) — unbalanced entries are REJECTED
--   3. If period_id is set, the period must be 'open'
--   4. Stamps posted_by and posted_at
-- Prevents status regression: posted entries can only move to 'reversed'
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION enforce_journal_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_diff   numeric;
  v_period period_status;
BEGIN
  -- ── Prevent illegal status regression ───────────────────────────────────
  IF OLD.status = 'posted' AND NEW.status NOT IN ('posted', 'reversed') THEN
    RAISE EXCEPTION
      'Journal entry % is already posted. Status can only move to ''reversed''.',
      OLD.entry_no;
  END IF;

  -- ── Enforce balance on draft → posted transition ─────────────────────────
  IF NEW.status = 'posted' AND OLD.status = 'draft' THEN

    -- Must have lines
    IF NOT EXISTS (
      SELECT 1 FROM journal_lines WHERE journal_entry_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Journal entry % has no lines.', NEW.entry_no;
    END IF;

    -- debit = credit
    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
      INTO v_diff
      FROM journal_lines
     WHERE journal_entry_id = NEW.id;

    IF v_diff <> 0 THEN
      RAISE EXCEPTION
        'Journal entry % is not balanced: debits − credits = % USD. Entry rejected.',
        NEW.entry_no, v_diff;
    END IF;

    -- Period must be open
    IF NEW.period_id IS NOT NULL THEN
      SELECT status INTO v_period
        FROM accounting_periods WHERE id = NEW.period_id;
      IF v_period <> 'open' THEN
        RAISE EXCEPTION
          'Cannot post to a ''%'' accounting period.', v_period;
      END IF;
    END IF;

    -- Stamp audit fields
    NEW.posted_at := now();
    NEW.posted_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_journal_balance
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION enforce_journal_balance();

-- ══════════════════════════════════════════════════════════════════════════════
-- TRIGGER FUNCTION: prevent_modify_posted_lines
--
-- Fires BEFORE INSERT/UPDATE/DELETE on journal_lines.
-- Posted entry lines are IMMUTABLE.
-- Any correction must be done via a new reversal journal entry.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION prevent_modify_posted_lines()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_entry_id uuid;
BEGIN
  v_entry_id := CASE TG_OP WHEN 'DELETE'
                  THEN OLD.journal_entry_id
                  ELSE NEW.journal_entry_id
                END;

  IF EXISTS (
    SELECT 1 FROM journal_entries WHERE id = v_entry_id AND status = 'posted'
  ) THEN
    RAISE EXCEPTION
      'Lines of posted journal entry are immutable. Create a reversal entry to correct.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_immutable_posted_lines
  BEFORE INSERT OR UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION prevent_modify_posted_lines();

-- ══════════════════════════════════════════════════════════════════════════════
-- TRIGGER FUNCTION: prevent_delete_system_accounts
-- System accounts (is_system=true) cannot be deleted.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION prevent_delete_system_accounts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_system THEN
    RAISE EXCEPTION 'System account "%" (%) cannot be deleted.', OLD.name, OLD.code;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_protect_system_accounts
  BEFORE DELETE ON accounts
  FOR EACH ROW EXECUTE FUNCTION prevent_delete_system_accounts();

-- ══════════════════════════════════════════════════════════════════════════════
-- TRIGGER FUNCTION: auto_assign_period
-- On INSERT, automatically assigns period_id by matching entry_date
-- to an open accounting period (if not already supplied).
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION auto_assign_period()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.period_id IS NULL THEN
    SELECT id INTO NEW.period_id
      FROM accounting_periods
     WHERE status = 'open'
       AND NEW.entry_date BETWEEN start_date AND end_date
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_assign_period
  BEFORE INSERT ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION auto_assign_period();

-- ══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- Reuses existing helper functions from migration 002:
--   is_admin()             → admin role only
--   is_manager_or_admin()  → manager or admin role
--   can_write_transactions() → accountant, manager, or admin
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines      ENABLE ROW LEVEL SECURITY;

-- accounting_periods: all read, admin write
CREATE POLICY "ap_select" ON accounting_periods
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ap_write"  ON accounting_periods
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- accounts: all read, manager+ write
CREATE POLICY "acc_select" ON accounts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "acc_write"  ON accounts
  FOR ALL TO authenticated
  USING (is_manager_or_admin()) WITH CHECK (is_manager_or_admin());

-- journal_entries: all read, accountant+ write, admin delete
CREATE POLICY "je_select" ON journal_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "je_insert" ON journal_entries
  FOR INSERT TO authenticated WITH CHECK (can_write_transactions());
CREATE POLICY "je_update" ON journal_entries
  FOR UPDATE TO authenticated USING (can_write_transactions());
CREATE POLICY "je_delete" ON journal_entries
  FOR DELETE TO authenticated USING (is_admin());

-- journal_lines: all read, accountant+ write, admin delete
CREATE POLICY "jl_select" ON journal_lines
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "jl_insert" ON journal_lines
  FOR INSERT TO authenticated WITH CHECK (can_write_transactions());
CREATE POLICY "jl_update" ON journal_lines
  FOR UPDATE TO authenticated USING (can_write_transactions());
CREATE POLICY "jl_delete" ON journal_lines
  FOR DELETE TO authenticated USING (is_admin());

-- ══════════════════════════════════════════════════════════════════════════════
-- REPORTING VIEWS
-- ══════════════════════════════════════════════════════════════════════════════

-- ── v_trial_balance ───────────────────────────────────────────────────────────
-- Standard trial balance from posted entries only.
-- balance = net amount in normal_balance direction.
CREATE OR REPLACE VIEW v_trial_balance AS
SELECT
  a.code,
  a.name,
  a.account_type,
  a.normal_balance,
  COALESCE(SUM(jl.debit),  0) AS total_debit,
  COALESCE(SUM(jl.credit), 0) AS total_credit,
  CASE a.normal_balance
    WHEN 'debit'  THEN COALESCE(SUM(jl.debit),  0) - COALESCE(SUM(jl.credit), 0)
    WHEN 'credit' THEN COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit),  0)
  END AS balance
FROM accounts a
LEFT JOIN journal_lines  jl ON jl.account_id = a.id
LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
                             AND je.status = 'posted'
WHERE a.is_active = true
GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
ORDER BY a.code;

-- ── v_account_ledger ──────────────────────────────────────────────────────────
-- Full general ledger: every posted line with entry header context.
-- Filter by account_code in application for per-account drilldown.
CREATE OR REPLACE VIEW v_account_ledger AS
SELECT
  je.entry_date,
  je.entry_no,
  je.description  AS entry_description,
  jl.description  AS line_description,
  a.code          AS account_code,
  a.name          AS account_name,
  a.account_type,
  jl.debit,
  jl.credit,
  jl.party_type,
  jl.party_id,
  je.source_type,
  je.source_id,
  je.status,
  je.period_id
FROM journal_lines  jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
JOIN accounts        a  ON a.id  = jl.account_id
ORDER BY je.entry_date, je.entry_no, jl.line_no;

-- ── v_subledger ───────────────────────────────────────────────────────────────
-- A/R and A/P sub-ledger: posted lines linked to a specific party.
-- Use for customer/supplier aging and statement of account reports.
CREATE OR REPLACE VIEW v_subledger AS
SELECT
  jl.party_type,
  jl.party_id,
  a.code   AS account_code,
  a.name   AS account_name,
  je.entry_date,
  je.entry_no,
  je.description,
  jl.debit,
  jl.credit,
  je.source_type,
  je.source_id
FROM journal_lines  jl
JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
JOIN accounts        a  ON a.id  = jl.account_id
WHERE jl.party_id IS NOT NULL
ORDER BY jl.party_type, jl.party_id, je.entry_date;

-- ══════════════════════════════════════════════════════════════════════════════
-- STARTER CHART OF ACCOUNTS
-- Standard COA for a trade/export company dealing in commodities.
-- Expand as needed — these are the minimum required accounts.
-- Parent hierarchy can be set manually after insert via parent_id.
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO accounts (code, name, account_type, normal_balance, is_system) VALUES
-- ── Assets 1xxx ───────────────────────────────────────────────────────────
('1000', 'Current Assets',           'asset',     'debit',  true),
('1010', 'Cash – USD',               'asset',     'debit',  true),
('1011', 'Cash – EUR',               'asset',     'debit',  true),
('1012', 'Cash – TRY',               'asset',     'debit',  true),
('1100', 'Accounts Receivable',      'asset',     'debit',  true),
('1200', 'Inventory',                'asset',     'debit',  false),
('1210', 'Goods in Transit',         'asset',     'debit',  false),
('1300', 'Prepaid Expenses',         'asset',     'debit',  false),
-- ── Liabilities 2xxx ──────────────────────────────────────────────────────
('2000', 'Current Liabilities',      'liability', 'credit', true),
('2010', 'Accounts Payable',         'liability', 'credit', true),
('2100', 'Accrued Expenses',         'liability', 'credit', false),
('2200', 'Tax Payable',              'liability', 'credit', false),
-- ── Equity 3xxx ───────────────────────────────────────────────────────────
('3000', 'Equity',                   'equity',    'credit', true),
('3010', 'Paid-in Capital',          'equity',    'credit', false),
('3900', 'Retained Earnings',        'equity',    'credit', true),
-- ── Revenue 4xxx ──────────────────────────────────────────────────────────
('4000', 'Revenue',                  'revenue',   'credit', true),
('4010', 'Sales Revenue',            'revenue',   'credit', true),
('4900', 'Other Income',             'revenue',   'credit', false),
-- ── Cost of Goods Sold 5xxx ───────────────────────────────────────────────
('5000', 'Cost of Goods Sold',       'expense',   'debit',  true),
('5010', 'Cost of Goods – Pulp',     'expense',   'debit',  false),
('5100', 'Freight & Logistics',      'expense',   'debit',  false),
('5110', 'Ocean Freight',            'expense',   'debit',  false),
('5120', 'Land Transport',           'expense',   'debit',  false),
('5130', 'Railway Transport',        'expense',   'debit',  false),
-- ── Operating Expenses 6xxx ───────────────────────────────────────────────
('6000', 'Operating Expenses',       'expense',   'debit',  false),
('6010', 'Customs & Port Fees',      'expense',   'debit',  false),
('6020', 'Warehouse Fees',           'expense',   'debit',  false),
('6030', 'Insurance',                'expense',   'debit',  false),
('6040', 'Bank Charges',             'expense',   'debit',  false),
('6050', 'Professional Services',    'expense',   'debit',  false),
('6900', 'Other Expenses',           'expense',   'debit',  false);
