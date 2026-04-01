-- ============================================================
-- 019_chart_of_accounts.sql
--
-- Production Chart of Accounts (COA)
--
-- DESIGN DECISIONS:
--   1. Hierarchical (3 levels): Type Group → Sub-Group → Posting Account
--   2. Multi-company ready via company_id (NULL = global/shared template)
--   3. Currency-specific accounts for cash & FX receivables/payables
--   4. Control accounts (A/R, A/P) marked — no direct journal posting
--   5. allow_direct_posting=false on group/summary accounts
-- ============================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE: companies  (multi-company foundation)
-- company_id=NULL on accounts means "global / shared across all companies".
-- Currently single-tenant — extend by inserting more rows here.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS companies (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 text          NOT NULL UNIQUE,   -- 'HQ', 'BRANCH_TR'
  name                 text          NOT NULL,
  functional_currency  currency_code NOT NULL DEFAULT 'USD',
  country              text,
  is_active            boolean       NOT NULL DEFAULT true,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now()
);

-- Seed: pull from company_settings; fallback to default
INSERT INTO companies (code, name, functional_currency)
  SELECT 'DEFAULT', company_name, default_currency
  FROM   company_settings
  LIMIT  1
ON CONFLICT (code) DO NOTHING;

INSERT INTO companies (code, name, functional_currency)
  SELECT 'DEFAULT', 'Default Company', 'USD'
  WHERE  NOT EXISTS (SELECT 1 FROM companies)
