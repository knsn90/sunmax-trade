import { z } from 'zod';

// ─── Master Data Forms ──────────────────────────────────────────────────────

export const customerSchema = z.object({
  name:           z.string().min(1, 'Customer name is required').max(200),
  code:           z.string().min(2).max(6).regex(/^[A-Z0-9]+$/, 'Sadece büyük harf ve rakam').optional().or(z.literal('')),
  country:        z.string().max(100).default(''),
  city:           z.string().max(100).default(''),
  address:        z.string().max(500).default(''),
  contact_email:  z.string().email('Invalid email').or(z.literal('')).default(''),
  contact_phone:  z.string().max(50).default(''),
  tax_id:         z.string().max(100).default(''),
  website:        z.string().max(200).default(''),
  payment_terms:  z.string().max(200).default(''),
  notes:          z.string().max(2000).default(''),
});
export type CustomerFormData = z.infer<typeof customerSchema>;

export const supplierSchema = z.object({
  name:           z.string().min(1, 'Supplier name is required').max(200),
  country:        z.string().max(100).default(''),
  city:           z.string().max(100).default(''),
  address:        z.string().max(500).default(''),
  contact_name:   z.string().max(200).default(''),
  phone:          z.string().max(50).default(''),
  email:          z.string().email('Invalid email').or(z.literal('')).default(''),
  tax_id:         z.string().max(100).default(''),
  website:        z.string().max(200).default(''),
  payment_terms:  z.string().max(200).default(''),
  swift_code:     z.string().max(50).default(''),
  iban:           z.string().max(100).default(''),
  notes:          z.string().max(2000).default(''),
});
export type SupplierFormData = z.infer<typeof supplierSchema>;

export const serviceProviderSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  service_type: z.enum([
    'customs', 'port', 'warehouse', 'freight', 'insurance', 'financial', 'other',
  ]),
  country: z.string().max(100).default(''),
  city: z.string().max(100).default(''),
  address: z.string().max(500).default(''),
  contact_name: z.string().max(200).default(''),
  phone: z.string().max(50).default(''),
  email: z.string().email('Invalid email').or(z.literal('')).default(''),
  notes: z.string().max(2000).default(''),
});
export type ServiceProviderFormData = z.infer<typeof serviceProviderSchema>;

export const productSchema = z.object({
  name:           z.string().min(1, 'Product name is required').max(200),
  hs_code:        z.string().max(20).default(''),
  unit:           z.string().min(1).default('ADMT'),
  description:    z.string().max(1000).default(''),
  origin_country: z.string().max(100).default(''),
  species:        z.string().max(100).default(''),
  grade:          z.string().max(100).default(''),
  category_id:    z.string().nullable().optional(),
});
export type ProductFormData = z.infer<typeof productSchema>;

export const productCategorySchema = z.object({
  name:  z.string().min(1, 'Category name is required').max(100),
  color: z.string().default('#6b7280'),
});
export type ProductCategoryFormData = z.infer<typeof productCategorySchema>;

// ─── Price List Forms ────────────────────────────────────────────────────────

export const priceListSchema = z.object({
  product_id:  z.string().min(1, 'Select a product'),
  supplier_id: z.string().min(1, 'Select a supplier'),
  price:       z.coerce.number().positive('Price must be positive'),
  currency:    z.enum(['USD', 'EUR', 'TRY', 'AED', 'GBP']).default('USD'),
  price_date:  z.string().min(1, 'Price date is required'),
  valid_until: z.string().default(''),
  notes:       z.string().max(2000).default(''),
});
export type PriceListFormData = z.infer<typeof priceListSchema>;

// ─── Trade File Forms ───────────────────────────────────────────────────────

export const newTradeFileSchema = z.object({
  customer_id: z.string().min(1, 'Select a customer'),
  product_id: z.string().min(1, 'Select a product'),
  file_date: z.string().min(1, 'Date is required'),
  eta: z.string().optional().default(''),
  tonnage_mt: z.coerce.number().positive('Tonnage must be positive'),
  file_no: z.string().min(1, 'Dosya numarası zorunlu').default(''),
  customer_ref: z.string().max(100).default(''),
  notes: z.string().max(2000).default(''),
});
export type NewTradeFileFormData = z.infer<typeof newTradeFileSchema>;

