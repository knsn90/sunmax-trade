import { supabase } from './supabase';
import type { JournalEntry } from '@/types/database';

export const journalService = {
  async list(filters?: { status?: string; dateFrom?: string; dateTo?: string }): Promise<JournalEntry[]> {
    let q = supabase
      .from('journal_entries')
      .select(`
        *,
        lines:journal_lines(
          *,
          account:accounts(code, name)
        )
      `)
      .order('entry_date', { ascending: false })
      .order('entry_no', { ascending: false });

    if (filters?.status) q = q.eq('status', filters.status);
    if (filters?.dateFrom) q = q.gte('entry_date', filters.dateFrom);
    if (filters?.dateTo)   q = q.lte('entry_date', filters.dateTo);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as JournalEntry[];
  },
};
