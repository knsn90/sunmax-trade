import { supabase } from './supabase';
import type { TradeFileNote } from '@/types/database';

export const tradeFileNotesService = {
  async list(tradeFileId: string): Promise<TradeFileNote[]> {
    const { data, error } = await supabase
      .from('trade_file_notes')
      .select('*')
      .eq('trade_file_id', tradeFileId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as TradeFileNote[];
  },

  async create(tradeFileId: string, content: string): Promise<TradeFileNote> {
    const { data, error } = await supabase
      .from('trade_file_notes')
      .insert({ trade_file_id: tradeFileId, content })
      .select('id, trade_file_id, content, created_by, created_at')
      .single();
    if (error) throw new Error(error.message);
    return data as TradeFileNote;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('trade_file_notes').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
