-- Add 'expense' value to transaction_type enum
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'expense';
