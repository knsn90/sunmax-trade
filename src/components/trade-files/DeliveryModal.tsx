import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { deliverySchema, type DeliveryFormData } from '@/types/forms';
import type { TradeFile } from '@/types/database';
import { useConvertToDelivery } from '@/hooks/useTradeFiles';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Package, Layers } from 'lucide-react';
import { MonoDatePicker } from '@/components/ui/MonoDatePicker';

// ── Mono stil sabitleri ───────────────────────────────────────────────────────
const inp = 'bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-gray-900 placeholder:text-gray-400 border-0 shadow-none focus:outline-none focus:ring-0 w-full';
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

interface DeliveryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: TradeFile | null;
  onPartialShipment?: () => void;
}

export function DeliveryModal({ open, onOpenChange, file, onPartialShipment }: DeliveryModalProps) {
  const convertToDelivery = useConvertToDelivery();
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

  const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = form;

  useEffect(() => {
    if (open && file) {
      const isBatch    = !!file.parent_file_id;
      const hasBatches = (file.batches?.length ?? 0) > 0;
      setStep(isBatch || hasBatches ? 'form' : 'ask');
      reset({
        delivered_admt:  file.delivered_admt ?? file.tonnage_mt ?? 0,
        gross_weight_kg: file.gross_weight_kg ?? undefined,
        packages:        file.packages ?? undefined,
        arrival_date:    file.arrival_date ?? '',
        bl_number:       file.bl_number ?? '',
        septi_ref:       file.septi_ref ?? file.register_no ?? '',
        insurance_tr:    file.insurance_tr ?? '',
        insurance_ir:    file.insurance_ir ?? '',
      });
    }
  }, [open, file, reset]);

  async function onSubmit(data: DeliveryFormData) {
    if (!file) return;
    try {
      await convertToDelivery.mutateAsync({ id: file.id, data });
      reset();
      onOpenChange(false);
    } catch { /* toast already shown */ }
  }

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle className="text-[15px] flex-1">Teslimat Bilgileri</DialogTitle>
            <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md shrink-0">
              {file.file_no}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">{file.customer?.name}</p>
        </DialogHeader>

        {/* ── Adım 0: Yükleme tipi ────────────────────────────────────────── */}
        {step === 'ask' && (
          <div className="py-1 space-y-3">
            <p className="text-[12px] text-gray-500 font-medium">Bu sevkiyat nasıl gerçekleşecek?</p>
            <div className="grid grid-cols-2 gap-3">
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

        {/* ── Adım 1: Teslimat formu ───────────────────────────────────────── */}
        {step === 'form' && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 mt-1">

            {/* ADMT · Brüt Ağırlık */}
            <div className="grid grid-cols-2 gap-3">
              <Fld label="ADMT *" error={errors.delivered_admt?.message}>
                <input type="number" step="0.001" {...register('delivered_admt')} className={inp} />
              </Fld>
              <Fld label="Brüt Ağırlık (KG)">
                <input type="number" step="0.001" {...register('gross_weight_kg')} className={inp} />
              </Fld>
            </div>

            {/* Paket · Varış Tarihi */}
            <div className="grid grid-cols-2 gap-3">
              <Fld label="Paket Sayısı">
                <input type="number" {...register('packages')} className={inp} />
              </Fld>
              <Fld label="Varış Tarihi">
                <MonoDatePicker value={watch('arrival_date') ?? ''} onChange={v => setValue('arrival_date', v)} className={inp} />
              </Fld>
            </div>

            {/* B/L · SEPTI Ref */}
            <div className="grid grid-cols-2 gap-3">
              <Fld label="B/L Numarası">
                <input {...register('bl_number')} className={inp} />
              </Fld>
              <Fld label="SEPTI Ref">
                <input {...register('septi_ref')} className={inp} />
              </Fld>
            </div>

            {/* Sigorta */}
            <div className="grid grid-cols-2 gap-3">
              <Fld label="Sigorta TR">
                <input {...register('insurance_tr')} className={inp} />
              </Fld>
              <Fld label="Sigorta IR">
                <input {...register('insurance_ir')} className={inp} />
              </Fld>
            </div>

            {/* Footer */}
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
                disabled={convertToDelivery.isPending}
                className="w-full md:w-auto px-4 h-12 md:h-8 rounded-2xl md:rounded-lg text-[14px] md:text-[12px] font-bold text-white shadow-sm disabled:opacity-50 active:scale-[0.98] transition-all"
                style={{ background: 'linear-gradient(135deg, #b70011 0%, #dc2626 100%)' }}
              >
                {convertToDelivery.isPending ? 'Kaydediliyor…' : 'Teslimatı Kaydet'}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
