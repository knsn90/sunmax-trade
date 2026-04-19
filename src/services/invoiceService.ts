import { supabase } from './supabase';
import type { Invoice } from '@/types/database';
import type { InvoiceFormData } from '@/types/forms';
import { today } from '@/lib/formatters';

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
    if (data === null) throw new Error('Request aborted or timed out — please refresh');
    return data as Invoice[];
  },

  async listByTradeFile(tradeFileId: string): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select(INVOICE_SELECT)
      .eq('trade_file_id', tradeFileId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    if (data === null) throw new Error('Request aborted or timed out — please refresh');
    return data as Invoice[];
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
    invoiceType: 'commercial' | 'sale' = 'commercial',
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
        invoice_type: invoiceType,
        bill_to: input.bill_to || null,
        ship_to: input.ship_to || null,
        qty_unit: input.qty_unit ?? 'ADMT',
      })
      .select(INVOICE_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as Invoice;
  },

  async upsertSaleInvoice(
    tradeFileId: string,
    customerId: string,
    productName: string,
    input: InvoiceFormData,
  ): Promise<Invoice> {
    const subtotal = input.quantity_admt * input.unit_price;
    const total = subtotal + (input.freight ?? 0);

    // Check if a sale invoice already exists for this trade file
    const { data: existing } = await supabase
      .from('invoices')
      .select('id, invoice_no')
      .eq('trade_file_id', tradeFileId)
      .eq('invoice_type', 'sale')
      .maybeSingle();

    let invoice: Invoice;

    if (existing?.id) {
      // Update existing sale invoice
      const { data, error } = await supabase
        .from('invoices')
        .update({
          invoice_date: input.invoice_date,
          currency: input.currency,
          incoterms: input.incoterms || null,
          quantity_admt: input.quantity_admt,
          unit_price: input.unit_price,
          freight: input.freight,
          subtotal,
          total,
          payment_terms: input.payment_terms || null,
          gross_weight_kg: input.gross_weight_kg ?? null,
          bill_to: input.bill_to || null,
          ship_to: input.ship_to || null,
          qty_unit: input.qty_unit ?? 'ADMT',
        })
        .eq('id', existing.id)
        .select(INVOICE_SELECT)
        .single();
      if (error) throw new Error(error.message);
      invoice = data as Invoice;
    } else {
      // Create new sale invoice
      const invNo = `SINV-${new Date().getFullYear()}-${String(Date.now() % 100000).padStart(5, '0')}`;
      invoice = await this.create(tradeFileId, customerId, productName, invNo, input, 'sale');
    }

    // Sync transaction: customer receivable
    await this.syncSaleInvoiceTransaction(invoice, customerId, tradeFileId);
    return invoice;
  },

  async syncSaleInvoiceTransaction(invoice: Invoice, customerId: string, tradeFileId: string): Promise<void> {
    // Use the already-calculated total from the invoice record directly
    const total = invoice.total;

    // Find existing sale_inv transaction for this trade file
    const { data: existingTxn } = await supabase
      .from('transactions')
      .select('id')
      .eq('trade_file_id', tradeFileId)
      .eq('transaction_type', 'sale_inv')
      .maybeSingle();

    if (existingTxn?.id) {
      await supabase
        .from('transactions')
        .update({
          transaction_date: invoice.invoice_date ?? today(),
          description: `Sale Invoice ${invoice.invoice_no}`,
          reference_no: invoice.invoice_no,
          currency: invoice.currency,
          amount: total,
          amount_usd: total,
        })
        .eq('id', existingTxn.id);
    } else {
      await supabase
        .from('transactions')
        .insert({
          transaction_date: invoice.invoice_date ?? today(),
          transaction_type: 'sale_inv',
          trade_file_id: tradeFileId,
          party_type: 'customer',
          customer_id: customerId,
          description: `Sale Invoice ${invoice.invoice_no}`,
          reference_no: invoice.invoice_no,
          currency: invoice.currency,
          amount: total,
          exchange_rate: 1,
          amount_usd: total,
          paid_amount: 0,
          paid_amount_usd: 0,
          payment_status: 'open',
        });
    }
  },

  async listSaleInvoices(): Promise<Invoice[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select(INVOICE_SELECT)
      .eq('invoice_type', 'sale')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    if (data === null) throw new Error('Request aborted or timed out — please refresh');
    return data as Invoice[];
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
        bill_to: input.bill_to || null,
        ship_to: input.ship_to || null,
        qty_unit: input.qty_unit ?? 'ADMT',
      })
      .eq('id', id)
      .select(INVOICE_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as Invoice;
  },

  /**
   * Generate a unique commercial invoice number for a trade file.
   * If the base number (e.g. "SUN ASJ-01 26-04 INV") already exists,
   * appends a sequence suffix: "SUN ASJ-01 26-04 INV-02", "-03", etc.
   */
  async generateUniqueCommercialInvoiceNo(tradeFileId: string, baseNo: string): Promise<string> {
    const { count } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('trade_file_id', tradeFileId)
      .eq('invoice_type', 'commercial');

    const existing = count ?? 0;
    if (existing === 0) return baseNo;
    return `${baseNo}-${String(existing + 1).padStart(2, '0')}`;
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
