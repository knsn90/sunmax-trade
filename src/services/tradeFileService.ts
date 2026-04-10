import { supabase } from './supabase';
import type { TradeFile } from '@/types/database';
import type { TradeFileStatus } from '@/types/enums';
import type {
  NewTradeFileFormData,
  SaleConversionFormData,
  DeliveryFormData,
} from '@/types/forms';

// Used for list queries — joins resolved by PostgREST
const FILE_SELECT = `
  *,
  customer:customers!customer_id(*, parent:customers!parent_customer_id(id, name, code, country, address, contact_phone)),
  product:products!product_id(*),
  supplier:suppliers!supplier_id(*),
  creator:profiles!created_by(id,full_name)
`;

// Used for detail page — includes sub-documents + batches
const FILE_DETAIL_SELECT = `
  *,
  customer:customers!customer_id(*, parent:customers!parent_customer_id(id, name, code, country, address, contact_phone)),
  product:products!product_id(*),
  supplier:suppliers!supplier_id(*),
  invoices(*),
  packing_lists(*, packing_list_items(*)),
  proformas(*),
  batches:trade_files!parent_file_id(id, file_no, batch_no, status, tonnage_mt, transport_mode, eta)
`;

// Minimal select for mutations — no joins, avoids Supabase load
const MUTATION_SELECT = 'id, file_no, status';

