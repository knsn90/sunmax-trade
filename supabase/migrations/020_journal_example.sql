-- ============================================================
-- Migration 020: Journal System — Örnek Veri
-- Accounting period + invoice journal entry örneği
-- Run AFTER 018_019_combined.sql
-- ============================================================

-- ─── 1. Accounting Period (2026 Q1) ───────────────────────────────────────────
INSERT INTO accounting_periods (name, start_date, end_date, status)
VALUES ('2026-Q1', '2026-01-01', '2026-03-31', 'open')
ON CONFLICT DO NOTHING;

INSERT INTO accounting_periods (name, start_date, end_date, status)
VALUES ('2026-Q2', '2026-04-01', '2026-06-30', 'open')
ON CONFLICT DO NOTHING;

-- ─── 2. Örnek Journal Entry: Müşteriye Invoice Kesilmesi ──────────────────────
--
-- Senaryo:
--   Müşteriye 10.000 USD tutarında ticaret malı satışı yapıldı.
--   KDV %10 → 1.000 USD
--   Toplam alacak: 11.000 USD
--
-- Double-Entry kuralı:
--   Debit   1110  Trade Receivables – USD   11,000.00   (A/R artar)
--   Credit  4100  Sales Revenue             10,000.00   (Gelir oluşur)
--   Credit  2200  VAT Payable                1,000.00   (Vergi borcu oluşur)
--   ────────────────────────────────────────────────────────────
--   TOPLAM DEBIT = 11,000.00  |  TOPLAM CREDIT = 11,000.00  ✓
-- ──────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_entry_id   uuid;
  v_ar_id      uuid;   -- 1110 Trade Receivables – USD
  v_rev_id     uuid;   -- 4100 Sales Revenue
  v_vat_id     uuid;   -- 2200 VAT Payable
  v_period_id  uuid;
BEGIN

  -- Account ID'lerini al
  SELECT id INTO v_ar_id  FROM accounts WHERE code = '1110';
  SELECT id INTO v_rev_id FROM accounts WHERE code = '4100';
  SELECT id INTO v_vat_id FROM accounts WHERE code = '2200';

  -- Period ID'sini al
  SELECT id INTO v_period_id FROM accounting_periods
   WHERE name = '2026-Q1' LIMIT 1;

  IF v_ar_id IS NULL OR v_rev_id IS NULL OR v_vat_id IS NULL THEN
    RAISE NOTICE 'Accounts not found — run 018_019_combined.sql first.';
    RETURN;
  END IF;

  -- ─── Journal Entry oluştur (draft) ────────────────────────
  INSERT INTO journal_entries (
    entry_date, period_id, description,
    source_type, currency, exchange_rate, status
  )
  VALUES (
    '2026-04-01',
    v_period_id,
    'INV-2026-0001 — Müşteri satış faturası',
    'invoice',       -- source_type: bağlantı kurmak için (trade_files.id ile ilişkilendirilebilir)
    'USD',
    1.0,
    'draft'
  )
  RETURNING id INTO v_entry_id;

  -- ─── Journal Lines ────────────────────────────────────────
  INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, debit, credit)
  VALUES
    -- Debit: A/R (alacak doğar)
    (v_entry_id, 1, v_ar_id,  'A/R — INV-2026-0001',  11000.00, 0.00),
    -- Credit: Satış geliri
    (v_entry_id, 2, v_rev_id, 'Ticaret malı satışı',      0.00, 10000.00),
    -- Credit: KDV borcu
    (v_entry_id, 3, v_vat_id, 'KDV %10',                  0.00,  1000.00);

  -- ─── Kaydı POST et (bu noktada trigger balance check yapar) ──
  UPDATE journal_entries
     SET status = 'posted'
   WHERE id = v_entry_id;

  RAISE NOTICE 'Journal entry oluşturuldu ve post edildi: %', v_entry_id;

END $$;


