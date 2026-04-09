-- ============================================================================
-- 027_legacy_transactions.sql
--
-- HYBRID ACCOUNTING — LEGACY DATA LAYER
--
-- PURPOSE
-- ───────
-- Allow historical (pre-system) data imported from Excel to participate
-- in reporting without polluting the double-entry journal.
--
-- STRICT SEPARATION RULES
-- ───────────────────────
-- 1. This table is REPORTING ONLY — never post to journal_entries from here.
-- 2. It has NO trade_file_id — legacy data is party-level, not contract-level.
-- 3. combined_statement_* views are the ONLY correct way to merge old + new data.
-- 4. The "type" column (debit/credit) is from the PARTY's perspective:
--      customer + debit  → customer owes us more (we raised an invoice on them)
--      customer + credit → customer paid us
--      supplier + debit  → supplier charged us (their invoice arrived)
--      supplier + credit → we paid the supplier
-- 5. All amounts are positive; direction is carried by "type".
--
-- OPENING BALANCE RECONCILIATION
-- ───────────────────────────────
-- After importing all legacy data, run:
--   SELECT * FROM v_legacy_balance_by_party;
-- Reconcile those balances against the opening balance journal entry posted
-- in migration 025 (or create one now) so that combined reports are correct.
-- ============================================================================

-- ─── Enum ─────────────────────────────────────────────────────────────────────
-- Simple debit/credit from party perspective.
-- Not the same as account-side DR/CR in the journal.
CREATE TYPE legacy_entry_type AS ENUM ('debit', 'credit');

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE: legacy_transactions
--
-- One row per historical line item (invoice, payment, debit note, etc.).
-- Bulk-imported from Excel; never created one-by-one in the app.
--
-- PERFORMANCE NOTES
-- ─────────────────
-- The primary query pattern is "all rows for a party, ordered by date."
-- idx_legacy_party covers this perfectly (party_type, party_id, date DESC).
-- For bulk-year exports, idx_legacy_period_year allows fast year filtering.
-- For re-import / de-duplicate workflows, the UNIQUE constraint on
-- (import_batch, external_ref) prevents accidental double-import.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE legacy_transactions (
  id            uuid              PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Party reference (polymorphic) ────────────────────────────────────────
  -- Exactly one of customer_id / supplier_id must be set.
  -- party_type is denormalised for fast index scans.
  party_type    obligation_party  NOT NULL,    -- reuse existing enum: customer|supplier
  customer_id   uuid              REFERENCES customers(id)  ON DELETE SET NULL,
  supplier_id   uuid              REFERENCES suppliers(id)  ON DELETE SET NULL,

  -- ── Core fields ──────────────────────────────────────────────────────────
  txn_date      date              NOT NULL,
  description   text              NOT NULL     DEFAULT '',
  amount        numeric(18,4)     NOT NULL     CHECK (amount > 0),
  currency      currency_code     NOT NULL     DEFAULT 'USD',
  type          legacy_entry_type NOT NULL,    -- debit | credit (party perspective)

  -- ── Source / import metadata ─────────────────────────────────────────────
  source        text              NOT NULL     DEFAULT 'excel',  -- 'excel', 'csv', 'manual'
  import_batch  text              NOT NULL     DEFAULT '',       -- e.g. '2024-Q1-import'
  external_ref  text              NOT NULL     DEFAULT '',       -- original ID / row ref from source
  period_year   smallint          GENERATED ALWAYS AS (EXTRACT(YEAR FROM txn_date)::smallint) STORED,

  -- ── Audit ────────────────────────────────────────────────────────────────
  imported_by   uuid              REFERENCES auth.users(id),
  imported_at   timestamptz       NOT NULL     DEFAULT now(),
  notes         text              DEFAULT '',

  -- ── Constraints ──────────────────────────────────────────────────────────
  CONSTRAINT chk_legacy_party CHECK (
    (party_type = 'customer' AND customer_id IS NOT NULL AND supplier_id IS NULL) OR
    (party_type = 'supplier' AND supplier_id IS NOT NULL AND customer_id IS NULL)
  ),

  -- Prevent double-import: same batch + same source reference = duplicate
  CONSTRAINT uq_legacy_batch_ref UNIQUE (import_batch, external_ref)
);

-- ─── Performance indexes ──────────────────────────────────────────────────────

