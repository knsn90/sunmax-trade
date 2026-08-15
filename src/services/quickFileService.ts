import { supabase } from './supabase';
import { toUSD } from '@/lib/formatters';
import type { TradeFile } from '@/types/database';

// ─── Hızlı Dosya Sihirbazı servisi ───────────────────────────────────────────
// Tek adımda tam bir ticaret dosyası oluşturur: dosya (completed) + alış + masraf
// satırları + satış — hepsi işlem (transaction) olarak, isteğe bağlı otomatik
// kapanış ödeme/tahsilatı ile (cari 0). Import'ta elle SQL ile yaptığım kalıbın
// birebir UI karşılığı.

export interface QuickCostLine {
  service_provider_id: string;
  party_name: string;
  amount: number;
  description: string;
}

export interface QuickFileInput {
  // Dosya
  file_no: string;
  file_date: string;
  product_id: string;
  customer_id: string;
  supplier_id: string;
  supplier_name: string;
  customer_name: string;
  tonnage_mt: number;
  currency: 'USD' | 'EUR' | 'TRY' | 'AED' | 'GBP';
  exchange_rate: number;      // 1 USD = kaç currency (USD için 1)
  register_no: string;
  notes: string;
  // Alış
  purchase_total: number;     // dosya para biriminde
  // Masraflar
  costs: QuickCostLine[];
  // Satış
  sale_total: number;
  sale_customer_id: string;
  sale_customer_name: string;
  sale_reference_no: string;
  // Seçenek
  auto_close: boolean;        // her fatura için eşleşen kapanış kaydı oluştur
}

type TxnRow = Record<string, unknown>;

export const quickFileService = {
  async createQuickFile(
    input: QuickFileInput,
    tenantId: string | null,
  ): Promise<TradeFile> {
    const rate = input.currency === 'USD' ? 1 : input.exchange_rate;
    const usd = (amt: number) => toUSD(amt, input.currency, rate);
    const tonnage = input.tonnage_mt || 1;
    const pprice = input.purchase_total / tonnage;
    const sprice = input.sale_total / tonnage;
    const totalCost = input.costs.reduce((s, c) => s + c.amount, 0);
    const profit = input.sale_total - input.purchase_total - totalCost;

    // 1) Dosya (completed)
    const { data: file, error: fileErr } = await supabase
      .from('trade_files')
      .insert({
        tenant_id: tenantId,
        file_no: input.file_no,
        batch_no: 0,
        status: 'completed',
        product_id: input.product_id,
        customer_id: input.customer_id,
        supplier_id: input.supplier_id || null,
        tonnage_mt: input.tonnage_mt,
        delivered_admt: input.tonnage_mt,
        purchase_price: pprice,
        selling_price: sprice,
        purchase_currency: input.currency,
        sale_currency: input.currency,
        currency: input.currency,
        file_date: input.file_date,
        arrival_date: input.file_date,
        eta: input.file_date,
        freight_cost: 0,
        register_no: input.register_no || null,
        notes: input.notes || `Hızlı dosya · kâr ${profit.toFixed(2)} ${input.currency}`,
      })
      .select('*')
      .single();
    if (fileErr) throw new Error(fileErr.message);
    const fileId = (file as { id: string }).id;

    // 2) Birincil tedarikçi
    if (input.supplier_id) {
      const { error: supErr } = await supabase.from('trade_file_suppliers').insert({
        tenant_id: tenantId,
        trade_file_id: fileId,
        supplier_id: input.supplier_id,
        position: 1,
        purchase_price: pprice,
        quantity_mt: input.tonnage_mt,
        currency: input.currency,
        fx_rate: rate,
        freight_cost: 0,
      });
      if (supErr) throw new Error(supErr.message);
    }

    // 3) İşlem bacakları (alış + masraflar + satış) — tek insert
    const base = (extra: TxnRow): TxnRow => ({
      tenant_id: tenantId,
      trade_file_id: fileId,
      transaction_date: input.file_date,
      currency: input.currency,
      exchange_rate: rate,
      doc_status: 'approved',
      ...extra,
    });
    const invLeg = (
      type: 'purchase_inv' | 'svc_inv' | 'sale_inv',
      partyType: 'supplier' | 'service_provider' | 'customer',
      ids: TxnRow,
      partyName: string,
      amount: number,
      description: string,
      referenceNo = '',
    ): TxnRow => base({
      transaction_type: type, party_type: partyType, ...ids, party_name: partyName,
      description, reference_no: referenceNo,
      amount, amount_usd: usd(amount),
      payment_status: 'open', paid_amount: 0, paid_amount_usd: 0,
    });
    const closeLeg = (
      type: 'payment' | 'receipt',
      partyType: 'supplier' | 'service_provider' | 'customer',
      ids: TxnRow,
      partyName: string,
      amount: number,
    ): TxnRow => base({
      transaction_type: type, party_type: partyType, ...ids, party_name: partyName,
      description: type === 'receipt' ? 'Tahsilat (otomatik kapanış)' : 'Ödeme (otomatik kapanış)',
      reference_no: '',
      amount, amount_usd: usd(amount),
      payment_status: 'paid', paid_amount: amount, paid_amount_usd: usd(amount),
    });

    const rows: TxnRow[] = [];
    // Alış
    if (input.purchase_total > 0) {
      const ids = { supplier_id: input.supplier_id || null };
      rows.push(invLeg('purchase_inv', 'supplier', ids, input.supplier_name, input.purchase_total, 'Alış', input.register_no));
      if (input.auto_close) rows.push(closeLeg('payment', 'supplier', ids, input.supplier_name, input.purchase_total));
    }
    // Masraflar
    for (const c of input.costs) {
      if (!c.service_provider_id || c.amount <= 0) continue;
      const ids = { service_provider_id: c.service_provider_id };
      rows.push(invLeg('svc_inv', 'service_provider', ids, c.party_name, c.amount, c.description || 'Masraf'));
      if (input.auto_close) rows.push(closeLeg('payment', 'service_provider', ids, c.party_name, c.amount));
    }
    // Satış
    if (input.sale_total > 0) {
      const ids = { customer_id: input.sale_customer_id || input.customer_id };
      rows.push(invLeg('sale_inv', 'customer', ids, input.sale_customer_name || input.customer_name, input.sale_total, 'Satış', input.sale_reference_no));
      if (input.auto_close) rows.push(closeLeg('receipt', 'customer', ids, input.sale_customer_name || input.customer_name, input.sale_total));
    }

    if (rows.length) {
      const { error: txnErr } = await supabase.from('transactions').insert(rows);
      if (txnErr) throw new Error(txnErr.message);
    }

    // 4) Satış faturası (invoices) — rapor/stok için
    if (input.sale_total > 0) {
      const invNo = input.sale_reference_no || `${input.file_no}-SATIS`;
      const { error: invErr } = await supabase.from('invoices').insert({
        tenant_id: tenantId,
        trade_file_id: fileId,
        invoice_no: invNo,
        invoice_type: 'sale',
        customer_id: input.sale_customer_id || input.customer_id,
        product_name: '',
        quantity_admt: input.tonnage_mt,
        unit_price: sprice,
        subtotal: input.sale_total,
        total: input.sale_total,
        currency: input.currency,
        qty_unit: 'TON',
        invoice_date: input.file_date,
        doc_status: 'approved',
        usd_exchange_rate: rate,
      });
      // invoice_no çakışırsa yut (dosya yine oluştu)
      if (invErr && !/duplicate|unique|23505/i.test(invErr.message)) throw new Error(invErr.message);
    }

    return file as TradeFile;
  },
};
