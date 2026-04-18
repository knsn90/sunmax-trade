-- Migration 055: Add bill_to, ship_to, qty_unit to invoices
-- bill_to / ship_to : editable address blocks on the invoice document
-- qty_unit          : quantity unit label (ADMT / MT)

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS bill_to  text,
  ADD COLUMN IF NOT EXISTS ship_to  text,
  ADD COLUMN IF NOT EXISTS qty_unit text NOT NULL DEFAULT 'ADMT';