ON CONFLICT (code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- ALTER: accounts
-- Add multi-company + multi-currency + posting-control columns.
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS company_id          uuid          REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS account_currency    currency_code,      -- NULL = functional (USD)
  ADD COLUMN IF NOT EXISTS is_control_account  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_direct_posting boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order          integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN accounts.company_id IS
  'NULL = global template shared across all companies. '
  'Set to a specific company for company-specific overrides.';

COMMENT ON COLUMN accounts.account_currency IS
  'NULL = accepts any / functional currency (USD). '
  'Set for FX-denominated accounts: e.g. EUR bank account → ''EUR''.';

COMMENT ON COLUMN accounts.is_control_account IS
  'A/R and A/P summary accounts. Sub-ledger detail lives in journal_lines.party_id. '
  'Direct posting is still allowed; flag is informational for reconciliation.';

COMMENT ON COLUMN accounts.allow_direct_posting IS
  'false on group/header accounts. journal_lines must not reference these. '
  'Enforced at application layer — not yet a DB constraint.';

-- ─── Uniqueness: replace single-column with multi-company safe indexes ────────
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_code_key;

-- Global accounts: code unique where company_id IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS accounts_code_global_unique
  ON accounts (code)
  WHERE company_id IS NULL;

-- Company accounts: (code, company_id) unique per company
CREATE UNIQUE INDEX IF NOT EXISTS accounts_code_company_unique
  ON accounts (code, company_id)
  WHERE company_id IS NOT NULL;

-- ─── RLS for companies ────────────────────────────────────────────────────────
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_select" ON companies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "companies_write" ON companies
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ══════════════════════════════════════════════════════════════════════════════
-- CHART OF ACCOUNTS SEED DATA
--
-- Structure (3 levels):
--   Level 1 — Sub-group   (allow_direct_posting=false, e.g. "1000 Current Assets")
--   Level 2 — Account     (allow_direct_posting=true,  e.g. "1010 Cash – USD")
--
-- Number ranges:
--   1xxx  Assets
--   2xxx  Liabilities
--   3xxx  Equity
--   4xxx  Revenue
--   5xxx  Cost of Goods Sold
--   6xxx  Operating Expenses
--
-- account_currency:
--   NULL = multi-currency / functional currency (USD)
--   'USD' / 'EUR' / 'TRY' = currency-specific cash or FX accounts
-- ══════════════════════════════════════════════════════════════════════════════

-- Clear migration 018 basic seed (no journal entries exist yet)
DELETE FROM accounts;

-- ─── STEP 1: Insert all accounts (parent_id set in step 2) ───────────────────

INSERT INTO accounts
  (code, name, account_type, normal_balance, is_system, is_control_account,
   allow_direct_posting, sort_order, account_currency, description)
VALUES

-- ════════════════════════════════
-- ASSETS (1xxx)
-- ════════════════════════════════

-- Sub-groups
('1000', 'Cash & Cash Equivalents',     'asset', 'debit',  true,  false, false, 100, NULL,
 'All cash, bank, and cash-equivalent accounts'),
('1100', 'Accounts Receivable',         'asset', 'debit',  true,  true,  false, 200, NULL,
 'Control account for trade receivables. Detail in sub-ledger (party_id on journal_lines).'),
('1200', 'Inventory & Goods in Transit','asset', 'debit',  false, false, false, 300, NULL,
 'Physical goods owned but not yet sold'),
('1300', 'Prepaid & Other Current',     'asset', 'debit',  false, false, false, 400, NULL,
 'Prepayments, deposits, and short-term receivables'),
('1800', 'Non-Current Assets',          'asset', 'debit',  false, false, false, 800, NULL,
 'Fixed assets and long-term investments'),

-- Cash & Bank (currency-specific)
('1010', 'Cash – USD',                  'asset', 'debit',  true,  false, true,  101, 'USD',
 'USD bank account or petty cash'),
('1011', 'Cash – EUR',                  'asset', 'debit',  true,  false, true,  102, 'EUR',
 'EUR bank account'),
('1012', 'Cash – TRY',                  'asset', 'debit',  true,  false, true,  103, 'TRY',
 'TRY bank account'),

-- Receivables
('1110', 'Trade Receivables – USD',     'asset', 'debit',  false, false, true,  201, 'USD',
 'Amounts owed by customers in USD'),
('1111', 'Trade Receivables – EUR',     'asset', 'debit',  false, false, true,  202, 'EUR',
 'Amounts owed by customers in EUR'),
('1120', 'Other Receivables',           'asset', 'debit',  false, false, true,  210, NULL,
 'Non-trade receivables'),
('1130', 'VAT Receivable',              'asset', 'debit',  false, false, true,  220, NULL,
 'Input VAT recoverable'),

-- Inventory
('1210', 'Inventory – Pulp & Wood',     'asset', 'debit',  false, false, true,  301, NULL,
 'Cost of goods held in stock'),
('1220', 'Goods in Transit',            'asset', 'debit',  false, false, true,  302, NULL,
 'Goods shipped, title not yet transferred'),
('1230', 'Goods Held at Port/Customs',  'asset', 'debit',  false, false, true,  303, NULL,
 'Goods cleared but awaiting pickup'),

-- Prepaid
('1310', 'Prepaid Expenses',            'asset', 'debit',  false, false, true,  401, NULL,
 'Expenses paid in advance (insurance, freight deposits)'),
('1320', 'Freight Advance Payments',    'asset', 'debit',  false, false, true,  402, NULL,
 'Advance payments to freight forwarders'),

-- Fixed Assets
('1810', 'Equipment & Fixtures',        'asset', 'debit',  false, false, true,  801, NULL,
 'Office equipment, vehicles'),
('1890', 'Accumulated Depreciation',    'asset', 'credit', false, false, true,  890, NULL,
 'Contra-asset: accumulated depreciation on fixed assets'),

-- ════════════════════════════════
-- LIABILITIES (2xxx)
-- ════════════════════════════════

-- Sub-groups
('2000', 'Accounts Payable',            'liability', 'credit', true,  true,  false, 1100, NULL,
 'Control account for trade payables. Detail in sub-ledger.'),
('2100', 'Accrued Liabilities',         'liability', 'credit', false, false, false, 1200, NULL,
 'Accrued but not yet invoiced expenses'),
('2200', 'Tax Liabilities',             'liability', 'credit', false, false, false, 1300, NULL,
 'VAT, income tax, withholding tax payables'),
('2800', 'Non-Current Liabilities',     'liability', 'credit', false, false, false, 1800, NULL,
 'Long-term debt and obligations'),

-- Payables (currency-specific)
('2010', 'Trade Payables – USD',        'liability', 'credit', false, false, true,  1101, 'USD',
 'Amounts owed to suppliers in USD'),
('2011', 'Trade Payables – EUR',        'liability', 'credit', false, false, true,  1102, 'EUR',
 'Amounts owed to suppliers in EUR'),
('2020', 'Freight & Logistics Payable', 'liability', 'credit', false, false, true,  1110, NULL,
 'Amounts owed to freight forwarders and carriers'),
('2030', 'Service Provider Payable',    'liability', 'credit', false, false, true,  1120, NULL,
 'Customs agents, warehouse, inspection fees payable'),

-- Accrued
('2110', 'Accrued Freight',             'liability', 'credit', false, false, true,  1201, NULL,
 'Freight cost accrued but not yet invoiced'),
('2120', 'Accrued Service Costs',       'liability', 'credit', false, false, true,  1202, NULL,
 'Port, customs, warehouse costs accrued'),

-- Tax
('2210', 'VAT Payable',                 'liability', 'credit', false, false, true,  1301, NULL,
 'Output VAT collected from customers'),
('2220', 'Income Tax Payable',          'liability', 'credit', false, false, true,  1302, NULL,
 'Corporate income tax due'),
('2230', 'Withholding Tax Payable',     'liability', 'credit', false, false, true,  1303, NULL,
 'WHT on foreign payments'),

-- Long-term
('2810', 'Bank Loans',                  'liability', 'credit', false, false, true,  1801, NULL,
 'Long-term bank borrowings'),

-- ════════════════════════════════
-- EQUITY (3xxx)
-- ════════════════════════════════

-- Sub-groups
('3000', 'Equity',                      'equity', 'credit', true,  false, false, 2000, NULL,
 'Owner equity accounts'),

-- Equity accounts
('3010', 'Paid-in Capital',             'equity', 'credit', false, false, true,  2001, NULL,
 'Contributions by owners/shareholders'),
('3020', 'Additional Paid-in Capital',  'equity', 'credit', false, false, true,  2002, NULL,
 'Share premium above par value'),
('3900', 'Retained Earnings',           'equity', 'credit', true,  false, true,  2900, NULL,
 'Accumulated prior-year earnings'),
('3990', 'Current Year Net Income',     'equity', 'credit', true,  false, true,  2990, NULL,
 'Closed to Retained Earnings at year-end'),

-- ════════════════════════════════
-- REVENUE (4xxx)
-- ════════════════════════════════

-- Sub-groups
('4000', 'Revenue',                     'revenue', 'credit', true,  false, false, 3000, NULL,
 'All revenue accounts'),

-- Revenue accounts
('4010', 'Sales Revenue – Commodity',   'revenue', 'credit', true,  false, true,  3001, NULL,
 'Revenue from sale of pulp, wood, and commodity products'),
('4020', 'Sales Revenue – Other',       'revenue', 'credit', false, false, true,  3002, NULL,
 'Other product or service revenue'),
('4800', 'FX Gain',                     'revenue', 'credit', false, false, true,  3800, NULL,
 'Foreign exchange gains on settlement'),
('4900', 'Other Income',                'revenue', 'credit', false, false, true,  3900, NULL,
 'Interest income, miscellaneous income'),

-- ════════════════════════════════
-- COST OF GOODS SOLD (5xxx)
-- ════════════════════════════════

-- Sub-groups
('5000', 'Cost of Goods Sold',          'expense', 'debit', true,  false, false, 4000, NULL,
 'Direct costs related to goods sold'),

-- COGS accounts
('5010', 'Purchase Cost – Commodity',   'expense', 'debit', false, false, true,  4001, NULL,
 'Cost of purchased pulp, wood, raw materials'),
('5100', 'Ocean Freight',               'expense', 'debit', false, false, true,  4100, NULL,
 'Sea freight charges on purchased goods'),
('5110', 'Land Transport',              'expense', 'debit', false, false, true,  4110, NULL,
 'Truck and overland transport costs'),
('5120', 'Railway Transport',           'expense', 'debit', false, false, true,  4120, NULL,
 'Rail freight charges'),
('5200', 'Import Duties & Tariffs',     'expense', 'debit', false, false, true,  4200, NULL,
 'Customs duties and import tariffs'),
('5300', 'Cargo Insurance',             'expense', 'debit', false, false, true,  4300, NULL,
 'Insurance on goods in transit'),
('5800', 'FX Loss – COGS',             'expense', 'debit', false, false, true,  4800, NULL,
 'FX losses directly related to cost of goods'),

-- ════════════════════════════════
-- OPERATING EXPENSES (6xxx)
-- ════════════════════════════════

-- Sub-groups
('6000', 'Operating Expenses',          'expense', 'debit', false, false, false, 5000, NULL,
 'Overhead and operational costs'),

-- Opex accounts
('6010', 'Customs & Port Fees',         'expense', 'debit', false, false, true,  5001, NULL,
 'Port handling, terminal fees, customs agent fees'),
('6020', 'Warehouse & Storage',         'expense', 'debit', false, false, true,  5002, NULL,
 'Warehouse rent, demurrage, storage fees'),
('6030', 'General Insurance',           'expense', 'debit', false, false, true,  5003, NULL,
 'Business, liability, and general insurance premiums'),
('6040', 'Bank Charges',                'expense', 'debit', false, false, true,  5004, NULL,
 'Wire transfer fees, LC fees, bank service charges'),
('6050', 'FX Loss – Operating',         'expense', 'debit', false, false, true,  5005, NULL,
 'Foreign exchange losses on operating transactions'),
('6060', 'Professional & Legal Fees',   'expense', 'debit', false, false, true,  5006, NULL,
 'Legal, audit, consulting, and advisory fees'),
('6070', 'Communication & Software',    'expense', 'debit', false, false, true,  5007, NULL,
 'Phone, internet, SaaS subscriptions'),
('6080', 'Travel & Representation',     'expense', 'debit', false, false, true,  5008, NULL,
 'Business travel, accommodation, client entertainment'),
('6100', 'Staff Costs',                 'expense', 'debit', false, false, true,  5100, NULL,
 'Salaries, bonuses, employer social security'),
('6900', 'Miscellaneous Expenses',      'expense', 'debit', false, false, true,  5900, NULL,
 'Other operating costs not classified above');

-- ─── STEP 2: Set parent_id via code-based UPDATE ─────────────────────────────

-- Cash accounts → parent: 1000
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '1000')
WHERE code IN ('1010','1011','1012');