export const saleConversionSchema = z.object({
  supplier_id: z.string().min(1, 'Select a supplier'),
  selling_price: z.coerce.number().positive('Selling price required'),
  purchase_price: z.coerce.number().positive('Purchase price required'),
  freight_cost: z.coerce.number().min(0).default(0),
  port_of_loading: z.string().min(1, 'Port of loading required'),
  port_of_discharge: z.string().default(''),
  incoterms: z.string().min(1, 'Incoterms required'),
  purchase_currency: z.enum(['USD', 'EUR', 'TRY', 'AED', 'GBP']).default('USD'),
  sale_currency: z.enum(['USD', 'EUR', 'TRY', 'AED', 'GBP']).default('USD'),
  payment_terms: z.string().default(''),
  advance_rate: z.coerce.number().min(0).max(100).default(0),
  purchase_advance_rate: z.coerce.number().min(0).max(100).default(0),
  transport_mode: z.enum(['truck', 'railway', 'sea']).default('truck'),
  eta: z.string().optional(),
  vessel_name: z.string().default(''),
  proforma_ref: z.string().default(''),
  register_no: z.string().default(''),
});
export type SaleConversionFormData = z.infer<typeof saleConversionSchema>;

export const deliverySchema = z.object({
  delivered_admt: z.coerce.number().positive('ADMT is required'),
  gross_weight_kg: z.coerce.number().min(0).default(0),
  packages: z.coerce.number().int().min(0).default(0),
  arrival_date: z.string().optional(),
  bl_number: z.string().default(''),
  septi_ref: z.string().default(''),
  insurance_tr: z.string().default(''),
  insurance_ir: z.string().default(''),
});
export type DeliveryFormData = z.infer<typeof deliverySchema>;

// ─── Document Forms ─────────────────────────────────────────────────────────

export const invoiceSchema = z.object({
  invoice_date: z.string().min(1, 'Date required'),
  currency: z.enum(['USD', 'EUR', 'TRY', 'AED', 'GBP']).default('USD'),
  incoterms: z.string().default('CPT'),
  proforma_no: z.string().default(''),
  cb_no: z.string().default(''),
  insurance_no: z.string().default(''),
  quantity_admt: z.coerce.number().positive('Quantity required'),
  unit_price: z.coerce.number().positive('Unit price required'),
  freight: z.coerce.number().min(0).default(0),
  gross_weight_kg: z.coerce.number().optional(),
  packing_info: z.string().default(''),
  payment_terms: z.string().default(''),
});
export type InvoiceFormData = z.infer<typeof invoiceSchema>;

export const packingListItemSchema = z.object({
  vehicle_plate: z.string().default(''),
  reels: z.coerce.number().int().min(0).default(0),
  admt: z.coerce.number().min(0).default(0),
  gross_weight_kg: z.coerce.number().min(0).default(0),
});

export const packingListSchema = z.object({
  pl_date: z.string().min(1, 'Date required'),
  transport_mode: z.enum(['truck', 'railway', 'sea']).default('truck'),
  invoice_no: z.string().default(''),
  cb_no: z.string().default(''),
  insurance_no: z.string().default(''),
  description: z.string().default(''),
  comments: z.string().default(''),
  items: z.array(packingListItemSchema).min(1, 'Add at least one row'),
});
export type PackingListFormData = z.infer<typeof packingListSchema>;

export const proformaSchema = z.object({
  proforma_date: z.string().min(1, 'Date required'),
  validity_date: z.string().optional(),
  buyer_commercial_id: z.string().default(''),
  country_of_origin: z.string().default('USA'),
  port_of_loading: z.string().default(''),
  port_of_discharge: z.string().default(''),
  final_delivery: z.string().default(''),
  incoterms: z.string().default(''),
  payment_terms: z.string().default(''),
  transport_mode: z.enum(['truck', 'railway', 'sea']).default('truck'),
  shipment_method: z.enum(['bulk', 'container', '']).default('').optional(),
  currency: z.enum(['USD', 'EUR', 'TRY', 'AED', 'GBP']).default('USD'),
  place_of_payment: z.string().default(''),
  delivery_time: z.string().default(''),
  vessel_details_confirmation: z.string().default(''),
  description: z.string().default(''),
  hs_code: z.string().default('470321'),
  partial_shipment: z.enum(['allowed', 'not']).default('allowed'),
  insurance: z.string().default('BY BUYER'),
  net_weight_kg: z.coerce.number().optional(),
  gross_weight_kg: z.coerce.number().optional(),
  quantity_admt: z.coerce.number().positive('Quantity required'),
  unit_price: z.coerce.number().positive('Unit price required'),
  freight: z.coerce.number().min(0).default(0),
  discount: z.coerce.number().optional(),
  other_charges: z.coerce.number().optional(),
  signatory: z.string().default(''),
  notes: z.string().default(''),
});
export type ProformaFormData = z.infer<typeof proformaSchema>;

