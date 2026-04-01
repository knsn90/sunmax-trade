-- Fix: account_balance function — accept text for dates so casts aren't needed at call site
CREATE OR REPLACE FUNCTION account_balance(
  p_account_id uuid,
  p_from        text DEFAULT NULL,
  p_to          text DEFAULT NULL
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
        AND (p_from IS NULL OR je.entry_date >= p_from::date)
        AND (p_to   IS NULL OR je.entry_date <= p_to::date)
  WHERE  a.id = p_account_id
  GROUP  BY a.normal_balance;
$$;
