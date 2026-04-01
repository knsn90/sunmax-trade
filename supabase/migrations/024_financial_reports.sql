-- ============================================================
-- Migration 024: Financial Reports
-- Sadece journal_lines üzerinden üretilir.
-- transactions tablosu kullanılmaz.
--
-- BASE CURRENCY: TRY (base_debit / base_credit kolonları)
-- KURAL: Sadece status = 'posted' kayıtlar dahil edilir.
--        reversed dahil değil, draft dahil değil.
-- ============================================================
--
-- TEMEL MUHASEBESEÇİM KURALI:
--   Hesabın normal_balance'ı = debit  → bakiye = base_debit - base_credit
--   Hesabın normal_balance'ı = credit → bakiye = base_credit - base_debit
--   Negatif bakiye = anormal bakiye (uyarı)
--
-- MUHASEBESEL DENGE KURALI (her zaman geçerli olmalı):
--   ASSETS = LIABILITIES + EQUITY + NET_INCOME
--   Eğer bu eşitlik bozulursa → journal_entry dengesi bozuktur
-- ============================================================


-- ─── 1. TRIAL BALANCE ─────────────────────────────────────────────────────────
--   Tüm hesapların bakiyesi (p_from / p_to arasında)
--   Hem TRY (base) hem orijinal tutar gösterilir.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_trial_balance(
  p_from text DEFAULT NULL,   -- 'YYYY-MM-DD' ya da NULL (başlangıç)
  p_to   text DEFAULT NULL    -- 'YYYY-MM-DD' ya da NULL (bugün)
)
RETURNS TABLE (
  code            text,
  name            text,
  account_type    account_type,
  normal_balance  normal_balance,
  total_debit     numeric,
  total_credit    numeric,
  total_debit_try numeric,
  total_credit_try numeric,
  balance_try     numeric,    -- pozitif = normal, negatif = anormal
  is_zero         boolean     -- hiç hareket yok mu
)
LANGUAGE sql STABLE AS $$
  SELECT
    a.code,
    a.name,
    a.account_type,
    a.normal_balance,
    COALESCE(SUM(jl.debit),        0) AS total_debit,
    COALESCE(SUM(jl.credit),       0) AS total_credit,
    COALESCE(SUM(jl.base_debit),   0) AS total_debit_try,
    COALESCE(SUM(jl.base_credit),  0) AS total_credit_try,
    CASE a.normal_balance
      WHEN 'debit'  THEN COALESCE(SUM(jl.base_debit),0)  - COALESCE(SUM(jl.base_credit),0)
      WHEN 'credit' THEN COALESCE(SUM(jl.base_credit),0) - COALESCE(SUM(jl.base_debit),0)
    END                               AS balance_try,
    (COALESCE(SUM(jl.base_debit),0) = 0 AND COALESCE(SUM(jl.base_credit),0) = 0) AS is_zero
  FROM accounts a
  LEFT JOIN journal_lines   jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
    AND je.status = 'posted'
    AND (p_from IS NULL OR je.entry_date >= p_from::date)
    AND (p_to   IS NULL OR je.entry_date <= p_to::date)
  WHERE a.is_active = true
  GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
  ORDER BY a.code;
$$;


