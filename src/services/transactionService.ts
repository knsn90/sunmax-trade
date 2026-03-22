import { supabase } from './supabase';
import type { Transaction } from '@/types/database';
import type { TransactionType, PaymentStatus } from '@/types/enums';
import type { TransactionFormData } from '@/types/forms';
import { toUSD } from '@/lib/formatters';

const TXN_SELECT = `
  *,
  trade_file:trade_files!trade_file_id(file_no),
  customer:customers!customer_id(name),
  supplier:suppliers!supplier_id(name),
  service_provider:service_providers!service_provider_id(name)
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
      const tabMap: Record<string, TransactionType[]> = {
        buy: ['purchase_inv'],
        svc: ['svc_inv'],
        cash: ['receipt', 'payment'],
        sale: ['sale_inv'],
      };
      const types = tabMap[filters.tab];
      if (types) {
        query = query.in('transaction_type', types);
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

    // For customer/supplier: also include transactions via trade file link
    const fileColumn = entityType === 'customer' ? 'customer_id' : 'supplier_id';
    const txnColumn  = entityType === 'customer' ? 'customer_id' : 'supplier_id';

    // Step 1: get trade file IDs for this entity
    const { data: files } = await supabase
      .from('trade_files')
      .select('id')
      .eq(fileColumn, entityId);
    const fileIds = (files ?? []).map((f: { id: string }) => f.id);

    // Step 2: query transactions by direct link OR trade file link
    let query = supabase.from('transactions').select(TXN_SELECT);
    if (fileIds.length > 0) {
      query = query.or(`${txnColumn}.eq.${entityId},trade_file_id.in.(${fileIds.join(',')})`);
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
    // Sale invoices live in the invoices table, not transactions
    const [{ data: saleInvoices }, { data: txns }] = await Promise.all([
      supabase.from('invoices').select('total').eq('invoice_type', 'sale'),
      supabase.from('transactions').select('transaction_type, amount_usd, paid_amount_usd'),
    ]);

    // Revenue = sum of all sale invoice totals
    const totalRevenue = (saleInvoices ?? []).reduce((s, inv) => s + (inv.total ?? 0), 0);

    // Total receipts collected (cash received from customers)
    const totalReceived = (txns ?? [])
      .filter((t) => t.transaction_type === 'receipt')
      .reduce((s, t) => s + (t.amount_usd ?? 0), 0);

    // Receivable = what customers still owe us
    const totalReceivable = Math.max(0, totalRevenue - totalReceived);

    // Costs = purchase + service invoice totals
    const costTxns = (txns ?? []).filter(
      (t) => t.transaction_type === 'purchase_inv' || t.transaction_type === 'svc_inv',
    );
    const totalCost = costTxns.reduce((s, t) => s + (t.amount_usd ?? 0), 0);

    // Payable = what we still owe (unpaid portion)
    const totalPayable = costTxns.reduce(
      (s, t) => s + Math.max(0, (t.amount_usd ?? 0) - (t.paid_amount_usd ?? 0)),
      0,
    );

    return { totalReceivable, totalPayable, totalRevenue, totalCost };
  },
};
