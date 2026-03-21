-- ============================================================================
-- SunMax Trade Management — Complete Database Schema
-- Steps 1-4 Deliverable: Production-ready PostgreSQL DDL
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE trade_file_status AS ENUM (
  'request', 'sale', 'delivery', 'completed', 'cancelled'
);

CREATE TYPE transaction_type AS ENUM (
  'svc_inv',        -- Service invoice (customs, port, freight, etc.)
  'purchase_inv',   -- Purchase invoice (supplier product purchase)
  'receipt',        -- Customer payment received
  'payment'         -- Payment made to supplier/service provider
);

CREATE TYPE payment_status AS ENUM ('open', 'partial', 'paid');

CREATE TYPE currency_code AS ENUM ('USD', 'EUR', 'TRY');

CREATE TYPE transport_mode AS ENUM ('truck', 'train', 'sea');

CREATE TYPE user_role AS ENUM ('admin', 'manager', 'viewer', 'accountant');

CREATE TYPE party_type AS ENUM (
  'customer', 'supplier', 'service_provider', 'other'
);

CREATE TYPE service_provider_type AS ENUM (
  'customs',      -- Gümrükçü
  'port',         -- Liman
  'warehouse',    -- Antrepo
  'freight',      -- Navlun
  'insurance',    -- Sigorta
  'financial',    -- Mali Müşavir
  'other'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEQUENCES (for never-reused document numbers)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SEQUENCE invoice_no_seq START 1;
CREATE SEQUENCE pl_no_seq START 1;
CREATE SEQUENCE proforma_no_seq START 1;
CREATE SEQUENCE trade_file_no_seq START 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Auto-update updated_at on every UPDATE
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Audit logging: records every INSERT/UPDATE/DELETE on business tables
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs(user_id, action, table_name, record_id, new_values)
    VALUES (auth.uid(), 'create', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs(user_id, action, table_name, record_id, old_values, new_values)
    VALUES (auth.uid(), 'update', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs(user_id, action, table_name, record_id, old_values)
    VALUES (auth.uid(), 'delete', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trade file status transition validation
CREATE OR REPLACE FUNCTION validate_trade_file_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow any transition from NULL (new record)
  IF OLD.status IS NULL THEN RETURN NEW; END IF;

  -- Valid transitions
  IF OLD.status = 'request' AND NEW.status IN ('sale', 'cancelled') THEN RETURN NEW; END IF;
  IF OLD.status = 'sale' AND NEW.status IN ('delivery', 'cancelled') THEN RETURN NEW; END IF;
  IF OLD.status = 'delivery' AND NEW.status IN ('completed', 'cancelled') THEN RETURN NEW; END IF;

  -- Same status (update other fields without changing status)
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
END;
$$ LANGUAGE plpgsql;

-- Ensure only one default bank account
CREATE OR REPLACE FUNCTION ensure_single_default_bank()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE bank_accounts SET is_default = false
    WHERE id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-create profile when Supabase auth user is created
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'viewer'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Audit Logs (created first because triggers reference it) ────────────

CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID,  -- FK added after profiles table
  action        TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  table_name    TEXT NOT NULL,
  record_id     UUID NOT NULL,
  old_values    JSONB,
  new_values    JSONB,
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- ── Profiles ────────────────────────────────────────────────────────────

CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'viewer',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_active ON profiles(is_active) WHERE is_active = true;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add FK for audit_logs.user_id now that profiles exists
ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_user
  FOREIGN KEY (user_id) REFERENCES profiles(id);

-- Auto-create profile on auth signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Company Settings ────────────────────────────────────────────────────

CREATE TABLE company_settings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name             TEXT NOT NULL DEFAULT '',
  tax_id                   TEXT DEFAULT '',
  address_line1            TEXT DEFAULT '',
  address_line2            TEXT DEFAULT '',
  phone                    TEXT DEFAULT '',
  email                    TEXT DEFAULT '',
  signatory                TEXT DEFAULT '',
  default_currency         currency_code NOT NULL DEFAULT 'USD',
  default_port_of_loading  TEXT DEFAULT 'MERSIN, TURKEY',
  default_incoterms        TEXT DEFAULT 'CPT',
  payment_terms            TEXT DEFAULT '',
  file_prefix              TEXT NOT NULL DEFAULT 'ESN',
  logo_url                 TEXT DEFAULT '',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON company_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Bank Accounts ───────────────────────────────────────────────────────

CREATE TABLE bank_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name           TEXT NOT NULL,
  account_name        TEXT NOT NULL DEFAULT '',
  iban_usd            TEXT DEFAULT '',
  iban_eur            TEXT DEFAULT '',
  swift_bic           TEXT DEFAULT '',
  correspondent_bank  TEXT DEFAULT '',
  is_default          BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER ensure_single_default BEFORE INSERT OR UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION ensure_single_default_bank();

-- ── Customers ───────────────────────────────────────────────────────────

CREATE TABLE customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL CHECK (length(trim(name)) > 0),
  country         TEXT DEFAULT '',
  address         TEXT DEFAULT '',
  contact_email   TEXT DEFAULT '',
  contact_phone   TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id)
);

CREATE INDEX idx_customers_name ON customers(name);
CREATE INDEX idx_customers_code ON customers(code);
CREATE INDEX idx_customers_active ON customers(is_active) WHERE is_active = true;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER audit_customers AFTER INSERT OR UPDATE OR DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ── Suppliers ───────────────────────────────────────────────────────────

CREATE TABLE suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL CHECK (length(trim(name)) > 0),
  country         TEXT DEFAULT '',
  city            TEXT DEFAULT '',
  contact_name    TEXT DEFAULT '',
  phone           TEXT DEFAULT '',
  email           TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id)
);

