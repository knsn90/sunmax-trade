import type {
  TradeFileStatus, TransactionType, PaymentStatus,
  CurrencyCode, TransportMode, UserRole, PartyType, ServiceProviderType,
} from './enums';

// ─── Base ───────────────────────────────────────────────────────────────────

interface Timestamps {
  created_at: string;
  updated_at: string;
}

// ─── Tenant (Firma) ─────────────────────────────────────────────────────────

export interface Tenant extends Timestamps {
  id: string;
  name: string;
  tax_id: string;
  address: string;
  phone: string;
  email: string;
  // Görsel özelleştirme
  logo_url: string;
  login_bg_url: string;
  favicon_url: string;
  primary_color: string;   // Hex renk kodu, örn: '#dc2626'
  // Domain & aktiflik
  custom_domain: string;
  is_active: boolean;
}

// ─── Auth / Profiles ────────────────────────────────────────────────────────

export interface Profile extends Timestamps {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  permissions: string[] | null;
  deleted_at: string | null;
  avatar_url: string | null;
  dashboard_prefs: { order?: string[]; sizes?: Record<string, 'full' | 'half'> } | null;
  // Multi-tenant
  tenant_id: string | null;
  is_super_admin: boolean;
}

// ─── Company Settings ───────────────────────────────────────────────────────

export interface CompanySettings extends Timestamps {
  id: string;
  company_name: string;
  tax_id: string;
  address_line1: string;
  address_line2: string;
  phone: string;
  email: string;
  signatory: string;
  default_currency: CurrencyCode;
  default_port_of_loading: string;
  default_incoterms: string;
  payment_terms: string;
  file_prefix: string;
  logo_url: string;
}

export interface BankAccount extends Timestamps {
  id: string;
  bank_name: string;
  account_name: string;
  currency: string;
  account_number: string;
  branch_name: string;
  branch_code: string;
  iban_usd: string;
  iban_eur: string;
  swift_bic: string;
  correspondent_bank: string;
  opening_balance: number;
  opening_balance_date: string | null;
  account_type: string;
  is_default: boolean;
}

// ─── Master Data ────────────────────────────────────────────────────────────

export interface Customer extends Timestamps {
  id: string;
  code: string;
  name: string;
  country: string;
  city: string;
  address: string;
  contact_email: string;
  contact_phone: string;
  tax_id: string;
  website: string;
  payment_terms: string;
  notes: string;
  is_active: boolean;
  created_by: string | null;
  /** Alt firma ilişkisi — dolu ise bu müşteri bir alt firmadır */
  parent_customer_id: string | null;
  /** Joined — sadece trade file sorgularında dolu gelir */
  parent?: Pick<Customer, 'id' | 'name' | 'code' | 'country' | 'address' | 'contact_phone'>;
}

export interface Supplier extends Timestamps {
  id: string;
  code: string;
  name: string;
  country: string;
  city: string;
  address: string;
  contact_name: string;
  phone: string;
  email: string;
  tax_id: string;
  website: string;
  payment_terms: string;
  swift_code: string;
  iban: string;
  notes: string;
  is_active: boolean;
  created_by: string | null;
}

export interface ServiceProvider extends Timestamps {
  id: string;
  code: string;
  name: string;
  service_type: ServiceProviderType;
  country: string;
  city: string;
  address: string;
  contact_name: string;
  phone: string;
  email: string;
  notes: string;
  is_active: boolean;
  created_by: string | null;
}

