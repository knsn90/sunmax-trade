-- ============================================================
-- Migration 025: Accounting Integrity Fixes
--
-- FIX 1: Direct INSERT with status='posted' bypass → BLOCKED
-- FIX 2: RAISE WARNING → RAISE EXCEPTION (sessiz kayıp önlenir)
-- FIX 3: line_currency + exchange_rate_try integration trigger'da set edilir
-- FIX 4: Invoice tutarı posted JE varken değiştirilemez
-- FIX 5: invoices tablosuna exchange_rate kolonu eklendi
-- ============================================================


-- ─── FIX 1: Direct INSERT bypass engeli ──────────────────────────────────────
--
-- journal_entries sadece status='draft' ile INSERT edilebilir.
-- Denge kontrolü UPDATE trigger'ında çalışır (draft→posted).
-- Direkt posted INSERT → EXCEPTION.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_draft_on_je_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'draft' THEN
    RAISE EXCEPTION
      'Journal entries must be inserted as ''draft''. Received: ''%''. Use UPDATE to post.',
      NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_je_draft_only ON journal_entries;
CREATE TRIGGER trg_je_draft_only
  BEFORE INSERT ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION enforce_draft_on_je_insert();


-- ─── FIX 2: Invoice tutarı — posted JE varken kilitli ────────────────────────
--
-- Invoice amount/subtotal/freight değişirse ve posted JE varsa → EXCEPTION.
-- Düzeltme için reversal entry gerekir.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION lock_invoice_if_posted_je()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Tutar değişiyor mu?
  IF NEW.total    IS DISTINCT FROM OLD.total    OR
     NEW.subtotal IS DISTINCT FROM OLD.subtotal OR
     NEW.freight  IS DISTINCT FROM OLD.freight
  THEN
    IF EXISTS (
      SELECT 1 FROM journal_entries
      WHERE source_type = 'invoice'
        AND source_id   = OLD.id
        AND status      = 'posted'
    ) THEN
      RAISE EXCEPTION
        'Invoice % has a posted journal entry. '
        'Amount cannot be changed. Create a reversal entry to correct.',
        OLD.invoice_no;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_invoice_amount ON invoices;
CREATE TRIGGER trg_lock_invoice_amount
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION lock_invoice_if_posted_je();


-- ─── FIX 3: invoices tablosuna exchange_rate kolonu ──────────────────────────
--
-- Faturanın oluşturulduğu andaki döviz kuru kaydedilir.
-- Sonradan kur değişse de fatura tutarı sabit kalır.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,6) NOT NULL DEFAULT 1.0
    CONSTRAINT chk_invoice_rate_positive CHECK (exchange_rate > 0);

COMMENT ON COLUMN invoices.exchange_rate IS
  '1 birim invoice.currency = kaç TRY — fatura anında dondurulur';


-- ─── FIX 4: Integration trigger — line_currency + exchange_rate_try ──────────
--
-- Önceki versiyon: line_currency ve exchange_rate_try set edilmiyordu.
-- Tüm satırlar TRY / 1.0 ile kaydediliyordu → base_debit yanlış.
-- Yeni versiyon: invoice.currency ve invoice.exchange_rate kullanılır.
--
-- RAISE WARNING → RAISE EXCEPTION:
-- Hesap bulunamazsa invoice INSERT de başarısız olur (sessiz kayıp yok).
-- Eğer accounting tabloları kurulmamışsa trigger'ı devre dışı bırak.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION je_on_sales_invoice()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_je_id  uuid;
  v_ar     uuid;
  v_rev    uuid;
  v_rev2   uuid;
  v_line   smallint := 1;
  v_rate   numeric  := COALESCE(NEW.exchange_rate, 1.0);