export const tradeFileService = {
  async list(filters?: {
    status?: TradeFileStatus;
    customerId?: string;
    search?: string;
  }): Promise<TradeFile[]> {
    let query = supabase
      .from('trade_files')
      .select(FILE_SELECT)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.customerId) {
      query = query.eq('customer_id', filters.customerId);
    }
    if (filters?.search) {
      query = query.or(
        `file_no.ilike.%${filters.search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as TradeFile[];
  },

  async getById(id: string): Promise<TradeFile> {
    const { data, error } = await supabase
      .from('trade_files')
      .select(FILE_DETAIL_SELECT)
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return data as TradeFile;
  },

  async create(
    input: NewTradeFileFormData & {
      file_no: string;
      parent_file_id?: string | null;
      batch_no?: number | null;
    },
  ): Promise<TradeFile> {
    const { data, error } = await supabase
      .from('trade_files')
      .insert({
        file_no: input.file_no,
        file_date: input.file_date,
        customer_id: input.customer_id,
        product_id: input.product_id,
        tonnage_mt: input.tonnage_mt,
        customer_ref: input.customer_ref,
        notes: input.notes,
        eta: input.eta || null,
        status: 'request' as TradeFileStatus,
        parent_file_id: input.parent_file_id ?? null,
        batch_no: input.batch_no ?? null,
      })
      .select(MUTATION_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as TradeFile;
  },

  async convertToSale(
    id: string,
    input: SaleConversionFormData,
  ): Promise<TradeFile> {
    const { data, error } = await supabase
      .from('trade_files')
      .update({
        status: 'sale' as TradeFileStatus,
        supplier_id: input.supplier_id,
        selling_price: input.selling_price,
        purchase_price: input.purchase_price,
        freight_cost: input.freight_cost,
        port_of_loading: input.port_of_loading,
        port_of_discharge: input.port_of_discharge,
        incoterms: input.incoterms,
        currency: input.sale_currency,         // backward compat
        purchase_currency: input.purchase_currency,
        sale_currency: input.sale_currency,
        payment_terms: input.payment_terms,
        advance_rate: input.advance_rate,
        purchase_advance_rate: input.purchase_advance_rate ?? 0,
        transport_mode: input.transport_mode,
        eta: input.eta || null,
        vessel_name: input.vessel_name || null,
        proforma_ref: input.proforma_ref || null,
        register_no: input.register_no || null,
      })
      .eq('id', id)
      .eq('status', 'request')
      .select(MUTATION_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as TradeFile;
  },

  async convertToDelivery(
    id: string,
    input: DeliveryFormData,
  ): Promise<TradeFile> {
    const { data, error } = await supabase
      .from('trade_files')
      .update({
        status: 'delivery' as TradeFileStatus,
        delivered_admt: input.delivered_admt,
        gross_weight_kg: input.gross_weight_kg,
        packages: input.packages,
        arrival_date: input.arrival_date || null,
        bl_number: input.bl_number || null,
        septi_ref: input.septi_ref || null,
        insurance_tr: input.insurance_tr || null,
        insurance_ir: input.insurance_ir || null,
      })
      .eq('id', id)
      .select(MUTATION_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as TradeFile;
  },

  async updatePnl(
    id: string,
    pnlData: TradeFile['pnl_data'],
  ): Promise<void> {
    const { error } = await supabase
      .from('trade_files')
      .update({ pnl_data: pnlData })
      .eq('id', id);

    if (error) throw new Error(error.message);
  },

  async delete(id: string): Promise<void> {
    // CASCADE on trade_files handles dependent rows automatically (migration 028+).
    const { error } = await supabase
      .from('trade_files')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  },

  async noteDelay(id: string, data: { revised_eta: string; delay_notes?: string }): Promise<void> {
    const { error } = await supabase
      .from('trade_files')
      .update({ revised_eta: data.revised_eta, delay_notes: data.delay_notes ?? null })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async countByCustomer(customerId: string): Promise<number> {
    const { count, error } = await supabase
      .from('trade_files')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId);
    if (error) throw new Error(error.message);
    return count ?? 0;
  },

  async updateFileNo(id: string, fileNo: string): Promise<void> {
    const { error } = await supabase
      .from('trade_files')
      .update({ file_no: fileNo })
      .eq('id', id);
    if (error) throw error;
  },

  async countByCustomerPrefix(prefix: string): Promise<number> {
    const { count, error } = await supabase
      .from('trade_files')
      .select('*', { count: 'exact', head: true })
      .like('file_no', `%${prefix}%`);

    if (error) throw new Error(error.message);
    return count ?? 0;
  },

  async updateSaleDetails(
    id: string,
    input: SaleConversionFormData,
  ): Promise<TradeFile> {
    const { data, error } = await supabase
      .from('trade_files')
      .update({
        supplier_id: input.supplier_id,
        selling_price: input.selling_price,
        purchase_price: input.purchase_price,
        freight_cost: input.freight_cost,
        port_of_loading: input.port_of_loading,
        port_of_discharge: input.port_of_discharge,
        incoterms: input.incoterms,
        currency: input.sale_currency,         // backward compat
        purchase_currency: input.purchase_currency,
        sale_currency: input.sale_currency,
        payment_terms: input.payment_terms,
        advance_rate: input.advance_rate,
        purchase_advance_rate: input.purchase_advance_rate ?? 0,
        transport_mode: input.transport_mode,
        eta: input.eta || null,
        vessel_name: input.vessel_name || null,
        proforma_ref: input.proforma_ref || null,
        register_no: input.register_no || null,
      })
      .eq('id', id)
      .select(MUTATION_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as TradeFile;
  },

  async updateFileInfo(id: string, input: NewTradeFileFormData): Promise<TradeFile> {
    const { data, error } = await supabase
      .from('trade_files')
      .update({
        file_date: input.file_date,
        customer_id: input.customer_id,
        product_id: input.product_id,
        tonnage_mt: input.tonnage_mt,
        customer_ref: input.customer_ref,
        notes: input.notes,
      })
      .eq('id', id)
      .select(MUTATION_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as TradeFile;
  },

  async changeStatus(id: string, newStatus: TradeFileStatus, cancelReason?: string): Promise<TradeFile> {
    const patch: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'cancelled' && cancelReason !== undefined) {
      patch.cancel_reason = cancelReason || null;
    }
    const { data, error } = await supabase
      .from('trade_files')
      .update(patch)
      .eq('id', id)
      .select(MUTATION_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as TradeFile;
  },
};
