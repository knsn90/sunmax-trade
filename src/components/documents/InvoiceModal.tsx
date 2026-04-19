import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { invoiceSchema, type InvoiceFormData } from '@/types/forms';
import type { TradeFile, Invoice } from '@/types/database';
import { useCreateInvoice, useUpdateInvoice } from '@/hooks/useDocuments';
import { invoiceService } from '@/services/invoiceService';
import { useSettings, useBankAccounts } from '@/hooks/useSettings';
import { useTradeFiles } from '@/hooks/useTradeFiles';
import { useCustomers } from '@/hooks/useEntities';
import { today, fCurrency } from '@/lib/formatters';
import { formatInvoiceNo } from '@/lib/generators';
import { parseInvoiceExcel, downloadInvoiceTemplate } from '@/lib/excelImport';
import { printInvoice } from '@/lib/printDocument';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { OcrButton } from '@/components/ui/OcrButton';
import { SmartFill } from '@/components/ui/SmartFill';
import { MonoDatePicker } from '@/components/ui/MonoDatePicker';
import { cn } from '@/lib/utils';
import { HelpCircle, Banknote, Building2, CreditCard, ChevronDown, ChevronUp } from 'lucide-react';
import type { OcrResult } from '@/lib/openai';

// ── Helpers ─────────────────────────────────────────────────────────────────
function buildAddress(c: { name?: string; address?: string; city?: string; country?: string } | null | undefined): string {
  if (!c) return '';
  return [c.name, c.address, [c.city, c.country].filter(Boolean).join(', ')].filter(Boolean).join('\n');
}

// ── Mono design primitives ──────────────────────────────────────────────────
const inp = 'bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-gray-900 placeholder:text-gray-400 border-0 shadow-none focus:outline-none focus:ring-0 w-full';
const sel = 'bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-gray-900 border-0 shadow-none focus:outline-none w-full appearance-none cursor-pointer';

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{children}</div>;
}
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Lbl>{label}</Lbl>
      {children}
    </div>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 pt-1">{children}</div>;
}
function Divider() { return <div className="border-t border-gray-100 my-1" />; }

// ── Constants ───────────────────────────────────────────────────────────────
const TXN_TYPES = [
  { value: 'sale_inv',     label: 'Satış Faturası' },
  { value: 'purchase_inv', label: 'Satın Alma Faturası' },
  { value: 'svc_inv',      label: 'Hizmet Faturası' },
  { value: 'receipt',      label: 'Tahsilat' },
  { value: 'payment',      label: 'Ödeme' },
  { value: 'advance',      label: 'Ön Ödeme' },
  { value: 'ic_transfer',  label: 'İç Transfer' },
] as const;

const PAYMENT_METHODS = [
  { value: '' as const,               label: 'Belirtilmedi', icon: <HelpCircle className="h-4 w-4" /> },
  { value: 'nakit' as const,          label: 'Nakit',        icon: <Banknote className="h-4 w-4" /> },
  { value: 'banka_havalesi' as const, label: 'Banka',        icon: <Building2 className="h-4 w-4" /> },
  { value: 'kredi_karti' as const,    label: 'Kredi Kartı',  icon: <CreditCard className="h-4 w-4" /> },
] as const;

interface InvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: TradeFile | null;
  invoice?: Invoice | null;
  invoiceType?: 'commercial' | 'sale';
  onSwitchToTransaction?: (type: string) => void;
}