-- Receivable accounts → parent: 1100
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '1100')
WHERE code IN ('1110','1111','1120','1130');

-- Inventory accounts → parent: 1200
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '1200')
WHERE code IN ('1210','1220','1230');

-- Prepaid accounts → parent: 1300
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '1300')
WHERE code IN ('1310','1320');

-- Fixed asset accounts → parent: 1800
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '1800')
WHERE code IN ('1810','1890');

-- Trade payable accounts → parent: 2000
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '2000')
WHERE code IN ('2010','2011','2020','2030');

-- Accrued accounts → parent: 2100
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '2100')
WHERE code IN ('2110','2120');

-- Tax accounts → parent: 2200
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '2200')
WHERE code IN ('2210','2220','2230');

-- Non-current liabilities → parent: 2800
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '2800')
WHERE code IN ('2810');

-- Equity accounts → parent: 3000
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '3000')
WHERE code IN ('3010','3020','3900','3990');

-- Revenue accounts → parent: 4000
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '4000')
WHERE code IN ('4010','4020','4800','4900');

-- COGS accounts → parent: 5000
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '5000')
WHERE code IN ('5010','5100','5110','5120','5200','5300','5800');

-- Opex accounts → parent: 6000
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '6000')
WHERE code IN ('6010','6020','6030','6040','6050','6060','6070','6080','6100','6900');

