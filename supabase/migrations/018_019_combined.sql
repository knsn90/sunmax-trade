-- ============================================================
-- COMBINED: Double-Entry Accounting + Chart of Accounts
-- Run this entire script once in Supabase SQL Editor
-- ============================================================

-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE account_type   AS ENUM ('asset','liability','equity','revenue','expense');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE normal_balance AS ENUM ('debit','credit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE entry_status   AS ENUM ('draft','posted','reversed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE period_status  AS ENUM ('open','closed','locked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Sequence ─────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS journal_entry_no_seq START 1;

-- ─── companies ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text          NOT NULL UNIQUE,
  name                text          NOT NULL,
  functional_currency currency_code NOT NULL DEFAULT 'USD',
  country             text,
  is_active           boolean       NOT NULL DEFAULT true,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

INSERT INTO companies (code, name, functional_currency)
  SELECT 'DEFAULT', company_name, default_currency
  FROM   company_settings LIMIT 1
ON CONFLICT (code) DO NOTHING;

INSERT INTO companies (code, name, functional_currency)
  SELECT 'DEFAULT', 'Default Company', 'USD'
  WHERE  NOT EXISTS (SELECT 1 FROM companies)
ON CONFLICT (code) DO NOTHING;

-- ─── accounting_periods ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounting_periods (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text          NOT NULL,
  start_date  date          NOT NULL,
  end_date    date          NOT NULL,
  status      period_status NOT NULL DEFAULT 'open',
  closed_by   uuid          REFERENCES auth.users(id),
  closed_at   timestamptz,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT period_dates_valid    CHECK (start_date <= end_date),
  CONSTRAINT no_period_overlap     EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)
);

-- ─── accounts ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id                   uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 text           NOT NULL,
  name                 text           NOT NULL,
  account_type         account_type   NOT NULL,
  normal_balance       normal_balance NOT NULL,
  parent_id            uuid           REFERENCES accounts(id),
  company_id           uuid           REFERENCES companies(id),
  account_currency     currency_code,
  is_control_account   boolean        NOT NULL DEFAULT false,
  allow_direct_posting boolean        NOT NULL DEFAULT true,
  sort_order           integer        NOT NULL DEFAULT 0,
  description          text,
  is_active            boolean        NOT NULL DEFAULT true,
  is_system            boolean        NOT NULL DEFAULT false,
  created_at           timestamptz    NOT NULL DEFAULT now(),
  updated_at           timestamptz    NOT NULL DEFAULT now()
);

-- Unique: global accounts by code, company accounts by (code, company_id)
CREATE UNIQUE INDEX IF NOT EXISTS accounts_code_global_unique
  ON accounts (code) WHERE company_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_code_company_unique
  ON accounts (code, company_id) WHERE company_id IS NOT NULL;

-- ─── journal_entries ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_no      text          NOT NULL UNIQUE
                  DEFAULT ('JE-' || LPAD(nextval('journal_entry_no_seq')::text, 6, '0')),
  entry_date    date          NOT NULL,
  period_id     uuid          REFERENCES accounting_periods(id),
  description   text          NOT NULL,
  source_type   text,
  source_id     uuid,
  currency      currency_code NOT NULL DEFAULT 'USD',
  exchange_rate numeric(18,6) NOT NULL DEFAULT 1.0 CHECK (exchange_rate > 0),
  status        entry_status  NOT NULL DEFAULT 'draft',
  reversal_of   uuid          REFERENCES journal_entries(id),
  reversed_by   uuid          REFERENCES journal_entries(id),
  created_by    uuid          REFERENCES auth.users(id),
  posted_by     uuid          REFERENCES auth.users(id),
  posted_at     timestamptz,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