-- ─── 2. PROFIT & LOSS ─────────────────────────────────────────────────────────
--   GELİR - GİDER = NET KAR/ZARAR
--   Dönemsel: p_from ile p_to arasındaki hareketler
--   Gelir hesapları: account_type = 'revenue'
--   Gider hesapları: account_type = 'expense'
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_profit_loss(
  p_from text DEFAULT NULL,
  p_to   text DEFAULT NULL
)
RETURNS TABLE (
  section       text,          -- 'Revenue' | 'COGS' | 'Expense' | 'NET'
  code          text,
  name          text,
  amount_try    numeric,       -- pozitif = gelir/gider miktarı
  sort_order    integer
)
LANGUAGE sql STABLE AS $$

  -- GELİRLER (credit normal balance — bakiye = credit - debit)
  SELECT
    'Revenue'           AS section,
    a.code,
    a.name,
    COALESCE(SUM(jl.base_credit),0) - COALESCE(SUM(jl.base_debit),0) AS amount_try,
    a.sort_order
  FROM accounts a
  LEFT JOIN journal_lines   jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
    AND je.status = 'posted'
    AND (p_from IS NULL OR je.entry_date >= p_from::date)
    AND (p_to   IS NULL OR je.entry_date <= p_to::date)
  WHERE a.is_active = true AND a.account_type = 'revenue'
  GROUP BY a.id, a.code, a.name, a.sort_order

  UNION ALL

  -- SATILAN MAL MALİYETİ (5xxx — debit normal balance)
  SELECT
    'COGS'              AS section,
    a.code,
    a.name,
    COALESCE(SUM(jl.base_debit),0) - COALESCE(SUM(jl.base_credit),0) AS amount_try,
    a.sort_order
  FROM accounts a
  LEFT JOIN journal_lines   jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
    AND je.status = 'posted'
    AND (p_from IS NULL OR je.entry_date >= p_from::date)
    AND (p_to   IS NULL OR je.entry_date <= p_to::date)
  WHERE a.is_active = true
    AND a.account_type = 'expense'
    AND a.code LIKE '5%'        -- 5000–5999: COGS grubu
  GROUP BY a.id, a.code, a.name, a.sort_order

  UNION ALL

  -- FAALIYET GİDERLERİ (6xxx — debit normal balance)
  SELECT
    'Expense'           AS section,
    a.code,
    a.name,
    COALESCE(SUM(jl.base_debit),0) - COALESCE(SUM(jl.base_credit),0) AS amount_try,
    a.sort_order
  FROM accounts a
  LEFT JOIN journal_lines   jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
    AND je.status = 'posted'
    AND (p_from IS NULL OR je.entry_date >= p_from::date)
    AND (p_to   IS NULL OR je.entry_date <= p_to::date)
  WHERE a.is_active = true
    AND a.account_type = 'expense'
    AND a.code LIKE '6%'        -- 6000–6999: Faaliyet giderleri
  GROUP BY a.id, a.code, a.name, a.sort_order

  UNION ALL

  -- NET KAR / ZARAR — özet satır
  SELECT
    'NET'               AS section,
    '----'              AS code,
    'Net Profit / Loss' AS name,
    -- Toplam gelir - toplam gider
    (
      SELECT COALESCE(SUM(base_credit),0) - COALESCE(SUM(base_debit),0)
      FROM journal_lines jl2
      JOIN journal_entries je2 ON je2.id = jl2.journal_entry_id
        AND je2.status = 'posted'
        AND (p_from IS NULL OR je2.entry_date >= p_from::date)
        AND (p_to   IS NULL OR je2.entry_date <= p_to::date)
      JOIN accounts a2 ON a2.id = jl2.account_id AND a2.account_type = 'revenue'
    )
    -
    (
      SELECT COALESCE(SUM(base_debit),0) - COALESCE(SUM(base_credit),0)
      FROM journal_lines jl2
      JOIN journal_entries je2 ON je2.id = jl2.journal_entry_id
        AND je2.status = 'posted'
        AND (p_from IS NULL OR je2.entry_date >= p_from::date)
        AND (p_to   IS NULL OR je2.entry_date <= p_to::date)
      JOIN accounts a2 ON a2.id = jl2.account_id AND a2.account_type = 'expense'
    )  AS amount_try,
    99999               AS sort_order

  ORDER BY section, sort_order, code;
$$;


