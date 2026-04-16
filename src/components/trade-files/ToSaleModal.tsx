import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { saleConversionSchema, type SaleConversionFormData } from '@/types/forms';
import type { TradeFile } from '@/types/database';
import { useSuppliers } from '@/hooks/useEntities';
import { useConvertToSale, useUpdateSaleDetails } from '@/hooks/useTradeFiles';
import { useSettings } from '@/hooks/useSettings';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MonoDatePicker } from '@/components/ui/MonoDatePicker';
import { cn } from '@/lib/utils';

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
    }
  }, [open, editMode, file, settings, reset, defCurrency]);

  async function onSubmit(data: SaleConversionFormData) {
    if (!file) return;
    await mutation.mutateAsync({ id: file.id, data });
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

          {/* Tedarikçi · Taşıma */}
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Tedarikçi *" error={errors.supplier_id?.message}>
              <select {...register('supplier_id')} className={sel}>
                <option value="">— Seçin —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Fld>
            <Fld label="Taşıma Şekli">
              <select {...register('transport_mode')} className={sel}>
                <option value="truck">Kara (Tır)</option>
                <option value="railway">Demiryolu</option>
                <option value="sea">Deniz</option>
              </select>
            </Fld>
          </div>

          {/* Alım · Satış fiyat kartları */}
          <div className="grid grid-cols-2 gap-3">
            {/* Alım */}
            <div className="bg-blue-50/60 rounded-xl p-3 space-y-2.5">
              <div className="text-[9px] font-bold uppercase tracking-widest text-blue-600">📦 Alım (Tedarikçi)</div>
              <Fld label="Alım Fiyatı (MT) *" error={errors.purchase_price?.message}>
                <input type="number" step="0.01" {...register('purchase_price')} className={cn(inp, 'bg-blue-100/60')} />
              </Fld>
              <Fld label="Para Birimi">
                <select {...register('purchase_currency')} className={cn(sel, 'bg-blue-100/60')}>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="TRY">TRY</option>
                  <option value="AED">AED</option>
                </select>
              </Fld>
            </div>

            {/* Satış */}
            <div className="bg-green-50/60 rounded-xl p-3 space-y-2.5">
              <div className="text-[9px] font-bold uppercase tracking-widest text-green-600">💰 Satış (Müşteri)</div>
              <Fld label="Satış Fiyatı (MT) *" error={errors.selling_price?.message}>
                <input type="number" step="0.01" {...register('selling_price')} className={cn(inp, 'bg-green-100/60')} />
              </Fld>
              <Fld label="Para Birimi">
                <select {...register('sale_currency')} className={cn(sel, 'bg-green-100/60')}>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="TRY">TRY</option>
                  <option value="AED">AED</option>
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