-- ─── 3. BALANCE ENFORCEMENT — Nasıl Çalışır ──────────────────────────────────
--
-- enforce_journal_balance() trigger'ı:
--   • Sadece draft → posted geçişinde tetiklenir
--   • SUM(debit) <> SUM(credit) ise RAISE EXCEPTION fırlatır
--   • Kapalı/kilitli period'a post etmeye çalışırsa EXCEPTION fırlatır
--   • posted → draft geçişini engeller (sadece reversed kabul edilir)
--
-- prevent_modify_posted_lines() trigger'ı:
--   • Post edilmiş entry'nin satırları INSERT/UPDATE/DELETE edilemez
--   • Düzeltme için reversal entry açılır (aşağıya bak)
--
-- ÖRNEK — Dengesiz kayıt testi (bu HATA verir):
-- ─────────────────────────────────────────────
/*
DO $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO journal_entries (entry_date, description, currency)
  VALUES (now()::date, 'Test — dengesiz kayıt', 'USD')
  RETURNING id INTO v_id;

  INSERT INTO journal_lines (journal_entry_id, line_no, account_id, debit, credit)
  SELECT v_id, 1, id, 5000.00, 0.00 FROM accounts WHERE code = '1110';

  -- Kasıtlı olarak credit eksik bırakıldı (3000 ≠ 5000)
  INSERT INTO journal_lines (journal_entry_id, line_no, account_id, debit, credit)
  SELECT v_id, 2, id, 0.00, 3000.00 FROM accounts WHERE code = '4100';

  -- Aşağıdaki satır HATA verir:
  -- "Journal entry JE-000002 not balanced: debits − credits = 2000.0000 USD."
  UPDATE journal_entries SET status = 'posted' WHERE id = v_id;
END $$;
*/


-- ─── 4. REVERSAL (Düzeltme) Journal Örneği ──────────────────────────────────
--
-- Senaryo: Yukarıdaki invoice iptal edildi / iade.
-- Orijinal entry tersine çevrilir — her satır mirror edilir.
--
-- Debit  4100  Sales Revenue             10,000.00
-- Debit  2200  VAT Payable                1,000.00
-- Credit 1110  Trade Receivables – USD   11,000.00
-- ─────────────────────────────────────────────────
-- TOPLAM DEBIT = 11,000  |  TOPLAM CREDIT = 11,000  ✓
-- ──────────────────────────────────────────────────────────────────────────────
/*
DO $$
DECLARE
  v_orig_id    uuid;
  v_rev_id_je  uuid;
  v_ar_id      uuid;
  v_rev_acc_id uuid;
  v_vat_id     uuid;
  v_period_id  uuid;
BEGIN
  SELECT id INTO v_orig_id    FROM journal_entries WHERE description LIKE 'INV-2026-0001%' LIMIT 1;
  SELECT id INTO v_ar_id      FROM accounts WHERE code = '1110';
  SELECT id INTO v_rev_acc_id FROM accounts WHERE code = '4100';
  SELECT id INTO v_vat_id     FROM accounts WHERE code = '2200';
  SELECT id INTO v_period_id  FROM accounting_periods WHERE name = '2026-Q2' LIMIT 1;

  INSERT INTO journal_entries (
    entry_date, period_id, description,
    source_type, currency, reversal_of, status
  )
  VALUES (
    now()::date, v_period_id,
    'INV-2026-0001 İPTAL — Reversal',
    'invoice', 'USD', v_orig_id, 'draft'
  )
  RETURNING id INTO v_rev_id_je;

  INSERT INTO journal_lines (journal_entry_id, line_no, account_id, debit, credit)
  VALUES
    (v_rev_id_je, 1, v_rev_acc_id, 10000.00, 0.00),
    (v_rev_id_je, 2, v_vat_id,      1000.00, 0.00),
    (v_rev_id_je, 3, v_ar_id,          0.00, 11000.00);

  UPDATE journal_entries SET status = 'posted'    WHERE id = v_rev_id_je;
  UPDATE journal_entries SET reversed_by = v_rev_id_je, status = 'reversed'
   WHERE id = v_orig_id;

  RAISE NOTICE 'Reversal entry oluşturuldu: %', v_rev_id_je;
END $$;
*/


-- ─── 5. Doğrulama Sorguları ───────────────────────────────────────────────────

-- Journal entries listesi
SELECT
  je.entry_no,
  je.entry_date,
  je.description,
  je.status,
  SUM(jl.debit)  AS total_debit,
  SUM(jl.credit) AS total_credit,
  SUM(jl.debit) - SUM(jl.credit) AS diff
FROM journal_entries je
JOIN journal_lines   jl ON jl.journal_entry_id = je.id
GROUP BY je.id, je.entry_no, je.entry_date, je.description, je.status
ORDER BY je.entry_date, je.entry_no;