-- ─── 3. BALANCE SHEET ─────────────────────────────────────────────────────────
--   p_as_of tarihine kadar birikimli bakiyeler
--   VARLIKLAR = BORÇLAR + ÖZKAYNAKLAR
--
--   Dönem kapanmamışsa: Net Kar journal_lines'dan hesaplanır,
--   özkaynaklar bölümüne eklenir.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_balance_sheet(
  p_as_of text DEFAULT NULL    -- 'YYYY-MM-DD' ya da NULL (bugün)
)
RETURNS TABLE (
  section       text,           -- 'Asset' | 'Liability' | 'Equity' | 'CHECK'
  code          text,
  name          text,
  balance_try   numeric,
  sort_order    integer
)
LANGUAGE sql STABLE AS $$

  -- VARLIKLAR (1xxx — debit normal balance)
  SELECT
    'Asset'  AS section,
    a.code, a.name,
    COALESCE(SUM(jl.base_debit),0) - COALESCE(SUM(jl.base_credit),0) AS balance_try,
    a.sort_order
  FROM accounts a
  LEFT JOIN journal_lines   jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
    AND je.status = 'posted'
    AND (p_as_of IS NULL OR je.entry_date <= p_as_of::date)
  WHERE a.is_active = true AND a.account_type = 'asset'
  GROUP BY a.id, a.code, a.name, a.sort_order

  UNION ALL

  -- BORÇLAR (2xxx — credit normal balance)
  SELECT
    'Liability' AS section,
    a.code, a.name,
    COALESCE(SUM(jl.base_credit),0) - COALESCE(SUM(jl.base_debit),0) AS balance_try,
    a.sort_order
  FROM accounts a
  LEFT JOIN journal_lines   jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
    AND je.status = 'posted'
    AND (p_as_of IS NULL OR je.entry_date <= p_as_of::date)
  WHERE a.is_active = true AND a.account_type = 'liability'
  GROUP BY a.id, a.code, a.name, a.sort_order

  UNION ALL

  -- ÖZKAYNAKLAR (3xxx — credit normal balance)
  SELECT
    'Equity'   AS section,
    a.code, a.name,
    COALESCE(SUM(jl.base_credit),0) - COALESCE(SUM(jl.base_debit),0) AS balance_try,
    a.sort_order
  FROM accounts a
  LEFT JOIN journal_lines   jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
    AND je.status = 'posted'
    AND (p_as_of IS NULL OR je.entry_date <= p_as_of::date)
  WHERE a.is_active = true AND a.account_type = 'equity'
  GROUP BY a.id, a.code, a.name, a.sort_order

  UNION ALL

  -- NET KAR / ZARAR — dönem kapanmamışsa gelir-gider farkı özkaynağa eklenir
  SELECT
    'Equity'            AS section,
    '3999'              AS code,
    'Current Year Net Income (from P&L)' AS name,
    (
      -- Toplam gelir (credit)
      SELECT COALESCE(SUM(base_credit),0) - COALESCE(SUM(base_debit),0)
      FROM journal_lines jl2
      JOIN journal_entries je2 ON je2.id = jl2.journal_entry_id
        AND je2.status = 'posted'
        AND (p_as_of IS NULL OR je2.entry_date <= p_as_of::date)
      JOIN accounts a2 ON a2.id = jl2.account_id
        AND a2.account_type = 'revenue'
    )
    -
    (
      -- Toplam gider (debit)
      SELECT COALESCE(SUM(base_debit),0) - COALESCE(SUM(base_credit),0)
      FROM journal_lines jl2
      JOIN journal_entries je2 ON je2.id = jl2.journal_entry_id
        AND je2.status = 'posted'
        AND (p_as_of IS NULL OR je2.entry_date <= p_as_of::date)
      JOIN accounts a2 ON a2.id = jl2.account_id
        AND a2.account_type = 'expense'
    )   AS balance_try,
    29950 AS sort_order   -- 3990'dan önce

  ORDER BY section DESC, sort_order, code;  -- Asset, Liability, Equity sırası
$$;


