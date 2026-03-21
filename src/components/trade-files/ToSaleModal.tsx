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
  /** If true, uses updateSaleDetails() instead of convertToSale() */
  editMode?: boolean;
}

export function ToSaleModal({ open, onOpenChange, file, editMode = false }: ToSaleModalProps) {
  const { data: suppliers = [] } = useSuppliers();
  const { data: settings } = useSettings();
  const convertToSale = useConvertToSale();
  const updateSaleDetails = useUpdateSaleDetails();

  const mutation = editMode ? updateSaleDetails : convertToSale;

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
      currency: settings?.default_currency ?? 'USD',
      payment_terms: settings?.payment_terms ?? '',
      transport_mode: 'truck',
      eta: '',
      vessel_name: '',
      proforma_ref: '',
      register_no: '',
    },
  });

  const { register, handleSubmit, formState: { errors }, reset } = form;

  // Pre-fill form when editing an existing sale
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
        currency: (file.currency as SaleConversionFormData['currency']) ?? settings?.default_currency ?? 'USD',
        payment_terms: file.payment_terms ?? settings?.payment_terms ?? '',
        transport_mode: (file.transport_mode as SaleConversionFormData['transport_mode']) ?? 'truck',
        eta: file.eta ?? '',
        vessel_name: file.vessel_name ?? '',
        proforma_ref: file.proforma_ref ?? '',
        register_no: file.register_no ?? '',
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
        currency: settings?.default_currency ?? 'USD',
        payment_terms: settings?.payment_terms ?? '',
        transport_mode: 'truck',
        eta: '',
        vessel_name: '',
        proforma_ref: '',
        register_no: '',
      });
    }
  }, [open, editMode, file, settings, reset]);

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
                <option value="train">By Train</option>
                <option value="sea">By Sea</option>
              </NativeSelect>
            </FormGroup>
          </FormRow>

          <FormRow cols={3}>
            <FormGroup label="Selling Price ($/MT) *" error={errors.selling_price?.message}>
              <Input type="number" step="0.01" {...register('selling_price')} />
            </FormGroup>
            <FormGroup label="Purchase Price ($/MT) *" error={errors.purchase_price?.message}>
              <Input type="number" step="0.01" {...register('purchase_price')} />
            </FormGroup>
            <FormGroup label="Freight ($)">
              <Input type="number" step="0.01" {...register('freight_cost')} />
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
            <FormGroup label="Incoterms *" error={errors.incoterms?.message}>
              <Input {...register('incoterms')} />
            </FormGroup>
            <FormGroup label="Currency">
              <NativeSelect {...register('currency')}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="TRY">TRY</option>
              </NativeSelect>
            </FormGroup>
            <FormGroup label="ETA">
              <Input type="date" {...register('eta')} />
            </FormGroup>
          </FormRow>

          <FormRow cols={3}>
            <FormGroup label="Vessel Name">
              <Input placeholder="e.g. MV ATLAS" {...register('vessel_name')} />
            </FormGroup>
            <FormGroup label="Register No">
              <Input {...register('register_no')} />
            </FormGroup>
            <FormGroup label="Proforma Ref">
              <Input {...register('proforma_ref')} />
            </FormGroup>
          </FormRow>

          <FormRow>
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