-- ─── journal_lines ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_lines (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid          NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
  line_no          smallint      NOT NULL,
  account_id       uuid          NOT NULL REFERENCES accounts(id),
  description      text,
  debit            numeric(18,4) NOT NULL DEFAULT 0 CHECK (debit  >= 0),
  credit           numeric(18,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  orig_currency    currency_code,
  orig_amount      numeric(18,4),
  party_type       party_type,
  party_id         uuid,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT single_side CHECK (NOT (debit > 0 AND credit > 0)),
  CONSTRAINT non_zero    CHECK (debit > 0 OR credit > 0),
  UNIQUE (journal_entry_id, line_no)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_je_date    ON journal_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_je_status  ON journal_entries (status);
CREATE INDEX IF NOT EXISTS idx_je_source  ON journal_entries (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_jl_entry   ON journal_lines   (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jl_account ON journal_lines   (account_id);
CREATE INDEX IF NOT EXISTS idx_jl_party   ON journal_lines   (party_type, party_id) WHERE party_id IS NOT NULL;

-- ─── Trigger: balance check on posting ───────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_journal_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_diff   numeric;
  v_period period_status;
BEGIN
  IF OLD.status = 'posted' AND NEW.status NOT IN ('posted','reversed') THEN
    RAISE EXCEPTION 'Journal entry % is already posted. Only ''reversed'' is allowed.', OLD.entry_no;
  END IF;

  IF NEW.status = 'posted' AND OLD.status = 'draft' THEN
    IF NOT EXISTS (SELECT 1 FROM journal_lines WHERE journal_entry_id = NEW.id) THEN
      RAISE EXCEPTION 'Journal entry % has no lines.', NEW.entry_no;
    END IF;

    SELECT COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0)
      INTO v_diff FROM journal_lines WHERE journal_entry_id = NEW.id;

    IF v_diff <> 0 THEN
      RAISE EXCEPTION 'Journal entry % not balanced: debits − credits = % USD.', NEW.entry_no, v_diff;
    END IF;

    IF NEW.period_id IS NOT NULL THEN
      SELECT status INTO v_period FROM accounting_periods WHERE id = NEW.period_id;
      IF v_period <> 'open' THEN
        RAISE EXCEPTION 'Cannot post to a ''%'' period.', v_period;
      END IF;
    END IF;

    NEW.posted_at := now();
    NEW.posted_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_balance ON journal_entries;
CREATE TRIGGER trg_journal_balance
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION enforce_journal_balance();

-- ─── Trigger: immutable posted lines ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION prevent_modify_posted_lines()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_entry_id uuid;
BEGIN
  v_entry_id := CASE TG_OP WHEN 'DELETE' THEN OLD.journal_entry_id ELSE NEW.journal_entry_id END;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE id = v_entry_id AND status = 'posted') THEN
    RAISE EXCEPTION 'Lines of a posted journal entry are immutable. Use a reversal entry.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_posted_lines ON journal_lines;
CREATE TRIGGER trg_immutable_posted_lines
  BEFORE INSERT OR UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION prevent_modify_posted_lines();

-- ─── Trigger: protect system accounts ────────────────────────────────────────
CREATE OR REPLACE FUNCTION prevent_delete_system_accounts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_system THEN
    RAISE EXCEPTION 'System account "%" (%) cannot be deleted.', OLD.name, OLD.code;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_system_accounts ON accounts;
CREATE TRIGGER trg_protect_system_accounts
  BEFORE DELETE ON accounts
  FOR EACH ROW EXECUTE FUNCTION prevent_delete_system_accounts();

-- ─── Trigger: auto-assign accounting period ───────────────────────────────────
CREATE OR REPLACE FUNCTION auto_assign_period()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.period_id IS NULL THEN
    SELECT id INTO NEW.period_id FROM accounting_periods
     WHERE status = 'open' AND NEW.entry_date BETWEEN start_date AND end_date LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_period ON journal_entries;
CREATE TRIGGER trg_auto_assign_period
  BEFORE INSERT ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION auto_assign_period();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE companies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines      ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "companies_select"  ON companies          FOR SELECT TO authenticated USING (true);
  CREATE POLICY "companies_write"   ON companies          FOR ALL    TO authenticated USING (is_admin()) WITH CHECK (is_admin());
  CREATE POLICY "ap_select"         ON accounting_periods FOR SELECT TO authenticated USING (true);
  CREATE POLICY "ap_write"          ON accounting_periods FOR ALL    TO authenticated USING (is_admin()) WITH CHECK (is_admin());
  CREATE POLICY "acc_select"        ON accounts           FOR SELECT TO authenticated USING (true);
  CREATE POLICY "acc_write"         ON accounts           FOR ALL    TO authenticated USING (is_manager_or_admin()) WITH CHECK (is_manager_or_admin());
  CREATE POLICY "je_select"         ON journal_entries    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "je_insert"         ON journal_entries    FOR INSERT TO authenticated WITH CHECK (can_write_transactions());
  CREATE POLICY "je_update"         ON journal_entries    FOR UPDATE TO authenticated USING (can_write_transactions());
  CREATE POLICY "je_delete"         ON journal_entries    FOR DELETE TO authenticated USING (is_admin());
  CREATE POLICY "jl_select"         ON journal_lines      FOR SELECT TO authenticated USING (true);
  CREATE POLICY "jl_insert"         ON journal_lines      FOR INSERT TO authenticated WITH CHECK (can_write_transactions());
  CREATE POLICY "jl_update"         ON journal_lines      FOR UPDATE TO authenticated USING (can_write_transactions());
  CREATE POLICY "jl_delete"         ON journal_lines      FOR DELETE TO authenticated USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Chart of Accounts (58 accounts, 2-level hierarchy) ──────────────────────
INSERT INTO accounts
  (code, name, account_type, normal_balance, is_system,
   is_control_account, allow_direct_posting, sort_order, account_currency, description)
VALUES
-- ASSETS
('1000','Cash & Cash Equivalents',    'asset','debit', true, false,false,100,NULL,'Cash and bank accounts'),
('1010','Cash – USD',                 'asset','debit', true, false,true, 101,'USD','USD bank/cash'),
('1011','Cash – EUR',                 'asset','debit', true, false,true, 102,'EUR','EUR bank account'),
('1012','Cash – TRY',                 'asset','debit', true, false,true, 103,'TRY','TRY bank account'),
('1100','Accounts Receivable',        'asset','debit', true, true, false,200,NULL,'Control account – trade receivables'),
('1110','Trade Receivables – USD',    'asset','debit', false,false,true, 201,'USD','Customer A/R in USD'),
('1111','Trade Receivables – EUR',    'asset','debit', false,false,true, 202,'EUR','Customer A/R in EUR'),
('1120','Other Receivables',          'asset','debit', false,false,true, 210,NULL,'Non-trade receivables'),
('1130','VAT Receivable',             'asset','debit', false,false,true, 220,NULL,'Input VAT recoverable'),
('1200','Inventory & Goods in Transit','asset','debit',false,false,false,300,NULL,'Goods owned not yet sold'),
('1210','Inventory – Pulp & Wood',    'asset','debit', false,false,true, 301,NULL,'Cost of goods in stock'),
('1220','Goods in Transit',           'asset','debit', false,false,true, 302,NULL,'Shipped, title not yet transferred'),
('1230','Goods at Port / Customs',    'asset','debit', false,false,true, 303,NULL,'Cleared, awaiting pickup'),
('1300','Prepaid & Other Current',    'asset','debit', false,false,false,400,NULL,'Prepayments and deposits'),
('1310','Prepaid Expenses',           'asset','debit', false,false,true, 401,NULL,'Insurance, freight deposits paid ahead'),
('1320','Freight Advance Payments',   'asset','debit', false,false,true, 402,NULL,'Advances to freight forwarders'),
('1800','Non-Current Assets',         'asset','debit', false,false,false,800,NULL,'Fixed assets'),
('1810','Equipment & Fixtures',       'asset','debit', false,false,true, 801,NULL,'Office equipment, vehicles'),
('1890','Accumulated Depreciation',   'asset','credit',false,false,true, 890,NULL,'Contra-asset: accumulated depreciation'),
-- LIABILITIES
('2000','Accounts Payable',           'liability','credit',true, true, false,1100,NULL,'Control account – trade payables'),
('2010','Trade Payables – USD',       'liability','credit',false,false,true, 1101,'USD','Supplier A/P in USD'),
('2011','Trade Payables – EUR',       'liability','credit',false,false,true, 1102,'EUR','Supplier A/P in EUR'),
('2020','Freight & Logistics Payable','liability','credit',false,false,true, 1110,NULL,'Amounts owed to carriers'),
('2030','Service Provider Payable',   'liability','credit',false,false,true, 1120,NULL,'Customs, warehouse, inspection payable'),
('2100','Accrued Liabilities',        'liability','credit',false,false,false,1200,NULL,'Accrued but not yet invoiced'),
('2110','Accrued Freight',            'liability','credit',false,false,true, 1201,NULL,'Freight accrued, not yet invoiced'),
('2120','Accrued Service Costs',      'liability','credit',false,false,true, 1202,NULL,'Port, customs, warehouse accrued'),
('2200','Tax Liabilities',            'liability','credit',false,false,false,1300,NULL,'VAT, income tax, withholding'),
('2210','VAT Payable',                'liability','credit',false,false,true, 1301,NULL,'Output VAT collected'),
('2220','Income Tax Payable',         'liability','credit',false,false,true, 1302,NULL,'Corporate income tax due'),
('2230','Withholding Tax Payable',    'liability','credit',false,false,true, 1303,NULL,'WHT on foreign payments'),
('2800','Non-Current Liabilities',    'liability','credit',false,false,false,1800,NULL,'Long-term obligations'),
('2810','Bank Loans',                 'liability','credit',false,false,true, 1801,NULL,'Long-term bank borrowings'),
-- EQUITY
('3000','Equity',                     'equity','credit',true, false,false,2000,NULL,'Owner equity'),
('3010','Paid-in Capital',            'equity','credit',false,false,true, 2001,NULL,'Owner/shareholder contributions'),
('3020','Additional Paid-in Capital', 'equity','credit',false,false,true, 2002,NULL,'Share premium'),
('3900','Retained Earnings',          'equity','credit',true, false,true, 2900,NULL,'Accumulated prior-year earnings'),
('3990','Current Year Net Income',    'equity','credit',true, false,true, 2990,NULL,'Closed to Retained Earnings at year-end'),
-- REVENUE
('4000','Revenue',                    'revenue','credit',true, false,false,3000,NULL,'All revenue'),
('4010','Sales Revenue – Commodity',  'revenue','credit',true, false,true, 3001,NULL,'Pulp, wood, commodity sales'),
('4020','Sales Revenue – Other',      'revenue','credit',false,false,true, 3002,NULL,'Other product/service revenue'),
('4800','FX Gain',                    'revenue','credit',false,false,true, 3800,NULL,'Foreign exchange gains'),
('4900','Other Income',               'revenue','credit',false,false,true, 3900,NULL,'Interest income, misc income'),
-- COST OF GOODS SOLD
('5000','Cost of Goods Sold',         'expense','debit', true, false,false,4000,NULL,'Direct cost of goods sold'),
('5010','Purchase Cost – Commodity',  'expense','debit', false,false,true, 4001,NULL,'Purchased pulp, wood, raw materials'),
('5100','Ocean Freight',              'expense','debit', false,false,true, 4100,NULL,'Sea freight on purchased goods'),
('5110','Land Transport',             'expense','debit', false,false,true, 4110,NULL,'Truck/overland transport'),
('5120','Railway Transport',          'expense','debit', false,false,true, 4120,NULL,'Rail freight charges'),
('5200','Import Duties & Tariffs',    'expense','debit', false,false,true, 4200,NULL,'Customs duties on imports'),
('5300','Cargo Insurance',            'expense','debit', false,false,true, 4300,NULL,'Insurance on goods in transit'),
('5800','FX Loss – COGS',            'expense','debit', false,false,true, 4800,NULL,'FX losses on cost of goods'),
-- OPERATING EXPENSES
('6000','Operating Expenses',         'expense','debit', false,false,false,5000,NULL,'Overhead and operations'),
('6010','Customs & Port Fees',        'expense','debit', false,false,true, 5001,NULL,'Port handling, terminal, agent fees'),
('6020','Warehouse & Storage',        'expense','debit', false,false,true, 5002,NULL,'Warehouse rent, demurrage'),
('6030','General Insurance',          'expense','debit', false,false,true, 5003,NULL,'Business and liability insurance'),
('6040','Bank Charges',               'expense','debit', false,false,true, 5004,NULL,'Wire fees, LC fees, bank charges'),
('6050','FX Loss – Operating',        'expense','debit', false,false,true, 5005,NULL,'FX losses on operating transactions'),
('6060','Professional & Legal Fees',  'expense','debit', false,false,true, 5006,NULL,'Legal, audit, consulting fees'),
('6070','Communication & Software',   'expense','debit', false,false,true, 5007,NULL,'Phone, internet, SaaS'),
('6080','Travel & Representation',    'expense','debit', false,false,true, 5008,NULL,'Business travel, client entertainment'),
('6100','Staff Costs',                'expense','debit', false,false,true, 5100,NULL,'Salaries, bonuses, social security'),
('6900','Miscellaneous Expenses',     'expense','debit', false,false,true, 5900,NULL,'Other operating costs')
ON CONFLICT DO NOTHING;

-- ─── Set parent_id ────────────────────────────────────────────────────────────
UPDATE accounts SET parent_id=(SELECT id FROM accounts WHERE code='1000') WHERE code IN ('1010','1011','1012');
UPDATE accounts SET parent_id=(SELECT id FROM accounts WHERE code='1100') WHERE code IN ('1110','1111','1120','1130');
UPDATE accounts SET parent_id=(SELECT id FROM accounts WHERE code='1200') WHERE code IN ('1210','1220','1230');
UPDATE accounts SET parent_id=(SELECT id FROM accounts WHERE code='1300') WHERE code IN ('1310','1320');
UPDATE accounts SET parent_id=(SELECT id FROM accounts WHERE code='1800') WHERE code IN ('1810','1890');
UPDATE accounts SET parent_id=(SELECT id FROM accounts WHERE code='2000') WHERE code IN ('2010','2011','2020','2030');
UPDATE accounts SET parent_id=(SELECT id FROM accounts WHERE code='2100') WHERE code IN ('2110','2120');
UPDATE accounts SET parent_id=(SELECT id FROM accounts WHERE code='2200') WHERE code IN ('2210','2220','2230');
UPDATE accounts SET parent_id=(SELECT id FROM accounts WHERE code='2800') WHERE code IN ('2810');
UPDATE accounts SET parent_id=(SELECT id FROM accounts WHERE code='3000') WHERE code IN ('3010','3020','3900','3990');
UPDATE accounts SET parent_id=(SELECT id FROM accounts WHERE code='4000') WHERE code IN ('4010','4020','4800','4900');
UPDATE accounts SET parent_id=(SELECT id FROM accounts WHERE code='5000') WHERE code IN ('5010','5100','5110','5120','5200','5300','5800');
UPDATE accounts SET parent_id=(SELECT id FROM accounts WHERE code='6000') WHERE code IN ('6010','6020','6030','6040','6050','6060','6070','6080','6100','6900');

-- ─── account_balance function ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION account_balance(
  p_account_id uuid,
  p_from        text DEFAULT NULL,
  p_to          text DEFAULT NULL
)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT CASE a.normal_balance
    WHEN 'debit'  THEN COALESCE(SUM(jl.debit),0)  - COALESCE(SUM(jl.credit),0)
    WHEN 'credit' THEN COALESCE(SUM(jl.credit),0) - COALESCE(SUM(jl.debit),0)
  END
  FROM accounts a
  LEFT JOIN journal_lines  jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
    AND je.status = 'posted'
    AND (p_from IS NULL OR je.entry_date >= p_from::date)
    AND (p_to   IS NULL OR je.entry_date <= p_to::date)
  WHERE a.id = p_account_id
  GROUP BY a.normal_balance;
$$;

-- ─── Reporting views ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_trial_balance AS
SELECT a.code, a.name, a.account_type, a.normal_balance,
  COALESCE(SUM(jl.debit),0)  AS total_debit,
  COALESCE(SUM(jl.credit),0) AS total_credit,
  CASE a.normal_balance
    WHEN 'debit'  THEN COALESCE(SUM(jl.debit),0)  - COALESCE(SUM(jl.credit),0)
    WHEN 'credit' THEN COALESCE(SUM(jl.credit),0) - COALESCE(SUM(jl.debit),0)
  END AS balance
FROM accounts a
LEFT JOIN journal_lines  jl ON jl.account_id = a.id
LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
WHERE a.is_active = true
GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
ORDER BY a.code;

CREATE OR REPLACE VIEW v_coa AS
SELECT a.id, a.code, a.name, a.account_type, a.normal_balance,
  a.account_currency, a.is_control_account, a.allow_direct_posting,
  a.is_active, a.sort_order, a.parent_id,
  p.code AS parent_code, p.name AS parent_name,
  CASE WHEN a.parent_id IS NULL THEN 1 ELSE 2 END AS level,
  CASE WHEN a.parent_id IS NULL
    THEN a.code || '  ' || a.name
    ELSE '    ' || a.code || '  ' || a.name
  END AS display_label
FROM accounts a
LEFT JOIN accounts p ON p.id = a.parent_id
WHERE a.is_active = true
ORDER BY a.sort_order, a.code;

CREATE OR REPLACE VIEW v_account_ledger AS
SELECT je.entry_date, je.entry_no,
  je.description AS entry_description, jl.description AS line_description,
  a.code AS account_code, a.name AS account_name, a.account_type,
  jl.debit, jl.credit, jl.party_type, jl.party_id,
  je.source_type, je.source_id, je.status
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
JOIN accounts a ON a.id = jl.account_id
ORDER BY je.entry_date, je.entry_no, jl.line_no;

CREATE OR REPLACE VIEW v_subledger AS
SELECT jl.party_type, jl.party_id,
  a.code AS account_code, a.name AS account_name,
  je.entry_date, je.entry_no, je.description,
  jl.debit, jl.credit, je.source_type, je.source_id
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
JOIN accounts a ON a.id = jl.account_id
WHERE jl.party_id IS NOT NULL
ORDER BY jl.party_type, jl.party_id, je.entry_date;

-- ─── Verify ───────────────────────────────────────────────────────────────────
SELECT account_type, COUNT(*) AS total,
  COUNT(*) FILTER (WHERE allow_direct_posting) AS posting_accounts
FROM accounts
GROUP BY account_type ORDER BY account_type;