-- Primary query: all rows for a party, chronological
CREATE INDEX idx_legacy_party
  ON legacy_transactions (party_type, customer_id, txn_date DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX idx_legacy_party_sup
  ON legacy_transactions (party_type, supplier_id, txn_date DESC)
  WHERE supplier_id IS NOT NULL;

-- Year-band queries (e.g. "show me 2022 data")
CREATE INDEX idx_legacy_year
  ON legacy_transactions (period_year, party_type);

-- Batch management (re-import, rollback batch)
CREATE INDEX idx_legacy_batch
  ON legacy_transactions (import_batch)
  WHERE import_batch <> '';

-- Date range (timeline queries, not party-scoped)
CREATE INDEX idx_legacy_date
  ON legacy_transactions USING BRIN (txn_date);

-- ─── Row-level security ───────────────────────────────────────────────────────
ALTER TABLE legacy_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lt_select" ON legacy_transactions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lt_insert" ON legacy_transactions
  FOR INSERT TO authenticated WITH CHECK (can_write_transactions());

CREATE POLICY "lt_update" ON legacy_transactions
  FOR UPDATE TO authenticated USING (is_manager_or_admin());

-- Deletes (whole-batch rollback) — admin only
CREATE POLICY "lt_delete" ON legacy_transactions
  FOR DELETE TO authenticated USING (is_admin());

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE: legacy_import_batches
--
-- Registry of every import run. Lets you see what was imported, when,
-- and roll back a specific batch if needed (DELETE WHERE import_batch = '...').
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE legacy_import_batches (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_key     text        NOT NULL UNIQUE,   -- matches legacy_transactions.import_batch
  label         text        NOT NULL,          -- human description, e.g. "2022 AR from Excel"
  source_file   text        DEFAULT '',        -- original filename
  row_count     integer     NOT NULL DEFAULT 0,
  total_debit   numeric(18,4) NOT NULL DEFAULT 0,
  total_credit  numeric(18,4) NOT NULL DEFAULT 0,
  currency      currency_code NOT NULL DEFAULT 'USD',
  imported_by   uuid        REFERENCES auth.users(id),
  imported_at   timestamptz NOT NULL DEFAULT now(),
  notes         text        DEFAULT ''
);

ALTER TABLE legacy_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lib_select" ON legacy_import_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "lib_write"  ON legacy_import_batches FOR ALL TO authenticated
  USING (can_write_transactions()) WITH CHECK (can_write_transactions());

-- ══════════════════════════════════════════════════════════════════════════════
-- VIEW: v_legacy_balance_by_party
--
-- Net balance per party from legacy data only.
-- Positive = they owe us (net debit); negative = we owe them (net credit).
-- Use this to reconcile with the opening balance journal entry.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_legacy_balance_by_party AS
SELECT
  lt.party_type,
  lt.customer_id,
  lt.supplier_id,
  c.name AS customer_name,
  s.name AS supplier_name,
  lt.currency,
  COALESCE(SUM(CASE WHEN lt.type = 'debit'  THEN lt.amount ELSE 0 END), 0) AS total_debit,
  COALESCE(SUM(CASE WHEN lt.type = 'credit' THEN lt.amount ELSE 0 END), 0) AS total_credit,
  -- net_balance > 0 → party owes us; < 0 → we owe party
  COALESCE(SUM(CASE WHEN lt.type = 'debit'  THEN lt.amount
                    WHEN lt.type = 'credit' THEN -lt.amount
                    END), 0) AS net_balance,
  COUNT(*)                                          AS row_count,
  MIN(lt.txn_date)                                  AS earliest_date,
  MAX(lt.txn_date)                                  AS latest_date
FROM legacy_transactions lt
LEFT JOIN customers c ON c.id = lt.customer_id
LEFT JOIN suppliers s ON s.id = lt.supplier_id
GROUP BY
  lt.party_type, lt.customer_id, lt.supplier_id,
  c.name, s.name, lt.currency;

-- ══════════════════════════════════════════════════════════════════════════════
-- VIEW: v_combined_statement_customer
--
-- Full account statement for a CUSTOMER:
--   legacy rows  +  posted journal lines  →  unified chronological view
--
-- USAGE:
--   SELECT * FROM v_combined_statement_customer
--   WHERE customer_id = '<uuid>'
--   ORDER BY txn_date, source_system, line_no;
--
-- running_balance: cumulative net (debit − credit), i.e. how much they owe.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_combined_statement_customer AS
WITH all_lines AS (

  -- ── Legacy data ────────────────────────────────────────────────────────
  SELECT
    lt.customer_id,
    lt.txn_date,
    lt.description,
    CASE WHEN lt.type = 'debit'  THEN lt.amount ELSE 0 END AS debit,
    CASE WHEN lt.type = 'credit' THEN lt.amount ELSE 0 END AS credit,
    lt.currency,
    lt.external_ref     AS reference_no,
    lt.import_batch     AS batch_or_source,
    'legacy'::text      AS source_system,
    0                   AS line_no        -- legacy has no line number
  FROM legacy_transactions lt
  WHERE lt.party_type = 'customer'

  UNION ALL

  -- ── New system (posted journal lines with party = customer) ────────────
  SELECT
    jl.party_id                                       AS customer_id,
    je.entry_date                                     AS txn_date,
    COALESCE(jl.description, je.description)          AS description,
    jl.debit,
    jl.credit,
    je.currency,
    je.entry_no                                       AS reference_no,
    je.source_type                                    AS batch_or_source,
    'journal'::text                                   AS source_system,
    jl.line_no
  FROM journal_lines  jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
                          AND je.status = 'posted'
  WHERE jl.party_type = 'customer'
)
SELECT
  customer_id,
  txn_date,
  description,
  debit,
  credit,
  currency,
  reference_no,
  batch_or_source,
  source_system,
  line_no,
  -- Running balance (debit increases balance, credit decreases it)
  SUM(debit - credit) OVER (
    PARTITION BY customer_id, currency
    ORDER BY txn_date, source_system DESC, line_no
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_balance
FROM all_lines;

-- ══════════════════════════════════════════════════════════════════════════════
-- VIEW: v_combined_statement_supplier
--
-- Same pattern for SUPPLIERS.
-- running_balance: how much we owe the supplier (debit = we owe more).
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_combined_statement_supplier AS
WITH all_lines AS (

  SELECT
    lt.supplier_id,
    lt.txn_date,
    lt.description,
    CASE WHEN lt.type = 'debit'  THEN lt.amount ELSE 0 END AS debit,
    CASE WHEN lt.type = 'credit' THEN lt.amount ELSE 0 END AS credit,
    lt.currency,
    lt.external_ref     AS reference_no,
    lt.import_batch     AS batch_or_source,
    'legacy'::text      AS source_system,
    0                   AS line_no
  FROM legacy_transactions lt
  WHERE lt.party_type = 'supplier'

  UNION ALL

  SELECT
    jl.party_id                                       AS supplier_id,
    je.entry_date                                     AS txn_date,
    COALESCE(jl.description, je.description)          AS description,
    jl.debit,
    jl.credit,
    je.currency,
    je.entry_no                                       AS reference_no,
    je.source_type                                    AS batch_or_source,
    'journal'::text                                   AS source_system,
    jl.line_no
  FROM journal_lines  jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
                          AND je.status = 'posted'
  WHERE jl.party_type = 'supplier'
)
SELECT
  supplier_id,
  txn_date,
  description,
  debit,
  credit,
  currency,
  reference_no,
  batch_or_source,
  source_system,
  line_no,
  SUM(debit - credit) OVER (
    PARTITION BY supplier_id, currency
    ORDER BY txn_date, source_system DESC, line_no
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_balance
FROM all_lines;

-- ══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: fn_legacy_import_summary
--
-- After a bulk INSERT, call this to register the batch totals in
-- legacy_import_batches.  Pass the batch_key used during the insert.
--
-- Usage (after your INSERT):
--   SELECT fn_legacy_import_summary('2022-full-import', 'FY2022 from AR Excel');
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_legacy_import_summary(
  p_batch_key  text,
  p_label      text       DEFAULT NULL,
  p_file_name  text       DEFAULT ''
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_rows    integer;
  v_debit   numeric(18,4);
  v_credit  numeric(18,4);
  v_curr    currency_code;
BEGIN
  SELECT
    COUNT(*),
    COALESCE(SUM(CASE WHEN type = 'debit'  THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0),
    -- take the most common currency (or USD as fallback)
    (SELECT currency FROM legacy_transactions
     WHERE import_batch = p_batch_key
     GROUP BY currency ORDER BY COUNT(*) DESC LIMIT 1)
  INTO v_rows, v_debit, v_credit, v_curr
  FROM legacy_transactions
  WHERE import_batch = p_batch_key;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'No rows found for batch_key "%"', p_batch_key;
  END IF;

  INSERT INTO legacy_import_batches
    (batch_key, label, source_file, row_count, total_debit, total_credit, currency, imported_by)
  VALUES
    (p_batch_key,
     COALESCE(p_label, p_batch_key),
     p_file_name,
     v_rows, v_debit, v_credit,
     COALESCE(v_curr, 'USD'),
     auth.uid())
  ON CONFLICT (batch_key) DO UPDATE SET
    row_count    = EXCLUDED.row_count,
    total_debit  = EXCLUDED.total_debit,
    total_credit = EXCLUDED.total_credit,
    imported_at  = now();
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- HELPER VIEW: v_party_combined_balance
--
-- Aggregate balance per party across BOTH systems.
-- Suitable for dashboard AR/AP aging — uses union instead of join.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_party_combined_balance AS

-- Customer balances
SELECT
  'customer'::text                              AS party_type,
  agg.party_id,
  c.name                                AS party_name,
  agg.currency,
  agg.legacy_debit,
  agg.legacy_credit,
  agg.journal_debit,
  agg.journal_credit,
  (agg.legacy_debit  - agg.legacy_credit) +
  (agg.journal_debit - agg.journal_credit)      AS net_balance
FROM (
  SELECT
    COALESCE(lt.customer_id, js.party_id)        AS party_id,
    COALESCE(lt.currency,    js.currency)         AS currency,
    COALESCE(SUM(CASE WHEN lt.type = 'debit'  AND lt.id IS NOT NULL THEN lt.amount ELSE 0 END), 0) AS legacy_debit,
    COALESCE(SUM(CASE WHEN lt.type = 'credit' AND lt.id IS NOT NULL THEN lt.amount ELSE 0 END), 0) AS legacy_credit,
    COALESCE(SUM(CASE WHEN js.id IS NOT NULL THEN js.debit  ELSE 0 END), 0)                        AS journal_debit,
    COALESCE(SUM(CASE WHEN js.id IS NOT NULL THEN js.credit ELSE 0 END), 0)                        AS journal_credit
  FROM legacy_transactions lt
  FULL OUTER JOIN (
    SELECT jl.party_id, je.currency, jl.debit, jl.credit, jl.id
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
    WHERE jl.party_type = 'customer'
  ) js ON js.party_id = lt.customer_id
  WHERE lt.party_type = 'customer' OR lt.id IS NULL
  GROUP BY COALESCE(lt.customer_id, js.party_id), COALESCE(lt.currency, js.currency)
) agg
JOIN customers c ON c.id = agg.party_id

UNION ALL

-- Supplier balances
SELECT
  'supplier'::text,
  agg.party_id,
  s.name,
  agg.currency,
  agg.legacy_debit,
  agg.legacy_credit,
  agg.journal_debit,
  agg.journal_credit,
  (agg.legacy_debit  - agg.legacy_credit) +
  (agg.journal_debit - agg.journal_credit)
FROM (
  SELECT
    COALESCE(lt.supplier_id, js.party_id)        AS party_id,
    COALESCE(lt.currency,    js.currency)         AS currency,
    COALESCE(SUM(CASE WHEN lt.type = 'debit'  AND lt.id IS NOT NULL THEN lt.amount ELSE 0 END), 0) AS legacy_debit,
    COALESCE(SUM(CASE WHEN lt.type = 'credit' AND lt.id IS NOT NULL THEN lt.amount ELSE 0 END), 0) AS legacy_credit,
    COALESCE(SUM(CASE WHEN js.id IS NOT NULL THEN js.debit  ELSE 0 END), 0)                        AS journal_debit,
    COALESCE(SUM(CASE WHEN js.id IS NOT NULL THEN js.credit ELSE 0 END), 0)                        AS journal_credit
  FROM legacy_transactions lt
  FULL OUTER JOIN (
    SELECT jl.party_id, je.currency, jl.debit, jl.credit, jl.id
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
    WHERE jl.party_type = 'supplier'
  ) js ON js.party_id = lt.supplier_id
  WHERE lt.party_type = 'supplier' OR lt.id IS NULL
  GROUP BY COALESCE(lt.supplier_id, js.party_id), COALESCE(lt.currency, js.currency)
) agg
JOIN suppliers s ON s.id = agg.party_id;
