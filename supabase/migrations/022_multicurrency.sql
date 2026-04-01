-- ============================================================
-- Migration 022: Multi-Currency Support
-- Base currency = TRY
-- Her journal satırı: orijinal tutar + kur + TRY karşılığı
-- ============================================================
--
-- TASARIM:
--   debit / credit          → orijinal para birimi cinsinden tutar (değişmez)
--   line_currency           → satırın para birimi (USD, EUR, TRY)
--   exchange_rate_try       → 1 birim line_currency = X TRY (işlem anında dondurulur)
--   base_debit / base_credit→ TRY karşılığı = debit/credit × exchange_rate_try
--
-- Denge kontrolü base_debit ve base_credit üzerinden çalışır (TRY):
--   SUM(base_debit) = SUM(base_credit)  →  TRY bazında denge zorunlu
--
-- orig_currency / orig_amount kolonları artık line_currency ile karşılanır.
-- Geriye dönük uyumluluk için saklanır ama kullanılmaz.
-- ============================================================


-- ─── 1. journal_lines: yeni kolonlar ─────────────────────────────────────────

ALTER TABLE journal_lines
  -- Satırın orijinal para birimi (varsayılan TRY)
  ADD COLUMN IF NOT EXISTS line_currency     currency_code  NOT NULL DEFAULT 'TRY',
  -- Döviz kuru: 1 birim line_currency kaç TRY (işlem anında dondurulur)
  ADD COLUMN IF NOT EXISTS exchange_rate_try numeric(18,6)  NOT NULL DEFAULT 1.0
    CONSTRAINT chk_rate_positive CHECK (exchange_rate_try > 0),
  -- TRY karşılıkları (trigger tarafından otomatik hesaplanır)
  ADD COLUMN IF NOT EXISTS base_debit        numeric(18,4)  NOT NULL DEFAULT 0
    CONSTRAINT chk_base_debit_positive  CHECK (base_debit  >= 0),
  ADD COLUMN IF NOT EXISTS base_credit       numeric(18,4)  NOT NULL DEFAULT 0
    CONSTRAINT chk_base_credit_positive CHECK (base_credit >= 0);

COMMENT ON COLUMN journal_lines.line_currency     IS 'Para birimi — işlem anında dondurulur';
COMMENT ON COLUMN journal_lines.exchange_rate_try IS '1 birim = kaç TRY — işlem anında dondurulur';
COMMENT ON COLUMN journal_lines.base_debit        IS 'Debit × exchange_rate_try (TRY bazında)';
COMMENT ON COLUMN journal_lines.base_credit       IS 'Credit × exchange_rate_try (TRY bazında)';


-- ─── 2. Trigger: base_debit / base_credit otomatik hesapla ───────────────────
--
-- Her INSERT veya UPDATE'te çalışır.
-- line_currency = TRY ise exchange_rate_try = 1 zorunludur (otomatik düzeltilir).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION compute_base_amounts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- TRY satırları için kur her zaman 1
  IF NEW.line_currency = 'TRY' THEN
    NEW.exchange_rate_try := 1.0;
  END IF;

  -- Tutar sıfırsa base de sıfır (floating point hatası önlemi)
  NEW.base_debit  := CASE WHEN NEW.debit  = 0 THEN 0
                          ELSE ROUND(NEW.debit  * NEW.exchange_rate_try, 4) END;
  NEW.base_credit := CASE WHEN NEW.credit = 0 THEN 0
                          ELSE ROUND(NEW.credit * NEW.exchange_rate_try, 4) END;

  RETURN NEW;
END;
$$;

-- trg_a_ prefix: BEFORE trigger'lar alfabetik sırayla çalışır.
-- Bu trigger, trg_i_immutable_posted_lines'dan ÖNCE çalışmalı.
DROP TRIGGER IF EXISTS trg_a_base_amounts ON journal_lines;
CREATE TRIGGER trg_a_base_amounts
  BEFORE INSERT OR UPDATE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION compute_base_amounts();


