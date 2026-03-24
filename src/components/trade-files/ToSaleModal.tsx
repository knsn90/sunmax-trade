import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
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

interface ToSaleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: TradeFile | null;
  editMode?: boolean;
}

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
      transport_mode: 'truck',
      eta: '',
      vessel_name: '',
      proforma_ref: '',
      register_no: '',
    },
  });

  const { register, handleSubmit, formState: { errors }, reset } = form;

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
              <Input {...register('payment_terms')} />
            </FormGroup>
          </FormRow>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? (editMode ? 'Saving…' : 'Converting…')
                : (editMode ? 'Save Changes' : 'Convert to Sale')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
