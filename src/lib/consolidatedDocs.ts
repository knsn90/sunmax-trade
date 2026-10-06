/**
 * Partili (batch) dosyalarda ana dosya için TOPLU belge üretimi — yazdır/PDF, KAYDEDİLMEZ.
 *
 * Her parti kendi ambalaj listesi / ticari faturasını taşır; müşteriye ise tüm partilerin
 * toplamını gösteren tek belge gerekir. Bu yardımcılar partilerin belgelerini birleştirir ve
 * mevcut printPackingList / printInvoice üreticilerine verilebilecek bir nesne döndürür.
 */
import type { TradeFile, PackingList, PackingListItem, Invoice } from '@/types/database';
import { formatPLNo, formatInvoiceNo } from '@/lib/generators';

type SoftDeletable = { deleted_at?: string | null };

/** Ana dosyanın iptal edilmemiş partileri, parti no sırasıyla. */
function activeBatches(file: TradeFile) {
  return [...(file.batches ?? [])]
    .filter(b => b.status !== 'cancelled' && !(b as SoftDeletable).deleted_at)
    .sort((a, b) => (a.batch_no ?? 0) - (b.batch_no ?? 0));
}

/** Boş olmayan benzersiz değerleri " / " ile birleştirir. */
function joinUnique(values: (string | null | undefined)[]): string {
  return [...new Set(values.map(v => (v ?? '').trim()).filter(Boolean))].join(' / ');
}

export interface ConsolidatedResult<T> {
  doc: T;
  /** Birleştirilen belge sayısı (parti belgesi) */
  count: number;
  /** Hepsi onaylı mı — değilse taslak filigranıyla basılır */
  allApproved: boolean;
}

export function buildConsolidatedPackingList(file: TradeFile): ConsolidatedResult<PackingList> | null {
  const sources: PackingList[] = activeBatches(file)
    .flatMap(b => (b.packing_lists ?? []) as unknown as PackingList[])
    .filter(pl => !(pl as SoftDeletable).deleted_at);
  if (sources.length === 0) return null;

  const template = sources[0];

  // Düz birleşik liste: tüm partilerin araçları tek numaralı listede
  const items: PackingListItem[] = sources
    .flatMap(pl => [...(pl.packing_list_items ?? [])].sort((a, b) => (a.item_order ?? 0) - (b.item_order ?? 0)))
    .map((it, i) => ({ ...it, item_order: i + 1 }));

  const sum = (k: 'total_reels' | 'total_admt' | 'total_gross_kg') =>
    sources.reduce((s, pl) => s + (Number(pl[k]) || 0), 0);

  const dates = sources.map(pl => pl.pl_date).filter(Boolean).sort();
  const allApproved = sources.every(pl => (pl.doc_status ?? 'draft') === 'approved');

  const doc = {
    ...template,
    id: 'consolidated',
    packing_list_no: `${formatPLNo(file.file_no)} (TOPLAM)`,
    pl_date: dates.length ? dates[dates.length - 1] : template.pl_date,
    invoice_no: joinUnique(sources.map(pl => pl.invoice_no)) || null,
    cb_no: joinUnique(sources.map(pl => pl.cb_no)) || null,
    insurance_no: joinUnique(sources.map(pl => pl.insurance_no)) || null,
    comments: null,
    total_reels: sum('total_reels'),
    total_admt: sum('total_admt'),
    total_gross_kg: sum('total_gross_kg'),
    doc_status: allApproved ? 'approved' : 'draft',
    packing_list_items: items,
    customer: file.customer ?? template.customer,
    trade_file: file,
    consignee: template.consignee ?? null,
  } as unknown as PackingList;

  return { doc, count: sources.length, allApproved };
}

export type ConsolidatedInvoiceResult =
  | (ConsolidatedResult<Invoice> & { error?: undefined })
  | { error: string }
  | null;

export function buildConsolidatedInvoice(file: TradeFile): ConsolidatedInvoiceResult {
  const sources: Invoice[] = activeBatches(file)
    .flatMap(b => (b.invoices ?? []) as unknown as Invoice[])
    .filter(inv => inv.invoice_type === 'commercial' && !(inv as SoftDeletable).deleted_at);
  if (sources.length === 0) return null;

  const currencies = new Set(sources.map(i => i.currency));
  if (currencies.size > 1) {
    return { error: `Partilerin faturaları farklı para biriminde (${[...currencies].join(', ')}) — toplu fatura oluşturulamaz.` };
  }

  const template = sources[0];
  const num = (v: unknown) => Number(v) || 0;
  const qty      = sources.reduce((s, i) => s + num(i.quantity_admt), 0);
  const subtotal = sources.reduce((s, i) => s + num(i.subtotal), 0);
  const freight  = sources.reduce((s, i) => s + num(i.freight), 0);
  const total    = sources.reduce((s, i) => s + num(i.total), 0);
  const hasGross = sources.some(i => i.gross_weight_kg != null);
  const gross    = sources.reduce((s, i) => s + num(i.gross_weight_kg), 0);

  const dates = sources.map(i => i.invoice_date).filter(Boolean).sort();
  const allApproved = sources.every(i => (i.doc_status ?? 'draft') === 'approved');

  const doc = {
    ...template,
    id: 'consolidated',
    invoice_no: `${formatInvoiceNo(file.file_no)} (TOPLAM)`,
    invoice_date: dates.length ? dates[dates.length - 1] : template.invoice_date,
    proforma_no: joinUnique(sources.map(i => i.proforma_no)) || null,
    cb_no: joinUnique(sources.map(i => i.cb_no)) || null,
    insurance_no: joinUnique(sources.map(i => i.insurance_no)) || null,
    packing_info: joinUnique(sources.map(i => i.packing_info)) || null,
    quantity_admt: qty,
    // Partilerde fiyat farklı olabilir → ağırlıklı ortalama (subtotal / miktar)
    unit_price: qty > 0 ? subtotal / qty : template.unit_price,
    subtotal,
    freight,
    total,
    gross_weight_kg: hasGross ? gross : null,
    doc_status: allApproved ? 'approved' : 'draft',
    customer: file.customer ?? template.customer,
    trade_file: file,
  } as unknown as Invoice;

  return { doc, count: sources.length, allApproved };
}
