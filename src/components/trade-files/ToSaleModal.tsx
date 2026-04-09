import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { saleConversionSchema, type SaleConversionFormData } from '@/types/forms';
import type { TradeFile } from '@/types/database';
import { useSuppliers } from '@/hooks/useEntities';
import { useConvertToSale, useUpdateSaleDetails } from '@/hooks/useTradeFiles';
import { useSettings } from '@/hooks/useSettings';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/form-elements';
import { FormRow, FormGroup } from '@/components/ui/shared';
import { journalService } from '@/services/journalService';

interface ToSaleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: TradeFile | null;
  editMode?: boolean;
}

const PAYMENT_TERMS_OPTIONS = [
  { value: '',                        label: '— Select —' },
  { value: '100% Prepayment',         label: '100% Prepayment' },
  { value: 'Downpayment',             label: 'Downpayment' },
  { value: 'Net 30',                  label: 'Net 30 days' },
  { value: 'Net 60',                  label: 'Net 60 days' },
  { value: 'Net 90',                  label: 'Net 90 days' },
  { value: 'Letter of Credit',        label: 'Letter of Credit (L/C)' },
  { value: 'Cash Against Documents',  label: 'Cash Against Documents (CAD)' },
  { value: 'Open Account',            label: 'Open Account' },
];

const CURRENCY_OPTIONS = (
  <>
    <option value="USD">USD — US Dollar</option>
    <option value="EUR">EUR — Euro</option>
    <option value="TRY">TRY — Turkish Lira</option>
  </>
);

