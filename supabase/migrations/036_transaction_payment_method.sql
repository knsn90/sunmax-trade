-- Add payment method fields to transactions
alter table transactions
  add column if not exists payment_method  text,       -- 'nakit' | 'banka_havalesi' | 'kredi_karti'
  add column if not exists bank_name       text,
  add column if not exists bank_account_no text,
  add column if not exists swift_bic       text,
  add column if not exists card_type       text,       -- 'visa' | 'mastercard' | 'amex' | 'troy'
  add column if not exists cash_receiver   text;       -- nakit teslim alan kişi
