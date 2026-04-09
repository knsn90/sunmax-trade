import { supabase } from './supabase';

export interface PostAdvanceInput {
  tradeFileId: string;
  fileNo: string;
  customerId: string;
  customerName: string;
  amount: number;
  currency: string;
  advanceRate: number;
}

export interface PostAdvancePayableInput {
  tradeFileId: string;
  fileNo: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  currency: string;
  advanceRate: number;
}

export const journalService = {
  /**
   * Returns true when an advance (customer) transaction already exists for this trade file.
   * Used to prevent duplicate accounting entries.
   */
  async advanceAlreadyPosted(tradeFileId: string): Promise<boolean> {
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('trade_file_id', tradeFileId)
      .eq('transaction_type', 'advance')
      .eq('party_type', 'customer');
    return (count ?? 0) > 0;
  },

  /**
   * Post advance receivable to the transactions table (cari hesap).
   * Idempotent: skips if already posted for this trade file.
   */
  async postAdvanceReceivable(input: PostAdvanceInput): Promise<void> {
    // Guard: skip if already posted for this trade file
    const alreadyPosted = await journalService.advanceAlreadyPosted(input.tradeFileId);
    if (alreadyPosted) return;

    const desc = `Ön Ödeme Alacak — ${input.fileNo} %${input.advanceRate} (${input.customerName})`;

    const { error } = await supabase.from('transactions').insert({
      transaction_date: new Date().toISOString().slice(0, 10),
      transaction_type: 'advance',
      trade_file_id:    input.tradeFileId,
      party_type:       'customer',
      customer_id:      input.customerId,
      supplier_id:      null,
      service_provider_id: null,
      party_name:       input.customerName,
      description:      desc,
      reference_no:     input.fileNo,
      currency:         input.currency,
      amount:           input.amount,
      exchange_rate:    1,
      amount_usd:       input.amount,
      paid_amount:      0,
      paid_amount_usd:  0,
      payment_status:   'open',
      doc_status:       'draft',
      notes:            `Ön Ödeme %${input.advanceRate}`,
    });

    if (error) throw new Error(error.message);
  },

  /** Returns true when an advance (supplier) transaction already exists for this trade file. */
  async supplierAdvanceAlreadyPosted(tradeFileId: string): Promise<boolean> {
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('trade_file_id', tradeFileId)
      .eq('transaction_type', 'advance')
      .eq('party_type', 'supplier');
    return (count ?? 0) > 0;
  },

  /**
   * Post supplier advance payable to the transactions table (cari hesap).
   * Creates a purchase_inv transaction representing money we owe the supplier.
   * Idempotent: skips if already posted for this trade file.
   */
  async postAdvancePayable(input: PostAdvancePayableInput): Promise<void> {
    const alreadyPosted = await journalService.supplierAdvanceAlreadyPosted(input.tradeFileId);
    if (alreadyPosted) return;

    const desc = `Satıcı Ön Ödeme Borç — ${input.fileNo} %${input.advanceRate} (${input.supplierName})`;

    const { error } = await supabase.from('transactions').insert({
      transaction_date:    new Date().toISOString().slice(0, 10),
      transaction_type:    'advance',
      trade_file_id:       input.tradeFileId,
      party_type:          'supplier',
      customer_id:         null,
      supplier_id:         input.supplierId,
      service_provider_id: null,
      party_name:          input.supplierName,
      description:         desc,
      reference_no:        input.fileNo,
      currency:            input.currency,
      amount:              input.amount,
      exchange_rate:       1,
      amount_usd:          input.amount,
      paid_amount:         0,
      paid_amount_usd:     0,
      payment_status:      'open',
      doc_status:          'draft',
      notes:               `Satıcı Ön Ödeme %${input.advanceRate}`,
    });

    if (error) throw new Error(error.message);
  },
};
