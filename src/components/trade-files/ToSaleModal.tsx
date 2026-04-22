import { useEffect, useRef, useState, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { saleConversionSchema, type SaleConversionFormData } from '@/types/forms';
import type { TradeFile } from '@/types/database';
import { useSuppliers } from '@/hooks/useEntities';
import { useConvertToSale, useUpdateSaleDetails } from '@/hooks/useTradeFiles';
import { useSettings } from '@/hooks/useSettings';
import { useCurrencies } from '@/hooks/useCurrencies';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MonoDatePicker } from '@/components/ui/MonoDatePicker';
import { cn } from '@/lib/utils';

const MAX_SUPPLIERS = 5;

interface SupplierRow {
  uid: string;
  supplier_id: string;
  quantity_mt: string;
  purchase_price: string;
  currency: string;
  fx_rate: string;
}

function makeRow(overrides: Partial<SupplierRow> = {}): SupplierRow {
  return {
    uid: crypto.randomUUID(),
    supplier_id: '',
    quantity_mt: '',
    purchase_price: '',
    currency: 'USD',
    fx_rate: '1',
    ...overrides,
  };
}

// ── Mono stil sabitleri ───────────────────────────────────────────────────────
const inp = 'bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-gray-900 placeholder:text-gray-400 border-0 shadow-none focus:outline-none focus:ring-0 w-full';
const sel = 'bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-gray-900 border-0 shadow-none focus:outline-none w-full appearance-none cursor-pointer';
const Lbl = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{children}</div>
);
const Fld = ({ label, children, className, error }: { label: string; children: React.ReactNode; className?: string; error?: string }) => (
  <div className={className}>
    <Lbl>{label}</Lbl>
    {children}
    {error && <div className="text-[10px] text-red-500 mt-0.5">{error}</div>}
  </div>
);

interface ToSaleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: TradeFile | null;
  editMode?: boolean;
}

const PAYMENT_TERMS_OPTIONS = [
  { value: '',                        label: '— Seçin —' },
  { value: '100% Prepayment',         label: '100% Ön Ödeme' },
  { value: 'Downpayment',             label: 'Avans (Downpayment)' },
  { value: 'Net 30',                  label: 'Net 30 gün' },
  { value: 'Net 60',                  label: 'Net 60 gün' },
  { value: 'Net 90',                  label: 'Net 90 gün' },
  { value: 'Letter of Credit',        label: 'Akreditif (L/C)' },
  { value: 'Cash Against Documents',  label: 'Vesaik Mukabili (CAD)' },
  { value: 'Open Account',            label: 'Açık Hesap' },
];