// ─── Transaction Form ───────────────────────────────────────────────────────

export const transactionSchema = z.object({
  transaction_date: z.string().min(1, 'Date required'),
  transaction_type: z.enum(['svc_inv', 'purchase_inv', 'receipt', 'payment', 'sale_inv', 'advance', 'ic_transfer']),
  trade_file_id: z.string().optional(),
  party_type: z.enum(['customer', 'supplier', 'service_provider', 'other']).optional(),
  customer_id: z.string().optional(),
  supplier_id: z.string().optional(),
  service_provider_id: z.string().optional(),
  party_name: z.string().default(''),
  description: z.string().min(1, 'Description required'),
  reference_no: z.string().default(''),
  currency: z.enum(['USD', 'EUR', 'TRY', 'AED', 'GBP']).default('USD'),
  amount: z.coerce.number().positive('Amount required'),
  exchange_rate: z.coerce.number().positive().default(1),
  paid_amount: z.coerce.number().min(0).default(0),
  payment_status: z.enum(['open', 'partial', 'paid']).default('open'),
  payment_method: z.enum(['nakit', 'banka_havalesi', 'kredi_karti', '']).default(''),
  bank_name: z.string().default(''),
  bank_account_no: z.string().default(''),
  swift_bic: z.string().default(''),
  card_type: z.enum(['visa', 'mastercard', 'amex', 'troy', '']).default(''),
  cash_receiver: z.string().default(''),
  masraf_turu: z.string().default(''),
  masraf_tutar: z.coerce.number().min(0).default(0),
  masraf_currency: z.enum(['USD', 'EUR', 'TRY', 'AED', 'GBP']).default('USD'),
  masraf_rate: z.coerce.number().positive().default(1),
  notes: z.string().default(''),
  kasa_id: z.string().optional().default(''),
  bank_account_id: z.string().optional().default(''),
}).refine(
  (d) => d.paid_amount <= d.amount,
  { message: 'Paid amount cannot exceed the total amount', path: ['paid_amount'] },
);
export type TransactionFormData = z.infer<typeof transactionSchema>;

// ─── Settings Form ──────────────────────────────────────────────────────────

export const companySettingsSchema = z.object({
  company_name: z.string().max(200).default(''),
  tax_id: z.string().max(50).default(''),
  address_line1: z.string().max(300).default(''),
  address_line2: z.string().max(300).default(''),
  phone: z.string().max(50).default(''),
  email: z.string().email().or(z.literal('')).default(''),
  signatory: z.string().max(200).default(''),
  default_currency: z.enum(['USD', 'EUR', 'TRY', 'AED', 'GBP']).default('USD'),
  default_port_of_loading: z.string().default('MERSIN, TURKEY'),
  default_incoterms: z.string().default('CPT'),
  payment_terms: z.string().default(''),
  file_prefix: z.string().min(1, 'Prefix required').max(10).default('ESN'),
});
export type CompanySettingsFormData = z.infer<typeof companySettingsSchema>;

export const bankAccountSchema = z.object({
  bank_name:              z.string().min(1, 'Banka adı zorunlu'),
  account_name:           z.string().default(''),
  currency:               z.string().default('USD'),
  account_number:         z.string().default(''),
  branch_name:            z.string().default(''),
  branch_code:            z.string().default(''),
  iban_usd:               z.string().default(''),
  iban_eur:               z.string().default(''),
  swift_bic:              z.string().default(''),
  correspondent_bank:     z.string().default(''),
  opening_balance:        z.coerce.number().default(0),
  opening_balance_date:   z.string().optional().default(''),
  account_type:           z.string().default('checking'),
  is_default:             z.boolean().default(false),
});
export type BankAccountFormData = z.infer<typeof bankAccountSchema>;

export const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});
export type LoginFormData = z.infer<typeof loginSchema>;