BEGIN
  -- accounts tablosu yoksa (accounting kurulmamış) sessizce geç
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accounts'
  ) THEN
    RETURN NEW;
  END IF;

  -- Zaten journal entry varsa atla
  IF EXISTS (
    SELECT 1 FROM journal_entries
    WHERE source_type = 'invoice' AND source_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  v_ar   := get_account_id(ar_account_code(NEW.currency));
  v_rev  := get_account_id('4010');
  v_rev2 := get_account_id('4020');

  -- Hesap bulunamazsa EXCEPTION (artık WARNING değil)
  IF v_ar IS NULL THEN
    RAISE EXCEPTION '[JE] A/R hesabı bulunamadı (currency: %). 018_019_combined.sql çalıştırıldı mı?', NEW.currency;
  END IF;
  IF v_rev IS NULL THEN
    RAISE EXCEPTION '[JE] Satış geliri hesabı (4010) bulunamadı. 018_019_combined.sql çalıştırıldı mı?';
  END IF;

  INSERT INTO journal_entries (
    entry_date, description,
    source_type, source_id,
    currency, exchange_rate, status
  ) VALUES (
    NEW.invoice_date,
    'Satış Faturası ' || NEW.invoice_no,
    'invoice', NEW.id,
    NEW.currency, v_rate, 'draft'
  )
  RETURNING id INTO v_je_id;

  -- Satır 1: DR A/R — line_currency ve exchange_rate_try set edilir
  INSERT INTO journal_lines
    (journal_entry_id, line_no, account_id, description,
     debit, credit,
     line_currency, exchange_rate_try,
     party_type, party_id)
  VALUES
    (v_je_id, v_line, v_ar, NEW.invoice_no || ' — Alacak',
     NEW.total, 0,
     NEW.currency, v_rate,
     'customer', NEW.customer_id);
  v_line := v_line + 1;

  -- Satır 2: CR Satış Geliri
  INSERT INTO journal_lines
    (journal_entry_id, line_no, account_id, description,
     debit, credit,
     line_currency, exchange_rate_try)
  VALUES
    (v_je_id, v_line, v_rev, NEW.invoice_no || ' — Satış Geliri',
     0, NEW.subtotal,
     NEW.currency, v_rate);
  v_line := v_line + 1;

  -- Satır 3: CR Navlun Geliri (varsa)
  IF COALESCE(NEW.freight, 0) > 0 AND v_rev2 IS NOT NULL THEN
    INSERT INTO journal_lines
      (journal_entry_id, line_no, account_id, description,
       debit, credit,
       line_currency, exchange_rate_try)
    VALUES
      (v_je_id, v_line, v_rev2, NEW.invoice_no || ' — Navlun',
       0, NEW.freight,
       NEW.currency, v_rate);
  END IF;

  UPDATE journal_entries SET status = 'posted' WHERE id = v_je_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_je_sales_invoice ON invoices;
CREATE TRIGGER trg_je_sales_invoice
  AFTER INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION je_on_sales_invoice();


-- ─── FIX 4b: Transaction trigger — line_currency + exchange_rate_try ─────────
CREATE OR REPLACE FUNCTION je_on_transaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_je_id    uuid;
  v_dr       uuid;
  v_cr       uuid;
  v_sp_type  service_provider_type;
  v_exp_code text;
  v_party_id uuid;
  v_rate     numeric := COALESCE(NEW.exchange_rate, 1.0);
BEGIN
  -- accounts tablosu yoksa geç
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accounts'
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM journal_entries
    WHERE source_type = 'transaction' AND source_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  v_party_id := COALESCE(NEW.customer_id, NEW.supplier_id, NEW.service_provider_id);

  IF NEW.transaction_type = 'purchase_inv' THEN
    v_dr := get_account_id('5010');
    v_cr := get_account_id(ap_account_code(NEW.currency));

  ELSIF NEW.transaction_type = 'svc_inv' THEN
    IF NEW.service_provider_id IS NOT NULL THEN
      SELECT sp_type INTO v_sp_type FROM service_providers WHERE id = NEW.service_provider_id;
    END IF;
    v_exp_code := CASE v_sp_type
      WHEN 'freight'   THEN '5100'
      WHEN 'customs'   THEN '6010'
      WHEN 'port'      THEN '6010'
      WHEN 'warehouse' THEN '6020'
      WHEN 'insurance' THEN '5300'
      WHEN 'financial' THEN '6060'
      ELSE                  '6900'
    END;
    v_dr := get_account_id(v_exp_code);
    v_cr := get_account_id(CASE v_sp_type WHEN 'freight' THEN '2020' ELSE '2030' END);

  ELSIF NEW.transaction_type = 'receipt' THEN
    v_dr := get_account_id(cash_account_code(NEW.currency));
    v_cr := get_account_id(ar_account_code(NEW.currency));

  ELSIF NEW.transaction_type = 'payment' THEN
    v_cr := get_account_id(cash_account_code(NEW.currency));
    v_dr := get_account_id(
      CASE NEW.party_type
        WHEN 'supplier'         THEN ap_account_code(NEW.currency)
        WHEN 'service_provider' THEN '2030'
        ELSE                         ap_account_code(NEW.currency)
      END
    );
  END IF;

  -- Hesap bulunamazsa EXCEPTION (artık WARNING değil)
  IF v_dr IS NULL OR v_cr IS NULL THEN
    RAISE EXCEPTION
      '[JE] Hesap bulunamadı — transaction_type: %, currency: %. '
      '018_019_combined.sql çalıştırıldı mı?',
      NEW.transaction_type, NEW.currency;
  END IF;

  INSERT INTO journal_entries (
    entry_date, description,
    source_type, source_id,
    currency, exchange_rate, status
  ) VALUES (
    NEW.transaction_date,
    NEW.transaction_type::text || ' — ' || NEW.description,
    'transaction', NEW.id,
    NEW.currency, v_rate, 'draft'
  )
  RETURNING id INTO v_je_id;

  -- line_currency ve exchange_rate_try set edilir
  INSERT INTO journal_lines
    (journal_entry_id, line_no, account_id, description,
     debit, credit,
     line_currency, exchange_rate_try,
     party_type, party_id)
  VALUES
    (v_je_id, 1, v_dr, NEW.description,
     NEW.amount, 0,
     NEW.currency, v_rate,
     NEW.party_type, v_party_id),
    (v_je_id, 2, v_cr, NEW.description,
     0, NEW.amount,
     NEW.currency, v_rate,
     NEW.party_type, v_party_id);

  UPDATE journal_entries SET status = 'posted' WHERE id = v_je_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_je_transaction ON transactions;
CREATE TRIGGER trg_je_transaction
  AFTER INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION je_on_transaction();


-- ─── FIX 5: Balance check — enforce_journal_balance güncellemesi ──────────────
--
-- Migration 022 base_debit/base_credit kontrolünü ekledi.
-- Ama migration 022 çalıştırılmamışsa eski versiyon aktif.
-- Bu migration her iki durumu da handle eder.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_journal_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_diff        numeric;
  v_line_count  integer;
  v_period      period_status;
  v_use_base    boolean;
BEGIN
  IF OLD.status = 'posted' AND NEW.status NOT IN ('posted','reversed') THEN
    RAISE EXCEPTION
      'Journal entry % is already posted. Only ''reversed'' transition is allowed.',
      OLD.entry_no;
  END IF;

  IF NEW.status = 'posted' AND OLD.status = 'draft' THEN

    SELECT COUNT(*) INTO v_line_count
    FROM journal_lines WHERE journal_entry_id = NEW.id;

    IF v_line_count < 2 THEN
      RAISE EXCEPTION
        'Journal entry % must have at least 2 lines. Found: %.',
        NEW.entry_no, v_line_count;
    END IF;

    -- base_debit varsa TRY bazında kontrol, yoksa debit/credit ile
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'journal_lines' AND column_name = 'base_debit'
    ) INTO v_use_base;

    IF v_use_base THEN
      SELECT COALESCE(SUM(base_debit),0) - COALESCE(SUM(base_credit),0)
        INTO v_diff FROM journal_lines WHERE journal_entry_id = NEW.id;
      IF v_diff <> 0 THEN
        RAISE EXCEPTION
          'Journal entry % not balanced (TRY): base_debit − base_credit = % TRY.',
          NEW.entry_no, v_diff;
      END IF;
    ELSE
      SELECT COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0)
        INTO v_diff FROM journal_lines WHERE journal_entry_id = NEW.id;
      IF v_diff <> 0 THEN
        RAISE EXCEPTION
          'Journal entry % not balanced: debit − credit = %.',
          NEW.entry_no, v_diff;
      END IF;
    END IF;

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

DROP TRIGGER IF EXISTS trg_journal_balance ON journal_entries;
CREATE TRIGGER trg_journal_balance
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION enforce_journal_balance();


-- ─── Doğrulama ────────────────────────────────────────────────────────────────
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name IN (
  'trg_je_draft_only',
  'trg_lock_invoice_amount',
  'trg_je_sales_invoice',
  'trg_je_transaction',
  'trg_journal_balance'
)
ORDER BY event_object_table, trigger_name;
