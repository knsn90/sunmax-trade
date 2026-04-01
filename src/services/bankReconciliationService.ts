import { supabase } from './supabase';
import type { BankTransaction, ReconciliationMatch } from '@/types/database';

export const bankReconciliationService = {
  async listBankTransactions(status?: string): Promise<BankTransaction[]> {
    let q = supabase
      .from('bank_transactions')
      .select('*, bank_account:bank_accounts(bank_name, account_name)')
      .order('txn_date', { ascending: false });

    if (status) q = q.eq('status', status);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as BankTransaction[];
  },

  async createBankTransaction(payload: {
    bank_account_id: string;
    txn_date: string;
    description: string;
    amount: number;
    currency: string;
    reference?: string;
    notes?: string;
  }): Promise<BankTransaction> {
    const { data, error } = await supabase
      .from('bank_transactions')
      .insert(payload)
      .select('*, bank_account:bank_accounts(bank_name, account_name)')
      .single();
    if (error) throw new Error(error.message);
    return data as BankTransaction;
  },

  async updateStatus(id: string, status: 'unmatched' | 'excluded'): Promise<void> {
    const { error } = await supabase
      .from('bank_transactions')
      .update({ status })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async createMatch(payload: {
    bank_transaction_id: string;
    transaction_id: string;
    difference_amount?: number;
    notes?: string;
  }): Promise<ReconciliationMatch> {
    const { data, error } = await supabase
      .from('reconciliation_matches')
      .insert({
        ...payload,
        difference_amount: payload.difference_amount ?? 0,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ReconciliationMatch;
  },

  async deleteMatch(id: string): Promise<void> {
    const { error } = await supabase
      .from('reconciliation_matches')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async getSummary(): Promise<{
    total: number; matched: number; unmatched: number; excluded: number;
  }> {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('status');
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    return {
      total:     rows.length,
      matched:   rows.filter(r => r.status === 'matched').length,
      unmatched: rows.filter(r => r.status === 'unmatched').length,
      excluded:  rows.filter(r => r.status === 'excluded').length,
    };
  },
};
