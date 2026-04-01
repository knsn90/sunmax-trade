-- ============================================================
-- Migration 021: Accounting Integration
-- Mevcut invoices + transactions tablolarını muhasebe sistemine bağlar.
-- Her INSERT'te otomatik journal entry oluşturur.
-- ============================================================

-- ─── Mapping Kuralları ────────────────────────────────────────────────────────
--
--  SATIŞ FATURASI (invoices INSERT)
--  ─────────────────────────────────
--  DR  1110 / 1111  Trade Receivables (USD/EUR)    ← total (subtotal + freight)
--  CR  4010         Sales Revenue – Commodity      ← subtotal
--  CR  4020         Sales Revenue – Other          ← freight  (freight > 0 ise)
--
--  TEDARİKÇİ FATURASI (transactions.transaction_type = 'purchase_inv')
--  ─────────────────────────────────────────────────────────────────────
--  DR  5010         Purchase Cost – Commodity
--  CR  2010 / 2011  Trade Payables (USD/EUR)
--
--  HİZMET FATURASI (transactions.transaction_type = 'svc_inv')
--  ─────────────────────────────────────────────────────────────
--  Masraf hesabı service_provider_type'a göre seçilir:
--    freight   → DR 5100  Ocean Freight
--    customs   → DR 6010  Customs & Port Fees
--    port      → DR 6010  Customs & Port Fees
--    warehouse → DR 6020  Warehouse & Storage
--    insurance → DR 5300  Cargo Insurance
--    financial → DR 6060  Professional & Legal Fees
--    other     → DR 6900  Miscellaneous Expenses
--  CR  2020 / 2030  Freight Payable / Service Provider Payable
--
--  TAHSİLAT (transactions.transaction_type = 'receipt')
--  ──────────────────────────────────────────────────────
--  DR  1010 / 1011  Cash (USD/EUR)
--  CR  1110 / 1111  Trade Receivables (USD/EUR)     ← A/R kapanır
--
--  TEDARİKÇİ ÖDEMESİ (transactions.transaction_type = 'payment', party_type = 'supplier')
--  ──────────────────────────────────────────────────────────────────────────────────────
--  DR  2010 / 2011  Trade Payables (USD/EUR)         ← Borç kapanır
--  CR  1010 / 1011  Cash (USD/EUR)
--
--  HİZMET ÖDEMESİ (transactions.transaction_type = 'payment', party_type = 'service_provider')
--  ──────────────────────────────────────────────────────────────────────────────────────────
--  DR  2020 / 2030  Freight / Service Payable        ← Borç kapanır
--  CR  1010 / 1011  Cash (USD/EUR)
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── Helper: account code → id ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_account_id(p_code text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM accounts WHERE code = p_code AND is_active = true LIMIT 1;
$$;


-- ─── Helper: currency → A/R account code ─────────────────────────────────────
CREATE OR REPLACE FUNCTION ar_account_code(p_currency currency_code)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_currency WHEN 'EUR' THEN '1111' ELSE '1110' END;
$$;

-- ─── Helper: currency → Cash account code ────────────────────────────────────
CREATE OR REPLACE FUNCTION cash_account_code(p_currency currency_code)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_currency WHEN 'EUR' THEN '1011' WHEN 'TRY' THEN '1012' ELSE '1010' END;
$$;

-- ─── Helper: currency → Trade Payables code ──────────────────────────────────
CREATE OR REPLACE FUNCTION ap_account_code(p_currency currency_code)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_currency WHEN 'EUR' THEN '2011' ELSE '2010' END;
$$;


-- ─── Trigger Function: Sales Invoice ─────────────────────────────────────────
--
-- invoices INSERT  →  DR A/R  /  CR Revenue
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION je_on_sales_invoice()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_je_id  uuid;
  v_ar     uuid;   -- A/R hesabı
  v_rev    uuid;   -- Satış geliri
  v_rev2   uuid;   -- Navlun geliri (opsiyonel)
  v_line   smallint := 1;
BEGIN
  -- Zaten journal entry varsa atla (idempotent)
  IF EXISTS (
    SELECT 1 FROM journal_entries
    WHERE source_type = 'invoice' AND source_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- Hesap ID'leri
  v_ar   := get_account_id(ar_account_code(NEW.currency));
  v_rev  := get_account_id('4010');   -- Sales Revenue – Commodity
  v_rev2 := get_account_id('4020');   -- Sales Revenue – Other (navlun)

  IF v_ar IS NULL OR v_rev IS NULL THEN
    RAISE WARNING '[JE] Hesap bulunamadı — invoice % atlandı', NEW.invoice_no;
    RETURN NEW;
  END IF;

  -- Journal Entry oluştur
  INSERT INTO journal_entries (
    entry_date, description,
    source_type, source_id,
    currency, exchange_rate, status
  ) VALUES (
    NEW.invoice_date,
    'Satış Faturası ' || NEW.invoice_no,
    'invoice', NEW.id,
    NEW.currency, 1.0, 'draft'
  )
  RETURNING id INTO v_je_id;

  -- Satır 1: DR Trade Receivables = total (subtotal + freight)
  INSERT INTO journal_lines
    (journal_entry_id, line_no, account_id, description, debit, credit, party_type, party_id)
  VALUES
    (v_je_id, v_line, v_ar, NEW.invoice_no || ' — Alacak', NEW.total, 0, 'customer', NEW.customer_id);
  v_line := v_line + 1;

  -- Satır 2: CR Sales Revenue = subtotal
  INSERT INTO journal_lines
    (journal_entry_id, line_no, account_id, description, debit, credit)
  VALUES
    (v_je_id, v_line, v_rev, NEW.invoice_no || ' — Satış Geliri', 0, NEW.subtotal);
  v_line := v_line + 1;

  -- Satır 3: CR Sales Revenue Other = freight (varsa)
  IF COALESCE(NEW.freight, 0) > 0 AND v_rev2 IS NOT NULL THEN
    INSERT INTO journal_lines
      (journal_entry_id, line_no, account_id, description, debit, credit)
    VALUES
      (v_je_id, v_line, v_rev2, NEW.invoice_no || ' — Navlun Geliri', 0, NEW.freight);
  END IF;

  -- Post et (trigger balance check burada çalışır)
  UPDATE journal_entries SET status = 'posted' WHERE id = v_je_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_je_sales_invoice ON invoices;
CREATE TRIGGER trg_je_sales_invoice
  AFTER INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION je_on_sales_invoice();


-- ─── Trigger Function: Transactions ──────────────────────────────────────────
--
-- transactions INSERT → transaction_type'a göre journal entry
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION je_on_transaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_je_id    uuid;
  v_dr       uuid;    -- Debit account
  v_cr       uuid;    -- Credit account
  v_sp_type  service_provider_type;
  v_exp_code text;
  v_party_id uuid;
BEGIN
  -- Zaten journal entry varsa atla
  IF EXISTS (
    SELECT 1 FROM journal_entries
    WHERE source_type = 'transaction' AND source_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- Party ID: hangi taraf
  v_party_id := COALESCE(NEW.customer_id, NEW.supplier_id, NEW.service_provider_id);

  -- ── transaction_type'a göre hesap seçimi ──────────────────────────────────

  IF NEW.transaction_type = 'purchase_inv' THEN
    -- Tedarikçi faturası: DR 5010 Satın Alma Maliyeti / CR A/P
    v_dr := get_account_id('5010');
    v_cr := get_account_id(ap_account_code(NEW.currency));

  ELSIF NEW.transaction_type = 'svc_inv' THEN
    -- Hizmet faturası: Gider hesabı service_provider_type'a göre belirlenir
    IF NEW.service_provider_id IS NOT NULL THEN
      SELECT sp_type INTO v_sp_type
      FROM service_providers WHERE id = NEW.service_provider_id;
    END IF;

    v_exp_code := CASE v_sp_type
      WHEN 'freight'   THEN '5100'   -- Ocean Freight
      WHEN 'customs'   THEN '6010'   -- Customs & Port Fees
      WHEN 'port'      THEN '6010'   -- Customs & Port Fees
      WHEN 'warehouse' THEN '6020'   -- Warehouse & Storage
      WHEN 'insurance' THEN '5300'   -- Cargo Insurance
      WHEN 'financial' THEN '6060'   -- Professional & Legal Fees
      ELSE                  '6900'   -- Miscellaneous
    END;

    v_dr := get_account_id(v_exp_code);
    -- Navlun firması için 2020, diğer hizmetler için 2030
    v_cr := get_account_id(
      CASE v_sp_type WHEN 'freight' THEN '2020' ELSE '2030' END
    );

  ELSIF NEW.transaction_type = 'receipt' THEN
    -- Tahsilat: DR Cash / CR A/R
    v_dr := get_account_id(cash_account_code(NEW.currency));
    v_cr := get_account_id(ar_account_code(NEW.currency));

  ELSIF NEW.transaction_type = 'payment' THEN
    -- Ödeme: DR Payable / CR Cash
    v_cr := get_account_id(cash_account_code(NEW.currency));
    v_dr := get_account_id(
      CASE NEW.party_type
        WHEN 'supplier'          THEN ap_account_code(NEW.currency)  -- 2010/2011
        WHEN 'service_provider'  THEN '2030'                         -- Service Provider Payable
        ELSE                          ap_account_code(NEW.currency)
      END
    );
  END IF;

  -- Hesap bulunamazsa uyarı ver, devam et (JE oluşturma)
  IF v_dr IS NULL OR v_cr IS NULL THEN
    RAISE WARNING '[JE] Hesap bulunamadı — transaction % (%) atlandı',
      NEW.id, NEW.transaction_type;
    RETURN NEW;
  END IF;

  -- Journal Entry oluştur
  INSERT INTO journal_entries (
    entry_date, description,
    source_type, source_id,
    currency, exchange_rate, status
  ) VALUES (
    NEW.transaction_date,
    NEW.transaction_type::text || ' — ' || NEW.description,
    'transaction', NEW.id,
    NEW.currency, NEW.exchange_rate, 'draft'
  )
  RETURNING id INTO v_je_id;

  -- Satırlar: DR ve CR
  INSERT INTO journal_lines
    (journal_entry_id, line_no, account_id, description, debit, credit, party_type, party_id)
  VALUES
    (v_je_id, 1, v_dr, NEW.description, NEW.amount, 0,          NEW.party_type, v_party_id),
    (v_je_id, 2, v_cr, NEW.description, 0,          NEW.amount, NEW.party_type, v_party_id);

  -- Post et
  UPDATE journal_entries SET status = 'posted' WHERE id = v_je_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_je_transaction ON transactions;
CREATE TRIGGER trg_je_transaction
  AFTER INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION je_on_transaction();


-- ─── View: İşlem ↔ Journal Entry bağlantısı ──────────────────────────────────
CREATE OR REPLACE VIEW v_transaction_je AS
SELECT
  t.id              AS transaction_id,
  t.transaction_date,
  t.transaction_type,
  t.description,
  t.currency,
  t.amount,
  t.payment_status,
  je.id             AS journal_entry_id,
  je.entry_no,
  je.status         AS je_status,
  je.posted_at
FROM transactions t
LEFT JOIN journal_entries je
  ON je.source_type = 'transaction' AND je.source_id = t.id;

CREATE OR REPLACE VIEW v_invoice_je AS
SELECT
  i.id              AS invoice_id,
  i.invoice_no,
  i.invoice_date,
  i.currency,
  i.total,
  i.payment_terms,
  je.id             AS journal_entry_id,
  je.entry_no,
  je.status         AS je_status,
  je.posted_at
FROM invoices i
LEFT JOIN journal_entries je
  ON je.source_type = 'invoice' AND je.source_id = i.id;


-- ─── Verification ─────────────────────────────────────────────────────────────
-- Triggers aktif mi?
SELECT trigger_name, event_manipulation, event_object_table, action_timing
FROM information_schema.triggers
WHERE trigger_name IN ('trg_je_sales_invoice', 'trg_je_transaction')
ORDER BY event_object_table;
