// ─── Database Enums ─────────────────────────────────────────────────────────
// Must match PostgreSQL enum definitions exactly

export const TRADE_FILE_STATUSES = ['request', 'sale', 'delivery', 'completed', 'cancelled'] as const;
export type TradeFileStatus = (typeof TRADE_FILE_STATUSES)[number];

export const TRANSACTION_TYPES = ['svc_inv', 'purchase_inv', 'receipt', 'payment', 'sale_inv'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const PAYMENT_STATUSES = ['open', 'partial', 'paid'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const CURRENCY_CODES = ['USD', 'EUR', 'TRY'] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const TRANSPORT_MODES = ['truck', 'train', 'sea'] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const USER_ROLES = ['admin', 'manager', 'viewer', 'accountant'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PARTY_TYPES = ['customer', 'supplier', 'service_provider', 'other'] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

export const SERVICE_PROVIDER_TYPES = [
  'customs', 'port', 'warehouse', 'freight', 'insurance', 'financial', 'other',
] as const;
export type ServiceProviderType = (typeof SERVICE_PROVIDER_TYPES)[number];

// ─── Display Labels ─────────────────────────────────────────────────────────

export const TRADE_FILE_STATUS_LABELS: Record<TradeFileStatus, string> = {
  request: 'Request',
  sale: 'Sale',
  delivery: 'Delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  svc_inv: 'Service Invoice',
  purchase_inv: 'Purchase Invoice',
  receipt: 'Receipt',
  payment: 'Payment',
  sale_inv: 'Sale Invoice',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  open: 'Open',
  partial: 'Partial',
  paid: 'Paid',
};

export const SERVICE_PROVIDER_TYPE_LABELS: Record<ServiceProviderType, string> = {
  customs: 'Customs',
  port: 'Port',
  warehouse: 'Warehouse',
  freight: 'Freight',
  insurance: 'Insurance',
  financial: 'Financial',
  other: 'Other',
};

export const TRANSPORT_MODE_LABELS: Record<TransportMode, string> = {
  truck: 'By Truck',
  train: 'By Train',
  sea: 'By Sea',
};

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$',
  EUR: '€',
  TRY: '₺',
};
