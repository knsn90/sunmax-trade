-- ============================================================
-- Migration 024b: Financial Reports (dependency-free version)
-- - RETURNS TABLE içinde enum tip kullanılmaz → text olarak döner
-- - base_debit/base_credit yoksa debit/credit'e fallback yapar
-- - Tüm migration bağımlılıkları kaldırıldı
-- ============================================================

-- ─── Yardımcı: base_debit kolonu var mı? ─────────────────────────────────────
-- Yoksa debit/credit kullanılır (migration 022 çalıştırılmamışsa)

-- ─── 1. TRIAL BALANCE ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS fn_trial_balance(text, text);

CREATE OR REPLACE FUNCTION fn_trial_balance(
  p_from text DEFAULT NULL,
  p_to   text DEFAULT NULL
)
RETURNS TABLE (
  code             text,
  name             text,
  account_type     text,
  normal_balance   text,
  total_debit      numeric,
  total_credit     numeric,
  balance          numeric,
  is_zero          boolean
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  -- base_debit kolonu varsa kullan, yoksa debit/credit ile çalış
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_lines' AND column_name = 'base_debit'
  ) THEN
    RETURN QUERY
    SELECT
      a.code::text,
      a.name::text,
      a.account_type::text,
      a.normal_balance::text,
      COALESCE(SUM(jl.base_debit),  0)::numeric AS total_debit,
      COALESCE(SUM(jl.base_credit), 0)::numeric AS total_credit,
      CASE a.normal_balance::text
        WHEN 'debit'  THEN COALESCE(SUM(jl.base_debit),0)  - COALESCE(SUM(jl.base_credit),0)
        WHEN 'credit' THEN COALESCE(SUM(jl.base_credit),0) - COALESCE(SUM(jl.base_debit),0)
      END::numeric AS balance,
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
  ELSE
    RETURN QUERY
    SELECT
      a.code::text,
      a.name::text,
      a.account_type::text,
      a.normal_balance::text,
      COALESCE(SUM(jl.debit),  0)::numeric,
      COALESCE(SUM(jl.credit), 0)::numeric,
      CASE a.normal_balance::text
        WHEN 'debit'  THEN COALESCE(SUM(jl.debit),0)  - COALESCE(SUM(jl.credit),0)
        WHEN 'credit' THEN COALESCE(SUM(jl.credit),0) - COALESCE(SUM(jl.debit),0)
      END::numeric,
      (COALESCE(SUM(jl.debit),0) = 0 AND COALESCE(SUM(jl.credit),0) = 0)
    FROM accounts a
    LEFT JOIN journal_lines   jl ON jl.account_id = a.id
    LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.status = 'posted'
      AND (p_from IS NULL OR je.entry_date >= p_from::date)
      AND (p_to   IS NULL OR je.entry_date <= p_to::date)
    WHERE a.is_active = true
    GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
    ORDER BY a.code;
  END IF;
END;
$$;


-- ─── 2. PROFIT & LOSS ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS fn_profit_loss(text, text);

