/**
 * Tek butonla belge üretimi: sipariş detayında girilen bilgilerden Proforma, Ambalaj Listesi ve
 * Ticari Fatura TASLAKLARINI oluşturur. Zaten var olan belge türüne dokunmaz; eksik olanları üretir.
 * Üretilen belgeler normal taslaktır — Belgeler kartından düzenlenir / onaylanır / silinir.
 *
 * Varsayılan değerler ProformaModal / InvoiceModal / PackingListModal'ın "yeni belge" varsayılanlarıyla
 * AYNIDIR (bir modalın varsayılanı değişirse buraya da yansıtılmalı).
 */
import type { TradeFile, Customer, CompanySettings, PackingList } from '@/types/database';
import type { TransportPlate } from '@/services/transportService';
import type { ProformaFormData, InvoiceFormData, PackingListFormData } from '@/types/forms';
import { proformaService } from '@/services/proformaService';
import { invoiceService } from '@/services/invoiceService';
import { packingListService } from '@/services/packingListService';
import { formatProformaNo, formatInvoiceNo, formatPLNo } from '@/lib/generators';
import { today } from '@/lib/formatters';
import { checkAdmt } from '@/lib/admtCheck';
import { weekRangeLabelFromDate } from '@/components/ui/WeekPicker';

type Ccy = 'USD' | 'EUR' | 'TRY' | 'AED' | 'GBP';

export interface GenerateDocsInput {
  file: TradeFile;
  settings: CompanySettings | undefined;
  customers: Customer[];
  /** 1 USD = kaç currency (canlı kur tablosu) */
  rates: Record<string, number> | undefined;
  /** Araç listesi (Tır Plakaları / Vagon): aktif satırlar, sıralı */
  plates: TransportPlate[];
}

export interface GenerateDocsResult {
  created: string[];   // "Proforma PI-…", "Ambalaj Listesi …", "Ticari Fatura …"
  skipped: string[];   // zaten var olan belge türleri
  problems: string[];  // eksik bilgi / hata — kullanıcıya gösterilir
}

function buildAddress(c: { name?: string; address?: string; city?: string; country?: string } | null | undefined): string {
  if (!c) return '';
  return [c.name, c.address, [c.city, c.country].filter(Boolean).join(', ')].filter(Boolean).join('\n');
}

/** Dosyada üretilebilecek belge kapıları (UI'da butonu göstermek için de kullanılır). */
export function documentGenerationState(file: TradeFile) {
  const isBatch = !!file.parent_file_id;
  const isPartial = !isBatch && (file.batches?.length ?? 0) > 0;
  const stageOk = ['sale', 'delivery', 'completed'].includes(file.status);
  const hasProforma = (file.proformas?.length ?? 0) > 0;
  const hasPL = (file.packing_lists?.length ?? 0) > 0;
  const hasInvoice = (file.invoices ?? []).some(i => i.invoice_type === 'commercial');
  const needsProforma = !isBatch && !isPartial && !hasProforma && file.status !== 'cancelled';
  const missing = [
    ...(needsProforma ? ['Proforma'] : []),
    ...(!hasPL ? ['Ambalaj Listesi'] : []),
    ...(!hasInvoice ? ['Ticari Fatura'] : []),
  ];
  return { isBatch, isPartial, stageOk, hasProforma, hasPL, hasInvoice, needsProforma, missing,
    available: !isPartial && stageOk && missing.length > 0 };
}

