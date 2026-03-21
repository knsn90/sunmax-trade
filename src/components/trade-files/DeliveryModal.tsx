import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { deliverySchema, type DeliveryFormData } from '@/types/forms';
import type { TradeFile } from '@/types/database';
import { useConvertToDelivery } from '@/hooks/useTradeFiles';
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

  async function onSubmit(data: DeliveryFormData) {
    if (!file) return;
    await convertToDelivery.mutateAsync({ id: file.id, data });
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