CREATE OR REPLACE FUNCTION fn_profit_loss(
  p_from text DEFAULT NULL,
  p_to   text DEFAULT NULL
)
RETURNS TABLE (
  section    text,
  code       text,
  name       text,
  amount     numeric,
  sort_order integer
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_use_base boolean;
  v_debit_col  text;
  v_credit_col text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_lines' AND column_name = 'base_debit'
  ) INTO v_use_base;

  v_debit_col  := CASE WHEN v_use_base THEN 'base_debit'  ELSE 'debit'  END;
  v_credit_col := CASE WHEN v_use_base THEN 'base_credit' ELSE 'credit' END;

  RETURN QUERY EXECUTE format($q$
    SELECT 'Revenue'::text, a.code::text, a.name::text,
      (COALESCE(SUM(jl.%I),0) - COALESCE(SUM(jl.%I),0))::numeric,
      a.sort_order::integer
    FROM accounts a
    LEFT JOIN journal_lines   jl ON jl.account_id = a.id
    LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.status = 'posted'
      AND ($1 IS NULL OR je.entry_date >= $1::date)
      AND ($2 IS NULL OR je.entry_date <= $2::date)
    WHERE a.is_active AND a.account_type = 'revenue'
    GROUP BY a.id, a.code, a.name, a.sort_order

    UNION ALL

    SELECT 'COGS'::text, a.code::text, a.name::text,
      (COALESCE(SUM(jl.%I),0) - COALESCE(SUM(jl.%I),0))::numeric,
      a.sort_order::integer
    FROM accounts a
    LEFT JOIN journal_lines   jl ON jl.account_id = a.id
    LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.status = 'posted'
      AND ($1 IS NULL OR je.entry_date >= $1::date)
      AND ($2 IS NULL OR je.entry_date <= $2::date)
    WHERE a.is_active AND a.account_type = 'expense' AND a.code LIKE '5%%'
    GROUP BY a.id, a.code, a.name, a.sort_order

    UNION ALL

    SELECT 'Expense'::text, a.code::text, a.name::text,
      (COALESCE(SUM(jl.%I),0) - COALESCE(SUM(jl.%I),0))::numeric,
      a.sort_order::integer
    FROM accounts a
    LEFT JOIN journal_lines   jl ON jl.account_id = a.id
    LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.status = 'posted'
      AND ($1 IS NULL OR je.entry_date >= $1::date)
      AND ($2 IS NULL OR je.entry_date <= $2::date)
    WHERE a.is_active AND a.account_type = 'expense' AND a.code LIKE '6%%'
    GROUP BY a.id, a.code, a.name, a.sort_order

    ORDER BY 1, 5, 2
  $q$,
    -- Revenue: credit - debit
    v_credit_col, v_debit_col,
    -- COGS: debit - credit
    v_debit_col, v_credit_col,
    -- Expense: debit - credit
    v_debit_col, v_credit_col
  ) USING p_from, p_to;

  -- NET satırını ayrıca ekle
  RETURN QUERY EXECUTE format($q$
    SELECT 'NET'::text, '----'::text, 'Net Profit / Loss'::text,
    (
      SELECT COALESCE(SUM(jl2.%I),0) - COALESCE(SUM(jl2.%I),0)
      FROM journal_lines jl2
      JOIN journal_entries je2 ON je2.id = jl2.journal_entry_id
        AND je2.status = 'posted'
        AND ($1 IS NULL OR je2.entry_date >= $1::date)
        AND ($2 IS NULL OR je2.entry_date <= $2::date)
      JOIN accounts a2 ON a2.id = jl2.account_id AND a2.account_type = 'revenue'
    ) - (
      SELECT COALESCE(SUM(jl2.%I),0) - COALESCE(SUM(jl2.%I),0)
      FROM journal_lines jl2
      JOIN journal_entries je2 ON je2.id = jl2.journal_entry_id
        AND je2.status = 'posted'
        AND ($1 IS NULL OR je2.entry_date >= $1::date)
        AND ($2 IS NULL OR je2.entry_date <= $2::date)
      JOIN accounts a2 ON a2.id = jl2.account_id AND a2.account_type = 'expense'
    ),
    99999::integer
  $q$,
    v_credit_col, v_debit_col,   -- revenue: credit - debit
    v_debit_col,  v_credit_col   -- expense: debit - credit
  ) USING p_from, p_to;
END;
$$;


-- ─── 3. BALANCE SHEET ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS fn_balance_sheet(text);

