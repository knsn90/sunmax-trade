-- Migration 054: Add bill_to, ship_to, unit_label, qty_unit to packing_lists
-- bill_to / ship_to : editable address blocks on the document
-- unit_label        : column header for the count column (Reels / Bales / Packages / Cartons)
-- qty_unit          : quantity unit label (ADMT / MT)

ALTER TABLE packing_lists
  ADD COLUMN IF NOT EXISTS bill_to    text,
  ADD COLUMN IF NOT EXISTS ship_to    text,
  ADD COLUMN IF NOT EXISTS unit_label text NOT NULL DEFAULT 'Reels',
  ADD COLUMN IF NOT EXISTS qty_unit   text NOT NULL DEFAULT 'ADMT';