-- ─── 3. enforce_journal_balance: TRY bazında denge kontrolü ──────────────────
--
-- Önceki versiyon: SUM(debit) = SUM(credit) (tek para birimi varsayımı)
-- Yeni versiyon:   SUM(base_debit) = SUM(base_credit)  (TRY bazında)
--
-- Tek para birimli entry'lerde de çalışır:
--   Tüm satırlar aynı kuru kullandığında debit=credit ↔ base_debit=base_credit
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_journal_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_diff   numeric;
  v_period period_status;
BEGIN
  -- Posted kaydı başka statüye çekmeye izin verme (sadece reversed)
  IF OLD.status = 'posted' AND NEW.status NOT IN ('posted','reversed') THEN
    RAISE EXCEPTION 'Journal entry % is already posted. Only ''reversed'' is allowed.', OLD.entry_no;
  END IF;

  IF NEW.status = 'posted' AND OLD.status = 'draft' THEN

    -- En az 2 satır zorunlu
    IF (SELECT COUNT(*) FROM journal_lines WHERE journal_entry_id = NEW.id) < 2 THEN
      RAISE EXCEPTION 'Journal entry % must have at least 2 lines.', NEW.entry_no;
    END IF;

    -- TRY bazında denge kontrolü
    SELECT COALESCE(SUM(base_debit),0) - COALESCE(SUM(base_credit),0)
      INTO v_diff
    FROM journal_lines
    WHERE journal_entry_id = NEW.id;

    IF v_diff <> 0 THEN
      RAISE EXCEPTION
        'Journal entry % not balanced in TRY: base_debits − base_credits = % TRY.',
        NEW.entry_no, v_diff;
    END IF;

    -- Kapalı period kontrolü
    IF NEW.period_id IS NOT NULL THEN
      SELECT status INTO v_period FROM accounting_periods WHERE id = NEW.period_id;
      IF v_period <> 'open' THEN
        RAISE EXCEPTION 'Cannot post to a ''%'' accounting period.', v_period;
      END IF;
    END IF;

    NEW.posted_at := now();
    NEW.posted_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger zaten var, yeniden bağlamaya gerek yok (CREATE OR REPLACE function yeterli)
-- Ama yine de sıfırdan tanımla:
DROP TRIGGER IF EXISTS trg_journal_balance ON journal_entries;
CREATE TRIGGER trg_journal_balance
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION enforce_journal_balance();


-- ─── 4. v_trial_balance: TRY bazında güncellendi ─────────────────────────────
CREATE OR REPLACE VIEW v_trial_balance AS
SELECT
  a.code,
  a.name,
  a.account_type,
  a.normal_balance,
  -- Orijinal para birimi tutarları
  COALESCE(SUM(jl.debit),  0) AS total_debit,
  COALESCE(SUM(jl.credit), 0) AS total_credit,
  -- TRY bazında tutarlar
  COALESCE(SUM(jl.base_debit),  0) AS total_debit_try,
  COALESCE(SUM(jl.base_credit), 0) AS total_credit_try,
  -- TRY bazında net bakiye
  CASE a.normal_balance
    WHEN 'debit'  THEN COALESCE(SUM(jl.base_debit),0)  - COALESCE(SUM(jl.base_credit),0)
    WHEN 'credit' THEN COALESCE(SUM(jl.base_credit),0) - COALESCE(SUM(jl.base_debit),0)
  END AS balance_try
FROM accounts a
LEFT JOIN journal_lines   jl ON jl.account_id = a.id
LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
WHERE a.is_active = true
GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
ORDER BY a.code;