CREATE OR REPLACE FUNCTION fn_balance_sheet(
  p_as_of text DEFAULT NULL
)
RETURNS TABLE (
  section     text,
  code        text,
  name        text,
  balance     numeric,
  sort_order  integer
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_use_base   boolean;
  v_debit_col  text;
  v_credit_col text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_lines' AND column_name = 'base_debit'
  ) INTO v_use_base;

  v_debit_col  := CASE WHEN v_use_base THEN 'base_debit'  ELSE 'debit'  END;
  v_credit_col := CASE WHEN v_use_base THEN 'base_credit' ELSE 'credit' END;

  RETURN QUERY EXECUTE format($q$
    SELECT 'Asset'::text, a.code::text, a.name::text,
      (COALESCE(SUM(jl.%I),0) - COALESCE(SUM(jl.%I),0))::numeric,
      a.sort_order::integer
    FROM accounts a
    LEFT JOIN journal_lines   jl ON jl.account_id = a.id
    LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.status = 'posted'
      AND ($1 IS NULL OR je.entry_date <= $1::date)
    WHERE a.is_active AND a.account_type = 'asset'
    GROUP BY a.id, a.code, a.name, a.sort_order

    UNION ALL

    SELECT 'Liability'::text, a.code::text, a.name::text,
      (COALESCE(SUM(jl.%I),0) - COALESCE(SUM(jl.%I),0))::numeric,
      a.sort_order::integer
    FROM accounts a
    LEFT JOIN journal_lines   jl ON jl.account_id = a.id
    LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.status = 'posted'
      AND ($1 IS NULL OR je.entry_date <= $1::date)
    WHERE a.is_active AND a.account_type = 'liability'
    GROUP BY a.id, a.code, a.name, a.sort_order

    UNION ALL

    SELECT 'Equity'::text, a.code::text, a.name::text,
      (COALESCE(SUM(jl.%I),0) - COALESCE(SUM(jl.%I),0))::numeric,
      a.sort_order::integer
    FROM accounts a
    LEFT JOIN journal_lines   jl ON jl.account_id = a.id
    LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.status = 'posted'
      AND ($1 IS NULL OR je.entry_date <= $1::date)
    WHERE a.is_active AND a.account_type = 'equity'
    GROUP BY a.id, a.code, a.name, a.sort_order

    ORDER BY 1 DESC, 5, 2
  $q$,
    v_debit_col,  v_credit_col,   -- asset
    v_credit_col, v_debit_col,    -- liability
    v_credit_col, v_debit_col     -- equity
  ) USING p_as_of;

  -- Net Kar satırı
  RETURN QUERY EXECUTE format($q$
    SELECT 'Equity'::text, '3999'::text, 'Current Year Net Income'::text,
    (
      SELECT COALESCE(SUM(jl2.%I),0) - COALESCE(SUM(jl2.%I),0)
      FROM journal_lines jl2
      JOIN journal_entries je2 ON je2.id = jl2.journal_entry_id
        AND je2.status = 'posted'
        AND ($1 IS NULL OR je2.entry_date <= $1::date)
      JOIN accounts a2 ON a2.id = jl2.account_id AND a2.account_type = 'revenue'
    ) - (
      SELECT COALESCE(SUM(jl2.%I),0) - COALESCE(SUM(jl2.%I),0)
      FROM journal_lines jl2
      JOIN journal_entries je2 ON je2.id = jl2.journal_entry_id
        AND je2.status = 'posted'
        AND ($1 IS NULL OR je2.entry_date <= $1::date)
      JOIN accounts a2 ON a2.id = jl2.account_id AND a2.account_type = 'expense'
    ),
    29950::integer
  $q$,
    v_credit_col, v_debit_col,
    v_debit_col,  v_credit_col
  ) USING p_as_of;
END;
$$;


-- ─── 4. DENGE KONTROLÜ VIEW ───────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_accounting_integrity AS
WITH cols AS (
  SELECT
    EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name = 'journal_lines' AND column_name = 'base_debit') AS has_base
),
posted AS (
  SELECT
    a.account_type::text AS account_type,
    CASE WHEN (SELECT has_base FROM cols)
      THEN COALESCE(SUM(jl.base_debit),  0)
      ELSE COALESCE(SUM(jl.debit),       0)
    END AS bd,
    CASE WHEN (SELECT has_base FROM cols)
      THEN COALESCE(SUM(jl.base_credit), 0)
      ELSE COALESCE(SUM(jl.credit),      0)
    END AS bc
  FROM accounts a
  LEFT JOIN journal_lines   jl ON jl.account_id = a.id
  LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
  WHERE a.is_active = true
  GROUP BY a.account_type
),
totals AS (
  SELECT
    SUM(CASE account_type WHEN 'asset'     THEN bd - bc ELSE 0 END) AS assets,
    SUM(CASE account_type WHEN 'liability' THEN bc - bd ELSE 0 END) AS liabilities,
    SUM(CASE account_type WHEN 'equity'    THEN bc - bd ELSE 0 END) AS equity,
    SUM(CASE account_type WHEN 'revenue'   THEN bc - bd ELSE 0 END) AS revenue,
    SUM(CASE account_type WHEN 'expense'   THEN bd - bc ELSE 0 END) AS expenses
  FROM posted
)
SELECT
  ROUND(assets,      2) AS total_assets,
  ROUND(liabilities, 2) AS total_liabilities,
  ROUND(equity,      2) AS total_equity,
  ROUND(revenue - expenses, 2) AS net_income,
  ROUND(liabilities + equity + (revenue - expenses), 2) AS l_plus_e_plus_ni,
  ROUND(assets - (liabilities + equity + (revenue - expenses)), 2) AS balance_diff,
  CASE
    WHEN ROUND(assets - (liabilities + equity + (revenue - expenses)), 2) = 0
    THEN '✓ Dengede'
    ELSE '✗ HATA — Dengesiz kayıt var!'
  END AS integrity_status
FROM totals;


-- ─── Doğrulama ────────────────────────────────────────────────────────────────
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('fn_trial_balance','fn_profit_loss','fn_balance_sheet')
ORDER BY routine_name;
