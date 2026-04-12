import { supabase } from './supabase';
import type { Transaction } from '@/types/database';
import type { TransactionType, PaymentStatus } from '@/types/enums';
import type { TransactionFormData } from '@/types/forms';
import { toUSD } from '@/lib/formatters';

const TXN_SELECT = `
  *,
  trade_file:trade_files!trade_file_id(file_no,tonnage_mt,delivered_admt,parent_file_id,product:products!product_id(name)),
  customer:customers!customer_id(name),
  supplier:suppliers!supplier_id(name),
  service_provider:service_providers!service_provider_id(name),
  kasa:kasalar(id,name,currency),
  creator:profiles!created_by(id,full_name)
`;

export interface TransactionFilters {
  type?: TransactionType;
  tradeFileId?: string;
  tradeFileIds?: string[];
  status?: PaymentStatus;
  tab?: 'all' | 'buy' | 'svc' | 'cash' | 'sale' | 'expense';
  /** Sadece onaylanmış kayıtları getir (raporlar için) */
  approvedOnly?: boolean;
}

export const PAGE_SIZE = 30;

export const transactionService = {
  async list(filters?: TransactionFilters): Promise<Transaction[]> {
    let query = supabase
      .from('transactions')
      .select(TXN_SELECT)
      .order('transaction_date', { ascending: false })
      .limit(10000); // Supabase default is 1000; reports need all rows

    if (filters?.type) {
      query = query.eq('transaction_type', filters.type);
    }
    if (filters?.tradeFileId) {
      query = query.eq('trade_file_id', filters.tradeFileId);
    }
    if (filters?.tradeFileIds?.length) {
      query = query.in('trade_file_id', filters.tradeFileIds);
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
          expense: ['expense'],
        };
        const types = tabMap[filters.tab];
        if (types) query = query.in('transaction_type', types);
      }
    }

    if (filters?.approvedOnly) {
      query = query.eq('doc_status', 'approved');
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as Transaction[];
  },

  /** Paginated list — returns one page + total count */
  async listPage(
    filters: TransactionFilters,
    page: number,
    pageSize = PAGE_SIZE,
  ): Promise<{ data: Transaction[]; count: number }> {
    const from = page * pageSize;
    const to   = from + pageSize - 1;

    let query = supabase
      .from('transactions')
      .select(TXN_SELECT, { count: 'exact' })
      .order('transaction_date', { ascending: false })
      .range(from, to);

    if (filters.type) query = query.eq('transaction_type', filters.type);
    if (filters.tradeFileId) query = query.eq('trade_file_id', filters.tradeFileId);
    if (filters.status) query = query.eq('payment_status', filters.status);
    if (filters.tab && filters.tab !== 'all') {
      if (filters.tab === 'buy') {
        query = query.or(
          'transaction_type.eq.purchase_inv,' +
          'and(transaction_type.eq.advance,party_type.eq.supplier)',
        );
      } else if (filters.tab === 'sale') {
        query = query.or(
          'transaction_type.eq.sale_inv,' +
          'and(transaction_type.eq.advance,party_type.eq.customer)',
        );
      } else {
        const tabMap: Record<string, TransactionType[]> = {
          svc:  ['svc_inv'],
          cash: ['receipt', 'payment'],
        };
        const types = tabMap[filters.tab];
        if (types) query = query.in('transaction_type', types);
      }
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { data: (data ?? []) as Transaction[], count: count ?? 0 };
  },

  async listByEntity(
    entityType: 'customer' | 'supplier' | 'service_provider',
    entityId: string,
    approvedOnly = false,
  ): Promise<Transaction[]> {
    const column = entityType === 'customer'
      ? 'customer_id'
      : entityType === 'supplier'
        ? 'supplier_id'
        : 'service_provider_id';

    let query = supabase
      .from('transactions')
      .select(TXN_SELECT)
      .eq(column, entityId)
      .order('transaction_date', { ascending: true });

    if (approvedOnly) query = query.eq('doc_status', 'approved');

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as Transaction[];
  },

  async listByEntityEnhanced(
    entityType: 'customer' | 'supplier' | 'service_provider',
    entityId: string,
    approvedOnly = false,
  ): Promise<Transaction[]> {
    // For service providers: direct query only
    if (entityType === 'service_provider') {
      let query = supabase
        .from('transactions')
        .select(TXN_SELECT)
        .eq('service_provider_id', entityId)
        .order('transaction_date', { ascending: true });
      if (approvedOnly) query = query.eq('doc_status', 'approved');
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as Transaction[];
    }

    const txnColumn = entityType === 'customer' ? 'customer_id' : 'supplier_id';
    const partyType = entityType; // 'customer' | 'supplier'

    // Step 1: entity name — for party_name fallback (covers manually typed entries without FK link)
    const entityTable = entityType === 'customer' ? 'customers' : 'suppliers';
    const { data: entityRow } = await supabase
      .from(entityTable)
      .select('name')
      .eq('id', entityId)
      .single();
    const entityName = (entityRow as { name?: string } | null)?.name ?? null;

    // Step 2: get trade file IDs for this entity
    const { data: files } = await supabase
      .from('trade_files')
      .select('id')
      .eq(txnColumn, entityId);
    const fileIds = (files ?? []).map((f: { id: string }) => f.id);

    // Step 3a: FK-based query — direct match OR trade-file match
    // Always filter by party_type on file matches so customer/supplier don't bleed into each other.
    let query = supabase.from('transactions').select(TXN_SELECT);
    if (fileIds.length > 0) {
      query = query.or(
        `${txnColumn}.eq.${entityId},` +
        `and(trade_file_id.in.(${fileIds.join(',')}),party_type.eq.${partyType})`,
      );
    } else {
      query = query.eq(txnColumn, entityId);
    }
    if (approvedOnly) query = query.eq('doc_status', 'approved');
    const { data: mainData, error } = await query.order('transaction_date', { ascending: true });
    if (error) throw new Error(error.message);

    // Step 3b: party_name fallback — finds transactions entered without a customer FK
    // (user typed the name instead of selecting from the entity dropdown).
    // Uses ilike for case-insensitive matching. Only requires customer_id IS NULL.
    let nameData: typeof mainData = [];
    if (entityName) {
      let nameQuery = supabase
        .from('transactions')
        .select(TXN_SELECT)
        .ilike('party_name', entityName)
        .is('customer_id', null)
        .order('transaction_date', { ascending: true });
      if (approvedOnly) nameQuery = nameQuery.eq('doc_status', 'approved');
      const { data: nd } = await nameQuery;
      nameData = (nd ?? []) as typeof mainData;
    }

    // Debug: log what was found (remove after investigation)
    console.log('[listByEntityEnhanced]', { entityType, entityId, entityName, fileIds, mainCount: (mainData ?? []).length, nameCount: nameData.length });
    console.log('[listByEntityEnhanced] mainData types:', (mainData ?? []).map((t: { transaction_type: string; customer_id?: string | null }) => `${t.transaction_type}(cid:${t.customer_id ?? 'null'})`));
    console.log('[listByEntityEnhanced] nameData types:', nameData.map((t: { transaction_type: string; party_name?: string | null }) => `${t.transaction_type}(name:${t.party_name})`));

    // Merge and dedup by id
    const combined = [...(mainData ?? []), ...nameData];
    const seen = new Set<string>();
    const deduped = combined.filter((t: { id: string }) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
    // Re-sort merged result
    (deduped as Array<{ transaction_date: string }>).sort(
      (a, b) => a.transaction_date.localeCompare(b.transaction_date),
    );
    return deduped as Transaction[];
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
        expense: 'other',
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
        masraf_turu: input.masraf_turu || '',
        masraf_tutar: input.masraf_tutar || 0,
        masraf_currency: input.masraf_currency || 'USD',
        masraf_rate: input.masraf_rate || 1,
        masraf_usd: input.masraf_tutar > 0 ? toUSD(input.masraf_tutar, input.masraf_currency, input.masraf_rate) : 0,
        kasa_id: input.kasa_id || null,
        bank_account_id: input.bank_account_id || null,
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
        masraf_turu: input.masraf_turu || '',
        masraf_tutar: input.masraf_tutar || 0,
        masraf_currency: input.masraf_currency || 'USD',
        masraf_rate: input.masraf_rate || 1,
        masraf_usd: input.masraf_tutar > 0 ? toUSD(input.masraf_tutar, input.masraf_currency, input.masraf_rate) : 0,
        kasa_id: input.kasa_id || null,
        bank_account_id: input.bank_account_id || null,
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
      .select('transaction_type, party_type, amount_usd, doc_status')
      .neq('doc_status', 'rejected');

    const all = txns ?? [];

    const sum = (pred: (t: typeof all[0]) => boolean) =>
      all.filter(pred).reduce((s, t) => s + (t.amount_usd ?? 0), 0);

    // ALACAK: Müşteri net bakiyesi = satış faturası + müşteri avansı − tahsilat
    const saleInv     = sum(t => t.transaction_type === 'sale_inv');
    const custAdvance = sum(t => t.transaction_type === 'advance' && t.party_type === 'customer');
    const receipts    = sum(t => t.transaction_type === 'receipt');
    const totalReceivable = Math.max(0, saleInv + custAdvance - receipts);

    // BORÇ: Tedarikçi net bakiyesi = satın alma + hizmet + tedarikçi avansı − ödeme
    const purchInv    = sum(t => t.transaction_type === 'purchase_inv');
    const svcInv      = sum(t => t.transaction_type === 'svc_inv');
    const suppAdvance = sum(t => t.transaction_type === 'advance' && t.party_type === 'supplier');
    const payments    = sum(t => t.transaction_type === 'payment');
    const totalPayable = Math.max(0, purchInv + svcInv + suppAdvance - payments);

    // GELİR = Toplam satış fatura tutarı (tahakkuk esaslı)
    const totalRevenue = saleInv;

    // GİDERLER = Toplam alım + hizmet fatura tutarı (tahakkuk esaslı)
    const totalCost = purchInv + svcInv;

    return { totalReceivable, totalPayable, totalRevenue, totalCost };
  },
};
