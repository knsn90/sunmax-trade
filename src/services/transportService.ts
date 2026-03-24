import { supabase } from './supabase';

export interface TransportPlan {
  id: string;
  trade_file_id: string;
  loading_date: string | null;
  freight_company: string;
  notes: string;
  customs_approval: boolean;
  tir_carnet: boolean;
  t1_document: boolean;
  created_at: string;
  updated_at: string;
  transport_plates: TransportPlate[];
  transport_notifications: TransportNotification[];
}

export interface TransportPlate {
  id: string;
  transport_plan_id: string;
  plate_no: string;
  driver_name: string;
  plate_status: 'active' | 'cancelled' | 'changed';
  replacement_plate: string;
  cancel_reason: string;
  sort_order: number;
  notified_groups: string[];
  created_at: string;
}

export interface TransportNotification {
  id: string;
  transport_plan_id: string;
  target_group: 'customs' | 'warehouse' | 'port' | 'company';
  notification_text: string;
  send_status: 'pending' | 'sent' | 'resent';
  sent_at: string | null;
  sent_by: string | null;
}

const PLAN_SELECT = `*, transport_plates(*), transport_notifications(*)`;

export const transportService = {
  async getPlanByFile(tradeFileId: string): Promise<TransportPlan | null> {
    const { data, error } = await supabase
      .from('transport_plans')
      .select(PLAN_SELECT)
      .eq('trade_file_id', tradeFileId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as TransportPlan | null;
  },

  async upsertPlan(tradeFileId: string, values: {
    loading_date?: string | null;
    freight_company?: string;
    notes?: string;
  }): Promise<TransportPlan> {
    const { data, error } = await supabase
      .from('transport_plans')
      .upsert({ trade_file_id: tradeFileId, ...values }, { onConflict: 'trade_file_id' })
      .select(PLAN_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return data as TransportPlan;
  },

  async updateChecklist(planId: string, flags: {
    customs_approval?: boolean;
    tir_carnet?: boolean;
    t1_document?: boolean;
  }): Promise<void> {
    const { error } = await supabase
      .from('transport_plans')
      .update(flags)
      .eq('id', planId);
    if (error) throw new Error(error.message);
  },

  // ── Plates ──────────────────────────────────────────────────────────────
  async addPlates(planId: string, plateNos: string[]): Promise<void> {
    const rows = plateNos.map((plate_no, i) => ({
      transport_plan_id: planId,
      plate_no,
      sort_order: i,
    }));
    const { error } = await supabase.from('transport_plates').insert(rows);
    if (error) throw new Error(error.message);
  },

  async updatePlate(id: string, values: Partial<TransportPlate>): Promise<void> {
    const { error } = await supabase
      .from('transport_plates')
      .update(values)
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async deletePlate(id: string): Promise<void> {
    const { error } = await supabase.from('transport_plates').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Notifications ────────────────────────────────────────────────────────
  async upsertNotification(planId: string, targetGroup: string, text: string): Promise<void> {
    const { error } = await supabase
      .from('transport_notifications')
      .upsert(
        { transport_plan_id: planId, target_group: targetGroup, notification_text: text },
        { onConflict: 'transport_plan_id,target_group' }
      );
    if (error) throw new Error(error.message);
  },

  async markSent(planId: string, targetGroup: string, userId: string): Promise<void> {
    const { data: existing } = await supabase
      .from('transport_notifications')
      .select('send_status')
      .eq('transport_plan_id', planId)
      .eq('target_group', targetGroup)
      .maybeSingle();

    const send_status = existing?.send_status === 'sent' ? 'resent' : 'sent';
    const { error } = await supabase
      .from('transport_notifications')
      .upsert({
        transport_plan_id: planId,
        target_group: targetGroup,
        notification_text: '',
        send_status,
        sent_at: new Date().toISOString(),
        sent_by: userId,
      }, { onConflict: 'transport_plan_id,target_group' });
    if (error) throw new Error(error.message);
  },
};