export function InvoiceModal({
  open, onOpenChange, file, invoice, invoiceType = 'commercial', onSwitchToTransaction,
}: InvoiceModalProps) {
  const { t } = useTranslation('documents');
  const { t: tc } = useTranslation('common');

  const { data: settings } = useSettings();
  const { data: bankAccounts } = useBankAccounts();
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const isEdit = !!invoice;
  const importRef = useRef<HTMLInputElement>(null);

  // ── Sale mode helpers ────────────────────────────────────────────────────
  const isSaleMode = (invoice?.invoice_type ?? invoiceType) === 'sale';
  const needsFilePicker = isSaleMode && !file && !invoice;

  const { data: allFiles = [] } = useTradeFiles();
  const { data: customers = [] } = useCustomers();
  const saleFiles = allFiles.filter(f => ['sale', 'delivery', 'completed'].includes(f.status));

  const [pickedCustomerId, setPickedCustomerId] = useState('');
  const [pickedFileId, setPickedFileId] = useState('');
  const filteredFiles = pickedCustomerId
    ? saleFiles.filter(f => f.customer_id === pickedCustomerId)
    : saleFiles;
  const pickedFile = filteredFiles.find(f => f.id === pickedFileId) ?? null;
  const effectiveFile = file ?? pickedFile;

  // ── Payment state ────────────────────────────────────────────────────────
  const [paymentMethod, setPaymentMethod] = useState<'' | 'nakit' | 'banka_havalesi' | 'kredi_karti'>('');
  const [masrafOpen, setMasrafOpen] = useState(false);
  const [masrafTuru, setMasrafTuru] = useState('');
  const [masrafTutar, setMasrafTutar] = useState(0);
  const [masrafCurrency, setMasrafCurrency] = useState<'USD' | 'EUR' | 'TRY'>('USD');
  const [masrafRate, setMasrafRate] = useState(1);

  // ── Form ────────────────────────────────────────────────────────────────
  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoice_date: today(),
      currency: settings?.default_currency ?? 'USD',
      incoterms: settings?.default_incoterms ?? 'CPT',
      proforma_no: '', cb_no: '', insurance_no: '',
      quantity_admt: 0, unit_price: 0, freight: 0,
      gross_weight_kg: undefined, packing_info: '',
      payment_terms: settings?.payment_terms ?? '',
      bill_to: '', ship_to: '', qty_unit: 'ADMT' as const,
    },
  });
  const { register, handleSubmit, formState: { errors }, reset, control, setValue } = form;

  useEffect(() => {
    if (!open) {
      setPickedCustomerId(''); setPickedFileId('');
      setPaymentMethod(''); setMasrafOpen(false);
      setMasrafTuru(''); setMasrafTutar(0); setMasrafCurrency('USD'); setMasrafRate(1);
      return;
    }
    if (invoice) {
      const invAny = invoice as unknown as Record<string, unknown>;
      reset({
        invoice_date: invoice.invoice_date, currency: invoice.currency,
        incoterms: invoice.incoterms ?? 'CPT', proforma_no: invoice.proforma_no ?? '',
        cb_no: invoice.cb_no ?? '', insurance_no: invoice.insurance_no ?? '',
        quantity_admt: invoice.quantity_admt, unit_price: invoice.unit_price,
        freight: invoice.freight, gross_weight_kg: invoice.gross_weight_kg ?? undefined,
        packing_info: invoice.packing_info ?? '', payment_terms: invoice.payment_terms ?? '',
        bill_to: (invAny['bill_to'] as string) ?? '',
        ship_to: (invAny['ship_to'] as string) ?? '',
        qty_unit: ((invAny['qty_unit'] as string) || 'ADMT') as 'ADMT' | 'MT',
      });
    } else if (file) {
      const customer = customers.find(c => c.id === file.customer_id);
      const addr = buildAddress(customer ?? file.customer);
      reset({
        invoice_date: today(),
        currency: file.currency ?? settings?.default_currency ?? 'USD',
        incoterms: file.incoterms ?? settings?.default_incoterms ?? 'CPT',
        proforma_no: file.proforma_ref ?? '', cb_no: '', insurance_no: file.insurance_tr ?? '',
        quantity_admt: file.delivered_admt ?? file.tonnage_mt ?? 0,
        unit_price: file.selling_price ?? 0, freight: file.freight_cost ?? 0,
        gross_weight_kg: file.gross_weight_kg ?? undefined, packing_info: '',
        payment_terms: file.payment_terms ?? settings?.payment_terms ?? '',
        bill_to: addr, ship_to: addr, qty_unit: 'ADMT' as const,
      });
    }
  }, [open, file, invoice, settings, reset]);

  useEffect(() => {
    if (!open || !pickedFile || invoice) return;
    const customer = customers.find(c => c.id === pickedFile.customer_id);
    const addr = buildAddress(customer ?? pickedFile.customer);
    reset({
      invoice_date: today(),
      currency: pickedFile.currency ?? settings?.default_currency ?? 'USD',
      incoterms: pickedFile.incoterms ?? settings?.default_incoterms ?? 'CPT',
      proforma_no: pickedFile.proforma_ref ?? '', cb_no: '', insurance_no: pickedFile.insurance_tr ?? '',
      quantity_admt: pickedFile.delivered_admt ?? pickedFile.tonnage_mt ?? 0,
      unit_price: pickedFile.selling_price ?? 0, freight: pickedFile.freight_cost ?? 0,
      gross_weight_kg: pickedFile.gross_weight_kg ?? undefined, packing_info: '',
      payment_terms: pickedFile.payment_terms ?? settings?.payment_terms ?? '',
      bill_to: addr, ship_to: addr, qty_unit: 'ADMT' as const,
    });
  }, [pickedFile, open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPickedFileId(''); }, [pickedCustomerId]);

  const qty      = useWatch({ control, name: 'quantity_admt' }) ?? 0;
  const price    = useWatch({ control, name: 'unit_price' }) ?? 0;
  const freight  = useWatch({ control, name: 'freight' }) ?? 0;
  const currency = useWatch({ control, name: 'currency' }) ?? 'USD';
  const qtyUnit  = useWatch({ control, name: 'qty_unit' }) ?? 'ADMT';
  const subtotal = qty * price;
  const total    = subtotal + freight;

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = '';
    try {
      const imported = await parseInvoiceExcel(f);
      if (imported.quantity_admt !== undefined) setValue('quantity_admt', imported.quantity_admt);
      if (imported.unit_price    !== undefined) setValue('unit_price',    imported.unit_price);
      if (imported.freight       !== undefined) setValue('freight',       imported.freight);
      if (imported.gross_weight_kg !== undefined) setValue('gross_weight_kg', imported.gross_weight_kg);
      if (imported.proforma_no)   setValue('proforma_no',   imported.proforma_no);
      if (imported.cb_no)         setValue('cb_no',         imported.cb_no);
      if (imported.insurance_no)  setValue('insurance_no',  imported.insurance_no);
      if (imported.payment_terms) setValue('payment_terms', imported.payment_terms);
      if (imported.packing_info)  setValue('packing_info',  imported.packing_info);
      toast.success(t('invoice.modal.successImported'));
    } catch { toast.error(t('invoice.modal.errorParseFailed')); }
  }

  function handleOcrResult(result: OcrResult) {
    if (result.date) setValue('invoice_date', result.date);
    if (result.currency && ['USD','EUR','TRY'].includes(result.currency))
      setValue('currency', result.currency as InvoiceFormData['currency']);
    if (result.quantity_admt) setValue('quantity_admt', result.quantity_admt);
    if (result.unit_price)    setValue('unit_price',    result.unit_price);
    if (result.freight != null) setValue('freight',     result.freight);
    if (result.incoterms)     setValue('incoterms',     result.incoterms);
    if (result.proforma_no)   setValue('proforma_no',   result.proforma_no);
    if (result.cb_no)         setValue('cb_no',         result.cb_no);
    if (result.insurance_no)  setValue('insurance_no',  result.insurance_no);
    if (result.payment_terms) setValue('payment_terms', result.payment_terms);
  }

  function handlePrint() {
    if (!invoice) { toast.error(t('invoice.modal.errorSaveFirst')); return; }
    if (!settings) return;
    const defaultBank = bankAccounts?.find(b => b.is_default) ?? bankAccounts?.[0] ?? null;
    const isDraft = (invoice.doc_status ?? 'draft') !== 'approved';
    printInvoice(invoice, settings, defaultBank, isDraft);
  }

  const effectiveType = invoice?.invoice_type ?? invoiceType;

  const [saving, setSaving] = useState(false);

  async function onSubmit(data: InvoiceFormData) {
    setSaving(true);
    try {
      if (isEdit && invoice) {
        await updateInvoice.mutateAsync({ id: invoice.id, data, existingInvoice: invoice });
      } else if (effectiveFile) {
        const isSale = effectiveType === 'sale';
        let invNo: string;
        if (isSale) {
          invNo = `SINV-${new Date().getFullYear()}-${String(Date.now() % 100000).padStart(5, '0')}`;
        } else {
          const baseNo = formatInvoiceNo(effectiveFile.file_no);
          invNo = await invoiceService.generateUniqueCommercialInvoiceNo(effectiveFile.id, baseNo);
        }
        await createInvoice.mutateAsync({
          tradeFileId: effectiveFile.id,
          customerId: effectiveFile.customer_id,
          productName: effectiveFile.product?.name ?? '',
          invoiceNo: invNo,
          data,
          invoiceType: effectiveType,
        });

        // Transaction is created by useCreateInvoice via syncSaleInvoiceTransaction — no duplicate needed here.
      } else {
        toast.error('Lütfen bir ticaret dosyası seçin');
        return;
      }
      onOpenChange(false);
    } catch {
      // Error shown via toast
    } finally {
      setSaving(false);
    }
  }

  const isSaving = saving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <div className="min-w-0 flex-1">
              <DialogTitle>
                {invoice?.invoice_type === 'sale'
                  ? (isEdit ? t('invoice.modal.titleEditSale') : t('invoice.modal.titleNewSale'))
                  : (isEdit ? t('invoice.modal.titleEditCommercial') : t('invoice.modal.titleNewCommercial'))}
              </DialogTitle>
              {(effectiveFile?.file_no || effectiveFile?.customer?.name || invoice?.customer?.name) && (
                <DialogDescription className="truncate">
                  {effectiveFile?.file_no ?? ''} — {effectiveFile?.customer?.name ?? invoice?.customer?.name ?? ''}
                </DialogDescription>
              )}
            </div>
            <div className="flex gap-1.5 shrink-0">
              <SmartFill mode="invoice" onResult={handleOcrResult} formName="Invoice" iconOnly />
              <OcrButton mode="invoice" onResult={handleOcrResult} iconOnly />
            </div>
          </div>

          {/* ── İşlem türü pill seçici ── */}
          {!isEdit && onSwitchToTransaction && (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto scrollbar-none mt-3">
              {TXN_TYPES.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    if (opt.value !== 'sale_inv') {
                      onOpenChange(false);
                      onSwitchToTransaction(opt.value);
                    }
                  }}
                  className={cn(
                    'shrink-0 px-3 h-7 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap',
                    opt.value === 'sale_inv'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-3 py-1">

            {/* ── Müşteri + Dosya seçimi (muhasebeden açılınca) ── */}
            {needsFilePicker && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Müşteri">
                    <select className={sel} value={pickedCustomerId} onChange={e => setPickedCustomerId(e.target.value)}>
                      <option value="">— Tüm müşteriler —</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Ticaret Dosyası *">
                    <select className={sel} value={pickedFileId} onChange={e => setPickedFileId(e.target.value)}>
                      <option value="">— Dosya seçin —</option>
                      {filteredFiles.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.file_no} — {f.customer?.name ?? '—'} {f.product?.name ? `(${f.product.name})` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Divider />
              </>
            )}

            {/* ── Fatura Bilgileri ── */}
            <div className="grid grid-cols-3 gap-3">
              <Field label={`${tc('form.date')} *`}>
                <MonoDatePicker value={form.watch('invoice_date') ?? ''} onChange={v => setValue('invoice_date', v)} />
                {errors.invoice_date && <p className="text-[11px] text-red-500 mt-0.5">{errors.invoice_date.message}</p>}
              </Field>
              <Field label={tc('form.currency')}>
                <select className={sel} {...register('currency')}>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="TRY">TRY</option>
                </select>
              </Field>
              <Field label={t('invoice.modal.incoterms')}>
                <input className={inp} {...register('incoterms')} />
              </Field>
            </div>

            <Divider />

            {/* ── Miktar / Fiyat ── */}
            <div className="grid grid-cols-3 gap-3">
              <Field label={`${t('invoice.modal.quantityAdmt')} *`}>
                <input type="number" step="0.001" className={inp} {...register('quantity_admt')} placeholder="0.000" />
                {errors.quantity_admt && <p className="text-[11px] text-red-500 mt-0.5">{errors.quantity_admt.message}</p>}
              </Field>
              <Field label={`${t('invoice.modal.unitPrice')} *`}>
                <input type="number" step="0.001" className={inp} {...register('unit_price')} placeholder="0.000" />
                {errors.unit_price && <p className="text-[11px] text-red-500 mt-0.5">{errors.unit_price.message}</p>}
              </Field>
              <Field label={t('invoice.modal.freight')}>
                <input type="number" step="0.001" className={inp} {...register('freight')} placeholder="0.000" />
              </Field>
            </div>

            {/* Live totals */}
            <div className="flex flex-wrap gap-3 sm:gap-5 text-[12px]">
              <span className="text-gray-500">{t('invoice.modal.subtotal')} <strong className="text-gray-900">{fCurrency(subtotal, currency as 'USD')}</strong></span>
              <span className="text-gray-500">{t('invoice.modal.freightLabel')} <strong className="text-gray-900">{fCurrency(freight, currency as 'USD')}</strong></span>
              <span className="text-gray-500">{t('invoice.modal.total')} <strong className="text-gray-900 text-[13px]">{fCurrency(total, currency as 'USD')}</strong></span>
            </div>

            <Divider />

            {/* ── Referans Bilgileri ── */}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('invoice.modal.proformaNo')}>
                <input className={inp} {...register('proforma_no')} />
              </Field>
              <Field label={t('invoice.modal.cbNo')}>
                <input className={inp} {...register('cb_no')} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('invoice.modal.insuranceNo')}>
                <input className={inp} {...register('insurance_no')} />
              </Field>
              <Field label={tc('form.payment_terms')}>
                <input className={inp} {...register('payment_terms')} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('invoice.modal.grossWeight')}>
                <input type="number" step="0.001" className={inp} {...register('gross_weight_kg')} placeholder="0.000" />
              </Field>
              <Field label={t('invoice.modal.packingInfo')}>
                <input className={inp} {...register('packing_info')} placeholder={t('invoice.modal.packingPlaceholder')} />
              </Field>
            </div>

            <Divider />

            {/* ── Miktar Birimi ── */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Miktar Birimi:</span>
              <Controller
                control={control}
                name="qty_unit"
                render={({ field }) => (
                  <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
                    {(['ADMT', 'MT'] as const).map(u => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => field.onChange(u)}
                        className={cn(
                          'px-3 h-6 rounded-md text-[11px] font-semibold transition-all',
                          field.value === u ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                        )}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                )}
              />
              <span className="text-[10px] text-gray-400 ml-1">{qtyUnit === 'ADMT' ? 'Air Dried Metric Ton' : 'Metric Ton'}</span>
            </div>

            {/* ── Bill To / Ship To ── */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bill To">
                <textarea
                  rows={3}
                  className="bg-gray-100 rounded-lg px-3 py-2 text-[12px] text-gray-900 placeholder:text-gray-400 border-0 shadow-none focus:outline-none focus:ring-0 w-full resize-none"
                  placeholder="Alıcı bilgileri..."
                  {...register('bill_to')}
                />
              </Field>
              <Field label="Ship To">
                <textarea
                  rows={3}
                  className="bg-gray-100 rounded-lg px-3 py-2 text-[12px] text-gray-900 placeholder:text-gray-400 border-0 shadow-none focus:outline-none focus:ring-0 w-full resize-none"
                  placeholder="Teslimat adresi..."
                  {...register('ship_to')}
                />
              </Field>
            </div>

            {/* ── Ödeme (sadece sale modunda) ── */}
            {isSaleMode && (
              <>
                <Divider />
                <SectionTitle>Ödeme</SectionTitle>
                <div className="grid grid-cols-4 gap-1.5">
                  {PAYMENT_METHODS.map(pm => (
                    <button key={pm.value} type="button"
                      onClick={() => setPaymentMethod(pm.value as typeof paymentMethod)}
                      className={cn(
                        'flex flex-col items-center gap-1 py-2 px-2 rounded-lg text-[10px] font-semibold transition-all',
                        paymentMethod === pm.value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                      )}>
                      {pm.icon}{pm.label}
                    </button>
                  ))}
                </div>

                <button type="button" onClick={() => setMasrafOpen(v => !v)}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-[11px] font-semibold text-gray-500 transition-colors">
                  {masrafOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  + Masraf / Komisyon Ekle
                </button>

                {masrafOpen && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Masraf Türü">
                        <input className={inp} value={masrafTuru} onChange={e => setMasrafTuru(e.target.value)} placeholder="Örn. Banka komisyonu" />
                      </Field>
                      <Field label="Tutar">
                        <input type="number" step="0.01" className={inp} value={masrafTutar || ''} onChange={e => setMasrafTutar(Number(e.target.value))} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Para Birimi">
                        <select className={sel} value={masrafCurrency} onChange={e => setMasrafCurrency(e.target.value as typeof masrafCurrency)}>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="TRY">TRY</option>
                        </select>
                      </Field>
                      {masrafCurrency !== 'USD' && (
                        <Field label="Kur">
                          <input type="number" step="0.0001" className={inp} value={masrafRate || ''} onChange={e => setMasrafRate(Number(e.target.value))} placeholder="0.0000" />
                        </Field>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

          </div>

          {/* ── Footer ── */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-1">
            <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile} />
            <div className="flex gap-2">
              <button type="button" onClick={() => downloadInvoiceTemplate()}
                className="h-8 px-3 rounded-lg text-[11px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
                {t('invoice.modal.btnTemplate')}
              </button>
              <button type="button" onClick={() => importRef.current?.click()}
                className="h-8 px-3 rounded-lg text-[11px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
                {t('invoice.modal.btnImportExcel')}
              </button>
            </div>
            <div className="flex flex-col md:flex-row gap-2">
              {isEdit && (
                <button type="button" onClick={handlePrint}
                  className="hidden md:flex h-8 px-3 rounded-lg text-[11px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors items-center justify-center">
                  {t('invoice.modal.btnPrint')}
                </button>
              )}
              <button type="button" onClick={() => onOpenChange(false)}
                className="hidden md:flex h-8 px-4 rounded-lg text-[12px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors items-center justify-center">
                {tc('btn.cancel')}
              </button>
              <button type="submit" disabled={isSaving}
                className="w-full md:w-auto h-12 md:h-8 px-4 rounded-2xl md:rounded-lg text-[14px] md:text-[12px] font-bold text-white disabled:opacity-50 active:scale-[0.98] transition-all"
                style={{ background: 'linear-gradient(135deg, #b70011 0%, #dc2626 100%)' }}>
                {isSaving ? tc('btn.saving') : isEdit ? t('invoice.modal.btnUpdate') : t('invoice.modal.btnSave')}
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
