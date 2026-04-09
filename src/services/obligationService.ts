import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TradeObligation {
  id: string;
  trade_file_id: string;
  party: 'customer' | 'supplier';
  customer_id?: string | null;
  supplier_id?: string | null;
  type: 'advance' | 'final' | 'adjustment';
  amount: number;
  currency: string;
  paid_amount: number;
  balance: number;
  status: 'pending' | 'partial' | 'settled' | 'cancelled';
  due_date?: string | null;
  notes?: string;
  created_at: string;
}

export interface ObligationPayment {
  id: string;
  payment_date: string;
  direction: 'inbound' | 'outbound';
  customer_id?: string | null;
  supplier_id?: string | null;
  amount: number;
  currency: string;
  exchange_rate: number;
  amount_usd: number;
  unallocated_amount: number;
  status: 'open' | 'partial' | 'paid';
  reference_no?: string;
  payment_method?: string;
  notes?: string;
}

export interface RecordPaymentInput {
  obligation_id: string;
  party: 'customer' | 'supplier';
  customer_id?: string | null;
  supplier_id?: string | null;
  amount: number;
  currency: string;
  payment_date: string;
  reference_no?: string;
  notes?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const obligationService = {
  /** Fetch all obligations for a trade file */
  async getByTradeFile(tradeFileId: string): Promise<TradeObligation[]> {
    const { data, error } = await supabase
      .from('trade_obligations')
      .select('*')
      .eq('trade_file_id', tradeFileId)
      .order('created_at');
    if (error) throw new Error(error.message);
    return (data ?? []) as TradeObligation[];
  },

  /**
   * Record a payment and immediately allocate it fully to the given obligation.
   * Steps:
   *   1. Insert into `payments`  (trigger sets unallocated_amount)
   *   2. Insert into `payment_allocations`  (triggers sync obligation.paid_amount + payment.unallocated_amount)
   * NOTE: No journal entries created — accounting is managed independently.
   */
  async recordPayment(input: RecordPaymentInput): Promise<void> {
    const direction = input.party === 'customer' ? 'inbound' : 'outbound';
    const amount_usd = input.amount; // assume 1:1 for now (same currency)

    // Step 1: create payment
    const { data: pay, error: payErr } = await supabase
      .from('payments')
      .insert({
        payment_date: input.payment_date,
        direction,
        customer_id: input.customer_id ?? null,
        supplier_id: input.supplier_id ?? null,
        amount: input.amount,
        currency: input.currency,
        exchange_rate: 1,
        amount_usd,
        unallocated_amount: input.amount,
        reference_no: input.reference_no ?? '',
        notes: input.notes ?? '',
      })
      .select('id')
      .single();
    if (payErr) throw new Error(payErr.message);

    // Step 2: allocate
    const { error: allocErr } = await supabase
      .from('payment_allocations')
      .insert({
        payment_id: pay.id,
        obligation_id: input.obligation_id,
        amount: input.amount,
      });
    if (allocErr) throw new Error(allocErr.message);
  },
};
