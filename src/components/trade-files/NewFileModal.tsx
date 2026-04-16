import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { newTradeFileSchema, type NewTradeFileFormData } from '@/types/forms';
import { useCustomers, useCreateCustomer, useProducts, useCreateProduct } from '@/hooks/useEntities';
import { useCreateTradeFile, useUpdateFileInfo, useDeleteTradeFile, useTradeFiles } from '@/hooks/useTradeFiles';
import { generateTradeFileNo } from '@/lib/generators';
import { today } from '@/lib/formatters';
import type { TradeFile } from '@/types/database';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTheme } from '@/contexts/ThemeContext';
import { Plus, Trash2 } from 'lucide-react';
import { SmartFill } from '@/components/ui/SmartFill';
import { MonoDatePicker } from '@/components/ui/MonoDatePicker';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

// ── Mono stil sabitleri ──────────────────────────────────────────────────────
const inp = 'bg-[#f2f4f7] rounded-xl px-4 py-3 text-[13px] font-medium text-gray-900 placeholder:text-gray-400 border-0 shadow-none focus:outline-none focus:ring-2 focus:ring-red-500/20 w-full';
const sel = 'bg-[#f2f4f7] rounded-xl px-4 py-3 text-[13px] font-medium text-gray-900 border-0 shadow-none focus:outline-none w-full appearance-none cursor-pointer';
const Lbl = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">{children}</div>
);
const Fld = ({ label, children, className, error }: { label: string; children: React.ReactNode; className?: string; error?: string }) => (
  <div className={className}>
    <Lbl>{label}</Lbl>
    {children}
    {error && <div className="text-[10px] text-red-500 mt-0.5">{error}</div>}
  </div>
);

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editMode?: boolean;
  fileToEdit?: TradeFile | null;
}