export function ToSaleModal({ open, onOpenChange, file, editMode = false }: ToSaleModalProps) {
  const currencies = useCurrencies();
  const { data: suppliers = [] } = useSuppliers();
  const { data: settings } = useSettings();
  const convertToSale = useConvertToSale();
  const updateSaleDetails = useUpdateSaleDetails();
  const [advAmtStr,   setAdvAmtStr]   = useState('');
  const [purchAmtStr, setPurchAmtStr] = useState('');
  const advFocused   = useRef(false);
  const purchFocused = useRef(false);

  const mutation = editMode ? updateSaleDetails : convertToSale;
  const defCurrency = (settings?.default_currency ?? 'USD') as SaleConversionFormData['purchase_currency'];

  const form = useForm<SaleConversionFormData>({
    resolver: zodResolver(saleConversionSchema),
    defaultValues: {
      supplier_id: '',
      selling_price: 0,
      purchase_price: 0,
      freight_cost: 0,
      port_of_loading: settings?.default_port_of_loading ?? 'MERSIN, TURKEY',
      port_of_discharge: '',
      incoterms: settings?.default_incoterms ?? 'CPT',
      purchase_currency: defCurrency,
      sale_currency: defCurrency,
      payment_terms: settings?.payment_terms ?? '',
      advance_rate: 0,
      purchase_advance_rate: 0,
      transport_mode: 'truck',
      eta: '',
      vessel_name: '',
      proforma_ref: '',
      register_no: '',
    },
  });

  const { register, handleSubmit, formState: { errors }, reset, control, setValue } = form;
  const paymentTerms     = useWatch({ control, name: 'payment_terms' });
  const sellingPrice     = useWatch({ control, name: 'selling_price' });
  const purchasePrice    = useWatch({ control, name: 'purchase_price' });
  const advanceRate      = useWatch({ control, name: 'advance_rate' });
  const purchAdvanceRate = useWatch({ control, name: 'purchase_advance_rate' });
  const saleCurrency     = useWatch({ control, name: 'sale_currency' });
  const purchCurrency    = useWatch({ control, name: 'purchase_currency' });
  const isDownpayment    = paymentTerms === 'Downpayment';
  const tonnage = Number(file?.tonnage_mt ?? 0);

  // ── Çoklu tedarikçi satırları (UI önizleme; backend şu an ilk satırı kullanır) ──
  const baseCurrency = defCurrency;
  const [rows, setRows] = useState<SupplierRow[]>([makeRow({ currency: baseCurrency })]);

  function addRow() {
    if (rows.length >= MAX_SUPPLIERS) return;
    setRows((prev) => [...prev, makeRow({ currency: baseCurrency })]);
  }
  function removeRow(uid: string) {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((r) => r.uid !== uid));
  }
  function updateRow(uid: string, patch: Partial<SupplierRow>) {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  }

  // İlk satırı forma yansıt — backend entegrasyonu gelene kadar tek kayıt olarak gider
  useEffect(() => {
    const first = rows[0];
    if (!first) return;
    setValue('supplier_id', first.supplier_id);
    if (first.purchase_price !== '') setValue('purchase_price', Number(first.purchase_price));
    setValue('purchase_currency', first.currency as SaleConversionFormData['purchase_currency']);
  }, [rows, setValue]);

  // Toplam & özet
  const supplierTotals = useMemo(() => {
    let totalMt = 0;
    let totalCostBase = 0;
    for (const r of rows) {
      const mt = Number(r.quantity_mt) || 0;
      const price = Number(r.purchase_price) || 0;
      const fx = r.currency === baseCurrency ? 1 : Number(r.fx_rate) || 0;
      totalMt += mt;
      totalCostBase += mt * price * fx;
    }
    const weightedAvg = totalMt > 0 ? totalCostBase / totalMt : 0;
    const diff = Math.round((totalMt - tonnage) * 1000) / 1000;
    const matches = tonnage > 0 && Math.abs(diff) < 0.001;
    return { totalMt, totalCostBase, weightedAvg, diff, matches };
  }, [rows, tonnage, baseCurrency]);

  useEffect(() => {
    if (advFocused.current) return;
    const base = Number(sellingPrice) * tonnage;
    const rate = Number(advanceRate ?? 0);
    setAdvAmtStr(base > 0 && rate > 0 ? (Math.round(base * rate / 100 * 100) / 100).toFixed(2) : '');
  }, [advanceRate, sellingPrice, tonnage]);

  useEffect(() => {
    if (purchFocused.current) return;
    const base = Number(purchasePrice) * tonnage;
    const rate = Number(purchAdvanceRate ?? 0);
    setPurchAmtStr(base > 0 && rate > 0 ? (Math.round(base * rate / 100 * 100) / 100).toFixed(2) : '');
  }, [purchAdvanceRate, purchasePrice, tonnage]);

  function handleAdvanceAmountChange(val: string) {
    setAdvAmtStr(val);
    const amt = parseFloat(val);
    const base = Number(sellingPrice) * tonnage;
    if (!isNaN(amt) && base > 0) setValue('advance_rate', Math.round(amt / base * 10000) / 100);
  }
  function handlePurchAdvanceAmountChange(val: string) {
    setPurchAmtStr(val);
    const amt = parseFloat(val);
    const base = Number(purchasePrice) * tonnage;
    if (!isNaN(amt) && base > 0) setValue('purchase_advance_rate', Math.round(amt / base * 10000) / 100);
  }

  const advanceAmount      = tonnage > 0 && Number(sellingPrice) > 0
    ? Math.round(Number(sellingPrice) * tonnage * Number(advanceRate ?? 0) / 100 * 100) / 100 : 0;
  const purchAdvanceAmount = tonnage > 0 && Number(purchasePrice) > 0
    ? Math.round(Number(purchasePrice) * tonnage * Number(purchAdvanceRate ?? 0) / 100 * 100) / 100 : 0;

  useEffect(() => {
    if (open && editMode && file) {
      reset({
        supplier_id: file.supplier_id ?? '',
        selling_price: file.selling_price ?? 0,
        purchase_price: file.purchase_price ?? 0,
        freight_cost: file.freight_cost ?? 0,
        port_of_loading: file.port_of_loading ?? settings?.default_port_of_loading ?? 'MERSIN, TURKEY',
        port_of_discharge: file.port_of_discharge ?? '',
        incoterms: file.incoterms ?? settings?.default_incoterms ?? 'CPT',
        purchase_currency: (file.purchase_currency ?? file.currency ?? 'USD') as SaleConversionFormData['purchase_currency'],
        sale_currency: (file.sale_currency ?? file.currency ?? 'USD') as SaleConversionFormData['sale_currency'],
        payment_terms: file.payment_terms ?? settings?.payment_terms ?? '',
        advance_rate: file.advance_rate ?? 0,
        purchase_advance_rate: file.purchase_advance_rate ?? 0,
        transport_mode: (file.transport_mode as SaleConversionFormData['transport_mode']) ?? 'truck',
        eta: file.eta ?? '',
        vessel_name: file.vessel_name ?? '',
        proforma_ref: file.proforma_ref ?? '',
        register_no: file.register_no ?? file.septi_ref ?? '',
      });
      const existing = file.suppliers ?? [];
      if (existing.length > 0) {
        setRows(
          [...existing]
            .sort((a, b) => a.position - b.position)
            .map((s) => makeRow({
              supplier_id: s.supplier_id,
              quantity_mt: String(s.quantity_mt),
              purchase_price: String(s.purchase_price),
              currency: s.currency,
              fx_rate: String(s.fx_rate),
            })),
        );
      } else {
        setRows([
          makeRow({
            supplier_id: file.supplier_id ?? '',
            quantity_mt: file.tonnage_mt ? String(file.tonnage_mt) : '',
            purchase_price: file.purchase_price ? String(file.purchase_price) : '',
            currency: (file.purchase_currency ?? file.currency ?? 'USD') as string,
          }),
        ]);
      }
    } else if (open && !editMode) {
      reset({
        supplier_id: '',
        selling_price: 0,
        purchase_price: 0,
        freight_cost: 0,
        port_of_loading: settings?.default_port_of_loading ?? 'MERSIN, TURKEY',
        port_of_discharge: '',
        incoterms: settings?.default_incoterms ?? 'CPT',
        purchase_currency: defCurrency,
        sale_currency: defCurrency,
        payment_terms: settings?.payment_terms ?? '',
        advance_rate: 0,
        purchase_advance_rate: 0,
        transport_mode: 'truck',
        eta: '',
        vessel_name: '',
        proforma_ref: '',
        register_no: '',
      });
      setRows([makeRow({ currency: defCurrency })]);
    }
  }, [open, editMode, file, settings, reset, defCurrency]);

  async function onSubmit(data: SaleConversionFormData) {
    if (!file) return;
    const suppliersPayload = rows
      .filter((r) => r.supplier_id && Number(r.quantity_mt) > 0 && r.purchase_price !== '')
      .map((r) => ({
        supplier_id: r.supplier_id,
        quantity_mt: Number(r.quantity_mt),
        purchase_price: Number(r.purchase_price),
        currency: r.currency as SaleConversionFormData['purchase_currency'],
        fx_rate: r.currency === baseCurrency ? 1 : Number(r.fx_rate) || 1,
        freight_cost: 0,
        notes: '',
      }));
    await mutation.mutateAsync({
      id: file.id,
      data: { ...data, suppliers: suppliersPayload.length ? suppliersPayload : undefined },
    });
    onOpenChange(false);
  }

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle className="text-[15px] flex-1">
              {editMode ? 'Satış Detaylarını Düzenle' : 'Satışa Çevir'}
            </DialogTitle>
            <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md shrink-0">
              {file.file_no}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">{file.customer?.name}</p>
        </DialogHeader>

        {/* ── Form ────────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 mt-1">

          {/* Taşıma */}
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Taşıma Şekli">
              <select {...register('transport_mode')} className={sel}>
                <option value="truck">Kara (Tır)</option>
                <option value="railway">Demiryolu</option>
                <option value="sea">Deniz</option>
              </select>
            </Fld>
            <div />
          </div>

          {/* ── Alım Kartı (Çoklu Tedarikçi) ──────────────────────────────────── */}
          <div className="bg-blue-50/60 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-[9px] font-bold uppercase tracking-widest text-blue-600">
                📦 Alım (Tedarikçiler)
              </div>
              <div className="text-[9px] text-blue-700/70 font-semibold">
                {rows.length} / {MAX_SUPPLIERS}
              </div>
            </div>

            {errors.supplier_id && rows[0]?.supplier_id === '' && (
              <div className="text-[10px] text-red-500">{errors.supplier_id.message}</div>
            )}

            {rows.map((row, idx) => {
              const isBase = row.currency === baseCurrency;
              const lineTotalCur = (Number(row.quantity_mt) || 0) * (Number(row.purchase_price) || 0);
              const lineTotalBase = lineTotalCur * (isBase ? 1 : Number(row.fx_rate) || 0);

              return (
                <div key={row.uid} className="bg-white rounded-lg p-2.5 border border-blue-100/70">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center text-white text-[9px] font-bold">
                        {idx + 1}
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">
                        Tedarikçi {idx + 1}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(row.uid)}
                      disabled={rows.length <= 1}
                      className="text-[10px] text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="grid grid-cols-12 gap-1.5">
                    <div className="col-span-4">
                      <Lbl>Tedarikçi {idx === 0 && '*'}</Lbl>
                      <select
                        className={cn(sel, 'bg-blue-50')}
                        value={row.supplier_id}
                        onChange={(e) => updateRow(row.uid, { supplier_id: e.target.value })}
                      >
                        <option value="">— Seçin —</option>
                        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <Lbl>MT</Lbl>
                      <input
                        type="number" step="0.001" min="0" placeholder="25"
                        className={cn(inp, 'bg-blue-50')}
                        value={row.quantity_mt}
                        onChange={(e) => updateRow(row.uid, { quantity_mt: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <Lbl>Fiyat {idx === 0 && '*'}</Lbl>
                      <input
                        type="number" step="0.01" min="0" placeholder="720"
                        className={cn(inp, 'bg-blue-50')}
                        value={row.purchase_price}
                        onChange={(e) => updateRow(row.uid, { purchase_price: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <Lbl>Kur</Lbl>
                      <select
                        className={cn(sel, 'bg-blue-50')}
                        value={row.currency}
                        onChange={(e) => updateRow(row.uid, {
                          currency: e.target.value,
                          fx_rate: e.target.value === baseCurrency ? '1' : row.fx_rate,
                        })}
                      >
                        {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <Lbl>{isBase ? 'Kur' : `→ ${baseCurrency}`}</Lbl>
                      <input
                        type="number" step="0.0001" min="0"
                        disabled={isBase}
                        placeholder="1.08"
                        className={cn(inp, 'bg-blue-50', isBase && 'opacity-40 cursor-not-allowed')}
                        value={row.fx_rate}
                        onChange={(e) => updateRow(row.uid, { fx_rate: e.target.value })}
                      />
                    </div>
                  </div>

                  {lineTotalCur > 0 && (
                    <div className="mt-1.5 flex items-center justify-end gap-2 text-[9px]">
                      <span className="text-gray-400">
                        {Number(row.quantity_mt).toLocaleString()} MT × {Number(row.purchase_price).toLocaleString()} {row.currency}
                      </span>
                      <span className="font-mono font-bold text-gray-700">
                        = {lineTotalCur.toLocaleString('en-US', { minimumFractionDigits: 2 })} {row.currency}
                      </span>
                      {!isBase && (Number(row.fx_rate) || 0) > 0 && (
                        <span className="font-mono font-bold text-blue-700">
                          ≈ {lineTotalBase.toLocaleString('en-US', { minimumFractionDigits: 2 })} {baseCurrency}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={addRow}
              disabled={rows.length >= MAX_SUPPLIERS}
              className="w-full h-8 rounded-lg border-2 border-dashed border-blue-300 text-[11px] font-semibold text-blue-700 hover:bg-blue-100/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Tedarikçi Ekle {rows.length >= MAX_SUPPLIERS && '(maks. 5)'}
            </button>

            {/* Özet bandı */}
            <div className="bg-white rounded-lg px-3 py-2 border border-blue-100/70 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                {supplierTotals.matches ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                )}
                <span className="text-[10px] font-semibold text-gray-500">Toplam:</span>
                <span className={cn('text-[11px] font-extrabold font-mono', supplierTotals.matches ? 'text-green-700' : 'text-amber-700')}>
                  {supplierTotals.totalMt.toLocaleString()} / {tonnage} MT
                </span>
                {!supplierTotals.matches && tonnage > 0 && (
                  <span className="text-[9px] text-amber-600 font-semibold">
                    ({supplierTotals.diff > 0 ? '+' : ''}{supplierTotals.diff})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[8px] uppercase tracking-widest text-gray-400 font-bold">Ort. Birim</div>
                  <div className="text-[11px] font-extrabold text-gray-900 font-mono">
                    {supplierTotals.weightedAvg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {baseCurrency}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[8px] uppercase tracking-widest text-gray-400 font-bold">Toplam</div>
                  <div className="text-[12px] font-extrabold font-mono text-blue-700">
                    {supplierTotals.totalCostBase.toLocaleString('en-US', { minimumFractionDigits: 2 })} {baseCurrency}
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* ── Satış Kartı ─────────────────────────────────────────────────── */}
          <div className="bg-green-50/60 rounded-xl p-3 space-y-2.5">
            <div className="text-[9px] font-bold uppercase tracking-widest text-green-600">💰 Satış (Müşteri)</div>
            <div className="grid grid-cols-2 gap-3">
              <Fld label="Satış Fiyatı (MT) *" error={errors.selling_price?.message}>
                <input type="number" step="0.01" {...register('selling_price')} className={cn(inp, 'bg-green-100/60')} />
              </Fld>
              <Fld label="Para Birimi">
                <select {...register('sale_currency')} className={cn(sel, 'bg-green-100/60')}>
                  {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Fld>
            </div>
          </div>

          {/* Navlun · Incoterms */}
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Navlun">
              <input type="number" step="0.01" {...register('freight_cost')} className={inp} />
            </Fld>
            <Fld label="Incoterms *" error={errors.incoterms?.message}>
              <input {...register('incoterms')} className={inp} />
            </Fld>
          </div>

          {/* Yükleme · Boşaltma Limanı */}
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Yükleme Limanı *" error={errors.port_of_loading?.message}>
              <input {...register('port_of_loading')} className={inp} />
            </Fld>
            <Fld label="Boşaltma Limanı">
              <input {...register('port_of_discharge')} className={inp} />
            </Fld>
          </div>

          {/* ETA · Gemi · Kayıt No */}
          <div className="grid grid-cols-3 gap-3">
            <Fld label="ETA">
              <MonoDatePicker
                value={form.watch('eta') ?? ''}
                onChange={v => setValue('eta', v)}
                className="w-full bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-gray-900 border-0 focus:outline-none flex items-center justify-between overflow-hidden hover:bg-gray-200 transition-colors"
              />
            </Fld>
            <Fld label="Gemi Adı">
              <input placeholder="örn. MV ATLAS" {...register('vessel_name')} className={inp} />
            </Fld>
            <Fld label="Kayıt No">
              <input {...register('register_no')} className={inp} />
            </Fld>
          </div>

          {/* Proforma Ref · Ödeme Koşulları */}
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Proforma Ref">
              <input {...register('proforma_ref')} className={inp} />
            </Fld>
            <Fld label="Ödeme Koşulları">
              <select {...register('payment_terms')} className={sel}>
                {PAYMENT_TERMS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Fld>
          </div>

          {/* Avans bölümü — sadece Downpayment seçiliyse */}
          {isDownpayment && (
            <div className="space-y-2">
              {/* Müşteri avansı */}
              <div className="bg-green-50/50 rounded-xl p-3">
                <div className="text-[9px] font-bold uppercase tracking-widest text-green-700 mb-2">Müşteri Ön Ödeme</div>
                <div className="grid grid-cols-2 gap-3">
                  <Fld label="Yüzde (%)" error={errors.advance_rate?.message}>
                    <input type="number" min="0" max="100" step="0.01" placeholder="örn. 30"
                      {...register('advance_rate')} className={cn(inp, 'bg-green-100/60')} />
                  </Fld>
                  <Fld label={`Tutar (${saleCurrency || 'USD'})`}>
                    <input type="number" step="0.01" placeholder="örn. 75000"
                      value={advAmtStr}
                      onFocus={() => { advFocused.current = true; }}
                      onBlur={() => { advFocused.current = false; }}
                      onChange={e => handleAdvanceAmountChange(e.target.value)}
                      className={cn(inp, 'bg-green-100/60')} />
                  </Fld>
                </div>
                {tonnage > 0 && Number(sellingPrice) > 0 && Number(advanceRate) > 0 && (
                  <p className="text-[10px] text-green-700 mt-1.5 font-medium">
                    {Number(sellingPrice).toLocaleString()} × {tonnage} MT × %{Number(advanceRate)} = <strong>${advanceAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                  </p>
                )}
              </div>

              {/* Tedarikçi avansı */}
              <div className="bg-blue-50/50 rounded-xl p-3">
                <div className="text-[9px] font-bold uppercase tracking-widest text-blue-700 mb-2">Tedarikçi Ön Ödeme</div>
                <div className="grid grid-cols-2 gap-3">
                  <Fld label="Yüzde (%)" error={errors.purchase_advance_rate?.message}>
                    <input type="number" min="0" max="100" step="0.01" placeholder="örn. 30"
                      {...register('purchase_advance_rate')} className={cn(inp, 'bg-blue-100/60')} />
                  </Fld>
                  <Fld label={`Tutar (${purchCurrency || 'USD'})`}>
                    <input type="number" step="0.01" placeholder="örn. 60000"
                      value={purchAmtStr}
                      onFocus={() => { purchFocused.current = true; }}
                      onBlur={() => { purchFocused.current = false; }}
                      onChange={e => handlePurchAdvanceAmountChange(e.target.value)}
                      className={cn(inp, 'bg-blue-100/60')} />
                  </Fld>
                </div>
                {tonnage > 0 && Number(purchasePrice) > 0 && Number(purchAdvanceRate) > 0 && (
                  <p className="text-[10px] text-blue-700 mt-1.5 font-medium">
                    {Number(purchasePrice).toLocaleString()} × {tonnage} MT × %{Number(purchAdvanceRate)} = <strong>${purchAdvanceAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Footer ──────────────────────────────────────────────────────── */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="hidden md:flex px-4 h-8 rounded-lg text-[12px] font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors items-center justify-center"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full md:w-auto px-4 h-12 md:h-8 rounded-2xl md:rounded-lg text-[14px] md:text-[12px] font-bold text-white shadow-sm disabled:opacity-50 active:scale-[0.98] transition-all"
              style={{ background: 'linear-gradient(135deg, #b70011 0%, #dc2626 100%)' }}
            >
              {mutation.isPending
                ? (editMode ? 'Kaydediliyor…' : 'Çevriliyor…')
                : (editMode ? 'Kaydet' : 'Satışa Çevir')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
