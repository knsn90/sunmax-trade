import type {
  TradeFileStatus, TransactionType, PaymentStatus,
  CurrencyCode, TransportMode, UserRole, PartyType, ServiceProviderType,
} from './enums';

// ─── Base ───────────────────────────────────────────────────────────────────

interface Timestamps {
  created_at: string;
  updated_at: string;
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
  iban_usd: string;
  iban_eur: string;
  swift_bic: string;
  correspondent_bank: string;
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
  transport_mode: TransportMode | null;
  eta: string | null;
  revised_eta: string | null;
  delay_notes: string | null;
  vessel_name: string | null;
  proforma_ref: string | null;
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
  // Meta
  created_by: string | null;
  // Joined relations (from select queries)
  customer?: Customer;
  product?: Product;
  supplier?: Supplier;
  invoices?: Invoice[];
  packing_lists?: PackingList[];
  proformas?: Proforma[];
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
  // Joined
  trade_file?: TradeFile;
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
  // Joined
  trade_file?: TradeFile;
  customer?: Customer;
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
  // Joined
  trade_file?: TradeFile;
  customer?: Customer;
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
  notes: string;
  doc_status: DocStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  // Joined
  trade_file?: TradeFile;
  customer?: Customer;
  supplier?: Supplier;
  service_provider?: ServiceProvider;
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