export async function generateMissingDocuments(input: GenerateDocsInput): Promise<GenerateDocsResult> {
  const { file, settings, customers, rates, plates } = input;
  const res: GenerateDocsResult = { created: [], skipped: [], problems: [] };
  const st = documentGenerationState(file);

  if (st.isPartial) {
    res.problems.push('Partili ana dosyada belgeler partilerden üretilir — bir parti dosyasını açın.');
    return res;
  }
  if (!st.stageOk) {
    res.problems.push('Belgeler satış aşamasından itibaren üretilebilir.');
    return res;
  }
  if (st.missing.length === 0) {
    res.skipped.push('Tüm belgeler zaten mevcut');
    return res;
  }

  // ── Zorunlu bilgiler ──────────────────────────────────────────────────────
  const qty = file.delivered_admt ?? file.tonnage_mt ?? 0;
  const price = file.selling_price ?? 0;
  const missingInfo: string[] = [];
  if (!file.customer_id) missingInfo.push('Müşteri');
  if (!(qty > 0)) missingInfo.push('Miktar (ADMT/MT)');
  if (!(price > 0)) missingInfo.push('Satış fiyatı');
  if (missingInfo.length) {
    res.problems.push(`Eksik bilgi: ${missingInfo.join(', ')}`);
    return res;
  }

  const customer = customers.find(c => c.id === file.customer_id) ?? file.customer ?? null;
  const addr = buildAddress(customer);
  // Birimler: sipariş detayında seçildiyse onlar, değilse ürün biriminden türetilir
  const derivedAdmt = file.product?.unit === 'ADMT' || !file.product?.unit;
  const unit: 'ADMT' | 'MT' = file.qty_unit ?? (derivedAdmt ? 'ADMT' : 'MT');
  const saleCcy = (file.currency ?? settings?.default_currency ?? 'USD') as Ccy;

  // ── 1) Proforma ───────────────────────────────────────────────────────────
  if (st.needsProforma) {
    try {
      const hsCode = file.product?.hs_code ?? '';
      const notes = [
        `1- Total Quantity: ${qty > 0 ? qty + ' ' + unit : ''}`,
        `2- HS Code:${hsCode ? ' ' + hsCode : ''}`,
        '3- The weights mentioned are approximate and will be confirmed at the time of loading. The approximate weights may vary by ±10%',
        '4- The following documents will be provided: Invoice/Packing/Origin/Certificate of Analysis',
        '5- Shipment 07-10 days from date of receipt of payment provided there is no delay due to Covid-19 situation and government orders and no inspection reqired from your side',
        '6- If payment is delayed, demurrage, warehouse charges, and other related expenses shall be the responsibility of the buyer.',
        '7- The given dates are provided by the manufacturing factory. In case of force majeure, strikes, natural disasters, wars, or any changes, the buyer will be notified.',
        '8- In case of delays in the arrival of the products due to the shipping company, the buyer will be informed beforehand.',
        '9- The criterion of quality confirmation is at the source before loading.',
        '10- Full payment must be made two days prior to loading',
      ].join('\n');
      const validDate = new Date();
      validDate.setMonth(validDate.getMonth() + 6);
      const pt = file.payment_terms ?? settings?.payment_terms ?? '';
      const adv = file.advance_rate ?? 0;
      const data: ProformaFormData = {
        proforma_date: today(),
        validity_date: validDate.toISOString().slice(0, 10),
        buyer_commercial_id: '',
        country_of_origin: file.product?.origin_country ?? '',
        port_of_loading: file.port_of_loading ?? settings?.default_port_of_loading ?? 'MERSIN, TURKEY',
        port_of_discharge: file.port_of_discharge ?? '',
        final_delivery: file.port_of_discharge ?? '',
        incoterms: file.incoterms ?? settings?.default_incoterms ?? 'CPT',
        payment_terms: pt === 'Downpayment' && adv > 0 ? `${adv}% Downpayment` : pt,
        transport_mode: (file.transport_mode ?? 'truck') as ProformaFormData['transport_mode'],
        shipment_method: '',
        currency: saleCcy,
        place_of_payment: 'ISTANBUL - TURKEY',
        delivery_time: weekRangeLabelFromDate(file.eta),
        vessel_details_confirmation: '',
        description: file.product?.name ?? '',
        hs_code: file.product?.hs_code ?? '470321',
        partial_shipment: 'allowed',
        insurance: 'BY BUYER',
        net_weight_kg: qty,
        gross_weight_kg: file.gross_weight_kg ?? undefined,
        quantity_admt: qty,
        unit_price: price,
        freight: file.freight_cost ?? 0,
        discount: undefined,
        other_charges: undefined,
        signatory: settings?.signatory ?? '',
        notes,
      };
      const piNo = await proformaService.generateUniqueProformaNo(file.id, formatProformaNo(file.file_no));
      const pi = await proformaService.create(file.id, piNo, data);
      res.created.push(`Proforma ${pi.proforma_no}`);
    } catch (e) {
      res.problems.push(`Proforma oluşturulamadı: ${(e as Error).message}`);
    }
  } else if (st.hasProforma) {
    res.skipped.push('Proforma zaten var');
  }

  // ── 2) Ambalaj Listesi ────────────────────────────────────────────────────
  let plTotals: { reels: number; admt: number; gross: number; unitLabel: string; cb: string; insurance: string } | null = null;
  const existingPL = [...(file.packing_lists ?? [])].sort((a, b) =>
    (b.pl_date ?? '').localeCompare(a.pl_date ?? '') || (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];

  if (!st.hasPL) {
    try {
      const active = plates.filter(p => p.plate_status !== 'cancelled');
      const items = active.length > 0
        ? active.map(p => ({
            vehicle_plate: p.plate_status === 'changed' && p.replacement_plate ? p.replacement_plate : p.plate_no,
            reels: Number(p.reels) || 0,
            admt: Number(p.admt) || 0,
            gross_weight_kg: Number(p.gross_weight_kg) || 0,
          }))
        // Araç listesi girilmemişse teslimat toplamlarıyla tek satır — sonra düzenlenir
        : [{ vehicle_plate: '', reels: Number(file.packages) || 0, admt: qty, gross_weight_kg: Number(file.gross_weight_kg) || 0 }];

      const sumAdmt = items.reduce((s, r) => s + r.admt, 0);
      const chk = checkAdmt(file.delivered_admt, sumAdmt);
      if (chk.diverges) {
        res.problems.push(
          `Araç listesi ADMT toplamı ${sumAdmt.toFixed(3)} — teslimat ADMT'si ${chk.reference.toFixed(3)} ile uyuşmuyor. ` +
          'Ambalaj listesi ve ticari fatura oluşturulmadı; araç satırlarını veya teslimat ADMT\'sini düzeltin.',
        );
      } else {
        const unitLabel: PackingListFormData['unit_label'] = file.count_unit ?? (derivedAdmt ? 'Reels' : 'Packages');
        const data: PackingListFormData = {
          pl_date: today(),
          transport_mode: (file.transport_mode ?? 'truck') as PackingListFormData['transport_mode'],
          invoice_no: '',
          cb_no: file.septi_ref ?? file.register_no ?? '',
          insurance_no: file.insurance_tr ?? file.insurance_ir ?? '',
          description: file.product?.name ?? 'FLUFF PULP',
          comments: '',
          bill_to: addr,
          ship_to: addr,
          unit_label: unitLabel,
          qty_unit: unit,
          items,
        };
        const plNo = await packingListService.generateUniquePLNo(file.id, formatPLNo(file.file_no));
        const pl: PackingList = await packingListService.create(file.id, file.customer_id, plNo, data);
        plTotals = {
          reels: items.reduce((s, r) => s + r.reels, 0), admt: sumAdmt,
          gross: items.reduce((s, r) => s + r.gross_weight_kg, 0),
          unitLabel, cb: data.cb_no, insurance: data.insurance_no,
        };
        res.created.push(`Ambalaj Listesi ${pl.packing_list_no}`);
      }
    } catch (e) {
      res.problems.push(`Ambalaj listesi oluşturulamadı: ${(e as Error).message}`);
    }
  } else {
    res.skipped.push('Ambalaj listesi zaten var');
    if (existingPL) {
      plTotals = {
        reels: Number(existingPL.total_reels) || 0, admt: Number(existingPL.total_admt) || 0,
        gross: Number(existingPL.total_gross_kg) || 0, unitLabel: existingPL.unit_label || 'Reels',
        cb: existingPL.cb_no ?? '', insurance: existingPL.insurance_no ?? '',
      };
    }
  }

  // ── 3) Ticari Fatura ──────────────────────────────────────────────────────
  // PL oluşturma ADMT uyuşmazlığıyla durduysa fatura da üretilmez (aynı kilit).
  const plBlocked = !st.hasPL && !plTotals;
  if (!st.hasInvoice && !plBlocked) {
    try {
      const rate = saleCcy === 'USD' ? 1 : (rates?.[saleCcy] ?? 0);
      if (!(rate > 0)) {
        res.problems.push(`Ticari fatura oluşturulamadı: ${saleCcy} kuru alınamadı (internet / kur servisi).`);
      } else {
        const invQty = plTotals && plTotals.admt > 0 ? plTotals.admt : qty;
        const data: InvoiceFormData = {
          invoice_date: today(),
          currency: saleCcy,
          usd_exchange_rate: Number(rate.toFixed(4)),
          incoterms: file.incoterms ?? settings?.default_incoterms ?? 'CPT',
          proforma_no: file.proforma_ref ?? '',
          cb_no: plTotals?.cb || file.septi_ref || file.register_no || '',
          insurance_no: plTotals?.insurance || file.insurance_tr || file.insurance_ir || '',
          quantity_admt: invQty,
          unit_price: price,
          freight: file.freight_cost ?? 0,
          gross_weight_kg: plTotals && plTotals.gross > 0 ? plTotals.gross : (file.gross_weight_kg ?? undefined),
          packing_info: plTotals && plTotals.reels > 0 ? `${plTotals.reels} ${plTotals.unitLabel}` : '',
          payment_terms: file.payment_terms ?? settings?.payment_terms ?? '',
          bill_to: addr,
          ship_to: addr,
          qty_unit: unit,
        };
        const invNo = await invoiceService.generateUniqueCommercialInvoiceNo(file.id, formatInvoiceNo(file.file_no));
        const inv = await invoiceService.create(file.id, file.customer_id, file.product?.name ?? '', invNo, data, 'commercial');
        res.created.push(`Ticari Fatura ${inv.invoice_no}`);
      }
    } catch (e) {
      res.problems.push(`Ticari fatura oluşturulamadı: ${(e as Error).message}`);
    }
  } else if (st.hasInvoice) {
    res.skipped.push('Ticari fatura zaten var');
  }

  return res;
}
