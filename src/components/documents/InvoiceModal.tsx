import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { invoiceSchema, type InvoiceFormData } from '@/types/forms';
import type { TradeFile, Invoice } from '@/types/database';
import { useCreateInvoice, useUpdateInvoice } from '@/hooks/useDocuments';
import { useSettings, useBankAccounts } from '@/hooks/useSettings';
import { useTradeFiles } from '@/hooks/useTradeFiles';
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
  const { t } = useTranslation('documents');
  const { t: tc } = useTranslation('common');

  const { data: settings } = useSettings();
  const { data: bankAccounts } = useBankAccounts();
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const isEdit = !!invoice;
  const importRef = useRef<HTMLInputElement>(null);

  // Dahili dosya seçimi — muhasebe sayfasından "yeni satış faturası" açılırken kullanılır
  const isSaleMode = invoiceType === 'sale';
  const needsFilePicker = isSaleMode && !file && !invoice;
  const { data: allFiles = [] } = useTradeFiles();
  const saleFiles = allFiles.filter(f => ['sale', 'delivery', 'completed'].includes(f.status));
  const [pickedFileId, setPickedFileId] = useState('');
  const pickedFile = saleFiles.find(f => f.id === pickedFileId) ?? null;
  const effectiveFile = file ?? pickedFile; // dışarıdan gelen file öncelikli

  // Dosya değiştiğinde formu doldur
  useEffect(() => {
    if (!open) { setPickedFileId(''); return; }
    if (pickedFile && !invoice) {
      form.reset({
        invoice_date: today(),
        currency: pickedFile.currency ?? settings?.default_currency ?? 'USD',
        incoterms: pickedFile.incoterms ?? settings?.default_incoterms ?? 'CPT',
        proforma_no: pickedFile.proforma_ref ?? '',
        cb_no: '',
        insurance_no: pickedFile.insurance_tr ?? '',
        quantity_admt: pickedFile.delivered_admt ?? pickedFile.tonnage_mt ?? 0,
        unit_price: pickedFile.selling_price ?? 0,
        freight: pickedFile.freight_cost ?? 0,
        gross_weight_kg: pickedFile.gross_weight_kg ?? undefined,
        packing_info: '',
        payment_terms: pickedFile.payment_terms ?? settings?.payment_terms ?? '',
      });
    }
  }, [pickedFile, open]); // eslint-disable-line react-hooks/exhaustive-deps

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
      toast.success(t('invoice.modal.successImported'));
    } catch {
      toast.error(t('invoice.modal.errorParseFailed'));
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
    if (!invoice) { toast.error(t('invoice.modal.errorSaveFirst')); return; }
    if (!settings) return;
    const defaultBank = bankAccounts?.find((b) => b.is_default) ?? bankAccounts?.[0] ?? null;
    printInvoice(invoice, settings, defaultBank);
  }

  // Effective type: editing takes precedence over prop
  const effectiveType = invoice?.invoice_type ?? invoiceType;

  async function onSubmit(data: InvoiceFormData) {
    try {
      if (isEdit && invoice) {
        await updateInvoice.mutateAsync({ id: invoice.id, data, existingInvoice: invoice });
      } else if (effectiveFile) {
        const isSale = effectiveType === 'sale';
        const prefix = isSale ? 'SINV' : (settings?.file_prefix ?? 'ESN');
        const invNo = isSale
          ? `SINV-${new Date().getFullYear()}-${String(Date.now() % 100000).padStart(5, '0')}`
          : formatInvoiceNo(prefix, Date.now() % 10000);
        await createInvoice.mutateAsync({
          tradeFileId: effectiveFile.id,
          customerId: effectiveFile.customer_id,
          productName: effectiveFile.product?.name ?? '',
          invoiceNo: invNo,
          data,
          invoiceType: effectiveType,
        });
      } else {
        toast.error('Lütfen bir ticaret dosyası seçin');
        return;
      }
      onOpenChange(false);
    } catch {
      // Error already shown via toast — prevent UI freeze
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <DialogTitle>
                {invoice?.invoice_type === 'sale'
                  ? (isEdit ? t('invoice.modal.titleEditSale') : t('invoice.modal.titleNewSale'))
                  : (isEdit ? t('invoice.modal.titleEditCommercial') : t('invoice.modal.titleNewCommercial'))}
              </DialogTitle>
              <DialogDescription className="truncate">
                {effectiveFile?.file_no ?? ''} — {effectiveFile?.customer?.name ?? invoice?.customer?.name ?? ''}
              </DialogDescription>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <SmartFill mode="invoice" onResult={handleOcrResult} formName="Invoice" />
              <OcrButton mode="invoice" onResult={handleOcrResult} />
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Dosya seçici — sadece muhasebeden yeni satış faturası açıldığında gösterilir */}
          {needsFilePicker && (
            <FormRow cols={2}>
              <FormGroup label="Ticaret Dosyası *">
                <NativeSelect
                  value={pickedFileId}
                  onChange={e => setPickedFileId(e.target.value)}
                >
                  <option value="">— Dosya seçin —</option>
                  {saleFiles.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.file_no} — {f.customer?.name ?? '—'} {f.product?.name ? `(${f.product.name})` : ''}
                    </option>
                  ))}
                </NativeSelect>
              </FormGroup>
            </FormRow>
          )}

          <FormRow cols={3}>
            <FormGroup label={`${tc('form.date')} *`} error={errors.invoice_date?.message}>
              <Input type="date" {...register('invoice_date')} />
            </FormGroup>
            <FormGroup label={tc('form.currency')}>
              <NativeSelect {...register('currency')}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="TRY">TRY</option>
              </NativeSelect>
            </FormGroup>
            <FormGroup label={t('invoice.modal.incoterms')}>
              <Input {...register('incoterms')} />
            </FormGroup>
          </FormRow>

          <FormRow cols={3}>
            <FormGroup label={`${t('invoice.modal.quantityAdmt')} *`} error={errors.quantity_admt?.message}>
              <Input type="number" step="0.001" {...register('quantity_admt')} />
            </FormGroup>
            <FormGroup label={`${t('invoice.modal.unitPrice')} *`} error={errors.unit_price?.message}>
              <Input type="number" step="0.001" {...register('unit_price')} />
            </FormGroup>
            <FormGroup label={t('invoice.modal.freight')}>
              <Input type="number" step="0.001" {...register('freight')} />
            </FormGroup>
          </FormRow>

          {/* Live totals */}
          <div className="bg-brand-50 rounded-lg px-3.5 py-2.5 mb-3 flex flex-wrap gap-3 sm:gap-5 text-xs">
            <span>{t('invoice.modal.subtotal')} <strong className="text-brand-600">{fCurrency(subtotal, currency as 'USD')}</strong></span>
            <span>{t('invoice.modal.freightLabel')} <strong>{fCurrency(freight, currency as 'USD')}</strong></span>
            <span>{t('invoice.modal.total')} <strong className="text-brand-600">{fCurrency(total, currency as 'USD')}</strong></span>
          </div>

          <FormRow>
            <FormGroup label={t('invoice.modal.proformaNo')}>
              <Input {...register('proforma_no')} />
            </FormGroup>
            <FormGroup label={t('invoice.modal.cbNo')}>
              <Input {...register('cb_no')} />
            </FormGroup>
          </FormRow>

          <FormRow>
            <FormGroup label={t('invoice.modal.insuranceNo')}>
              <Input {...register('insurance_no')} />
            </FormGroup>
            <FormGroup label={tc('form.payment_terms')}>
              <Input {...register('payment_terms')} />
            </FormGroup>
          </FormRow>

          <FormRow>
            <FormGroup label={t('invoice.modal.grossWeight')}>
              <Input type="number" step="0.001" {...register('gross_weight_kg')} />
            </FormGroup>
            <FormGroup label={t('invoice.modal.packingInfo')}>
              <Input {...register('packing_info')} placeholder={t('invoice.modal.packingPlaceholder')} />
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
                {t('invoice.modal.btnTemplate')}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => importRef.current?.click()}>
                {t('invoice.modal.btnImportExcel')}
              </Button>
            </div>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc('btn.cancel')}
            </Button>
            {isEdit && (
              <Button type="button" variant="outline" onClick={handlePrint}>
                {t('invoice.modal.btnPrint')}
              </Button>
            )}
            <Button
              type="submit"
              variant="secondary"
              disabled={createInvoice.isPending || updateInvoice.isPending}
            >
              {isEdit ? t('invoice.modal.btnUpdate') : t('invoice.modal.btnSave')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
