-- Performans iyileştirme: eksik index'ler
-- Analiz: en sık kullanılan sorgularda tabloya full scan yapılıyordu

-- ── trade_files ───────────────────────────────────────────────────────────────

-- created_at DESC sıralama + deleted_at IS NULL filtresi için partial index
-- (list() ve listPaginated() her sorguda kullanır)
CREATE INDEX IF NOT EXISTS idx_trade_files_created_deleted
  ON trade_files(created_at DESC)
  WHERE deleted_at IS NULL;

-- tenant_id + status kombinasyonu — RLS + filtre için
CREATE INDEX IF NOT EXISTS idx_trade_files_tenant_status
  ON trade_files(tenant_id, status)
  WHERE deleted_at IS NULL;

-- ── transactions ──────────────────────────────────────────────────────────────

-- trade_file_id + tarih — dosya bazlı muhasebe raporları için kritik
-- (müşteri/tedarikçi cari hesabı sayfası her açılışta bu kombinasyonu sorgular)
CREATE INDEX IF NOT EXISTS idx_txns_trade_file_date
  ON transactions(trade_file_id, transaction_date DESC)
  WHERE deleted_at IS NULL;

-- transaction_type + payment_status — muhasebe sekmesi filtreleri
CREATE INDEX IF NOT EXISTS idx_txns_type_status
  ON transactions(transaction_type, payment_status)
  WHERE deleted_at IS NULL;

-- tenant_id + tarih — RLS + sıralama için
CREATE INDEX IF NOT EXISTS idx_txns_tenant_date
  ON transactions(tenant_id, transaction_date DESC)
  WHERE deleted_at IS NULL;

-- party_name arama (ilike) — ilike left-anchor optimizasyonu için pg_trgm
-- (party_name fallback sorgusu bu kolonu kullanır)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_txns_party_name_trgm
  ON transactions USING gin(party_name gin_trgm_ops)
  WHERE party_name IS NOT NULL AND deleted_at IS NULL;

-- ── customers / suppliers ─────────────────────────────────────────────────────

-- Müşteri adı araması için trigram index (ilike '%...%' performanslı çalışsın)
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON customers USING gin(name gin_trgm_ops)
  WHERE deleted_at IS NULL OR deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_name_trgm
  ON suppliers USING gin(name gin_trgm_ops);

-- ── invoices ──────────────────────────────────────────────────────────────────

-- Dosya bazlı fatura sorgusu + tarih
CREATE INDEX IF NOT EXISTS idx_invoices_trade_file_date
  ON invoices(trade_file_id, invoice_date DESC)
  WHERE deleted_at IS NULL;

-- ── proformas / packing_lists ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_proformas_trade_file_date
  ON proformas(trade_file_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_packing_lists_trade_file_date
  ON packing_lists(trade_file_id, created_at DESC);
