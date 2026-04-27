import { supabase } from './supabase';
import type { AccountTransfer } from '@/types/database';

export interface TransferInput {
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
}

export const transferService = {
  async list(): Promise<AccountTransfer[]> {
    const { data, error } = await supabase
      .from('account_transfers')
      .select('*')
      .is('deleted_at', null)
      .order('transfer_date', { ascending: false });
    if (error) throw new Error(error.message);
    if (data === null) throw new Error('Request aborted or timed out — please refresh');
    return data as AccountTransfer[];
  },

  async create(input: TransferInput): Promise<AccountTransfer> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('account_transfers')
      .insert({ ...input, created_by: user?.id ?? null })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as AccountTransfer;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('account_transfers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async restore(id: string): Promise<void> {
    const { error } = await supabase
      .from('account_transfers')
      .update({ deleted_at: null })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async hardDelete(id: string): Promise<void> {
    const { error } = await supabase
      .from('account_transfers')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async listDeleted(): Promise<AccountTransfer[]> {
    const { data, error } = await supabase
      .from('account_transfers')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as AccountTransfer[];
  },
};
