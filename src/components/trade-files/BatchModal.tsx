import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCreateTradeFile, useUpdateSaleDetails } from '@/hooks/useTradeFiles';
import { useTheme } from '@/contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { TradeFile } from '@/types/database';
import { Layers } from 'lucide-react';

const inp = 'bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-gray-900 placeholder:text-gray-400 border-0 shadow-none focus:outline-none focus:ring-0 w-full';
const Lbl = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{children}</div>
);

const schema = z.object({
  tonnage_mt: z.number({ invalid_type_error: 'Ton giriniz' }).positive('Pozitif olmalı'),
});
type Form = z.infer<typeof schema>;

interface Props {
  parent: TradeFile;
  nextBatchNo: number;
  open: boolean;
  onClose: () => void;
}

export function BatchModal({ parent, nextBatchNo, open, onClose }: Props) {
  const { accent } = useTheme();
  const navigate = useNavigate();
  const createFile = useCreateTradeFile();
  const updateSaleDetails = useUpdateSaleDetails();

  const batchFileNo = `${parent.file_no}/P${nextBatchNo}`;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { tonnage_mt: undefined },
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
        notes: '',
        eta: parent.eta ?? '',
        parent_file_id: parent.id,
        batch_no: nextBatchNo,
        initialStatus: 'sale',
      });

      if (parent.supplier_id || parent.selling_price != null || parent.incoterms || parent.payment_terms) {
        await updateSaleDetails.mutateAsync({
          id: created.id,
          data: {
            supplier_id:           parent.supplier_id ?? '',
            selling_price:         parent.selling_price ?? 0,
            purchase_price:        parent.purchase_price ?? 0,
            freight_cost:          parent.freight_cost ?? 0,
            port_of_loading:       parent.port_of_loading ?? '',
            port_of_discharge:     parent.port_of_discharge ?? '',
            incoterms:             parent.incoterms ?? '',
            purchase_currency:     (parent.purchase_currency ?? parent.currency ?? 'USD') as 'USD' | 'EUR' | 'TRY',
            sale_currency:         (parent.sale_currency ?? parent.currency ?? 'USD') as 'USD' | 'EUR' | 'TRY',
            payment_terms:         parent.payment_terms ?? '',
            advance_rate:          parent.advance_rate ?? 0,
            purchase_advance_rate: parent.purchase_advance_rate ?? 0,
            transport_mode:        (parent.transport_mode ?? 'truck') as 'truck' | 'railway' | 'sea',
            eta:                   parent.eta ?? '',
            vessel_name:           parent.vessel_name ?? '',
            proforma_ref:          parent.proforma_ref ?? '',
            register_no:           parent.register_no ?? '',
          },
        });
      }

      toast.success(`Parti ${batchFileNo} oluşturuldu`);
      reset();
      onClose();
      navigate(`/files/${created.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const usedTon      = (parent.batches ?? []).reduce((s, b) => s + (b.tonnage_mt ?? 0), 0);
  const remainingTon = Math.max(0, parent.tonnage_mt - usedTon);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: accent + '18' }}>
              <Layers className="h-3.5 w-3.5" style={{ color: accent }} />
            </div>
            <DialogTitle className="text-[15px] flex-1">Yeni Parti Oluştur</DialogTitle>
          </div>
        </DialogHeader>

        {/* Bilgi satırı */}
        <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl mt-1">
          <div className="flex-1">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Ana Dosya</p>
            <p className="text-[13px] font-bold text-gray-800">{parent.file_no}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Parti No</p>
            <p className="text-[13px] font-bold" style={{ color: accent }}>{batchFileNo}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Kalan Ton</p>
            <p className="text-[13px] font-bold text-amber-600">{remainingTon.toLocaleString('tr-TR')} MT</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 mt-1">
          <div>
            <Lbl>Tonaj (MT) *</Lbl>
            <input
              type="number"
              step="0.001"
              placeholder={`maks. ${remainingTon}`}
              autoFocus
              className={inp}
              {...register('tonnage_mt', { valueAsNumber: true })}
            />
            {errors.tonnage_mt && (
              <div className="text-[10px] text-red-500 mt-0.5">{errors.tonnage_mt.message}</div>
            )}
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => { reset(); onClose(); }}
              className="hidden md:flex px-4 h-8 rounded-lg text-[12px] font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors items-center justify-center"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={createFile.isPending}
              className="w-full md:w-auto px-4 h-12 md:h-8 rounded-2xl md:rounded-lg text-[14px] md:text-[12px] font-bold text-white shadow-sm disabled:opacity-50 active:scale-[0.98] transition-all"
              style={{ background: 'linear-gradient(135deg, #b70011 0%, #dc2626 100%)' }}
            >
              {createFile.isPending ? 'Oluşturuluyor…' : 'Parti Oluştur'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