export interface ProductCategory {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Product extends Timestamps {
  id: string;
  code: string;
  name: string;
  hs_code: string;
  unit: string;
  description: string;
  origin_country: string;
  species: string;
  grade: string;
  category_id: string | null;
  category?: ProductCategory | null;
  is_active: boolean;
  created_by: string | null;
  logo_url: string | null;
}

// ─── Price List ─────────────────────────────────────────────────────────────

export interface PriceList {
  id: string;
  product_id: string;
  supplier_id: string;
  price: number;
  currency: string;
  price_date: string;
  valid_until: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  product?: Product | null;
  supplier?: Supplier | null;
}

// ─── Trade Files ────────────────────────────────────────────────────────────

export interface TradeFile extends Timestamps {
  id: string;
  file_no: string;
  file_date: string;
  status: TradeFileStatus;
  // Request phase
  customer_id: string;
  product_id: string;
  tonnage_mt: number;
  customer_ref: string;
  notes: string;
  // Sale phase
  supplier_id: string | null;
  selling_price: number | null;
  purchase_price: number | null;
  freight_cost: number | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  incoterms: string | null;
  currency: CurrencyCode;          // kept for backward compat (sale currency)
  purchase_currency: CurrencyCode; // currency used to buy from supplier
  sale_currency: CurrencyCode;     // currency used to sell to customer
  payment_terms: string | null;
  advance_rate: number | null;
  purchase_advance_rate: number | null;
  transport_mode: TransportMode | null;
  eta: string | null;
  revised_eta: string | null;
  delay_notes: string | null;
  vessel_name: string | null;
  proforma_ref: string | null;
  google_drive_folder_id: string | null;
  google_drive_folder_url: string | null;
  dropbox_folder_path: string | null;
  dropbox_folder_url: string | null;
  register_no: string | null;
  // Delivery phase
  delivered_admt: number | null;
  gross_weight_kg: number | null;
  packages: number | null;
  arrival_date: string | null;
  bl_number: string | null;
  septi_ref: string | null;
  insurance_tr: string | null;
  insurance_ir: string | null;
  // P&L
  pnl_data: PnlData | null;
  // Cancellation
  cancel_reason: string | null;
  // Meta
  created_by: string | null;
  // Parti / kısmi sevkiyat
  parent_file_id: string | null;
  batch_no: number | null;
  // Joined relations (from select queries)
  customer?: Customer;
  product?: Product;
  supplier?: Supplier;
  creator?: Pick<Profile, 'id' | 'full_name'> | null;
  invoices?: Invoice[];
  packing_lists?: PackingList[];
  proformas?: Proforma[];
  // Alt partiler (detail sorgusunda gelir)
  batches?: (Pick<TradeFile, 'id' | 'file_no' | 'batch_no' | 'status' | 'tonnage_mt' | 'transport_mode' | 'eta'> & {
    packing_lists?: { id: string; packing_list_no: string; doc_status: string; total_admt: number | null }[];
    invoices?: { id: string; invoice_no: string; invoice_date: string | null; total: number | null; doc_status: string; invoice_type: 'commercial' | 'sale'; currency: string | null }[];
  })[];
}

export interface PnlData {
  admt: number;
  buyp: number;
  sellp: number;
  totalCost: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  netProfit: number;
  margin: number;
  curr: string;
  rows: PnlCostRow[];
}

export interface PnlCostRow {
  label: string;
  qty: string;
  unitTRY: string;
  unitUSD: string;
  rate: string;
}

// ─── Documents ──────────────────────────────────────────────────────────────

export type DocStatus = 'draft' | 'approved' | 'rejected';

export interface Proforma extends Timestamps {
  id: string;
  proforma_no: string;
  trade_file_id: string;
  proforma_date: string;
  validity_date: string | null;
  buyer_commercial_id: string;
  country_of_origin: string;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  final_delivery: string | null;
  incoterms: string | null;
  payment_terms: string | null;
  transport_mode: TransportMode | null;
  shipment_method: 'bulk' | 'container' | null;
  currency: CurrencyCode;
  place_of_payment: string | null;
  delivery_time: string | null;
  vessel_details_confirmation: string | null;
  description: string | null;
  hs_code: string | null;
  partial_shipment: 'allowed' | 'not';
  insurance: string;
  net_weight_kg: number | null;
  gross_weight_kg: number | null;
  quantity_admt: number;
  unit_price: number;
  freight: number;
  discount: number | null;
  other_charges: number | null;
  subtotal: number;
  total: number;
  signatory: string | null;
  notes: string | null;
  pdf_url: string | null;
  doc_status: DocStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  /** Evrak bazında alıcı firma — NULL ise trade_file.customer kullanılır */
  consignee_customer_id: string | null;
  // Joined
  trade_file?: TradeFile;
  consignee?: Customer;
}

export interface Invoice extends Timestamps {
  id: string;
  invoice_no: string;
  trade_file_id: string;
  customer_id: string;
  invoice_date: string;
  currency: CurrencyCode;
  incoterms: string | null;
  proforma_no: string | null;
  cb_no: string | null;
  insurance_no: string | null;
  product_name: string;
  quantity_admt: number;
  unit_price: number;
  freight: number;
  subtotal: number;
  total: number;
  gross_weight_kg: number | null;
  packing_info: string | null;
  payment_terms: string | null;
  pdf_url: string | null;
  invoice_type: 'commercial' | 'sale';
  doc_status: DocStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  /** Evrak bazında alıcı firma — NULL ise trade_file.customer kullanılır */
  consignee_customer_id: string | null;
  // Joined
  trade_file?: TradeFile;
  customer?: Customer;
  consignee?: Customer;
}

export interface PackingList extends Timestamps {
  id: string;
  packing_list_no: string;
  trade_file_id: string;
  customer_id: string;
  pl_date: string;
  transport_mode: TransportMode;
  invoice_no: string | null;
  cb_no: string | null;
  insurance_no: string | null;
  description: string | null;
  comments: string | null;
  total_reels: number;
  total_admt: number;
  total_gross_kg: number;
  pdf_url: string | null;
  doc_status: DocStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  /** Evrak bazında alıcı firma — NULL ise trade_file.customer kullanılır */
  consignee_customer_id: string | null;
  /** Fatura adresi — editable metin bloğu */
  bill_to: string | null;
  /** Teslimat adresi — editable metin bloğu */
  ship_to: string | null;
  /** Sayım sütunu etiketi: Reels | Bales | Packages | Cartons */
  unit_label: string;
  /** Miktar birimi: ADMT | MT */
  qty_unit: string;
  // Joined
  trade_file?: TradeFile;
  customer?: Customer;
  consignee?: Customer;
  packing_list_items?: PackingListItem[];
}

export interface PackingListItem {
  id: string;
  packing_list_id: string;
  item_order: number;
  vehicle_plate: string;
  reels: number;
  admt: number;
  gross_weight_kg: number;
}

// ─── Kasa (Cash Register) ────────────────────────────────────────────────────

export interface Kasa {
  id: string;
  name: string;
  account_code: string;
  currency: string;
  opening_balance: number;
  opening_balance_date: string | null;
  responsible: string;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Accounting ─────────────────────────────────────────────────────────────

export interface Transaction extends Timestamps {
  id: string;
  transaction_date: string;
  transaction_type: TransactionType;
  trade_file_id: string | null;
  party_type: PartyType | null;
  customer_id: string | null;
  supplier_id: string | null;
  service_provider_id: string | null;
  party_name: string;
  description: string;
  reference_no: string;
  currency: CurrencyCode;
  amount: number;
  exchange_rate: number;
  amount_usd: number;
  paid_amount: number;
  paid_amount_usd: number;
  payment_status: PaymentStatus;
  payment_method: string | null;
  bank_name: string | null;
  bank_account_no: string | null;
  swift_bic: string | null;
  card_type: string | null;
  cash_receiver: string | null;
  masraf_turu: string;
  masraf_tutar: number;
  masraf_currency: string;
  masraf_rate: number;
  masraf_usd: number;
  notes: string;
  doc_status: DocStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  kasa_id: string | null;
  bank_account_id: string | null;
  flagged: boolean;
  flag_note: string | null;
  // Joined
  trade_file?: TradeFile;
  customer?: Customer;
  supplier?: Supplier;
  service_provider?: ServiceProvider;
  kasa?: Kasa;
  bank_account?: BankAccount;
  creator?: Pick<Profile, 'id' | 'full_name'> | null;
}

// ─── System ─────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: 'create' | 'update' | 'delete';
  table_name: string;
  record_id: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  // Joined
  user?: Profile;
}

export interface Attachment {
  id: string;
  table_name: string;
  record_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

// ─── Journal (Double-Entry Accounting) ──────────────────────────────────────

export type EntryStatus = 'draft' | 'posted' | 'reversed';

export interface JournalEntry {
  id: string;
  entry_no: string;
  entry_date: string;
  description: string;
  source_type: string | null;
  source_id: string | null;
  currency: CurrencyCode;
  exchange_rate: number;
  status: EntryStatus;
  period_id: string | null;
  posted_at: string | null;
  posted_by: string | null;
  created_at: string;
  // Joined
  lines?: JournalLine[];
}

export interface JournalLine {
  id: string;
  journal_entry_id: string;
  line_no: number;
  account_id: string;
  description: string | null;
  debit: number;
  credit: number;
  line_currency: CurrencyCode;
  exchange_rate_try: number;
  base_debit: number;
  base_credit: number;
  party_type: PartyType | null;
  party_id: string | null;
  // Joined
  account?: { code: string; name: string };
}

// ─── Bank Reconciliation ────────────────────────────────────────────────────

export type BankTxnStatus = 'unmatched' | 'matched' | 'excluded';

export interface BankTransaction {
  id: string;
  bank_account_id: string;
  txn_date: string;
  value_date: string | null;
  description: string;
  reference: string | null;
  amount: number;
  currency: CurrencyCode;
  balance_after: number | null;
  status: BankTxnStatus;
  notes: string | null;
  imported_at: string;
  created_at: string;
  // Joined
  bank_account?: { bank_name: string; account_name: string };
}

export interface ReconciliationMatch {
  id: string;
  bank_transaction_id: string;
  transaction_id: string;
  match_type: 'manual' | 'auto';
  difference_amount: number;
  difference_note: string | null;
  notes: string | null;
  matched_by: string | null;
  matched_at: string;
}

// ─── Trade File Notes ────────────────────────────────────────────────────────

export interface TradeFileNote {
  id: string;
  trade_file_id: string;
  content: string;
  created_by: string | null;
  created_at: string;
}

export interface TradeFileAttachment {
  id: string;
  trade_file_id: string;
  name: string;
  file_type: string | null;
  file_size_bytes: number | null;
  dropbox_url: string | null;
  dropbox_path: string | null;
  created_by: string | null;
  created_at: string;
}

// ─── Financial Reports ───────────────────────────────────────────────────────

export interface TrialBalanceRow {
  code: string;
  name: string;
  account_type: string;
  normal_balance: string;
  total_debit: number;
  total_credit: number;
  balance: number;
  is_zero: boolean;
}

export interface ProfitLossRow {
  section: string;
  code: string;
  name: string;
  amount: number;
  sort_order: number;
}

export interface BalanceSheetRow {
  section: string;
  code: string;
  name: string;
  balance: number;
  sort_order: number;
}

// ─── Account Transfers ───────────────────────────────────────────────────────

export interface AccountTransfer {
  id: string;
  transfer_date: string;
  description: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  amount_usd: number;
  from_type: 'kasa' | 'bank';
  from_id: string;
  to_type: 'kasa' | 'bank';
  to_id: string;
  reference_no: string;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined (select sorgusunda eklenir)
  from_kasa?: { id: string; name: string; currency: string } | null;
  from_bank?: { id: string; bank_name: string; account_name: string } | null;
  to_kasa?: { id: string; name: string; currency: string } | null;
  to_bank?: { id: string; bank_name: string; account_name: string } | null;
}