-- ─── 4. MUHASEBESEÇİM DENGE KONTROLÜ ─────────────────────────────────────────
--   VARLIKLAR = BORÇLAR + ÖZKAYNAKLAR + NET KAR
--   Fark = 0 ise sistem sağlıklı.
--   Fark ≠ 0 ise dengesi bozuk journal entry var demektir.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_accounting_integrity AS
WITH posted AS (
  SELECT
    a.account_type,
    a.normal_balance,
    COALESCE(SUM(jl.base_debit),  0) AS bd,
    COALESCE(SUM(jl.base_credit), 0) AS bc
  FROM accounts a
  LEFT JOIN journal_lines   jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
    AND je.status = 'posted'
  WHERE a.is_active = true
  GROUP BY a.account_type, a.normal_balance
),
totals AS (
  SELECT
    SUM(CASE account_type WHEN 'asset'     THEN bd - bc ELSE 0 END) AS total_assets,
    SUM(CASE account_type WHEN 'liability' THEN bc - bd ELSE 0 END) AS total_liabilities,
    SUM(CASE account_type WHEN 'equity'    THEN bc - bd ELSE 0 END) AS total_equity,
    SUM(CASE account_type WHEN 'revenue'   THEN bc - bd ELSE 0 END) AS total_revenue,
    SUM(CASE account_type WHEN 'expense'   THEN bd - bc ELSE 0 END) AS total_expenses
  FROM posted
)
SELECT
  ROUND(total_assets,      2) AS total_assets_try,
  ROUND(total_liabilities, 2) AS total_liabilities_try,
  ROUND(total_equity,      2) AS total_equity_try,
  ROUND(total_revenue,     2) AS total_revenue_try,
  ROUND(total_expenses,    2) AS total_expenses_try,
  ROUND(total_revenue - total_expenses, 2) AS net_income_try,
  ROUND(total_liabilities + total_equity + (total_revenue - total_expenses), 2) AS l_plus_e_try,
  -- Denge farkı (0 olmalı)
  ROUND(
    total_assets - (total_liabilities + total_equity + (total_revenue - total_expenses))
  , 2) AS balance_diff,
  -- Sonuç
  CASE
    WHEN ROUND(
      total_assets - (total_liabilities + total_equity + (total_revenue - total_expenses))
    , 2) = 0
    THEN '✓ Dengede'
    ELSE '✗ HATA — Dengesiz kayıt var!'
  END AS integrity_status
FROM totals;


-- ─── 5. UPDATED v_trial_balance ───────────────────────────────────────────────
--   (Tüm zamanlar — parametresiz hızlı bakış)
CREATE OR REPLACE VIEW v_trial_balance AS
SELECT
  a.code,
  a.name,
  a.account_type,
  a.normal_balance,
  COALESCE(SUM(jl.debit),        0) AS total_debit,
  COALESCE(SUM(jl.credit),       0) AS total_credit,
  COALESCE(SUM(jl.base_debit),   0) AS total_debit_try,
  COALESCE(SUM(jl.base_credit),  0) AS total_credit_try,
  CASE a.normal_balance
    WHEN 'debit'  THEN COALESCE(SUM(jl.base_debit),0)  - COALESCE(SUM(jl.base_credit),0)
    WHEN 'credit' THEN COALESCE(SUM(jl.base_credit),0) - COALESCE(SUM(jl.base_debit),0)
  END AS balance_try,
  CASE
    WHEN CASE a.normal_balance
      WHEN 'debit'  THEN COALESCE(SUM(jl.base_debit),0)  - COALESCE(SUM(jl.base_credit),0)
      WHEN 'credit' THEN COALESCE(SUM(jl.base_credit),0) - COALESCE(SUM(jl.base_debit),0)
    END < 0
    THEN true ELSE false
  END AS is_abnormal        -- Negatif bakiye uyarısı
FROM accounts a
LEFT JOIN journal_lines   jl ON jl.account_id = a.id
LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
  AND je.status = 'posted'
WHERE a.is_active = true
GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
ORDER BY a.code;


-- ─── Doğrulama ────────────────────────────────────────────────────────────────
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('fn_trial_balance', 'fn_profit_loss', 'fn_balance_sheet')
ORDER BY routine_name;