export function ToSaleModal({ open, onOpenChange, file, editMode = false }: ToSaleModalProps) {
  const { data: suppliers = [] } = useSuppliers();
  const { data: settings } = useSettings();
  const convertToSale = useConvertToSale();
  const updateSaleDetails = useUpdateSaleDetails();
  const [posting, setPosting] = useState(false);
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

  // Yüzde değişince → tutar alanını güncelle (kullanıcı tutara odaklanmadıysa)
  useEffect(() => {
    if (advFocused.current) return;
    const base = Number(sellingPrice) * tonnage;
    const rate = Number(advanceRate ?? 0);
    const computed = base > 0 && rate > 0 ? (Math.round(base * rate / 100 * 100) / 100).toFixed(2) : '';
    setAdvAmtStr(computed);
  }, [advanceRate, sellingPrice, tonnage]);

  useEffect(() => {
    if (purchFocused.current) return;
    const base = Number(purchasePrice) * tonnage;
    const rate = Number(purchAdvanceRate ?? 0);
    const computed = base > 0 && rate > 0 ? (Math.round(base * rate / 100 * 100) / 100).toFixed(2) : '';
    setPurchAmtStr(computed);
  }, [purchAdvanceRate, purchasePrice, tonnage]);

  // Tutar girilince → yüzdeyi hesapla
  function handleAdvanceAmountChange(val: string) {
    setAdvAmtStr(val);
    const amt = parseFloat(val);
    const base = Number(sellingPrice) * tonnage;
    if (!isNaN(amt) && base > 0) {
      setValue('advance_rate', Math.round(amt / base * 10000) / 100);
    }
  }
  function handlePurchAdvanceAmountChange(val: string) {
    setPurchAmtStr(val);
    const amt = parseFloat(val);
    const base = Number(purchasePrice) * tonnage;
    if (!isNaN(amt) && base > 0) {
      setValue('purchase_advance_rate', Math.round(amt / base * 10000) / 100);
    }
  }

  // Özet satırı için hesaplama
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

    // Post customer advance receivable (sale side)
    const rate    = Number(data.advance_rate ?? 0);
    const selling = Number(data.selling_price ?? 0);
    const tonnage = Number(file.tonnage_mt ?? 0);
    if (data.payment_terms === 'Downpayment' && rate > 0 && selling > 0 && tonnage > 0) {
      const advanceAmt = Math.round(selling * tonnage * rate / 100 * 100) / 100;
      setPosting(true);
      try {
        await journalService.postAdvanceReceivable({
          tradeFileId: file.id,
          fileNo:       file.file_no,
          customerId:   file.customer_id,
          customerName: (file.customer as any)?.name ?? '',
          amount:       advanceAmt,
          currency:     data.sale_currency,
          advanceRate:  rate,
        });
      } finally {
        setPosting(false);
      }
    }

    // Post supplier advance payable (purchase side)
    const purchaseRate    = Number(data.purchase_advance_rate ?? 0);
    const purchasePrice   = Number(data.purchase_price ?? 0);
    if (purchaseRate > 0 && purchasePrice > 0 && tonnage > 0 && data.supplier_id) {
      const supplierAdvAmt = Math.round(purchasePrice * tonnage * purchaseRate / 100 * 100) / 100;
      setPosting(true);
      try {
        await journalService.postAdvancePayable({
          tradeFileId:  file.id,
          fileNo:       file.file_no,
          supplierId:   data.supplier_id,
          supplierName: (file.supplier as any)?.name ?? '',
          amount:       supplierAdvAmt,
          currency:     data.purchase_currency,
          advanceRate:  purchaseRate,
        });
      } finally {
        setPosting(false);
      }
    }

    onOpenChange(false);
  }

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{editMode ? 'Edit Sale Details' : 'Convert to Sale'}</DialogTitle>
          <DialogDescription>
            {file.file_no} — {file.customer?.name}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <FormRow>
            <FormGroup label="Supplier *" error={errors.supplier_id?.message}>
              <NativeSelect {...register('supplier_id')}>
                <option value="">— Select Supplier —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </NativeSelect>
            </FormGroup>
            <FormGroup label="Transport Mode">
              <NativeSelect {...register('transport_mode')}>
                <option value="truck">By Truck</option>
                <option value="railway">By Railway</option>
                <option value="sea">By Sea</option>
              </NativeSelect>
            </FormGroup>
          </FormRow>

          {/* Prices + Currencies side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {/* Purchase side */}
            <div className="border border-blue-100 bg-blue-50/40 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                📦 Purchase (from Supplier)
              </p>
              <FormGroup label="Purchase Price (per MT) *" error={errors.purchase_price?.message}>
                <Input type="number" step="0.01" {...register('purchase_price')} />
              </FormGroup>
              <FormGroup label="Purchase Currency">
                <NativeSelect {...register('purchase_currency')}>
                  {CURRENCY_OPTIONS}
                </NativeSelect>
              </FormGroup>
            </div>

            {/* Sale side */}
            <div className="border border-green-100 bg-green-50/40 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                💰 Sale (to Customer)
              </p>
              <FormGroup label="Selling Price (per MT) *" error={errors.selling_price?.message}>
                <Input type="number" step="0.01" {...register('selling_price')} />
              </FormGroup>
              <FormGroup label="Sale Currency">
                <NativeSelect {...register('sale_currency')}>
                  {CURRENCY_OPTIONS}
                </NativeSelect>
              </FormGroup>
            </div>
          </div>

          <FormRow>
            <FormGroup label="Freight Cost">
              <Input type="number" step="0.01" {...register('freight_cost')} />
            </FormGroup>
            <FormGroup label="Incoterms *" error={errors.incoterms?.message}>
              <Input {...register('incoterms')} />
            </FormGroup>
          </FormRow>

          <FormRow>
            <FormGroup label="Port of Loading *" error={errors.port_of_loading?.message}>
              <Input {...register('port_of_loading')} />
            </FormGroup>
            <FormGroup label="Port of Discharge">
              <Input {...register('port_of_discharge')} />
            </FormGroup>
          </FormRow>

          <FormRow cols={3}>
            <FormGroup label="ETA">
              <Input type="date" {...register('eta')} />
            </FormGroup>
            <FormGroup label="Vessel Name">
              <Input placeholder="e.g. MV ATLAS" {...register('vessel_name')} />
            </FormGroup>
            <FormGroup label="Register No">
              <Input {...register('register_no')} />
            </FormGroup>
          </FormRow>

          <FormRow>
            <FormGroup label="Proforma Ref">
              <Input {...register('proforma_ref')} />
            </FormGroup>
            <FormGroup label="Payment Terms">
              <NativeSelect {...register('payment_terms')}>
                {PAYMENT_TERMS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </NativeSelect>
            </FormGroup>
          </FormRow>

          {isDownpayment && (
            <div className="space-y-3 mb-3">
              {/* Müşteri Ön Ödeme */}
              <div className="border border-green-100 bg-green-50/30 rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-green-700 mb-2">
                  Müşteri Ön Ödeme
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <FormGroup label="Yüzde (%)" error={errors.advance_rate?.message}>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="örn. 30"
                      {...register('advance_rate')}
                    />
                  </FormGroup>
                  <FormGroup label={`Tutar (${saleCurrency || 'USD'})`}>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="örn. 75000"
                      value={advAmtStr}
                      onFocus={() => { advFocused.current = true; }}
                      onBlur={() => { advFocused.current = false; }}
                      onChange={(e) => handleAdvanceAmountChange(e.target.value)}
                    />
                  </FormGroup>
                </div>
                {tonnage > 0 && Number(sellingPrice) > 0 && Number(advanceRate) > 0 && (
                  <p className="text-[11px] text-green-700 mt-1.5 font-medium">
                    = {Number(sellingPrice).toLocaleString()} × {tonnage} MT × %{Number(advanceRate)} = <strong>${advanceAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                  </p>
                )}
              </div>

              {/* Satıcı Ön Ödeme */}
              <div className="border border-blue-100 bg-blue-50/30 rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700 mb-2">
                  Satıcı Ön Ödeme
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <FormGroup label="Yüzde (%)" error={errors.purchase_advance_rate?.message}>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="örn. 30"
                      {...register('purchase_advance_rate')}
                    />
                  </FormGroup>
                  <FormGroup label={`Tutar (${purchCurrency || 'USD'})`}>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="örn. 60000"
                      value={purchAmtStr}
                      onFocus={() => { purchFocused.current = true; }}
                      onBlur={() => { purchFocused.current = false; }}
                      onChange={(e) => handlePurchAdvanceAmountChange(e.target.value)}
                    />
                  </FormGroup>
                </div>
                {tonnage > 0 && Number(purchasePrice) > 0 && Number(purchAdvanceRate) > 0 && (
                  <p className="text-[11px] text-blue-700 mt-1.5 font-medium">
                    = {Number(purchasePrice).toLocaleString()} × {tonnage} MT × %{Number(purchAdvanceRate)} = <strong>${purchAdvanceAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || posting}>
              {posting
                ? 'Muhasebeye İşleniyor…'
                : mutation.isPending
                  ? (editMode ? 'Saving…' : 'Converting…')
                  : (editMode ? 'Save Changes' : 'Convert to Sale')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
