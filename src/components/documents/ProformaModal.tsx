import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTheme } from '@/contexts/ThemeContext';
import { zodResolver } from '@hookform/resolvers/zod';
import { proformaSchema, type ProformaFormData } from '@/types/forms';
import type { TradeFile, Proforma } from '@/types/database';
import type { OcrResult } from '@/lib/openai';
import { useCreateProforma, useUpdateProforma } from '@/hooks/useProformas';
import { proformaService } from '@/services/proformaService';
import { useCustomers } from '@/hooks/useEntities';
import { useSettings, useBankAccounts } from '@/hooks/useSettings';
import { useCurrencies } from '@/hooks/useCurrencies';
import { today, fCurrency } from '@/lib/formatters';
import { formatProformaNo } from '@/lib/generators';
import { parseProformaExcel, downloadProformaTemplate } from '@/lib/excelImport';
import { generateProformaHtml, printProforma } from '@/lib/printDocument';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { OcrButton } from '@/components/ui/OcrButton';
import { SmartFill } from '@/components/ui/SmartFill';
import { WeekPicker } from '@/components/ui/WeekPicker';
import { MonoDatePicker } from '@/components/ui/MonoDatePicker';
import { MonoNumberInput } from '@/components/ui/MonoNumberInput';
import { FileText } from 'lucide-react';

// ── Mono stil sabitleri ────────────────────────────────────────────────────────
const inp = 'bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-gray-900 placeholder:text-gray-400 border-0 shadow-none focus:outline-none focus:ring-0 w-full';
const ta  = 'bg-gray-100 rounded-lg px-3 py-2 text-[12px] text-gray-900 placeholder:text-gray-400 border-0 shadow-none focus:outline-none focus:ring-0 w-full resize-none';
const sel = 'bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-gray-900 border-0 shadow-none focus:outline-none w-full appearance-none cursor-pointer';

const Lbl = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{children}</div>
);
const Fld = ({
  label, children, className, error,
}: { label: string; children: React.ReactNode; className?: string; error?: string }) => (
  <div className={className}>
    <Lbl>{label}</Lbl>
    {children}
    {error && <div className="text-[10px] text-red-500 mt-0.5">{error}</div>}
  </div>
);

