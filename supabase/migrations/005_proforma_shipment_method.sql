-- Add shipment_method column to proformas
ALTER TABLE proformas
  ADD COLUMN IF NOT EXISTS shipment_method TEXT CHECK (shipment_method IN ('bulk', 'container'));

-- Update transport_mode enum to use 'railway' instead of 'train'
UPDATE proformas SET transport_mode = 'truck' WHERE transport_mode = 'train';
