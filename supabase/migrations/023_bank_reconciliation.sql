-- ============================================================
-- Migration 023: Bank Reconciliation System
-- bank_transactions + reconciliation_matches
-- ============================================================
--
-- KAVRAMLAR:
--   bank_transactions      → Banka ekstresinden gelen ham hareketler
--   reconciliation_matches → Banka hareketi ↔ sistem transaction eşleşmesi
--
-- AKIŞ:
--   1. Banka ekstresini içe aktar  →  bank_transactions (status = 'unmatched')
--   2. Kullanıcı eşleştirir        →  reconciliation_matches INSERT
--   3. Trigger: bank_transactions.status = 'matched'
--   4. Eşleşmeyen kayıtlar v_unmatched_* view'larından görülür
--
-- KURAL: 1 banka hareketi ↔ 1 sistem transaction (basit, bölünmüş değil)
-- ============================================================


-- ─── bank_transactions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_transactions (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id  uuid          NOT NULL REFERENCES bank_accounts(id),

  txn_date         date          NOT NULL,
  value_date       date,                               -- valör tarihi

  description      text          NOT NULL,             -- banka açıklaması
  reference        text,                               -- banka referans no

  -- Pozitif = gelen para (credit), Negatif = giden para (debit)
  amount           numeric(14,2) NOT NULL,
  currency         currency_code NOT NULL DEFAULT 'USD',
  balance_after    numeric(14,2),                      -- hareket sonrası bakiye (opsiyonel)

  -- Eşleştirme durumu
  status           text          NOT NULL DEFAULT 'unmatched'
    CONSTRAINT chk_btxn_status CHECK (status IN ('unmatched','matched','excluded')),

  notes            text,
  imported_at      timestamptz   NOT NULL DEFAULT now(),
  imported_by      uuid          REFERENCES auth.users(id),
  created_at       timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_btxn_bank      ON bank_transactions (bank_account_id);
CREATE INDEX IF NOT EXISTS idx_btxn_date      ON bank_transactions (txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_btxn_status    ON bank_transactions (status) WHERE status != 'matched';
CREATE INDEX IF NOT EXISTS idx_btxn_currency  ON bank_transactions (currency);

COMMENT ON TABLE  bank_transactions         IS 'Banka ekstresinden içe aktarılan ham hareketler';
COMMENT ON COLUMN bank_transactions.amount  IS 'Pozitif = gelen, Negatif = giden';
COMMENT ON COLUMN bank_transactions.status  IS 'unmatched | matched | excluded';


-- ─── reconciliation_matches ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reconciliation_matches (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Banka tarafı
  bank_transaction_id  uuid         NOT NULL
    REFERENCES bank_transactions(id) ON DELETE CASCADE,

  -- Sistem tarafı (transactions tablosu — receipt veya payment)
  transaction_id       uuid         NOT NULL
    REFERENCES transactions(id) ON DELETE RESTRICT,

  match_type           text         NOT NULL DEFAULT 'manual'
    CONSTRAINT chk_match_type CHECK (match_type IN ('manual','auto')),

  -- Kur farkı varsa burada
  difference_amount    numeric(14,2) NOT NULL DEFAULT 0,
  difference_note      text,

  notes                text,
  matched_by           uuid         REFERENCES auth.users(id),
  matched_at           timestamptz  NOT NULL DEFAULT now(),

  -- 1:1 kural
  UNIQUE (bank_transaction_id),
  UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_recon_bank ON reconciliation_matches (bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_recon_txn  ON reconciliation_matches (transaction_id);

COMMENT ON TABLE  reconciliation_matches                   IS '1:1 banka hareketi ↔ sistem transaction eşleşmesi';
COMMENT ON COLUMN reconciliation_matches.difference_amount IS 'Banka tutarı − sistem tutarı (tolere edilen kur/komisyon farkı)';


-- ─── Trigger: eşleştirme → bank_transactions.status güncelle ─────────────────

CREATE OR REPLACE FUNCTION sync_bank_txn_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Eşleştirme oluştu → matched
    UPDATE bank_transactions SET status = 'matched'
    WHERE id = NEW.bank_transaction_id;

  ELSIF TG_OP = 'DELETE' THEN
    -- Eşleştirme silindi → unmatched (excluded değilse)
    UPDATE bank_transactions
    SET status = 'unmatched'
    WHERE id = OLD.bank_transaction_id AND status != 'excluded';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_btxn_status ON reconciliation_matches;
CREATE TRIGGER trg_sync_btxn_status
  AFTER INSERT OR DELETE ON reconciliation_matches
  FOR EACH ROW EXECUTE FUNCTION sync_bank_txn_status();


-- ─── Trigger: excluded banka hareketine eşleştirme yapılmasını engelle ────────

CREATE OR REPLACE FUNCTION prevent_match_excluded()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status
  FROM bank_transactions WHERE id = NEW.bank_transaction_id;

  IF v_status = 'excluded' THEN
    RAISE EXCEPTION 'Bu banka hareketi "excluded" olarak işaretlenmiş, eşleştirilemez.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_match_excluded ON reconciliation_matches;
CREATE TRIGGER trg_no_match_excluded
  BEFORE INSERT ON reconciliation_matches
  FOR EACH ROW EXECUTE FUNCTION prevent_match_excluded();


-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE bank_transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_matches ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "btxn_select"   ON bank_transactions      FOR SELECT TO authenticated USING (true);
  CREATE POLICY "btxn_insert"   ON bank_transactions      FOR INSERT TO authenticated WITH CHECK (can_write_transactions());
  CREATE POLICY "btxn_update"   ON bank_transactions      FOR UPDATE TO authenticated USING (can_write_transactions());
  CREATE POLICY "btxn_delete"   ON bank_transactions      FOR DELETE TO authenticated USING (is_admin());
  CREATE POLICY "recon_select"  ON reconciliation_matches FOR SELECT TO authenticated USING (true);
  CREATE POLICY "recon_insert"  ON reconciliation_matches FOR INSERT TO authenticated WITH CHECK (can_write_transactions());
  CREATE POLICY "recon_delete"  ON reconciliation_matches FOR DELETE TO authenticated USING (can_write_transactions());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─── Views ────────────────────────────────────────────────────────────────────

-- Eşleşmemiş banka hareketleri
CREATE OR REPLACE VIEW v_unmatched_bank_txns AS
SELECT
  bt.id,
  bt.txn_date,
  bt.value_date,
  ba.bank_name,
  ba.account_name,
  bt.description,
  bt.reference,
  bt.amount,
  bt.currency,
  bt.status,
  bt.notes,
  bt.imported_at
FROM bank_transactions bt
JOIN bank_accounts ba ON ba.id = bt.bank_account_id
WHERE bt.status = 'unmatched'
ORDER BY bt.txn_date DESC;

-- Eşleşmemiş sistem transactionları (sadece receipt ve payment)
CREATE OR REPLACE VIEW v_unmatched_transactions AS
SELECT
  t.id,
  t.transaction_date,
  t.transaction_type,
  t.party_type,
  COALESCE(c.name, s.name, sp.name, t.party_name) AS party_name,
  t.description,
  t.currency,
  t.amount,
  t.payment_status,
  t.reference_no
FROM transactions t
LEFT JOIN customers         c  ON c.id  = t.customer_id
LEFT JOIN suppliers         s  ON s.id  = t.supplier_id
LEFT JOIN service_providers sp ON sp.id = t.service_provider_id
WHERE t.transaction_type IN ('receipt', 'payment')
  AND NOT EXISTS (
    SELECT 1 FROM reconciliation_matches rm
    WHERE rm.transaction_id = t.id
  )
ORDER BY t.transaction_date DESC;

-- Tam reconciliation tablosu
CREATE OR REPLACE VIEW v_reconciliation AS
SELECT
  rm.id             AS match_id,
  rm.matched_at,
  rm.match_type,
  rm.difference_amount,
  -- Banka tarafı
  bt.txn_date       AS bank_date,
  bt.description    AS bank_description,
  bt.reference      AS bank_reference,
  bt.amount         AS bank_amount,
  bt.currency       AS bank_currency,
  ba.bank_name,
  -- Sistem tarafı
  t.transaction_date AS txn_date,
  t.transaction_type,
  t.description      AS txn_description,
  t.amount           AS txn_amount,
  t.currency         AS txn_currency,
  t.payment_status,
  COALESCE(c.name, s.name, sp.name, t.party_name) AS party_name
FROM reconciliation_matches rm
JOIN bank_transactions  bt ON bt.id = rm.bank_transaction_id
JOIN bank_accounts      ba ON ba.id = bt.bank_account_id
JOIN transactions        t ON t.id  = rm.transaction_id
LEFT JOIN customers         c  ON c.id  = t.customer_id
LEFT JOIN suppliers         s  ON s.id  = t.supplier_id
LEFT JOIN service_providers sp ON sp.id = t.service_provider_id
ORDER BY rm.matched_at DESC;

-- Banka hesabı özeti
CREATE OR REPLACE VIEW v_bank_reconciliation_summary AS
SELECT
  ba.id            AS bank_account_id,
  ba.bank_name,
  ba.account_name,
  COUNT(bt.id)                                           AS total_bank_txns,
  COUNT(bt.id) FILTER (WHERE bt.status = 'matched')     AS matched,
  COUNT(bt.id) FILTER (WHERE bt.status = 'unmatched')   AS unmatched,
  COUNT(bt.id) FILTER (WHERE bt.status = 'excluded')    AS excluded,
  ROUND(
    COUNT(bt.id) FILTER (WHERE bt.status = 'matched')::numeric
    / NULLIF(COUNT(bt.id), 0) * 100, 1
  )                                                      AS match_rate_pct
FROM bank_accounts ba
LEFT JOIN bank_transactions bt ON bt.bank_account_id = ba.id
GROUP BY ba.id, ba.bank_name, ba.account_name
ORDER BY ba.bank_name;


-- ─── Doğrulama ────────────────────────────────────────────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('bank_transactions','reconciliation_matches')
ORDER BY table_name;