// ── Preview CSS injection — hides sidebar ───────────────────────────────────
function injectPreviewCss(html: string): string {
  return html.replace(
    '</style>',
    '.sidebar{display:none!important}.doc-area{padding:16px!important;}\n</style>',
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface ProformaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: TradeFile | null;
  proforma?: Proforma | null;
}

export function ProformaModal({ open, onOpenChange, file, proforma }: ProformaModalProps) {
  const { accent } = useTheme();
  const currencies = useCurrencies();
  const { data: settings } = useSettings();
  const { data: bankAccounts } = useBankAccounts();
  const { data: allCustomers = [] } = useCustomers();
  const createPI = useCreateProforma();
  const updatePI = useUpdateProforma();
  const isEdit = !!proforma;
  const importRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  // ── Consignee (Alıcı Firma) ───────────────────────────────────────────
  const [consigneeId, setConsigneeId] = useState<string>('');
  const mainCustomerId = file?.customer_id ?? '';
  const subCustomers = allCustomers.filter(c => c.parent_customer_id === mainCustomerId);
  const mainCustomer = allCustomers.find(c => c.id === mainCustomerId);
  const hasSubCustomers = subCustomers.length > 0;

  const hsCode = proforma?.hs_code || file?.product?.hs_code || '';
  const defaultQty = file?.delivered_admt ?? file?.tonnage_mt ?? 0;
  const defaultNotes = [
    `1- Total Quantity: ${defaultQty > 0 ? defaultQty + ' ADMT' : ''}`,
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

  const form = useForm<ProformaFormData>({
    resolver: zodResolver(proformaSchema),
  });

  const { register, handleSubmit, formState: { errors }, reset, control, setValue } = form;

  useEffect(() => {
    if (!open) return;
    if (proforma) {
      setConsigneeId(proforma.consignee_customer_id ?? '');
      reset({
        proforma_date: proforma.proforma_date,
        validity_date: proforma.validity_date ?? '',
        buyer_commercial_id: proforma.buyer_commercial_id,
        country_of_origin: file?.product?.origin_country || proforma.country_of_origin,
        port_of_loading: proforma.port_of_loading ?? '',
        port_of_discharge: proforma.port_of_discharge ?? '',
        final_delivery: proforma.final_delivery ?? '',
        incoterms: proforma.incoterms ?? '',
        payment_terms: proforma.payment_terms ?? '',
        transport_mode: proforma.transport_mode ?? 'truck',
        shipment_method: proforma.shipment_method ?? '',
        currency: proforma.currency,
        place_of_payment: proforma.place_of_payment ?? '',
        delivery_time: proforma.delivery_time ?? '',
        vessel_details_confirmation: proforma.vessel_details_confirmation ?? '',
        description: file?.product?.name || proforma.description || '',
        hs_code: file?.product?.hs_code || proforma.hs_code || '',
        partial_shipment: proforma.partial_shipment,
        insurance: proforma.insurance,
        net_weight_kg: proforma.net_weight_kg ?? undefined,
        gross_weight_kg: proforma.gross_weight_kg ?? undefined,
        quantity_admt: proforma.quantity_admt,
        unit_price: proforma.unit_price,
        freight: proforma.freight,
        discount: proforma.discount ?? undefined,
        other_charges: proforma.other_charges ?? undefined,
        signatory: proforma.signatory ?? '',
        notes: proforma.notes ?? '',
      });
    } else if (file) {
      setConsigneeId('');
      const validDate = new Date();
      validDate.setMonth(validDate.getMonth() + 6);
      reset({
        proforma_date: today(),
        validity_date: validDate.toISOString().slice(0, 10),
        buyer_commercial_id: '',
        country_of_origin: file.product?.origin_country ?? '',
        port_of_loading: file.port_of_loading ?? settings?.default_port_of_loading ?? 'MERSIN, TURKEY',
        port_of_discharge: file.port_of_discharge ?? '',
        final_delivery: file.port_of_discharge ?? '',
        incoterms: file.incoterms ?? settings?.default_incoterms ?? 'CPT',
        payment_terms: (() => {
          const pt = file.payment_terms ?? settings?.payment_terms ?? '';
          const rate = file.advance_rate ?? 0;
          if (pt === 'Downpayment' && rate > 0) return `${rate}% Downpayment`;
          return pt;
        })(),
        transport_mode: file.transport_mode ?? 'truck',
        shipment_method: '',
        currency: file.currency ?? settings?.default_currency ?? 'USD',
        place_of_payment: 'ISTANBUL - TURKEY',
        delivery_time: file.eta ?? '',
        vessel_details_confirmation: '',
        description: file.product?.name ?? '',
        hs_code: file.product?.hs_code ?? '470321',
        partial_shipment: 'allowed',
        insurance: 'BY BUYER',
        net_weight_kg: file.delivered_admt ?? file.tonnage_mt ?? undefined,
        gross_weight_kg: file.gross_weight_kg ?? undefined,
        quantity_admt: file.delivered_admt ?? file.tonnage_mt ?? 0,
        unit_price: file.selling_price ?? 0,
        freight: file.freight_cost ?? 0,
        discount: undefined,
        other_charges: undefined,
        signatory: settings?.signatory ?? '',
        notes: defaultNotes,
      });
    }
  }, [open, file, proforma, settings, reset, defaultNotes]);

  const qty          = useWatch({ control, name: 'quantity_admt' }) ?? 0;
  const price        = useWatch({ control, name: 'unit_price' }) ?? 0;
  const freight      = useWatch({ control, name: 'freight' }) ?? 0;
  const discount     = useWatch({ control, name: 'discount' }) ?? 0;
  const otherCharges = useWatch({ control, name: 'other_charges' }) ?? 0;
  const currency     = useWatch({ control, name: 'currency' }) ?? 'USD';

  const subtotal = qty * price;
  const total    = subtotal + freight - discount + otherCharges;

  // ── Watch all form values for live preview ───────────────────────────────
  const allValues = useWatch({ control });

  useEffect(() => {
    if (!open || !settings) return;
    const timer = setTimeout(() => {
      try {
        const v = form.getValues();
        const defaultBank = bankAccounts?.find(b => b.is_default) ?? bankAccounts?.[0] ?? null;
        const consignee = consigneeId ? allCustomers.find(c => c.id === consigneeId) ?? null : null;
        const fakePI = {
          ...v,
          id: proforma?.id ?? 'preview',
          proforma_no: proforma?.proforma_no ?? 'PREVIEW',
          doc_status: 'draft',
          customer: file?.customer ?? null,
          consignee,
        } as unknown as Proforma;
        const raw = generateProformaHtml(fakePI, settings, defaultBank, file, true);
        setPreviewHtml(injectPreviewCss(raw));
      } catch { /* ignore preview errors */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [allValues, open, settings, bankAccounts, file, proforma, consigneeId, allCustomers]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = '';
    try {
      const imported = await parseProformaExcel(f);
      if (imported.quantity_admt     !== undefined) setValue('quantity_admt',     imported.quantity_admt);
      if (imported.unit_price        !== undefined) setValue('unit_price',        imported.unit_price);
      if (imported.freight           !== undefined) setValue('freight',           imported.freight);
      if (imported.net_weight_kg     !== undefined) setValue('net_weight_kg',     imported.net_weight_kg);
      if (imported.gross_weight_kg   !== undefined) setValue('gross_weight_kg',   imported.gross_weight_kg);
      if (imported.buyer_commercial_id) setValue('buyer_commercial_id', imported.buyer_commercial_id);
      if (imported.port_of_discharge)   setValue('port_of_discharge',   imported.port_of_discharge);
      if (imported.payment_terms)       setValue('payment_terms',       imported.payment_terms);
      if (imported.hs_code)             setValue('hs_code',             imported.hs_code);
      toast.success('Proforma data imported from Excel');
    } catch {
      toast.error('Could not parse file. Please use the Excel template.');
    }
  }

  function handleOcrResult(result: OcrResult) {
    if (result.date) setValue('proforma_date', result.date);
    if (result.currency && ['USD', 'EUR', 'TRY'].includes(result.currency)) {
      setValue('currency', result.currency as ProformaFormData['currency']);
    }
    if (result.quantity_admt) setValue('quantity_admt', result.quantity_admt);
    if (result.unit_price) setValue('unit_price', result.unit_price);
    if (result.freight != null) setValue('freight', result.freight);
    if (result.incoterms) setValue('incoterms', result.incoterms);
    if (result.port_of_loading) setValue('port_of_loading', result.port_of_loading);
    if (result.port_of_discharge) setValue('port_of_discharge', result.port_of_discharge);
    if (result.country_of_origin) setValue('country_of_origin', result.country_of_origin);
    if (result.payment_terms) setValue('payment_terms', result.payment_terms);
  }

  function handlePrintPreview() {
    if (!settings) return;
    const defaultBank = bankAccounts?.find((b) => b.is_default) ?? bankAccounts?.[0] ?? null;
    if (proforma) {
      printProforma(proforma, settings, defaultBank, file);
    } else {
      const v = form.getValues();
      const consignee = consigneeId ? allCustomers.find(c => c.id === consigneeId) ?? null : null;
      const fakePI = {
        ...v,
        id: 'preview',
        proforma_no: 'PREVIEW',
        doc_status: 'draft',
        customer: file?.customer ?? null,
        consignee,
      } as unknown as Proforma;
      printProforma(fakePI, settings, defaultBank, file, true);
    }
  }

  async function onSubmit(data: ProformaFormData) {
    setSaving(true);
    try {
      const cId = consigneeId || undefined;
      if (isEdit && proforma) {
        await updatePI.mutateAsync({ id: proforma.id, data, consigneeId: cId });
      } else if (file) {
        const baseNo = formatProformaNo(file.file_no);
        const piNo = await proformaService.generateUniqueProformaNo(file.id, baseNo);
        await createPI.mutateAsync({ tradeFileId: file.id, proformaNo: piNo, data, consigneeId: cId });
      }
      onOpenChange(false);
    } catch {
      // Error shown via onError toast — button always re-enables via finally
    } finally {
      setSaving(false);
    }
  }

  if (!file && !proforma) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="preview" layout="split">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-2 pr-8">
            <div className="min-w-0">
              <DialogTitle>{isEdit ? 'Edit Proforma' : 'New Proforma Invoice'}</DialogTitle>
              <DialogDescription className="truncate">
                {file?.file_no ?? ''} — {file?.customer?.name ?? ''}
              </DialogDescription>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <SmartFill mode="proforma" onResult={handleOcrResult} formName="Proforma" />
              <OcrButton mode="proforma" onResult={handleOcrResult} />
            </div>
          </div>
        </DialogHeader>

        {/* ── Split panels ─────────────────────────────────────────────────── */}
        <div className="flex h-full min-h-0">

          {/* LEFT: Scrollable form */}
          <div className="flex-1 overflow-y-auto px-5 py-3 md:px-6 md:py-4 min-w-0">
            <form onSubmit={handleSubmit(onSubmit)}>

              {/* ── Alıcı Firma (Consignee) — sadece alt firma varsa göster ── */}
              {hasSubCustomers && (
                <div className="mb-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <Lbl>Alıcı Firma (Consignee)</Lbl>
                  <select
                    value={consigneeId}
                    onChange={e => setConsigneeId(e.target.value)}
                    className={sel}
                  >
                    <option value="">{mainCustomer?.name ?? '—'} (Ana Firma)</option>
                    {subCustomers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-blue-500 mt-1">Muhasebe değişmez — sadece evrak üzerindeki alıcı adı değişir.</p>
                </div>
              )}

              {/* ── Satır 1: Tarihler + Alıcı ID ── */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Fld label="PI Date *" error={errors.proforma_date?.message}>
                  <MonoDatePicker value={form.watch('proforma_date') ?? ''} onChange={v => setValue('proforma_date', v)} className="w-full bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-gray-900 border-0 focus:outline-none flex items-center justify-between overflow-hidden hover:bg-gray-200 transition-colors" />
                </Fld>
                <Fld label="Validity Date">
                  <MonoDatePicker value={form.watch('validity_date') ?? ''} onChange={v => setValue('validity_date', v)} className="w-full bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-gray-900 border-0 focus:outline-none flex items-center justify-between overflow-hidden hover:bg-gray-200 transition-colors" />
                </Fld>
                <Fld label="Buyer Commercial ID">
                  <input className={inp} {...register('buyer_commercial_id')} />
                </Fld>
              </div>

              {/* ── Satır 2: Menşei + Döviz ── */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Fld label="Country of Origin">
                  <input className={inp} {...register('country_of_origin')} />
                </Fld>
                <Fld label="Currency">
                  <select className={sel} {...register('currency')}>
                    {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Fld>
              </div>

              {/* ── Satır 3: Yükleme / Boşaltma Limanı ── */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Fld label="Port of Loading">
                  <input className={inp} {...register('port_of_loading')} />
                </Fld>
                <Fld label="Port of Discharge">
                  <input className={inp} {...register('port_of_discharge')} />
                </Fld>
              </div>

              {/* ── Satır 4: Teslimat + Incoterms ── */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Fld label="Final Delivery Place">
                  <input className={inp} {...register('final_delivery')} />
                </Fld>
                <Fld label="Incoterms">
                  <input className={inp} {...register('incoterms')} placeholder="CPT MERSIN" />
                </Fld>
              </div>

              {/* ── Satır 5: Ödeme + Taşıma + Ödeme Yeri ── */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Fld label="Payment Terms">
                  <input className={inp} {...register('payment_terms')} />
                </Fld>
                <Fld label="Transport Mode">
                  <select className={sel} {...register('transport_mode')}>
                    <option value="truck">By Truck</option>
                    <option value="railway">By Railway</option>
                    <option value="sea">By Sea</option>
                  </select>
                </Fld>
                <Fld label="Place of Payment">
                  <input className={inp} {...register('place_of_payment')} />
                </Fld>
              </div>

              {/* ── Satır 6: Sevkiyat Yöntemi + Teslimat Haftası + Gemi Konfirme ── */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Fld label="Shipment Method">
                  <select className={sel} {...register('shipment_method')}>
                    <option value="">— Select —</option>
                    <option value="bulk">Bulk</option>
                    <option value="container">Container</option>
                  </select>
                </Fld>
                <Fld label="Time of Delivery">
                  <WeekPicker
                    value={form.watch('delivery_time') ?? ''}
                    onChange={v => setValue('delivery_time', v)}
                  />
                </Fld>
                <Fld label="Vessel Details Confirmation">
                  <input className={inp} {...register('vessel_details_confirmation')} placeholder="e.g. 7 days before loading" />
                </Fld>
              </div>

              {/* ── Satır 7: Ürün + HS Kodu + Kısmi Sevkiyat ── */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Fld label="Description">
                  <input className={inp} {...register('description')} />
                </Fld>
                <Fld label="HS Code">
                  <input className={inp} {...register('hs_code')} />
                </Fld>
                <Fld label="Partial Shipment">
                  <select className={sel} {...register('partial_shipment')}>
                    <option value="allowed">Allowed</option>
                    <option value="not">Not Allowed</option>
                  </select>
                </Fld>
              </div>

              {/* ── Satır 8: Sigorta + Net/Brüt Ağırlık ── */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Fld label="Insurance">
                  <input className={inp} {...register('insurance')} />
                </Fld>
                <Fld label="Net Weight (KG)">
                  <MonoNumberInput
                    value={form.watch('net_weight_kg')}
                    onChange={v => setValue('net_weight_kg', v as number)}
                    className={inp}
                    decimals={3}
                  />
                </Fld>
                <Fld label="Gross Weight (KG)">
                  <MonoNumberInput
                    value={form.watch('gross_weight_kg')}
                    onChange={v => setValue('gross_weight_kg', v as number)}
                    className={inp}
                    decimals={3}
                  />
                </Fld>
              </div>

              {/* ── Satır 9: Miktar + Fiyat + Navlun ── */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Fld label="Quantity (ADMT) *" error={errors.quantity_admt?.message}>
                  <MonoNumberInput
                    value={form.watch('quantity_admt')}
                    onChange={v => setValue('quantity_admt', v ?? 0)}
                    className={inp}
                    decimals={3}
                  />
                </Fld>
                <Fld label="Unit Price *" error={errors.unit_price?.message}>
                  <MonoNumberInput
                    value={form.watch('unit_price')}
                    onChange={v => setValue('unit_price', v ?? 0)}
                    className={inp}
                    decimals={3}
                  />
                </Fld>
                <Fld label="Freight (0=N/A)">
                  <MonoNumberInput
                    value={form.watch('freight')}
                    onChange={v => setValue('freight', v ?? 0)}
                    className={inp}
                    decimals={3}
                  />
                </Fld>
              </div>

              {/* ── Satır 10: İskonto + Diğer ── */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Fld label="Discount">
                  <MonoNumberInput
                    value={form.watch('discount')}
                    onChange={v => setValue('discount', v)}
                    className={inp}
                    decimals={3}
                    placeholder="N/A"
                  />
                </Fld>
                <Fld label="Other Charges">
                  <MonoNumberInput
                    value={form.watch('other_charges')}
                    onChange={v => setValue('other_charges', v)}
                    className={inp}
                    decimals={3}
                    placeholder="N/A"
                  />
                </Fld>
              </div>

              {/* ── Toplam Banner ── */}
              <div className="bg-gray-50 rounded-xl px-4 py-3 mb-3 flex flex-wrap gap-5">
                <span className="text-[11px] text-gray-500">
                  Subtotal:{' '}
                  <strong className="text-gray-900 text-[12px]">{fCurrency(subtotal, currency as 'USD')}</strong>
                </span>
                <span className="text-[11px] text-gray-500">
                  Freight:{' '}
                  <strong className="text-gray-900 text-[12px]">{fCurrency(freight, currency as 'USD')}</strong>
                </span>
                <span className="text-[11px] text-gray-500">
                  TOTAL:{' '}
                  <strong className="text-red-600 text-[13px] font-extrabold">{fCurrency(total, currency as 'USD')}</strong>
                </span>
              </div>

              {/* ── İmzalayan ── */}
              <Fld label="Signatory" className="mb-3">
                <input className={inp} {...register('signatory')} />
              </Fld>

              {/* ── Notlar ── */}
              <Fld label="Notes" className="mb-3">
                <textarea className={ta} rows={6} {...register('notes')} />
              </Fld>

              {/* ── Footer ── */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-1 border-t border-gray-100">
                <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile} />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => downloadProformaTemplate()}>
                    ↓ Template
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => importRef.current?.click()}>
                    ↑ Import Excel
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="h-9 px-5 rounded-xl text-white text-[13px] font-semibold shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                    style={{ background: accent }}
                  >
                    {saving ? 'Saving…' : isEdit ? 'Update Proforma' : 'Save Proforma'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* RIGHT: Live preview — desktop only */}
          <div className="w-[520px] shrink-0 hidden md:flex flex-col border-l border-gray-100">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Önizleme</span>
              </div>
              <button
                type="button"
                onClick={handlePrintPreview}
                className="h-7 px-3 rounded-lg text-[11px] font-bold text-white flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                style={{ background: 'linear-gradient(135deg, #b70011 0%, #dc2626 100%)' }}
              >
                🖨 PDF / Yazdır
              </button>
            </div>
            <iframe
              srcDoc={previewHtml || '<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;color:#9ca3af;font-family:Arial;font-size:13px">Önizleme yükleniyor…</body></html>'}
              className="flex-1 w-full border-0 bg-gray-100"
              title="Proforma Preview"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
