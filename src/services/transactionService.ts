import { supabase } from './supabase';
import type { Transaction } from '@/types/database';
import type { TransactionType, PaymentStatus } from '@/types/enums';
import type { TransactionFormData } from '@/types/forms';
import { toUSD } from '@/lib/formatters';

const TXN_SELECT = `
  *,
  trade_file:trade_files!trade_file_id(file_no,tonnage_mt,delivered_admt,product:products!product_id(name)),
  customer:customers!customer_id(name),
  supplier:suppliers!supplier_id(name),
  service_provider:service_providers!service_provider_id(name),
  kasa:kasalar(id,name,currency)
`;

export interface TransactionFilters {
  type?: TransactionType;
  tradeFileId?: string;
  status?: PaymentStatus;
  tab?: 'all' | 'buy' | 'svc' | 'cash' | 'sale';
}

export const transactionService = {
  async list(filters?: TransactionFilters): Promise<Transaction[]> {
    let query = supabase
      .from('transactions')
      .select(TXN_SELECT)
      .order('transaction_date', { ascending: false });

    if (filters?.type) {
      query = query.eq('transaction_type', filters.type);
    }
    if (filters?.tradeFileId) {
      query = query.eq('trade_file_id', filters.tradeFileId);
    }
    if (filters?.status) {
      query = query.eq('payment_status', filters.status);
    }
    if (filters?.tab && filters.tab !== 'all') {
      if (filters.tab === 'buy') {
        // Satın alma faturası + tedarikçi ön ödemesi
        query = query.or(
          `transaction_type.eq.purchase_inv,` +
          `and(transaction_type.eq.advance,party_type.eq.supplier)`,
        );
      } else if (filters.tab === 'sale') {
        // Satış faturası + müşteri ön ödemesi
        query = query.or(
          `transaction_type.eq.sale_inv,` +
          `and(transaction_type.eq.advance,party_type.eq.customer)`,
        );
      } else {
        const tabMap: Record<string, TransactionType[]> = {
          svc: ['svc_inv'],
          cash: ['receipt', 'payment'],
        };
        const types = tabMap[filters.tab];
        if (types) query = query.in('transaction_type', types);
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as Transaction[];
  },

  async listByEntity(
    entityType: 'customer' | 'supplier' | 'service_provider',
    entityId: string,
  ): Promise<Transaction[]> {
    const column = entityType === 'customer'
      ? 'customer_id'
      : entityType === 'supplier'
        ? 'supplier_id'
        : 'service_provider_id';

    const { data, error } = await supabase
      .from('transactions')
      .select(TXN_SELECT)
      .eq(column, entityId)
      .order('transaction_date', { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as Transaction[];
  },

  async listByEntityEnhanced(
    entityType: 'customer' | 'supplier' | 'service_provider',
    entityId: string,
  ): Promise<Transaction[]> {
    // For service providers: direct query only
    if (entityType === 'service_provider') {
      const { data, error } = await supabase
        .from('transactions')
        .select(TXN_SELECT)
        .eq('service_provider_id', entityId)
        .order('transaction_date', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Transaction[];
    }

    const txnColumn = entityType === 'customer' ? 'customer_id' : 'supplier_id';
    const partyType = entityType; // 'customer' | 'supplier'

    // Step 1: get trade file IDs for this entity
    const { data: files } = await supabase
      .from('trade_files')
      .select('id')
      .eq(txnColumn, entityId);
    const fileIds = (files ?? []).map((f: { id: string }) => f.id);

    // Step 2: direct match OR trade-file match — but ALWAYS filter by party_type so
    // customer and supplier accounts never see each other's transactions on the same file.
    let query = supabase.from('transactions').select(TXN_SELECT);
    if (fileIds.length > 0) {
      query = query.or(
        `${txnColumn}.eq.${entityId},` +
        `and(trade_file_id.in.(${fileIds.join(',')}),party_type.eq.${partyType})`,
      );
    } else {
      query = query.eq(txnColumn, entityId);
    }
    const { data, error } = await query.order('transaction_date', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Transaction[];
  },

  async getById(id: string): Promise<Transaction> {
    const { data, error } = await supabase
      .from('transactions')
      .select(TXN_SELECT)
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return data as Transaction;
  },

  async create(input: TransactionFormData): Promise<Transaction> {
    const amountUsd = toUSD(input.amount, input.currency, input.exchange_rate);
    const paidAmountUsd = toUSD(input.paid_amount, input.currency, input.exchange_rate);

    // Derive party_type from transaction_type
    let partyType = input.party_type;
    if (!partyType) {
      const typeToParty: Record<string, string> = {
        svc_inv: 'service_provider',
        purchase_inv: 'supplier',
        receipt: 'customer',
        payment: 'other',
        sale_inv: 'customer',
      };
      partyType = typeToParty[input.transaction_type] as TransactionFormData['party_type'];
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        transaction_date: input.transaction_date,
        transaction_type: input.transaction_type,
        trade_file_id: input.trade_file_id || null,
        party_type: partyType,
        customer_id: input.customer_id || null,
        supplier_id: input.supplier_id || null,
        service_provider_id: input.service_provider_id || null,
        party_name: input.party_name,
        description: input.description,
        reference_no: input.reference_no,
        currency: input.currency,
        amount: input.amount,
        exchange_rate: input.exchange_rate,
        amount_usd: amountUsd,
        paid_amount: input.paid_amount,
        paid_amount_usd: paidAmountUsd,
        payment_status: input.payment_status,
        payment_method: input.payment_method || null,
        bank_name: input.bank_name || null,
        bank_account_no: input.bank_account_no || null,
        swift_bic: input.swift_bic || null,
        card_type: input.card_type || null,
        cash_receiver: input.cash_receiver || null,
        kasa_id: input.kasa_id || null,
        doc_status: 'draft',
        notes: input.notes,
      })
      .select(TXN_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as Transaction;
  },

  async update(id: string, input: TransactionFormData): Promise<Transaction> {
    const amountUsd = toUSD(input.amount, input.currency, input.exchange_rate);
    const paidAmountUsd = toUSD(input.paid_amount, input.currency, input.exchange_rate);

    const { data, error } = await supabase
      .from('transactions')
      .update({
        transaction_date: input.transaction_date,
        transaction_type: input.transaction_type,
        trade_file_id: input.trade_file_id || null,
        customer_id: input.customer_id || null,
        supplier_id: input.supplier_id || null,
        service_provider_id: input.service_provider_id || null,
        party_name: input.party_name,
        description: input.description,
        reference_no: input.reference_no,
        currency: input.currency,
        amount: input.amount,
        exchange_rate: input.exchange_rate,
        amount_usd: amountUsd,
        paid_amount: input.paid_amount,
        paid_amount_usd: paidAmountUsd,
        payment_status: input.payment_status,
        payment_method: input.payment_method || null,
        bank_name: input.bank_name || null,
        bank_account_no: input.bank_account_no || null,
        swift_bic: input.swift_bic || null,
        card_type: input.card_type || null,
        cash_receiver: input.cash_receiver || null,
        kasa_id: input.kasa_id || null,
        notes: input.notes,
      })
      .eq('id', id)
      .select(TXN_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as Transaction;
  },

  async recordPayment(
    id: string,
    paymentAmount: number,
    paymentDate: string,
  ): Promise<Transaction> {
    // Fetch current transaction
    const txn = await this.getById(id);
    const newPaid = (txn.paid_amount ?? 0) + paymentAmount;
    const newStatus: PaymentStatus =
      newPaid >= txn.amount ? 'paid' : newPaid > 0 ? 'partial' : 'open';

    const paidUsd = toUSD(newPaid, txn.currency, txn.exchange_rate);

    const { data, error } = await supabase
      .from('transactions')
      .update({
        paid_amount: newPaid,
        paid_amount_usd: paidUsd,
        payment_status: newStatus,
      })
      .eq('id', id)
      .select(TXN_SELECT)
      .single();

    if (error) throw new Error(error.message);

    // Optionally store the payment event as a note
    void paymentDate; // Future: create a payment_events child table

    return data as Transaction;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  },

  /** Aggregate summary for dashboard cards */
  async getSummary(): Promise<{
    totalReceivable: number;
    totalPayable: number;
    totalRevenue: number;
    totalCost: number;
  }> {
    const { data: txns } = await supabase
      .from('transactions')
      .select('transaction_type, party_type, amount_usd');

    const all = txns ?? [];

    // BORÇ tarafı: müşteri alacakları + ödenen borçlar + müşteri ön ödemeleri
    const isBorc = (t: { transaction_type: string; party_type?: string | null }) =>
      t.transaction_type === 'sale_inv' ||
      t.transaction_type === 'payment' ||
      (t.transaction_type === 'advance' && t.party_type === 'customer');

    // ALACAK tarafı: tahsilatlar + satıcı/hizmet borçları + tedarikçi ön ödemeleri
    const isAlacak = (t: { transaction_type: string; party_type?: string | null }) =>
      t.transaction_type === 'receipt' ||
      t.transaction_type === 'purchase_inv' ||
      t.transaction_type === 'svc_inv' ||
      (t.transaction_type === 'advance' && t.party_type === 'supplier');

    const totalPayable    = all
      .filter(isBorc)
      .reduce((s, t) => s + (t.amount_usd ?? 0), 0);

    const totalReceivable = all
      .filter(isAlacak)
      .reduce((s, t) => s + (t.amount_usd ?? 0), 0);

    // Gelir = sale_inv + müşteri ön ödemeleri
    const totalRevenue = all
      .filter(t => t.transaction_type === 'sale_inv' || (t.transaction_type === 'advance' && t.party_type === 'customer'))
      .reduce((s, t) => s + (t.amount_usd ?? 0), 0);

    // Maliyet = purchase_inv + svc_inv + tedarikçi ön ödemeleri
    const totalCost = all
      .filter(t => t.transaction_type === 'purchase_inv' || t.transaction_type === 'svc_inv' || (t.transaction_type === 'advance' && t.party_type === 'supplier'))
      .reduce((s, t) => s + (t.amount_usd ?? 0), 0);

    return { totalReceivable, totalPayable, totalRevenue, totalCost };
  },
};
