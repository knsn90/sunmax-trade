import { supabase } from './supabase';
import type { Invoice } from '@/types/database';
import type { InvoiceFormData } from '@/types/forms';

const INVOICE_SELECT = `
  *,
  trade_file:trade_files!trade_file_id(file_no, status),
  customer:customers!customer_id(name, address, contact_email, country)
`;

export const invoiceService = {
  async list(): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select(INVOICE_SELECT)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []) as Invoice[];
  },

  async listByTradeFile(tradeFileId: string): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select(INVOICE_SELECT)
      .eq('trade_file_id', tradeFileId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []) as Invoice[];
  },

  async getById(id: string): Promise<Invoice> {
    const { data, error } = await supabase
      .from('invoices')
      .select(INVOICE_SELECT)
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return data as Invoice;
  },

  async create(
    tradeFileId: string,
    customerId: string,
    productName: string,
    invoiceNo: string,
    input: InvoiceFormData,
  ): Promise<Invoice> {
    const subtotal = input.quantity_admt * input.unit_price;
    const total = subtotal + (input.freight ?? 0);

    const { data, error } = await supabase
      .from('invoices')
      .insert({
        invoice_no: invoiceNo,
        trade_file_id: tradeFileId,
        customer_id: customerId,
        product_name: productName,
        invoice_date: input.invoice_date,
        currency: input.currency,
        incoterms: input.incoterms,
        proforma_no: input.proforma_no || null,
        cb_no: input.cb_no || null,
        insurance_no: input.insurance_no || null,
        quantity_admt: input.quantity_admt,
        unit_price: input.unit_price,
        freight: input.freight,
        subtotal,
        total,
        gross_weight_kg: input.gross_weight_kg ?? null,
        packing_info: input.packing_info || null,
        payment_terms: input.payment_terms || null,
      })
      .select(INVOICE_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as Invoice;
  },

  async update(id: string, input: InvoiceFormData): Promise<Invoice> {
    const subtotal = input.quantity_admt * input.unit_price;
    const total = subtotal + (input.freight ?? 0);

    const { data, error } = await supabase
      .from('invoices')
      .update({
        invoice_date: input.invoice_date,
        currency: input.currency,
        incoterms: input.incoterms,
        proforma_no: input.proforma_no || null,
        cb_no: input.cb_no || null,
        insurance_no: input.insurance_no || null,
        quantity_admt: input.quantity_admt,
        unit_price: input.unit_price,
        freight: input.freight,
        subtotal,
        total,
        gross_weight_kg: input.gross_weight_kg ?? null,
        packing_info: input.packing_info || null,
        payment_terms: input.payment_terms || null,
      })
      .eq('id', id)
      .select(INVOICE_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as Invoice;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  },

  async getNextNumber(): Promise<number> {
    const { data, error } = await supabase
      .rpc('nextval_invoice');

    if (error) throw new Error(error.message);
    return data as number;
  },
};
