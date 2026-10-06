import { supabase } from './supabase';
import type { PackingList, PackingListItem } from '@/types/database';
import type { PackingListFormData } from '@/types/forms';
import { nextAvailableDocNo } from '@/lib/generators';
import { transportService } from './transportService';

const PL_SELECT = `
  *,
  trade_file:trade_files!trade_file_id(file_no, status, delivered_admt, tonnage_mt),
  customer:customers!customer_id(*),
  consignee:customers!consignee_customer_id(*),
  packing_list_items(*)
`;

/**
 * Ambalaj listesi kaydedilince / güncellenince sipariş detayı (Tır Plakaları / Vagon tablosu ve dosya
 * alanları) otomatik güncellenir — bilgiler birbirine bağlı, iki yerde ayrı girmek gerekmez.
 *  - Araç satırları: plaka listede varsa kap/ADMT/brüt güncellenir, yoksa eklenir (silme yapılmaz).
 *    Plakası boş satırlar atlanır (plaka tablosunda plaka zorunlu).
 *  - Dosya: yükleme türü + sayım/miktar birimi her zaman; CB No (SEPTİ), sigorta, brüt, paket yalnızca boşsa.
 * Hata kaydı engellemez (sadece uyarı) — ambalaj listesi zaten kaydedildi.
 */
async function syncCardFromPackingList(tradeFileId: string | null | undefined, input: PackingListFormData): Promise<void> {
  if (!tradeFileId) return;
  try {
    const rows = input.items
      .map(r => ({
        plate: (r.vehicle_plate ?? '').trim().replace(/\s+/g, ' ').toUpperCase(),
        reels: Math.max(0, Math.round(r.reels ?? 0)),
        admt: Math.max(0, r.admt ?? 0),
        gross: Math.max(0, r.gross_weight_kg ?? 0),
      }))
      .filter(r => r.plate);

    if (rows.length > 0) {
      const plan = await transportService.upsertPlan(tradeFileId, {});
      const existing = new Map((plan.transport_plates ?? []).map(p => [p.plate_no.toUpperCase(), p]));
      const next = Math.max(-1, ...(plan.transport_plates ?? []).map(p => p.sort_order ?? 0)) + 1;
      const fresh: { plate_no: string; reels: number; admt: number; gross_weight_kg: number }[] = [];
      for (const r of rows) {
        const ex = existing.get(r.plate);
        if (ex) await transportService.updatePlate(ex.id, { reels: r.reels, admt: r.admt, gross_weight_kg: r.gross });
        else fresh.push({ plate_no: r.plate, reels: r.reels, admt: r.admt, gross_weight_kg: r.gross });
      }
      if (fresh.length) await transportService.addPlates(plan.id, fresh, next);
    }

    const { data: f } = await supabase
      .from('trade_files')
      .select('septi_ref, insurance_tr, insurance_ir, gross_weight_kg, packages')
      .eq('id', tradeFileId)
      .single();
    const totalReels = input.items.reduce((s, r) => s + (r.reels ?? 0), 0);
    const totalGross = input.items.reduce((s, r) => s + (r.gross_weight_kg ?? 0), 0);
    const patch: Record<string, unknown> = {
      transport_mode: input.transport_mode,
      count_unit: input.unit_label,
      qty_unit: input.qty_unit,
    };
    if (!f?.septi_ref && input.cb_no) patch.septi_ref = input.cb_no;
    if (!f?.insurance_tr && !f?.insurance_ir && input.insurance_no) patch.insurance_tr = input.insurance_no;
    if (!(Number(f?.gross_weight_kg) > 0) && totalGross > 0) patch.gross_weight_kg = totalGross;
    if (!(Number(f?.packages) > 0) && totalReels > 0) patch.packages = totalReels;
    const { error } = await supabase.from('trade_files').update(patch).eq('id', tradeFileId);
    if (error) throw new Error(error.message);
  } catch (e) {
    console.warn('Ambalaj listesi → sipariş detayı senkronu başarısız:', e);
  }
}

export const packingListService = {
  async list(): Promise<PackingList[]> {
    const { data, error } = await supabase
      .from('packing_lists')
      .select(PL_SELECT)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('item_order', { referencedTable: 'packing_list_items', ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as PackingList[];
  },

  async listByTradeFile(tradeFileId: string): Promise<PackingList[]> {
    const { data, error } = await supabase
      .from('packing_lists')
      .select(PL_SELECT)
      .eq('trade_file_id', tradeFileId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('item_order', { referencedTable: 'packing_list_items', ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []) as PackingList[];
  },

  async getById(id: string): Promise<PackingList> {
    const { data, error } = await supabase
      .from('packing_lists')
      .select(PL_SELECT)
      .eq('id', id)
      .order('item_order', { referencedTable: 'packing_list_items', ascending: true })
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
        bill_to: input.bill_to || null,
        ship_to: input.ship_to || null,
        unit_label: input.unit_label ?? 'Reels',
        qty_unit: input.qty_unit ?? 'ADMT',
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

    await syncCardFromPackingList(tradeFileId, input);
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
        bill_to: input.bill_to || null,
        ship_to: input.ship_to || null,
        unit_label: input.unit_label ?? 'Reels',
        qty_unit: input.qty_unit ?? 'ADMT',
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

    await syncCardFromPackingList((pl as PackingList).trade_file_id, input);
    return pl as PackingList;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('packing_lists')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async restore(id: string): Promise<void> {
    const { error } = await supabase
      .from('packing_lists')
      .update({ deleted_at: null })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async hardDelete(id: string): Promise<void> {
    const { error } = await supabase
      .from('packing_lists')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async listDeleted(): Promise<PackingList[]> {
    const { data, error } = await supabase
      .from('packing_lists')
      .select(PL_SELECT)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as PackingList[];
  },

  /** Generate a unique PL number — checks globally by LIKE pattern to avoid collisions on batch files */
  async generateUniquePLNo(_tradeFileId: string, baseNo: string): Promise<string> {
    // deleted_at filtresi YOK: unique constraint çöp kutusundaki PL numaralarını da
    // kapsar; onları hesaba katmazsak silinen bir numara yeniden üretilip
    // "duplicate key ... packing_list_no_key" hatası verir.
    const { data } = await supabase
      .from('packing_lists')
      .select('packing_list_no')
      .like('packing_list_no', `${baseNo}%`);
    return nextAvailableDocNo((data ?? []).map(r => r.packing_list_no as string), baseNo);
  },

  /** Update only the packing list number */
  async updateNo(id: string, newNo: string): Promise<void> {
    const { error } = await supabase
      .from('packing_lists')
      .update({ packing_list_no: newNo })
      .eq('id', id);

    if (error) throw new Error(error.message);
  },
};