-- ─── 5. Örnek: USD Satış Faturası + TRY Tahsilat (Kur Farkı ile) ─────────────
--
-- Senaryo:
--   Fatura tarihi: 2026-01-15  →  1 USD = 38.50 TRY
--   Tahsilat tarihi: 2026-02-10 →  1 USD = 39.20 TRY
--   Fatura tutarı: 10,000 USD
--
-- JE-1 (Satış Faturası):
--   DR 1110  Trade Receivables – USD   10,000 USD × 38.50 = 385,000 TRY
--   CR 4010  Sales Revenue             10,000 USD × 38.50 = 385,000 TRY ✓
--
-- JE-2 (Tahsilat - kur farkı ile):
--   DR 1010  Cash – USD                10,000 USD × 39.20 = 392,000 TRY
--   CR 1110  Trade Receivables – USD   10,000 USD × 38.50 = 385,000 TRY  ← defter değeri
--   CR 4800  FX Gain                    0 USD   × 1.00  =   7,000 TRY   ← kur farkı geliri
--   ────────────────────────────────────────────────────────────────────
--   base_debit = 392,000 TRY  |  base_credit = 392,000 TRY              ✓
-- ─────────────────────────────────────────────────────────────────────────────
/*
DO $$
DECLARE
  v_je1 uuid; v_je2 uuid;
  v_ar  uuid; v_rev uuid; v_cash uuid; v_fxg uuid;
  v_pid uuid;
BEGIN
  v_ar   := get_account_id('1110');  -- Trade Receivables – USD
  v_rev  := get_account_id('4010');  -- Sales Revenue – Commodity
  v_cash := get_account_id('1010');  -- Cash – USD
  v_fxg  := get_account_id('4800');  -- FX Gain

  SELECT id INTO v_pid FROM accounting_periods WHERE name = '2026-Q1' LIMIT 1;

  -- ── JE-1: Satış Faturası ────────────────────────────────────
  INSERT INTO journal_entries (entry_date, period_id, description, source_type, currency, exchange_rate, status)
  VALUES ('2026-01-15', v_pid, 'INV-2026-0002 — USD Satış', 'invoice', 'USD', 38.50, 'draft')
  RETURNING id INTO v_je1;

  INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description,
    debit, credit, line_currency, exchange_rate_try)
  VALUES
    (v_je1, 1, v_ar,  'A/R USD', 10000, 0, 'USD', 38.50),
    (v_je1, 2, v_rev, 'Satış',       0, 10000, 'USD', 38.50);
  --  base_debit = 10000 × 38.50 = 385,000 TRY
  --  base_credit = 10000 × 38.50 = 385,000 TRY  ✓

  UPDATE journal_entries SET status = 'posted' WHERE id = v_je1;

  -- ── JE-2: Tahsilat (kur 39.20, fatura kurunda 38.50) ────────
  INSERT INTO journal_entries (entry_date, period_id, description, source_type, currency, exchange_rate, status)
  VALUES ('2026-02-10', v_pid, 'RCT-2026-0001 — Tahsilat + Kur Farkı', 'transaction', 'USD', 39.20, 'draft')
  RETURNING id INTO v_je2;

  INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description,
    debit, credit, line_currency, exchange_rate_try)
  VALUES
    (v_je2, 1, v_cash, 'Tahsilat',            10000,     0, 'USD', 39.20),
    -- A/R defterde 38.50 kurundan kayıtlı, o kurda kapatılır
    (v_je2, 2, v_ar,   'A/R kapat',               0, 10000, 'USD', 38.50),
    -- Kur farkı geliri: TRY cinsinden, exchange_rate_try = 1
    (v_je2, 3, v_fxg,  'Kur farkı geliri',        0,  7000, 'TRY', 1.00);
  --  base_debit  = 10000×39.20 = 392,000 TRY
  --  base_credit = 10000×38.50 + 7000×1 = 385,000 + 7,000 = 392,000 TRY  ✓

  UPDATE journal_entries SET status = 'posted' WHERE id = v_je2;

  RAISE NOTICE 'Örnek entry''ler oluşturuldu. JE1=% JE2=%', v_je1, v_je2;
END $$;
*/


-- ─── 6. Doğrulama ────────────────────────────────────────────────────────────

-- journal_lines yeni kolonları göster
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'journal_lines'
  AND column_name IN ('line_currency','exchange_rate_try','base_debit','base_credit')
ORDER BY ordinal_position;