export function NewFileModal({ open, onOpenChange, editMode = false, fileToEdit }: Props) {
  const { accent } = useTheme();
  const navigate = useNavigate();
  const deleteFile = useDeleteTradeFile();

  async function handleDelete() {
    if (!fileToEdit) return;
    if (!window.confirm(`"${fileToEdit.file_no}" dosyasını silmek istediğinizden emin misiniz?\nBu işlem geri alınamaz.`)) return;
    await deleteFile.mutateAsync(fileToEdit.id);
    onOpenChange(false);
    navigate('/files');
  }

  const { data: customers = [] } = useCustomers();
  const { data: products = [] } = useProducts();
  const { data: allFiles = [] } = useTradeFiles();
  const createFile = useCreateTradeFile();
  const updateFileInfo = useUpdateFileInfo();
  const createCust = useCreateCustomer();
  const createProd = useCreateProduct();
  const [showNewCust, setShowNewCust] = useState(false);
  const [showNewProd, setShowNewProd] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newProdName, setNewProdName] = useState('');

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<NewTradeFileFormData>({
    resolver: zodResolver(newTradeFileSchema),
    defaultValues: { customer_id: '', product_id: '', file_date: today(), eta: '', tonnage_mt: 0, file_no: '', customer_ref: '', notes: '' },
  });

  useEffect(() => {
    if (open && editMode && fileToEdit) {
      reset({
        customer_id: fileToEdit.customer_id ?? '',
        product_id: fileToEdit.product_id ?? '',
        file_date: fileToEdit.file_date ?? today(),
        eta: fileToEdit.eta ?? '',
        tonnage_mt: fileToEdit.tonnage_mt ?? 0,
        file_no: fileToEdit.file_no ?? '',
        customer_ref: fileToEdit.customer_ref ?? '',
        notes: fileToEdit.notes ?? '',
      });
    } else if (open && !editMode) {
      reset({ customer_id: '', product_id: '', file_date: today(), eta: '', tonnage_mt: 0, file_no: '', customer_ref: '', notes: '' });
    }
  }, [open, editMode, fileToEdit, reset]);

  const selectedCustomerId = watch('customer_id');
  const selectedProductId  = watch('product_id');
  const selectedEta        = watch('eta');
  const fileNoValue        = watch('file_no');

  useEffect(() => {
    if (editMode || !selectedCustomerId) return;
    const customer     = customers.find(c => c.id === selectedCustomerId);
    const product      = products.find(p => p.id === selectedProductId);
    const customerCode = customer?.code || 'XX';
    const count        = allFiles.filter(f => f.customer_id === selectedCustomerId).length;
    let year: number, month: number;
    if (selectedEta) {
      const d = new Date(selectedEta);
      year = d.getFullYear(); month = d.getMonth() + 1;
    } else {
      const now = new Date();
      year = now.getFullYear(); month = now.getMonth() + 1;
    }
    setValue('file_no', generateTradeFileNo(customerCode, count + 1, year, month, product?.name ?? ''));
  }, [selectedCustomerId, selectedProductId, selectedEta, customers, products, allFiles, editMode, setValue]);

  async function addCust() {
    if (!newCustName.trim()) return;
    const c = await createCust.mutateAsync({ name: newCustName.trim(), country: '', city: '', address: '', contact_email: '', contact_phone: '', tax_id: '', website: '', payment_terms: '', notes: '' });
    setValue('customer_id', c.id); setNewCustName(''); setShowNewCust(false);
  }
  async function addProd() {
    if (!newProdName.trim()) return;
    const p = await createProd.mutateAsync({ name: newProdName.trim(), hs_code: '', unit: 'ADMT', description: '', origin_country: '', species: '', grade: '' });
    setValue('product_id', p.id); setNewProdName(''); setShowNewProd(false);
  }

  async function handleAIFill(fields: Record<string, unknown>) {
    if (fields.customer_id && customers.find(c => c.id === fields.customer_id)) {
      setValue('customer_id', String(fields.customer_id));
    } else if (fields.customer_name) {
      const name = String(fields.customer_name).trim();
      const local = customers.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (local) {
        setValue('customer_id', local.id);
      } else {
        try {
          const created = await createCust.mutateAsync({ name, country: '', city: '', address: '', contact_email: '', contact_phone: '', tax_id: '', website: '', payment_terms: '', notes: '' });
          setValue('customer_id', created.id);
          toast.success(`Müşteri "${name}" oluşturuldu`);
        } catch { toast.error(`Müşteri oluşturulamadı: ${name}`); }
      }
    }
    if (fields.product_id && products.find(p => p.id === fields.product_id)) {
      setValue('product_id', String(fields.product_id));
    } else if (fields.product_name) {
      const name = String(fields.product_name).trim();
      const local = products.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (local) {
        setValue('product_id', local.id);
      } else {
        try {
          const created = await createProd.mutateAsync({ name, hs_code: '', unit: 'ADMT', description: '', origin_country: '', species: '', grade: '' });
          setValue('product_id', created.id);
          toast.success(`Ürün "${name}" oluşturuldu`);
        } catch { toast.error(`Ürün oluşturulamadı: ${name}`); }
      }
    }
    if (fields.tonnage_mt != null)         setValue('tonnage_mt',   Number(fields.tonnage_mt));
    if (fields.file_date)                  setValue('file_date',    String(fields.file_date));
    if (fields.customer_ref !== undefined) setValue('customer_ref', String(fields.customer_ref ?? ''));
    if (fields.notes !== undefined)        setValue('notes',        String(fields.notes ?? ''));
  }

  const [saving, setSaving] = useState(false);

  // Her açılışta saving durumunu sıfırla (beklenmedik duruma karşı güvenlik)
  useEffect(() => {
    if (open) setSaving(false);
  }, [open]);

  async function onSubmit(data: NewTradeFileFormData) {
    setSaving(true);
    try {
      if (editMode && fileToEdit) {
        await updateFileInfo.mutateAsync({ id: fileToEdit.id, data });
        onOpenChange(false);
      } else {
        await createFile.mutateAsync({ ...data, file_no: data.file_no });
        reset(); setShowNewCust(false); setShowNewProd(false); onOpenChange(false);
      }
    } catch {
      // Error shown via toast
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle className="text-[15px] flex-1 font-extrabold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
              {editMode ? 'Dosya Bilgilerini Düzenle' : 'Yeni Dosya'}
            </DialogTitle>
            {fileNoValue && (
              <span className="text-[10px] font-mono font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md shrink-0">
                # {fileNoValue}
              </span>
            )}
            {!editMode && (
              <SmartFill
                iconOnly
                mode="new_file"
                context={{ customers, products }}
                formName="New File"
                onResult={(r) => handleAIFill(r as Record<string, unknown>)}
              />
            )}
          </div>
        </DialogHeader>

        {/* ── Form ────────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 mt-1">

          {/* Müşteri + Ürün */}
          <div className="grid grid-cols-2 gap-3">
            <Fld label="Müşteri *" error={errors.customer_id?.message}>
              <div className="flex gap-1.5">
                <select {...register('customer_id')} className={cn(sel, 'flex-1')}>
                  <option value="">— Seçin —</option>
                  {(() => {
                    const parents = customers.filter(c => !c.parent_customer_id);
                    const subs    = customers.filter(c =>  c.parent_customer_id);
                    return parents.map((p) => {
                      const children = subs.filter(s => s.parent_customer_id === p.id);
                      return children.length > 0 ? (
                        <optgroup key={p.id} label={p.name}>
                          <option value={p.id}>{p.name}</option>
                          {children.map(s => (
                            <option key={s.id} value={s.id}>↳ {s.name}</option>
                          ))}
                        </optgroup>
                      ) : (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      );
                    });
                  })()}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewCust(!showNewCust)}
                  title="Yeni müşteri ekle"
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-all shrink-0',
                    showNewCust ? 'text-white' : 'bg-gray-100 text-gray-400 hover:text-gray-600',
                  )}
                  style={showNewCust ? { background: accent } : {}}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {showNewCust && (
                <div className="flex gap-1.5 mt-1.5">
                  <input
                    className={cn(inp, 'flex-1')}
                    placeholder="Müşteri adı"
                    value={newCustName}
                    onChange={e => setNewCustName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCust(); } }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={addCust}
                    disabled={createCust.isPending || !newCustName.trim()}
                    className="px-3 h-8 rounded-lg text-[11px] font-semibold text-white disabled:opacity-50 shrink-0 hover:opacity-90 transition-opacity"
                    style={{ background: accent }}
                  >
                    Ekle
                  </button>
                </div>
              )}
            </Fld>

            <Fld label="Ürün *" error={errors.product_id?.message}>
              <div className="flex gap-1.5">
                <select {...register('product_id')} className={cn(sel, 'flex-1')}>
                  <option value="">— Seçin —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewProd(!showNewProd)}
                  title="Yeni ürün ekle"
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-all shrink-0',
                    showNewProd ? 'text-white' : 'bg-gray-100 text-gray-400 hover:text-gray-600',
                  )}
                  style={showNewProd ? { background: accent } : {}}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {showNewProd && (
                <div className="flex gap-1.5 mt-1.5">
                  <input
                    className={cn(inp, 'flex-1')}
                    placeholder="Ürün adı"
                    value={newProdName}
                    onChange={e => setNewProdName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProd(); } }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={addProd}
                    disabled={createProd.isPending || !newProdName.trim()}
                    className="px-3 h-8 rounded-lg text-[11px] font-semibold text-white disabled:opacity-50 shrink-0 hover:opacity-90 transition-opacity"
                    style={{ background: accent }}
                  >
                    Ekle
                  </button>
                </div>
              )}
            </Fld>
          </div>

          {/* Tarih · ETA · Miktar */}
          <div className="grid grid-cols-3 gap-3">
            <Fld label="Tarih" error={errors.file_date?.message}>
              <MonoDatePicker value={watch('file_date') ?? ''} onChange={v => setValue('file_date', v)} />
            </Fld>
            <Fld label="ETA" error={errors.eta?.message}>
              <MonoDatePicker value={watch('eta') ?? ''} onChange={v => setValue('eta', v)} />
            </Fld>
            <Fld label="Miktar (MT)" error={errors.tonnage_mt?.message}>
              <input type="number" step="0.001" {...register('tonnage_mt')} className={inp} />
            </Fld>
          </div>

          {/* Dosya No · Müşteri Ref */}
          <div className="grid grid-cols-2 gap-3">
            {!editMode && (
              <Fld label="Dosya No" error={errors.file_no?.message}>
                <input
                  {...register('file_no')}
                  placeholder="Otomatik oluşturulacak…"
                  className={cn(inp, 'font-mono')}
                />
              </Fld>
            )}
            <Fld label="Müşteri Ref" className={editMode ? 'col-span-2' : ''}>
              <input {...register('customer_ref')} className={inp} />
            </Fld>
          </div>

          {/* Notlar */}
          <Fld label="Notlar">
            <textarea
              {...register('notes')}
              rows={3}
              className="bg-[#f2f4f7] rounded-xl px-4 py-3 text-[13px] font-medium text-gray-900 placeholder:text-gray-400 border-0 shadow-none focus:outline-none focus:ring-2 focus:ring-red-500/20 w-full resize-none"
            />
          </Fld>

          {/* ── Footer ──────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-1">
            <div>
              {editMode && fileToEdit && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteFile.isPending}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleteFile.isPending ? 'Siliniyor…' : 'Dosyayı Sil'}
                </button>
              )}
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="hidden md:flex px-4 h-8 rounded-lg text-[12px] font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors items-center justify-center"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="w-full md:w-auto px-5 h-12 md:h-9 rounded-2xl md:rounded-xl text-[14px] md:text-[13px] font-bold text-white shadow-sm active:scale-[0.98] transition-all disabled:opacity-50"
                style={{ fontFamily: 'Manrope, sans-serif', background: 'linear-gradient(135deg, #b70011 0%, #dc2626 100%)' }}
              >
                {saving
                  ? (editMode ? 'Kaydediliyor…' : 'Oluşturuluyor…')
                  : (editMode ? 'Kaydet' : 'Dosya Oluştur')}
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
