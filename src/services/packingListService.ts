import { supabase } from './supabase';
import type { PackingList, PackingListItem } from '@/types/database';
import type { PackingListFormData } from '@/types/forms';

const PL_SELECT = `
  *,
  trade_file:trade_files!trade_file_id(file_no, status),
  customer:customers!customer_id(*),
  consignee:customers!consignee_customer_id(*),
  packing_list_items(*)
`;

export const packingListService = {
  async list(): Promise<PackingList[]> {
    const { data, error } = await supabase
      .from('packing_lists')
      .select(PL_SELECT)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []) as PackingList[];
  },

  async listByTradeFile(tradeFileId: string): Promise<PackingList[]> {
    const { data, error } = await supabase
      .from('packing_lists')
      .select(PL_SELECT)
      .eq('trade_file_id', tradeFileId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []) as PackingList[];
  },

  async getById(id: string): Promise<PackingList> {
    const { data, error } = await supabase
      .from('packing_lists')
      .select(PL_SELECT)
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return data as PackingList;
  },

  async create(
    tradeFileId: string,
    customerId: string,
    plNo: string,
    input: PackingListFormData,
    consigneeId?: string,
  ): Promise<PackingList> {
    const totalReels = input.items.reduce((s, r) => s + (r.reels ?? 0), 0);
    const totalAdmt = input.items.reduce((s, r) => s + (r.admt ?? 0), 0);
    const totalGross = input.items.reduce((s, r) => s + (r.gross_weight_kg ?? 0), 0);

    // Insert packing list
    const { data: pl, error: plErr } = await supabase
      .from('packing_lists')
      .insert({
        packing_list_no: plNo,
        trade_file_id: tradeFileId,
        customer_id: customerId,
        pl_date: input.pl_date,
        transport_mode: input.transport_mode,
        invoice_no: input.invoice_no || null,
        cb_no: input.cb_no || null,
        insurance_no: input.insurance_no || null,
        description: input.description || null,
        comments: input.comments || null,
        total_reels: totalReels,
        total_admt: totalAdmt,
        total_gross_kg: totalGross,
        consignee_customer_id: consigneeId || null,
      })
      .select()
      .single();

    if (plErr) throw new Error(plErr.message);

    // Insert items
    const items: Omit<PackingListItem, 'id'>[] = input.items.map((item, i) => ({
      packing_list_id: pl.id,
      item_order: i + 1,
      vehicle_plate: item.vehicle_plate ?? '',
      reels: item.reels ?? 0,
      admt: item.admt ?? 0,
      gross_weight_kg: item.gross_weight_kg ?? 0,
    }));

    if (items.length > 0) {
      const { error: itemErr } = await supabase
        .from('packing_list_items')
        .insert(items);

      if (itemErr) throw new Error(itemErr.message);
    }

    return pl as PackingList;
  },

  async update(id: string, input: PackingListFormData, consigneeId?: string): Promise<PackingList> {
    const totalReels = input.items.reduce((s, r) => s + (r.reels ?? 0), 0);
    const totalAdmt = input.items.reduce((s, r) => s + (r.admt ?? 0), 0);
    const totalGross = input.items.reduce((s, r) => s + (r.gross_weight_kg ?? 0), 0);

    // Update parent
    const { data: pl, error: plErr } = await supabase
      .from('packing_lists')
      .update({
        pl_date: input.pl_date,
        transport_mode: input.transport_mode,
        invoice_no: input.invoice_no || null,
        cb_no: input.cb_no || null,
        insurance_no: input.insurance_no || null,
        description: input.description || null,
        comments: input.comments || null,
        total_reels: totalReels,
        total_admt: totalAdmt,
        total_gross_kg: totalGross,
        consignee_customer_id: consigneeId || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (plErr) throw new Error(plErr.message);

    // Replace items: delete all existing, insert new
    const { error: delErr } = await supabase
      .from('packing_list_items')
      .delete()
      .eq('packing_list_id', id);

    if (delErr) throw new Error(delErr.message);

    const items = input.items.map((item, i) => ({
      packing_list_id: id,
      item_order: i + 1,
      vehicle_plate: item.vehicle_plate ?? '',
      reels: item.reels ?? 0,
      admt: item.admt ?? 0,
      gross_weight_kg: item.gross_weight_kg ?? 0,
    }));

    if (items.length > 0) {
      const { error: itemErr } = await supabase
        .from('packing_list_items')
        .insert(items);

      if (itemErr) throw new Error(itemErr.message);
    }

    return pl as PackingList;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('packing_lists')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  },
};
