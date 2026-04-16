import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { proformaSchema, type ProformaFormData } from '@/types/forms';
import type { TradeFile, Proforma } from '@/types/database';
import { useCreateProforma, useUpdateProforma } from '@/hooks/useProformas';
import { useCustomers } from '@/hooks/useEntities';
import { useSettings, useBankAccounts } from '@/hooks/useSettings';
import { today, fCurrency } from '@/lib/formatters';
import { formatProformaNo } from '@/lib/generators';
import { parseProformaExcel, downloadProformaTemplate } from '@/lib/excelImport';
import { printProforma } from '@/lib/printDocument';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, Textarea } from '@/components/ui/form-elements';
import { FormRow, FormGroup } from '@/components/ui/shared';
import { OcrButton } from '@/components/ui/OcrButton';
import { SmartFill } from '@/components/ui/SmartFill';
import { WeekPicker } from '@/components/ui/WeekPicker';
import type { OcrResult } from '@/lib/openai';

interface ProformaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: TradeFile | null;
  proforma?: Proforma | null;
}

export function ProformaModal({ open, onOpenChange, file, proforma }: ProformaModalProps) {
  const { data: settings } = useSettings();
  const { data: bankAccounts } = useBankAccounts();
  const { data: allCustomers = [] } = useCustomers();
  const createPI = useCreateProforma();
  const updatePI = useUpdateProforma();
  const isEdit = !!proforma;
  const importRef = useRef<HTMLInputElement>(null);

  // ── Consignee (Alıcı Firma) ───────────────────────────────────────────
  const [consigneeId, setConsigneeId] = useState<string>('');
  // Sub-customers of the trade file's customer
  const mainCustomerId = file?.customer_id ?? '';
  const subCustomers = allCustomers.filter(c => c.parent_customer_id === mainCustomerId);
  const mainCustomer = allCustomers.find(c => c.id === mainCustomerId);
  // Show the dropdown only if there are sub-companies defined
  const hasSubCustomers = subCustomers.length > 0;

  const hsCode = proforma?.hs_code || file?.product?.hs_code || '';
  const defaultNotes = [
    '1- Total Quantity:',
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
        payment_terms: file.payment_terms ?? settings?.payment_terms ?? '',
        transport_mode: file.transport_mode ?? 'truck',
        shipment_method: '',
        currency: file.currency ?? settings?.default_currency ?? 'USD',
        place_of_payment: 'ISTANBUL - TURKEY',
        delivery_time: '',
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

  const qty = useWatch({ control, name: 'quantity_admt' }) ?? 0;
  const price = useWatch({ control, name: 'unit_price' }) ?? 0;
  const freight = useWatch({ control, name: 'freight' }) ?? 0;
  const discount = useWatch({ control, name: 'discount' }) ?? 0;
  const otherCharges = useWatch({ control, name: 'other_charges' }) ?? 0;
  const currency = useWatch({ control, name: 'currency' }) ?? 'USD';

  const subtotal = qty * price;
  const total = subtotal + freight - discount + otherCharges;

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

  function handlePrint() {
    if (!proforma) { toast.error('Save the proforma first to print it.'); return; }
    if (!settings) return;
    const defaultBank = bankAccounts?.find((b) => b.is_default) ?? bankAccounts?.[0] ?? null;
    printProforma(proforma, settings, defaultBank, file);
  }

  async function onSubmit(data: ProformaFormData) {
    try {
      const cId = consigneeId || undefined;
      if (isEdit && proforma) {
        await updatePI.mutateAsync({ id: proforma.id, data, consigneeId: cId });
      } else if (file) {
        const prefix = settings?.file_prefix ?? 'ESN';
        const piNo = formatProformaNo(prefix, Date.now() % 10000);
        await createPI.mutateAsync({ tradeFileId: file.id, proformaNo: piNo, data, consigneeId: cId });
      }
      onOpenChange(false);
    } catch {
      // Error already shown via toast — prevent UI freeze
    }
  }

  if (!file && !proforma) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
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

        <form onSubmit={handleSubmit(onSubmit)}>

          {/* ── Alıcı Firma (Consignee) — sadece alt firma varsa göster ── */}
          {hasSubCustomers && (
            <div className="mb-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-blue-600 mb-1.5">
                Alıcı Firma (Consignee)
              </label>
              <NativeSelect
                value={consigneeId}
                onChange={e => setConsigneeId(e.target.value)}
                className="text-[12px]"
              >
                <option value="">{mainCustomer?.name ?? '—'} (Ana Firma)</option>
                {subCustomers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </NativeSelect>
              <p className="text-[10px] text-blue-500 mt-1">Muhasebe değişmez — sadece evrak üzerindeki alıcı adı değişir.</p>
            </div>
          )}

          <FormRow cols={3}>
            <FormGroup label="PI Date *" error={errors.proforma_date?.message}>
              <Input type="date" {...register('proforma_date')} />
            </FormGroup>
            <FormGroup label="Validity Date">
              <Input type="date" {...register('validity_date')} />
            </FormGroup>
            <FormGroup label="Buyer Commercial ID">
              <Input {...register('buyer_commercial_id')} />
            </FormGroup>
          </FormRow>

          <FormRow>
            <FormGroup label="Country of Origin">
              <Input {...register('country_of_origin')} />
            </FormGroup>
            <FormGroup label="Currency">
              <NativeSelect {...register('currency')}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </NativeSelect>
            </FormGroup>
          </FormRow>

          <FormRow>
            <FormGroup label="Port of Loading">
              <Input {...register('port_of_loading')} />
            </FormGroup>
            <FormGroup label="Port of Discharge">
              <Input {...register('port_of_discharge')} />
            </FormGroup>
          </FormRow>

          <FormRow>
            <FormGroup label="Final Delivery Place">
              <Input {...register('final_delivery')} />
            </FormGroup>
            <FormGroup label="Incoterms">
              <Input {...register('incoterms')} placeholder="CPT MERSIN" />
            </FormGroup>
          </FormRow>

          <FormRow cols={3}>
            <FormGroup label="Payment Terms">
              <Input {...register('payment_terms')} />
            </FormGroup>
            <FormGroup label="Transport Mode and Means">
              <NativeSelect {...register('transport_mode')}>
                <option value="truck">By Truck</option>
                <option value="railway">By Railway</option>
                <option value="sea">By Sea</option>
              </NativeSelect>
            </FormGroup>
            <FormGroup label="Place of Payment">
              <Input {...register('place_of_payment')} />
            </FormGroup>
          </FormRow>

          <FormRow cols={3}>
            <FormGroup label="Shipment Method">
              <NativeSelect {...register('shipment_method')}>
                <option value="">— Select —</option>
                <option value="bulk">Bulk</option>
                <option value="container">Container</option>
              </NativeSelect>
            </FormGroup>
          </FormRow>

          <FormRow>
            <FormGroup label="Time of Delivery">
              <WeekPicker
                value={form.watch('delivery_time') ?? ''}
                onChange={v => setValue('delivery_time', v)}
              />
            </FormGroup>
            <FormGroup label="Vessel Details Confirmation Time">
              <Input {...register('vessel_details_confirmation')} placeholder="e.g. 7 days before loading" />
            </FormGroup>
          </FormRow>

          <FormRow cols={3}>
            <FormGroup label="Description">
              <Input {...register('description')} />
            </FormGroup>
            <FormGroup label="HS Code">
              <Input {...register('hs_code')} />
            </FormGroup>
            <FormGroup label="Partial Shipment">
              <NativeSelect {...register('partial_shipment')}>
                <option value="allowed">Allowed</option>
                <option value="not">Not Allowed</option>
              </NativeSelect>
            </FormGroup>
          </FormRow>

          <FormRow cols={3}>
            <FormGroup label="Insurance">
              <Input {...register('insurance')} />
            </FormGroup>
            <FormGroup label="Net Weight (KG)">
              <Input type="number" step="0.001" {...register('net_weight_kg')} />
            </FormGroup>
            <FormGroup label="Gross Weight (KG)">
              <Input type="number" step="0.001" {...register('gross_weight_kg')} />
            </FormGroup>
          </FormRow>

          <FormRow cols={3}>
            <FormGroup label="Quantity (ADMT) *" error={errors.quantity_admt?.message}>
              <Input type="number" step="0.001" {...register('quantity_admt')} />
            </FormGroup>
            <FormGroup label="Unit Price *" error={errors.unit_price?.message}>
              <Input type="number" step="0.001" {...register('unit_price')} />
            </FormGroup>
            <FormGroup label="Freight (0=N/A)">
              <Input type="number" step="0.001" {...register('freight')} />
            </FormGroup>
          </FormRow>

          <FormRow>
            <FormGroup label="Discount">
              <Input type="number" step="0.001" {...register('discount')} placeholder="N/A" />
            </FormGroup>
            <FormGroup label="Other Charges">
              <Input type="number" step="0.001" {...register('other_charges')} placeholder="N/A" />
            </FormGroup>
          </FormRow>

          <div className="bg-brand-50 rounded-lg px-3.5 py-2.5 mb-3 flex flex-wrap gap-3 sm:gap-5 text-xs">
            <span>Subtotal: <strong className="text-brand-600">{fCurrency(subtotal, currency as 'USD')}</strong></span>
            <span>Freight: <strong>{fCurrency(freight, currency as 'USD')}</strong></span>
            <span>TOTAL: <strong className="text-brand-600">{fCurrency(total, currency as 'USD')}</strong></span>
          </div>

          <FormGroup label="Signatory" className="mb-2.5">
            <Input {...register('signatory')} />
          </FormGroup>

          <FormGroup label="Notes" className="mb-2.5">
            <Textarea rows={6} {...register('notes')} />
          </FormGroup>

          <DialogFooter>
            <input
              ref={importRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImportFile}
            />
            <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:flex-1">
              <Button type="button" variant="outline" size="sm" onClick={() => downloadProformaTemplate()}>
                ↓ Template
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => importRef.current?.click()}>
                ↑ Import Excel
              </Button>
            </div>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            {isEdit && (
              <Button type="button" variant="outline" onClick={handlePrint}>
                🖨 Print / PDF
              </Button>
            )}
            <Button type="submit" disabled={createPI.isPending || updatePI.isPending}>
              {isEdit ? 'Update Proforma' : 'Save Proforma'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
