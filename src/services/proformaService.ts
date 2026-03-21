import { supabase } from './supabase';
import type { Proforma } from '@/types/database';
import type { ProformaFormData } from '@/types/forms';

const PI_SELECT = `
  *,
  trade_file:trade_files!trade_file_id(file_no, status, customer:customers!customer_id(*), product:products!product_id(*))
`;

export const proformaService = {
  async list(): Promise<Proforma[]> {
    const { data, error } = await supabase
      .from('proformas')
      .select(PI_SELECT)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []) as Proforma[];
  },

  async listByTradeFile(tradeFileId: string): Promise<Proforma[]> {
    const { data, error } = await supabase
      .from('proformas')
      .select(PI_SELECT)
      .eq('trade_file_id', tradeFileId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []) as Proforma[];
  },

  async getById(id: string): Promise<Proforma> {
    const { data, error } = await supabase
      .from('proformas')
      .select(PI_SELECT)
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return data as Proforma;
  },

  async create(
    tradeFileId: string,
    proformaNo: string,
    input: ProformaFormData,
  ): Promise<Proforma> {
    const subtotal = input.quantity_admt * input.unit_price;
    const total = subtotal + (input.freight ?? 0) - (input.discount ?? 0) + (input.other_charges ?? 0);

    const { data, error } = await supabase
      .from('proformas')
      .insert({
        proforma_no: proformaNo,
        trade_file_id: tradeFileId,
        proforma_date: input.proforma_date,
        validity_date: input.validity_date || null,
        buyer_commercial_id: input.buyer_commercial_id,
        country_of_origin: input.country_of_origin,
        port_of_loading: input.port_of_loading,
        port_of_discharge: input.port_of_discharge,
        final_delivery: input.final_delivery,
        incoterms: input.incoterms,
        payment_terms: input.payment_terms,
        transport_mode: input.transport_mode,
        currency: input.currency,
        place_of_payment: input.place_of_payment,
        description: input.description,
        hs_code: input.hs_code,
        partial_shipment: input.partial_shipment,
        insurance: input.insurance,
        net_weight_kg: input.net_weight_kg ?? null,
        gross_weight_kg: input.gross_weight_kg ?? null,
        quantity_admt: input.quantity_admt,
        unit_price: input.unit_price,
        freight: input.freight,
        discount: input.discount ?? null,
        other_charges: input.other_charges ?? null,
        subtotal,
        total,
        signatory: input.signatory,
        notes: input.notes,
      })
      .select(PI_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as Proforma;
  },

  async update(id: string, input: ProformaFormData): Promise<Proforma> {
    const subtotal = input.quantity_admt * input.unit_price;
    const total = subtotal + (input.freight ?? 0) - (input.discount ?? 0) + (input.other_charges ?? 0);

    const { data, error } = await supabase
      .from('proformas')
      .update({
        proforma_date: input.proforma_date,
        validity_date: input.validity_date || null,
        buyer_commercial_id: input.buyer_commercial_id,
        country_of_origin: input.country_of_origin,
        port_of_loading: input.port_of_loading,
        port_of_discharge: input.port_of_discharge,
        final_delivery: input.final_delivery,
        incoterms: input.incoterms,
        payment_terms: input.payment_terms,
        transport_mode: input.transport_mode,
        currency: input.currency,
        place_of_payment: input.place_of_payment,
        description: input.description,
        hs_code: input.hs_code,
        partial_shipment: input.partial_shipment,
        insurance: input.insurance,
        net_weight_kg: input.net_weight_kg ?? null,
        gross_weight_kg: input.gross_weight_kg ?? null,
        quantity_admt: input.quantity_admt,
        unit_price: input.unit_price,
        freight: input.freight,
        discount: input.discount ?? null,
        other_charges: input.other_charges ?? null,
        subtotal,
        total,
        signatory: input.signatory,
        notes: input.notes,
      })
      .eq('id', id)
      .select(PI_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as Proforma;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('proformas')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  },
};
