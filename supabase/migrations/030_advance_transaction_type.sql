-- Add 'advance' value to transaction_type enum
-- Used for advance payment transactions (ön ödeme) instead of reusing sale_inv/purchase_inv
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'advance';

-- Migrate existing advance receivable records (customer side)
-- These were created by journalService.postAdvanceReceivable with transaction_type = 'sale_inv'
-- and notes starting with 'Ön Ödeme %'
UPDATE transactions
SET transaction_type = 'advance'
WHERE transaction_type = 'sale_inv'
  AND notes LIKE 'Ön Ödeme %';

-- Migrate existing advance payable records (supplier side)
-- These were created by journalService.postAdvancePayable with transaction_type = 'purchase_inv'
-- and notes starting with 'Satıcı Ön Ödeme %'
UPDATE transactions
SET transaction_type = 'advance'
WHERE transaction_type = 'purchase_inv'
  AND notes LIKE 'Satıcı Ön Ödeme %';
