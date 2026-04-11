import { supabase } from './supabase';
import type { DocStatus } from '@/types/database';

type ApprovableTable = 'invoices' | 'proformas' | 'packing_lists' | 'transactions';

export const approvalService = {
  async bulkSetStatus(
    table: ApprovableTable,
    ids: string[],
    status: DocStatus,
    userId?: string,
  ): Promise<void> {
    const payload: Record<string, unknown> = { doc_status: status };
    if (status === 'approved' && userId) {
      payload.approved_by = userId;
      payload.approved_at = new Date().toISOString();
    } else if (status === 'draft' || status === 'rejected') {
      payload.approved_by = null;
      payload.approved_at = null;
    }
    const { error } = await supabase.from(table).update(payload).in('id', ids);
    if (error) throw new Error(error.message);
  },

  async setStatus(
    table: ApprovableTable,
    id: string,
    status: DocStatus,
    userId?: string,
  ): Promise<void> {
    const payload: Record<string, unknown> = { doc_status: status };
    if (status === 'approved' && userId) {
      payload.approved_by = userId;
      payload.approved_at = new Date().toISOString();
    } else if (status === 'draft' || status === 'rejected') {
      payload.approved_by = null;
      payload.approved_at = null;
    }
    const { error } = await supabase.from(table).update(payload).eq('id', id);
    if (error) throw new Error(error.message);
  },
};
