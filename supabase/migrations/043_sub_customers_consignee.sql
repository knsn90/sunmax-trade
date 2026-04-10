-- 043: Sub-customers (parent_customer_id) + per-document consignee override
-- Allows a customer like "Marinasun" to have sub-companies (e.g. "Ario Cellulose").
-- Financial transactions always use the parent; documents can be issued to any sub-company.

-- ── 1. Sub-customer hierarchy ───────────────────────────────────────────────
alter table customers
  add column if not exists parent_customer_id uuid references customers(id) on delete set null;

-- ── 2. Consignee override on documents ─────────────────────────────────────
-- NULL  = use trade file's customer (default behaviour, backward-compatible)
-- UUID  = issue the document to this sub-company instead

alter table proformas
  add column if not exists consignee_customer_id uuid references customers(id) on delete set null;

alter table packing_lists
  add column if not exists consignee_customer_id uuid references customers(id) on delete set null;

alter table invoices
  add column if not exists consignee_customer_id uuid references customers(id) on delete set null;