CREATE INDEX idx_suppliers_name ON suppliers(name);
CREATE INDEX idx_suppliers_active ON suppliers(is_active) WHERE is_active = true;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER audit_suppliers AFTER INSERT OR UPDATE OR DELETE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ── Service Providers ───────────────────────────────────────────────────

CREATE TABLE service_providers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL CHECK (length(trim(name)) > 0),
  service_type    service_provider_type NOT NULL DEFAULT 'other',
  country         TEXT DEFAULT '',
  city            TEXT DEFAULT '',
  contact_name    TEXT DEFAULT '',
  phone           TEXT DEFAULT '',
  email           TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id)
);

CREATE INDEX idx_svc_providers_type ON service_providers(service_type);
CREATE INDEX idx_svc_providers_active ON service_providers(is_active) WHERE is_active = true;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON service_providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER audit_svc_providers AFTER INSERT OR UPDATE OR DELETE ON service_providers
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ── Products ────────────────────────────────────────────────────────────

CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL CHECK (length(trim(name)) > 0),
  hs_code         TEXT DEFAULT '',
  unit            TEXT NOT NULL DEFAULT 'ADMT',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id)
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER audit_products AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ── Trade Files ─────────────────────────────────────────────────────────

CREATE TABLE trade_files (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_no             TEXT UNIQUE NOT NULL,
  file_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  status              trade_file_status NOT NULL DEFAULT 'request',

  -- Request phase (required)
  customer_id         UUID NOT NULL REFERENCES customers(id),
  product_id          UUID NOT NULL REFERENCES products(id),
  tonnage_mt          NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (tonnage_mt >= 0),
  customer_ref        TEXT DEFAULT '',
  notes               TEXT DEFAULT '',

  -- Sale phase (nullable until status >= 'sale')
  supplier_id         UUID REFERENCES suppliers(id),
  selling_price       NUMERIC(12,2) CHECK (selling_price IS NULL OR selling_price >= 0),
  purchase_price      NUMERIC(12,2) CHECK (purchase_price IS NULL OR purchase_price >= 0),
  freight_cost        NUMERIC(12,2) DEFAULT 0 CHECK (freight_cost IS NULL OR freight_cost >= 0),
  port_of_loading     TEXT,
  port_of_discharge   TEXT,
  incoterms           TEXT,
  currency            currency_code DEFAULT 'USD',
  payment_terms       TEXT,
  transport_mode      transport_mode,
  eta                 DATE,
  proforma_ref        TEXT,

  -- Delivery phase (nullable until status >= 'delivery')
  delivered_admt      NUMERIC(12,3) CHECK (delivered_admt IS NULL OR delivered_admt >= 0),
  gross_weight_kg     NUMERIC(12,3) CHECK (gross_weight_kg IS NULL OR gross_weight_kg >= 0),
  packages            INTEGER CHECK (packages IS NULL OR packages >= 0),
  arrival_date        DATE,
  bl_number           TEXT,
  septi_ref           TEXT,
  insurance_tr        TEXT,
  insurance_ir        TEXT,

  -- P&L data (flexible JSONB for cost breakdown rows)
  pnl_data            JSONB,

  -- Metadata
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES profiles(id)
);

CREATE INDEX idx_trade_files_status ON trade_files(status);
CREATE INDEX idx_trade_files_customer ON trade_files(customer_id);
CREATE INDEX idx_trade_files_supplier ON trade_files(supplier_id);
CREATE INDEX idx_trade_files_date ON trade_files(file_date DESC);
CREATE INDEX idx_trade_files_file_no ON trade_files(file_no);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON trade_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER validate_status_transition BEFORE UPDATE ON trade_files
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION validate_trade_file_status();
CREATE TRIGGER audit_trade_files AFTER INSERT OR UPDATE OR DELETE ON trade_files
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ── Proformas ───────────────────────────────────────────────────────────

