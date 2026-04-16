import { supabase } from './supabase';
import type { TradeFileAttachment } from '@/types/database';

export const tradeFileAttachmentsService = {
  async list(tradeFileId: string): Promise<TradeFileAttachment[]> {
    const { data, error } = await supabase
      .from('trade_file_attachments')
      .select('*')
      .eq('trade_file_id', tradeFileId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    if (data === null) throw new Error('Request aborted or timed out — please refresh');
    return data as TradeFileAttachment[];
  },

  async create(attachment: {
    trade_file_id: string;
    name: string;
    file_type: string | null;
    file_size_bytes: number | null;
    dropbox_url: string | null;
    dropbox_path: string | null;
  }): Promise<TradeFileAttachment> {
    const { data, error } = await supabase
      .from('trade_file_attachments')
      .insert(attachment)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as TradeFileAttachment;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('trade_file_attachments').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
