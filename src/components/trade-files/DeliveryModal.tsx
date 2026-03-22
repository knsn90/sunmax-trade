import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { deliverySchema, type DeliveryFormData } from '@/types/forms';
import type { TradeFile } from '@/types/database';
import { useConvertToDelivery } from '@/hooks/useTradeFiles';
import { useUpsertSaleInvoice } from '@/hooks/useDocuments';
import { today } from '@/lib/formatters';
import { invoiceService } from '@/services/invoiceService';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormRow, FormGroup } from '@/components/ui/shared';

interface DeliveryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: TradeFile | null;
}

export function DeliveryModal({ open, onOpenChange, file }: DeliveryModalProps) {
  const convertToDelivery = useConvertToDelivery();
  const upsertSaleInvoice = useUpsertSaleInvoice();

  const form = useForm<DeliveryFormData>({
    resolver: zodResolver(deliverySchema),
    defaultValues: {
      delivered_admt: file?.tonnage_mt ?? 0,
      gross_weight_kg: 0,
      packages: 0,
      arrival_date: '',
      bl_number: '',
      septi_ref: '',
      insurance_tr: '',
      insurance_ir: '',
    },
  });

  const { register, handleSubmit, formState: { errors }, reset } = form;

  // Pre-fill existing delivery data when editing; sync septi_ref ↔ register_no
  useEffect(() => {
    if (open && file) {
      reset({
        delivered_admt: file.delivered_admt ?? file.tonnage_mt ?? 0,
        gross_weight_kg: file.gross_weight_kg ?? 0,
        packages: file.packages ?? 0,
        arrival_date: file.arrival_date ?? '',
        bl_number: file.bl_number ?? '',
        septi_ref: file.septi_ref ?? file.register_no ?? '',
        insurance_tr: file.insurance_tr ?? '',
        insurance_ir: file.insurance_ir ?? '',
      });
    }
  }, [open, file, reset]);

  async function onSubmit(data: DeliveryFormData) {
    if (!file) return;
    await convertToDelivery.mutateAsync({ id: file.id, data });

    // Auto-create/update Sale Invoice: ADMT × selling_price
    if (file.customer_id && file.selling_price) {
      await upsertSaleInvoice.mutateAsync({
        tradeFileId: file.id,
        customerId: file.customer_id,
        productName: file.product?.name ?? '',
        data: {
          invoice_date: today(),
          currency: (file.currency as 'USD' | 'EUR' | 'TRY') ?? 'USD',
          incoterms: file.incoterms ?? '',
          proforma_no: file.proforma_ref ?? '',
          cb_no: '',
          insurance_no: '',
          quantity_admt: data.delivered_admt,
          unit_price: file.selling_price,
          freight: file.freight_cost ?? 0,
          gross_weight_kg: data.gross_weight_kg ?? undefined,
          packing_info: '',
          payment_terms: file.payment_terms ?? '',
        },
      });
    }

    // Auto-create/update Purchase Transaction: ADMT × purchase_price
    if (file.supplier_id && file.purchase_price) {
      await invoiceService.upsertPurchaseTransaction(
        file.id,
        file.supplier_id,
        file.file_no,
        data.delivered_admt,
        file.purchase_price,
        file.freight_cost ?? 0,
        file.currency ?? 'USD',
        today(),
      );
    }

    reset();
    onOpenChange(false);
  }

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delivery Details</DialogTitle>
          <DialogDescription>
            {file.file_no} — {file.customer?.name}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <FormRow>
            <FormGroup label="ADMT *" error={errors.delivered_admt?.message}>
              <Input type="number" step="0.001" {...register('delivered_admt')} />
            </FormGroup>
            <FormGroup label="Gross Weight (KG)">
              <Input type="number" step="0.001" {...register('gross_weight_kg')} />
            </FormGroup>
          </FormRow>

          <FormRow>
            <FormGroup label="Packages">
              <Input type="number" {...register('packages')} />
            </FormGroup>
            <FormGroup label="Arrival Date">
              <Input type="date" {...register('arrival_date')} />
            </FormGroup>
          </FormRow>

          <FormRow>
            <FormGroup label="B/L Number">
              <Input {...register('bl_number')} />
            </FormGroup>
            <FormGroup label="SEPTI Ref">
              <Input {...register('septi_ref')} />
            </FormGroup>
          </FormRow>

          <FormRow>
            <FormGroup label="Insurance TR">
              <Input {...register('insurance_tr')} />
            </FormGroup>
            <FormGroup label="Insurance IR">
              <Input {...register('insurance_ir')} />
            </FormGroup>
          </FormRow>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={convertToDelivery.isPending}>
              {convertToDelivery.isPending ? 'Saving…' : 'Save Delivery'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