CREATE TABLE proformas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proforma_no         TEXT UNIQUE NOT NULL,
  trade_file_id       UUID NOT NULL REFERENCES trade_files(id) ON DELETE CASCADE,
  proforma_date       DATE NOT NULL,
  validity_date       DATE,
  buyer_commercial_id TEXT DEFAULT '',
  country_of_origin   TEXT DEFAULT 'USA',
  port_of_loading     TEXT,
  port_of_discharge   TEXT,
  final_delivery      TEXT,
  incoterms           TEXT,
  payment_terms       TEXT,
  transport_mode      transport_mode,
  currency            currency_code DEFAULT 'USD',
  place_of_payment    TEXT,
  description         TEXT,
  hs_code             TEXT,
  partial_shipment    TEXT DEFAULT 'allowed' CHECK (partial_shipment IN ('allowed', 'not')),
  insurance           TEXT DEFAULT 'BY BUYER',
  net_weight_kg       NUMERIC(12,3),
  gross_weight_kg     NUMERIC(12,3),
  quantity_admt       NUMERIC(12,3) NOT NULL CHECK (quantity_admt > 0),
  unit_price          NUMERIC(12,2) NOT NULL CHECK (unit_price > 0),
  freight             NUMERIC(12,2) DEFAULT 0,
  discount            NUMERIC(12,2),
  other_charges       NUMERIC(12,2),
  subtotal            NUMERIC(14,2) NOT NULL,
  total               NUMERIC(14,2) NOT NULL,
  signatory           TEXT,
  notes               TEXT,
  pdf_url             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES profiles(id)
);

