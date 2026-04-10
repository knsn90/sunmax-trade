import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/form-elements';
import { FormRow, FormGroup } from '@/components/ui/shared';
import { useCreateTradeFile } from '@/hooks/useTradeFiles';
import { useTheme } from '@/contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { TradeFile } from '@/types/database';
import { Layers } from 'lucide-react';

const schema = z.object({
  tonnage_mt: z.number({ invalid_type_error: 'Ton giriniz' }).positive('Pozitif olmalı'),
  transport_mode: z.string().optional(),
  eta: z.string().optional(),
  notes: z.string().optional(),
});

type Form = z.infer<typeof schema>;

interface Props {
  parent: TradeFile;
  nextBatchNo: number;
  open: boolean;
  onClose: () => void;
}

const TRANSPORT_OPTIONS = [
  { value: '',        label: '— Seçin —' },
  { value: 'sea',    label: 'Deniz (Gemi)' },
  { value: 'road',   label: 'Kara (TIR)' },
  { value: 'rail',   label: 'Demiryolu (Vagon)' },
  { value: 'air',    label: 'Hava' },
  { value: 'mixed',  label: 'Karma' },
];

export function BatchModal({ parent, nextBatchNo, open, onClose }: Props) {
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';
  const navigate = useNavigate();
  const createFile = useCreateTradeFile();

  const batchFileNo = `${parent.file_no}/P${nextBatchNo}`;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      tonnage_mt: undefined,
      transport_mode: '',
      eta: '',
      notes: '',
    },
  });

  async function onSubmit(values: Form) {
    try {
      const created = await createFile.mutateAsync({
        file_no: batchFileNo,
        file_date: new Date().toISOString().slice(0, 10),
        customer_id: parent.customer_id,
        product_id: parent.product_id,
        tonnage_mt: values.tonnage_mt,
        customer_ref: parent.customer_ref ?? '',
        notes: values.notes ?? '',
        eta: values.eta ?? '',
        parent_file_id: parent.id,
        batch_no: nextBatchNo,
        initialStatus: 'sale', // partiler doğrudan belgeler/satış aşamasından başlar
      });
      toast.success(`Parti ${batchFileNo} oluşturuldu`);
      reset();
      onClose();
      navigate(`/files/${created.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Kalan ton = parent tonnage - existing batches total
  const usedTon = (parent.batches ?? []).reduce((s, b) => s + (b.tonnage_mt ?? 0), 0);
  const remainingTon = Math.max(0, parent.tonnage_mt - usedTon);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px] font-bold text-gray-900">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: accent + '18' }}>
              <Layers className="h-4 w-4" style={{ color: accent }} />
            </div>
            Yeni Parti Oluştur
          </DialogTitle>
        </DialogHeader>

        {/* Bilgi satırı */}
        <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl">
          <div className="flex-1">
            <p className="text-[11px] text-gray-400 font-medium">Ana Dosya</p>
            <p className="text-[13px] font-bold text-gray-800">{parent.file_no}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-gray-400 font-medium">Parti No</p>
            <p className="text-[13px] font-bold" style={{ color: accent }}>{batchFileNo}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-gray-400 font-medium">Kalan Ton</p>
            <p className="text-[13px] font-bold text-amber-600">{remainingTon.toLocaleString('tr-TR')} MT</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 mt-1">
          <FormRow cols={2}>
            <FormGroup label="Tonaj (MT) *" error={errors.tonnage_mt?.message}>
              <Input
                type="number"
                step="0.001"
                placeholder={`max ${remainingTon}`}
                {...register('tonnage_mt', { valueAsNumber: true })}
              />
            </FormGroup>
            <FormGroup label="Taşıma Şekli">
              <NativeSelect {...register('transport_mode')}>
                {TRANSPORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </NativeSelect>
            </FormGroup>
          </FormRow>

          <FormGroup label="Tahmini Varış (ETA)">
            <Input type="date" {...register('eta')} />
          </FormGroup>

          <FormGroup label="Notlar">
            <Input placeholder="İsteğe bağlı..." {...register('notes')} />
          </FormGroup>

          <DialogFooter className="pt-2">
            <button
              type="button"
              onClick={() => { reset(); onClose(); }}
              className="px-4 h-9 rounded-xl text-[13px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={createFile.isPending}
              className="px-5 h-9 rounded-xl text-[13px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ background: accent }}
            >
              {createFile.isPending ? 'Oluşturuluyor…' : 'Parti Oluştur'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
