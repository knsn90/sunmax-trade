import { useState } from 'react';
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

  // Çoklu tedarikçi varsa kullanıcıdan seçim istenir
  const multiSuppliers = (parent.suppliers ?? []).length > 1;
  const [selectedSupplierId, setSelectedSupplierId] = useState('');

  // Her tedarikçi için mevcut partilerde kullanılan tonaj (supplier_id bazında)
  const usedTonBySupplier = (parent.batches ?? [])
    .filter(b => b.status !== 'cancelled')   // iptal edilen parti tonajı serbest kalmalı
    .reduce<Record<string, number>>((acc, b) => {
      const sid = (b as unknown as { supplier_id?: string }).supplier_id;
      if (sid) acc[sid] = (acc[sid] ?? 0) + (b.tonnage_mt ?? 0);
      return acc;
    }, {});

  // Aynı tedarikçi (supplier_id) birden fazla satırda olabilir (farklı lot/fiyat).
  // Kalan tonaj tedarikçinin TÜM satırlarının toplamı üzerinden hesaplanmalı —
  // aksi halde toplam kullanım her satırdan ayrı düşülüp yanlışlıkla "Doldu" görünür.
  const totalQtyBySupplier = (parent.suppliers ?? []).reduce<Record<string, number>>((acc, s) => {
    acc[s.supplier_id] = (acc[s.supplier_id] ?? 0) + (s.quantity_mt ?? 0);
    return acc;
  }, {});

  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { tonnage_mt: undefined },
  });

  async function onSubmit(values: Form) {
    // Çok tedarikçili dosyada seçim zorunlu
    if (multiSuppliers && !selectedSupplierId) {
      toast.error('Lütfen bu parti için bir tedarikçi seçin');
      return;
    }

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
        // Çok tedarikçili → sadece seçilen tedarikçi bu partiye atanır
        let batchSuppliers: typeof parent.suppliers | undefined;
        if (multiSuppliers && selectedSupplierId) {
          const picked = (parent.suppliers ?? []).find(s => s.supplier_id === selectedSupplierId);
          batchSuppliers = picked
            ? [{ ...picked, quantity_mt: values.tonnage_mt }]
            : undefined;
        } else {
          batchSuppliers = parent.suppliers?.length ? parent.suppliers : undefined;
        }

        await updateSaleDetails.mutateAsync({
          id: created.id,
          data: {
            supplier_id: multiSuppliers
              ? (selectedSupplierId || (parent.supplier_id ?? ''))
              : (parent.supplier_id ?? ''),
            selling_price:         parent.selling_price ?? 0,
            purchase_price:        batchSuppliers?.[0]?.purchase_price ?? parent.purchase_price ?? 0,
            freight_cost:          batchSuppliers?.[0]?.freight_cost ?? parent.freight_cost ?? 0,
            port_of_loading:       parent.port_of_loading ?? '',
            port_of_discharge:     parent.port_of_discharge ?? '',
            incoterms:             parent.incoterms ?? '',
            purchase_currency:     (batchSuppliers?.[0]?.currency ?? parent.purchase_currency ?? parent.currency ?? 'USD') as 'USD' | 'EUR' | 'TRY',
            sale_currency:         (parent.sale_currency ?? parent.currency ?? 'USD') as 'USD' | 'EUR' | 'TRY',
            payment_terms:         parent.payment_terms ?? '',
            advance_rate:          parent.advance_rate ?? 0,
            purchase_advance_rate: parent.purchase_advance_rate ?? 0,
            transport_mode:        (parent.transport_mode ?? 'truck') as 'truck' | 'railway' | 'sea',
            eta:                   parent.eta ?? '',
            vessel_name:           parent.vessel_name ?? '',
            proforma_ref:          parent.proforma_ref ?? '',
            register_no:           parent.register_no ?? '',
            suppliers: batchSuppliers?.map(s => ({
              supplier_id:    s.supplier_id,
              quantity_mt:    s.quantity_mt || values.tonnage_mt,
              purchase_price: s.purchase_price ?? 0,
              currency:       (s.currency ?? 'USD') as 'USD' | 'EUR' | 'TRY' | 'AED' | 'GBP',
              fx_rate:        s.fx_rate ?? 1,
              freight_cost:   s.freight_cost ?? 0,
              notes:          s.notes ?? '',
            })),
          },
        });
      }

      toast.success(`Parti ${batchFileNo} oluşturuldu`);
      reset();
      setSelectedSupplierId('');
      onClose();
      navigate(`/files/${created.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const usedTon      = (parent.batches ?? [])
    .filter(b => b.status !== 'cancelled')
    .reduce((s, b) => s + (b.tonnage_mt ?? 0), 0);
  const remainingTon = Math.max(0, parent.tonnage_mt - usedTon);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); setSelectedSupplierId(''); onClose(); } }}>
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

          {/* ── Çoklu tedarikçi seçimi ── */}
          {multiSuppliers && (
            <div>
              <Lbl>Bu Parti İçin Tedarikçi *</Lbl>
              <div className="space-y-1.5">
                {(parent.suppliers ?? []).map(s => {
                  const isSelected  = selectedSupplierId === s.supplier_id;
                  const poolQty     = totalQtyBySupplier[s.supplier_id] ?? 0;
                  const usedTon     = usedTonBySupplier[s.supplier_id] ?? 0;
                  const remaining   = Math.max(0, poolQty - usedTon);
                  const isFull      = poolQty > 0 && remaining <= 0;
                  return (
                    <button
                      key={s.supplier_id}
                      type="button"
                      disabled={isFull}
                      onClick={() => !isFull && setSelectedSupplierId(s.supplier_id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                        isFull
                          ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                          : isSelected
                            ? 'border-transparent text-white shadow-sm'
                            : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
                      }`}
                      style={isSelected && !isFull ? { background: accent } : {}}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${isSelected && !isFull ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`}>
                        {(s.supplier?.name ?? s.supplier_id).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12px] font-semibold truncate ${isSelected && !isFull ? 'text-white' : 'text-gray-800'}`}>
                          {s.supplier?.name ?? s.supplier_id}
                        </p>
                        <p className={`text-[10px] ${isSelected && !isFull ? 'text-white/70' : isFull ? 'text-red-400' : 'text-gray-400'}`}>
                          {isFull
                            ? `Doldu — ${poolQty} MT tamamı kullanıldı`
                            : `${remaining.toLocaleString('tr-TR')} MT kalan · $${s.purchase_price?.toLocaleString('tr-TR') ?? 0}/${s.currency ?? 'USD'}`
                          }
                        </p>
                      </div>
                      {!isFull && (
                        <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${isSelected ? 'border-white bg-white/30' : 'border-gray-300'}`}>
                          {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {!selectedSupplierId && (
                <p className="text-[10px] text-amber-600 mt-1">Bu parti için tedarikçi seçimi zorunludur</p>
              )}
            </div>
          )}

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
              onClick={() => { reset(); setSelectedSupplierId(''); onClose(); }}
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