CREATE INDEX idx_proformas_trade_file ON proformas(trade_file_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON proformas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER audit_proformas AFTER INSERT OR UPDATE OR DELETE ON proformas
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ── Invoices ────────────────────────────────────────────────────────────

CREATE TABLE invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no          TEXT UNIQUE NOT NULL,
  trade_file_id       UUID NOT NULL REFERENCES trade_files(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES customers(id),
  invoice_date        DATE NOT NULL,
  currency            currency_code DEFAULT 'USD',
  incoterms           TEXT,
  proforma_no         TEXT,
  cb_no               TEXT,
  insurance_no        TEXT,
  product_name        TEXT NOT NULL,  -- Denormalized: frozen at invoice creation
  quantity_admt       NUMERIC(12,3) NOT NULL CHECK (quantity_admt > 0),
  unit_price          NUMERIC(12,2) NOT NULL CHECK (unit_price > 0),
  freight             NUMERIC(12,2) DEFAULT 0,
  subtotal            NUMERIC(14,2) NOT NULL,
  total               NUMERIC(14,2) NOT NULL,
  gross_weight_kg     NUMERIC(12,3),
  packing_info        TEXT,
  payment_terms       TEXT,
  pdf_url             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES profiles(id)
);

CREATE INDEX idx_invoices_trade_file ON invoices(trade_file_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_date ON invoices(invoice_date DESC);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER audit_invoices AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ── Packing Lists ───────────────────────────────────────────────────────

CREATE TABLE packing_lists (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packing_list_no     TEXT UNIQUE NOT NULL,
  trade_file_id       UUID NOT NULL REFERENCES trade_files(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES customers(id),
  pl_date             DATE NOT NULL,
  transport_mode      transport_mode NOT NULL DEFAULT 'truck',
  invoice_no          TEXT,
  cb_no               TEXT,
  insurance_no        TEXT,
  description         TEXT,
  comments            TEXT,
  total_reels         INTEGER DEFAULT 0,
  total_admt          NUMERIC(12,3) DEFAULT 0,
  total_gross_kg      NUMERIC(12,3) DEFAULT 0,
  pdf_url             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES profiles(id)
);

CREATE INDEX idx_packing_lists_trade_file ON packing_lists(trade_file_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON packing_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER audit_packing_lists AFTER INSERT OR UPDATE OR DELETE ON packing_lists
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ── Packing List Items ──────────────────────────────────────────────────

CREATE TABLE packing_list_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packing_list_id     UUID NOT NULL REFERENCES packing_lists(id) ON DELETE CASCADE,
  item_order          INTEGER NOT NULL CHECK (item_order > 0),
  vehicle_plate       TEXT NOT NULL DEFAULT '',
  reels               INTEGER DEFAULT 0 CHECK (reels >= 0),
  admt                NUMERIC(12,3) DEFAULT 0 CHECK (admt >= 0),
  gross_weight_kg     NUMERIC(12,3) DEFAULT 0 CHECK (gross_weight_kg >= 0),

  UNIQUE (packing_list_id, item_order)
);

CREATE INDEX idx_pl_items_packing_list ON packing_list_items(packing_list_id);

-- ── Transactions ────────────────────────────────────────────────────────

CREATE TABLE transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date      DATE NOT NULL,
  transaction_type      transaction_type NOT NULL,
  trade_file_id         UUID REFERENCES trade_files(id),
  party_type            party_type,
  customer_id           UUID REFERENCES customers(id),
  supplier_id           UUID REFERENCES suppliers(id),
  service_provider_id   UUID REFERENCES service_providers(id),
  party_name            TEXT DEFAULT '',
  description           TEXT NOT NULL CHECK (length(trim(description)) > 0),
  reference_no          TEXT DEFAULT '',
  currency              currency_code NOT NULL DEFAULT 'USD',
  amount                NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  exchange_rate         NUMERIC(10,4) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  amount_usd            NUMERIC(14,2) NOT NULL CHECK (amount_usd >= 0),
  paid_amount           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  paid_amount_usd       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount_usd >= 0),
  payment_status        payment_status NOT NULL DEFAULT 'open',
  notes                 TEXT DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES profiles(id),

  -- Ensure correct party FK is populated based on party_type
  CONSTRAINT chk_party_reference CHECK (
    (party_type = 'customer'         AND customer_id IS NOT NULL)        OR
    (party_type = 'supplier'         AND supplier_id IS NOT NULL)        OR
    (party_type = 'service_provider' AND service_provider_id IS NOT NULL) OR
    (party_type = 'other'            AND length(trim(party_name)) > 0)  OR
    (party_type IS NULL)
  ),

  -- Paid amount cannot exceed total amount
  CONSTRAINT chk_paid_not_exceeding CHECK (paid_amount <= amount)
);

CREATE INDEX idx_txns_date ON transactions(transaction_date DESC);
CREATE INDEX idx_txns_type ON transactions(transaction_type);
CREATE INDEX idx_txns_trade_file ON transactions(trade_file_id);
CREATE INDEX idx_txns_customer ON transactions(customer_id);
CREATE INDEX idx_txns_supplier ON transactions(supplier_id);
CREATE INDEX idx_txns_svc_provider ON transactions(service_provider_id);
CREATE INDEX idx_txns_status ON transactions(payment_status);
CREATE INDEX idx_txns_status_open ON transactions(payment_status)
  WHERE payment_status != 'paid';  -- Partial index for aging reports

CREATE TRIGGER set_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER audit_transactions AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ── Attachments ─────────────────────────────────────────────────────────

CREATE TABLE attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name      TEXT NOT NULL,
  record_id       UUID NOT NULL,
  file_name       TEXT NOT NULL,
  file_url        TEXT NOT NULL,
  file_size       INTEGER,
  mime_type       TEXT,
  uploaded_by     UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attachments_record ON attachments(table_name, record_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════════════════════

-- Default company settings (single row)
INSERT INTO company_settings (
  company_name, file_prefix, default_currency,
  default_incoterms, default_port_of_loading
) VALUES (
  'SunMax', 'ESN', 'USD', 'CPT', 'MERSIN, TURKEY'
);

-- Default bank account placeholder
INSERT INTO bank_accounts (bank_name, account_name, is_default)
VALUES ('', '', true);

-- ═══════════════════════════════════════════════════════════════════════════
-- USEFUL VIEWS
-- ═══════════════════════════════════════════════════════════════════════════

-- Pipeline summary (for dashboard cards)
CREATE OR REPLACE VIEW pipeline_summary AS
SELECT
  status,
  COUNT(*) as file_count,
  COALESCE(SUM(tonnage_mt), 0) as total_tonnage
FROM trade_files
WHERE status NOT IN ('completed', 'cancelled')
GROUP BY status;

-- Aging report (open receivables/payables)
CREATE OR REPLACE VIEW aging_report AS
SELECT
  t.id,
  t.transaction_type,
  t.party_type,
  COALESCE(c.name, s.name, sp.name, t.party_name) as party_name,
  t.description,
  t.currency,
  t.amount,
  t.paid_amount,
  (t.amount - t.paid_amount) as remaining,
  t.amount_usd,
  t.paid_amount_usd,
  (t.amount_usd - t.paid_amount_usd) as remaining_usd,
  t.transaction_date,
  CURRENT_DATE - t.transaction_date as days_outstanding
FROM transactions t
LEFT JOIN customers c ON t.customer_id = c.id
LEFT JOIN suppliers s ON t.supplier_id = s.id
LEFT JOIN service_providers sp ON t.service_provider_id = sp.id
WHERE t.payment_status != 'paid';
