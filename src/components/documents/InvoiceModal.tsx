import { useEffect, useRef } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { invoiceSchema, type InvoiceFormData } from '@/types/forms';
import type { TradeFile, Invoice } from '@/types/database';
import { useCreateInvoice, useUpdateInvoice } from '@/hooks/useDocuments';
import { useSettings, useBankAccounts } from '@/hooks/useSettings';
import { today, fCurrency } from '@/lib/formatters';
import { formatInvoiceNo } from '@/lib/generators';
import { parseInvoiceExcel, downloadInvoiceTemplate } from '@/lib/excelImport';
import { printInvoice } from '@/lib/printDocument';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/form-elements';
import { FormRow, FormGroup } from '@/components/ui/shared';
import { OcrButton } from '@/components/ui/OcrButton';
import { SmartFill } from '@/components/ui/SmartFill';
import type { OcrResult } from '@/lib/openai';

interface InvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: TradeFile | null;
  invoice?: Invoice | null;  // If editing
  invoiceType?: 'commercial' | 'sale';
}

export function InvoiceModal({ open, onOpenChange, file, invoice, invoiceType = 'commercial' }: InvoiceModalProps) {
  const { data: settings } = useSettings();
  const { data: bankAccounts } = useBankAccounts();
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const isEdit = !!invoice;
  const importRef = useRef<HTMLInputElement>(null);

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoice_date: today(),
      currency: settings?.default_currency ?? 'USD',
      incoterms: settings?.default_incoterms ?? 'CPT',
      proforma_no: '',
      cb_no: '',
      insurance_no: '',
      quantity_admt: 0,
      unit_price: 0,
      freight: 0,
      gross_weight_kg: undefined,
      packing_info: '',
      payment_terms: settings?.payment_terms ?? '',
    },
  });

  const { register, handleSubmit, formState: { errors }, reset, control, setValue } = form;

  // Populate from file/invoice when modal opens
  useEffect(() => {
    if (!open) return;
    if (invoice) {
      reset({
        invoice_date: invoice.invoice_date,
        currency: invoice.currency,
        incoterms: invoice.incoterms ?? 'CPT',
        proforma_no: invoice.proforma_no ?? '',
        cb_no: invoice.cb_no ?? '',
        insurance_no: invoice.insurance_no ?? '',
        quantity_admt: invoice.quantity_admt,
        unit_price: invoice.unit_price,
        freight: invoice.freight,
        gross_weight_kg: invoice.gross_weight_kg ?? undefined,
        packing_info: invoice.packing_info ?? '',
        payment_terms: invoice.payment_terms ?? '',
      });
    } else if (file) {
      reset({
        invoice_date: today(),
        currency: file.currency ?? settings?.default_currency ?? 'USD',
        incoterms: file.incoterms ?? settings?.default_incoterms ?? 'CPT',
        proforma_no: file.proforma_ref ?? '',
        cb_no: '',
        insurance_no: file.insurance_tr ?? '',
        quantity_admt: file.delivered_admt ?? file.tonnage_mt ?? 0,
        unit_price: file.selling_price ?? 0,
        freight: file.freight_cost ?? 0,
        gross_weight_kg: file.gross_weight_kg ?? undefined,
        packing_info: '',
        payment_terms: file.payment_terms ?? settings?.payment_terms ?? '',
      });
    }
  }, [open, file, invoice, settings, reset]);

  // Live calculation
  const qty = useWatch({ control, name: 'quantity_admt' }) ?? 0;
  const price = useWatch({ control, name: 'unit_price' }) ?? 0;
  const freight = useWatch({ control, name: 'freight' }) ?? 0;
  const currency = useWatch({ control, name: 'currency' }) ?? 'USD';

  const subtotal = qty * price;
  const total = subtotal + freight;

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
      toast.success('Invoice data imported from Excel');
    } catch {
      toast.error('Could not parse file. Please use the Excel template.');
    }
  }

  function handleOcrResult(result: OcrResult) {
    if (result.date) setValue('invoice_date', result.date);
    if (result.currency && ['USD', 'EUR', 'TRY'].includes(result.currency)) {
      setValue('currency', result.currency as InvoiceFormData['currency']);
    }
    if (result.quantity_admt) setValue('quantity_admt', result.quantity_admt);
    if (result.unit_price) setValue('unit_price', result.unit_price);
    if (result.freight != null) setValue('freight', result.freight);
    if (result.incoterms) setValue('incoterms', result.incoterms);
    if (result.proforma_no) setValue('proforma_no', result.proforma_no);
    if (result.cb_no) setValue('cb_no', result.cb_no);
    if (result.insurance_no) setValue('insurance_no', result.insurance_no);
    if (result.payment_terms) setValue('payment_terms', result.payment_terms);
  }

  function handlePrint() {
    if (!invoice) { toast.error('Save the invoice first to print it.'); return; }
    if (!settings) return;
    const defaultBank = bankAccounts?.find((b) => b.is_default) ?? bankAccounts?.[0] ?? null;
    printInvoice(invoice, settings, defaultBank);
  }

  // Effective type: editing takes precedence over prop
  const effectiveType = invoice?.invoice_type ?? invoiceType;

  async function onSubmit(data: InvoiceFormData) {
    if (isEdit && invoice) {
      await updateInvoice.mutateAsync({ id: invoice.id, data, existingInvoice: invoice });
    } else if (file) {
      const isSale = effectiveType === 'sale';
      const prefix = isSale ? 'SINV' : (settings?.file_prefix ?? 'ESN');
      const invNo = isSale
        ? `SINV-${new Date().getFullYear()}-${String(Date.now() % 100000).padStart(5, '0')}`
        : formatInvoiceNo(prefix, Date.now() % 10000);
      await createInvoice.mutateAsync({
        tradeFileId: file.id,
        customerId: file.customer_id,
        productName: file.product?.name ?? '',
        invoiceNo: invNo,
        data,
        invoiceType: effectiveType,
      });
    }
    onOpenChange(false);
  }

  if (!file && !invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <DialogTitle>
                {invoice?.invoice_type === 'sale'
                  ? (isEdit ? 'Edit Sale Invoice' : 'New Sale Invoice')
                  : (isEdit ? 'Edit Com-Invoice' : 'New Com-Invoice')}
              </DialogTitle>
              <DialogDescription className="truncate">
                {file?.file_no ?? ''} — {file?.customer?.name ?? invoice?.customer?.name ?? ''}
              </DialogDescription>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <SmartFill mode="invoice" onResult={handleOcrResult} formName="Invoice" />
              <OcrButton mode="invoice" onResult={handleOcrResult} />
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <FormRow cols={3}>
            <FormGroup label="Date *" error={errors.invoice_date?.message}>
              <Input type="date" {...register('invoice_date')} />
            </FormGroup>
            <FormGroup label="Currency">
              <NativeSelect {...register('currency')}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="TRY">TRY</option>
              </NativeSelect>
            </FormGroup>
            <FormGroup label="Incoterms">
              <Input {...register('incoterms')} />
            </FormGroup>
          </FormRow>

          <FormRow cols={3}>
            <FormGroup label="Quantity (ADMT) *" error={errors.quantity_admt?.message}>
              <Input type="number" step="0.001" {...register('quantity_admt')} />
            </FormGroup>
            <FormGroup label="Unit Price *" error={errors.unit_price?.message}>
              <Input type="number" step="0.001" {...register('unit_price')} />
            </FormGroup>
            <FormGroup label="Freight">
              <Input type="number" step="0.001" {...register('freight')} />
            </FormGroup>
          </FormRow>

          {/* Live totals */}
          <div className="bg-brand-50 rounded-lg px-3.5 py-2.5 mb-3 flex flex-wrap gap-3 sm:gap-5 text-xs">
            <span>Subtotal: <strong className="text-brand-600">{fCurrency(subtotal, currency as 'USD')}</strong></span>
            <span>Freight: <strong>{fCurrency(freight, currency as 'USD')}</strong></span>
            <span>TOTAL: <strong className="text-brand-600">{fCurrency(total, currency as 'USD')}</strong></span>
          </div>

          <FormRow>
            <FormGroup label="Proforma No.">
              <Input {...register('proforma_no')} />
            </FormGroup>
            <FormGroup label="CB No.">
              <Input {...register('cb_no')} />
            </FormGroup>
          </FormRow>

          <FormRow>
            <FormGroup label="Insurance No.">
              <Input {...register('insurance_no')} />
            </FormGroup>
            <FormGroup label="Payment Terms">
              <Input {...register('payment_terms')} />
            </FormGroup>
          </FormRow>

          <FormRow>
            <FormGroup label="Gross Weight (KG)">
              <Input type="number" step="0.001" {...register('gross_weight_kg')} />
            </FormGroup>
            <FormGroup label="Packing Info">
              <Input {...register('packing_info')} placeholder="e.g. 70 Reels" />
            </FormGroup>
          </FormRow>

          <DialogFooter>
            <input
              ref={importRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImportFile}
            />
            <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:flex-1">
              <Button type="button" variant="outline" size="sm" onClick={() => downloadInvoiceTemplate()}>
                ↓ Template
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => importRef.current?.click()}>
                ↑ Import Excel
              </Button>
            </div>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {isEdit && (
              <Button type="button" variant="outline" onClick={handlePrint}>
                🖨 Print / PDF
              </Button>
            )}
            <Button
              type="submit"
              variant="secondary"
              disabled={createInvoice.isPending || updateInvoice.isPending}
            >
              {isEdit ? 'Update' : 'Save Invoice'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