-- ─── STEP 3: Verify balance of COA structure ─────────────────────────────────
-- (informational — run manually to confirm)
-- SELECT account_type, COUNT(*), COUNT(*) FILTER (WHERE allow_direct_posting) AS posting_accounts
-- FROM accounts GROUP BY account_type ORDER BY account_type;

-- ══════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTION: account_balance(account_id, from_date, to_date)
-- Returns net balance for a single account over a date range.
-- Respects normal_balance: positive = balance in normal direction.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION account_balance(
  p_account_id uuid,
  p_from        date DEFAULT NULL,
  p_to          date DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT CASE a.normal_balance
           WHEN 'debit'  THEN COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)
           WHEN 'credit' THEN COALESCE(SUM(jl.credit),0) - COALESCE(SUM(jl.debit),  0)
         END
  FROM   accounts a
  LEFT JOIN journal_lines jl
         ON jl.account_id = a.id
  LEFT JOIN journal_entries je
         ON je.id = jl.journal_entry_id
        AND je.status = 'posted'
        AND (p_from IS NULL OR je.entry_date >= p_from)
        AND (p_to   IS NULL OR je.entry_date <= p_to)
  WHERE  a.id = p_account_id
  GROUP  BY a.normal_balance;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- VIEW: v_coa  (Chart of Accounts with hierarchy labels)
-- Useful for UI dropdowns and reports.
-- Shows level (1=group, 2=posting), full path, and parent name.
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_coa AS
SELECT
  a.id,
  a.code,
  a.name,
  a.account_type,
  a.normal_balance,
  a.account_currency,
  a.is_control_account,
  a.allow_direct_posting,
  a.is_active,
  a.sort_order,
  a.parent_id,
  p.code  AS parent_code,
  p.name  AS parent_name,
  CASE WHEN a.parent_id IS NULL THEN 1 ELSE 2 END AS level,
  -- Indented label for dropdowns: "  1010 Cash – USD" or "1000 Current Assets"
  CASE
    WHEN a.parent_id IS NULL THEN a.code || '  ' || a.name
    ELSE '    ' || a.code || '  ' || a.name
  END AS display_label
FROM   accounts a
LEFT JOIN accounts p ON p.id = a.parent_id
WHERE  a.is_active = true
ORDER  BY a.sort_order, a.code;
