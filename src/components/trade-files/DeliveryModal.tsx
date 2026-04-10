import { useEffect, useState } from 'react';
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
import { Package, Layers } from 'lucide-react';

interface DeliveryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: TradeFile | null;
  /** Kısmi sevkiyat seçildiğinde çağrılır — ana bileşen BatchModal'ı açar */
  onPartialShipment?: () => void;
}

export function DeliveryModal({ open, onOpenChange, file, onPartialShipment }: DeliveryModalProps) {
  const convertToDelivery = useConvertToDelivery();
  // step: 'ask' = ilk soru | 'form' = teslimat formu
  const [step, setStep] = useState<'ask' | 'form'>('ask');

  const form = useForm<DeliveryFormData>({
    resolver: zodResolver(deliverySchema),
    defaultValues: {
      delivered_admt: file?.tonnage_mt ?? 0,
      gross_weight_kg: undefined,
      packages: undefined,
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
      // Batch dosyalar ve partisi olan dosyalar için direkt forma git (soru adımı yok)
      const isBatch = !!file.parent_file_id;
      const hasBatches = (file.batches?.length ?? 0) > 0;
      setStep(isBatch || hasBatches ? 'form' : 'ask');
      reset({
        delivered_admt: file.delivered_admt ?? file.tonnage_mt ?? 0,
        gross_weight_kg: file.gross_weight_kg ?? undefined,
        packages: file.packages ?? undefined,
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
    try {
      await convertToDelivery.mutateAsync({ id: file.id, data });
      reset();
      onOpenChange(false);
    } catch {
      // Error already shown via toast — prevent UI freeze
    }
  }

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Teslimat Bilgileri</DialogTitle>
          <DialogDescription>
            {file.file_no} — {file.customer?.name}
          </DialogDescription>
        </DialogHeader>

        {/* ── Adım 0: Yükleme tipi sorusu ─────────────────────────── */}
        {step === 'ask' && (
          <div className="py-2 space-y-3">
            <p className="text-[13px] text-gray-600 font-medium">Bu sevkiyat nasıl gerçekleşecek?</p>
            <div className="grid grid-cols-2 gap-3">
              {/* Tek yükleme */}
              <button
                type="button"
                onClick={() => setStep('form')}
                className="flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition-all group"
              >
                <div className="w-11 h-11 rounded-xl bg-gray-100 group-hover:bg-white flex items-center justify-center transition-colors">
                  <Package className="h-5 w-5 text-gray-500" />
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-bold text-gray-800">Tek Yükleme</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Tüm mal tek seferde</p>
                </div>
              </button>

              {/* Kısmi sevkiyat */}
              <button
                type="button"
                onClick={() => onPartialShipment?.()}
                className="flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 border-blue-100 hover:border-blue-300 hover:bg-blue-50 transition-all group"
              >
                <div className="w-11 h-11 rounded-xl bg-blue-50 group-hover:bg-white flex items-center justify-center transition-colors">
                  <Layers className="h-5 w-5 text-blue-500" />
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-bold text-gray-800">Kısmi Sevkiyat</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Parça parça yükleme</p>
                </div>
              </button>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="text-[12px] text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
            </div>
          </div>
        )}

        {/* ── Adım 1: Teslimat formu ────────────────────────────────── */}
        {step === 'form' && <form onSubmit={handleSubmit(onSubmit)}>
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
              İptal
            </Button>
            <Button type="submit" disabled={convertToDelivery.isPending}>
              {convertToDelivery.isPending ? 'Kaydediliyor…' : 'Teslimatı Kaydet'}
            </Button>
          </DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
  );
}
