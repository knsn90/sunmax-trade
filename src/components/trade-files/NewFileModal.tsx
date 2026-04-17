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
import { Plus, Trash2, Users, CalendarDays, Hash, FileText, StickyNote } from 'lucide-react';
import { SmartFill } from '@/components/ui/SmartFill';
import { MonoDatePicker } from '@/components/ui/MonoDatePicker';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

// ── Input style constants ────────────────────────────────────────────────────
const inp = 'bg-[#f2f4f7] rounded-xl px-4 py-3 text-[13px] font-medium text-gray-900 placeholder:text-gray-400 border border-transparent focus:border-gray-300 focus:bg-white shadow-none focus:outline-none focus:ring-0 w-full transition-all';
const sel = 'bg-[#f2f4f7] rounded-xl px-4 py-3 text-[13px] font-medium text-gray-900 border border-transparent focus:border-gray-300 focus:bg-white shadow-none focus:outline-none w-full appearance-none cursor-pointer transition-all';

/** Section header with icon */
function Section({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
        <Icon className="h-3 w-3 text-gray-400" />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

/** Field wrapper */
function Fld({ label, children, className, error }: {
  label: string; children: React.ReactNode; className?: string; error?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">{label}</div>
      {children}
      {error && <div className="text-[10px] text-red-500 mt-1">{error}</div>}
    </div>
  );
}

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

  useEffect(() => { if (open) setSaving(false); }, [open]);

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
          <div className="flex items-center justify-between gap-3 pr-8 md:pr-0 w-full">
            <div className="flex flex-col min-w-0">
              <DialogTitle
                className="text-[17px] font-extrabold tracking-tight text-gray-900 leading-tight"
                style={{ fontFamily: 'Manrope, sans-serif' }}
              >
                {editMode ? 'Dosyayı Düzenle' : 'Yeni Ticaret Dosyası'}
              </DialogTitle>
              {fileNoValue && (
                <span className="text-[11px] font-mono text-gray-400 mt-0.5">
                  #{fileNoValue}
                </span>
              )}
            </div>
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-1">

          {/* ── Section: Taraflar ─────────────────────────────────────────── */}
          <div>
            <Section icon={Users} label="Taraflar" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

              {/* Müşteri */}
              <Fld label="Müşteri *" error={errors.customer_id?.message}>
                <div className="flex gap-2">
                  <select {...register('customer_id')} className={cn(sel, 'flex-1')}>
                    <option value="">— Müşteri Seçin —</option>
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
                      'w-9 h-[46px] rounded-xl flex items-center justify-center font-bold transition-all shrink-0',
                      showNewCust ? 'text-white' : 'bg-[#f2f4f7] text-gray-400 hover:text-gray-600 hover:bg-gray-200',
                    )}
                    style={showNewCust ? { background: accent } : {}}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {showNewCust && (
                  <div className="flex gap-2 mt-2">
                    <input
                      className={cn(inp, 'flex-1')}
                      placeholder="Yeni müşteri adı…"
                      value={newCustName}
                      onChange={e => setNewCustName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCust(); } }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={addCust}
                      disabled={createCust.isPending || !newCustName.trim()}
                      className="px-4 h-[46px] rounded-xl text-[12px] font-bold text-white disabled:opacity-50 shrink-0 hover:opacity-90 transition-opacity"
                      style={{ background: accent }}
                    >
                      Ekle
                    </button>
                  </div>
                )}
              </Fld>

              {/* Ürün */}
              <Fld label="Ürün *" error={errors.product_id?.message}>
                <div className="flex gap-2">
                  <select {...register('product_id')} className={cn(sel, 'flex-1')}>
                    <option value="">— Ürün Seçin —</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewProd(!showNewProd)}
                    title="Yeni ürün ekle"
                    className={cn(
                      'w-9 h-[46px] rounded-xl flex items-center justify-center font-bold transition-all shrink-0',
                      showNewProd ? 'text-white' : 'bg-[#f2f4f7] text-gray-400 hover:text-gray-600 hover:bg-gray-200',
                    )}
                    style={showNewProd ? { background: accent } : {}}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {showNewProd && (
                  <div className="flex gap-2 mt-2">
                    <input
                      className={cn(inp, 'flex-1')}
                      placeholder="Yeni ürün adı…"
                      value={newProdName}
                      onChange={e => setNewProdName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProd(); } }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={addProd}
                      disabled={createProd.isPending || !newProdName.trim()}
                      className="px-4 h-[46px] rounded-xl text-[12px] font-bold text-white disabled:opacity-50 shrink-0 hover:opacity-90 transition-opacity"
                      style={{ background: accent }}
                    >
                      Ekle
                    </button>
                  </div>
                )}
              </Fld>
            </div>
          </div>

          {/* ── Section: Süreç ────────────────────────────────────────────── */}
          <div>
            <Section icon={CalendarDays} label="Süreç" />
            <div className="grid grid-cols-3 gap-3">
              <Fld label="Tarih" error={errors.file_date?.message}>
                <MonoDatePicker value={watch('file_date') ?? ''} onChange={v => setValue('file_date', v)} />
              </Fld>
              <Fld label="ETA" error={errors.eta?.message}>
                <MonoDatePicker value={watch('eta') ?? ''} onChange={v => setValue('eta', v)} />
              </Fld>
              <Fld label="Miktar (MT)" error={errors.tonnage_mt?.message}>
                <input
                  type="number"
                  step="0.001"
                  {...register('tonnage_mt')}
                  className={inp}
                  placeholder="0.000"
                />
              </Fld>
            </div>
          </div>

          {/* ── Section: Referans ─────────────────────────────────────────── */}
          <div>
            <Section icon={Hash} label="Referans" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {!editMode && (
                <Fld label="Dosya No" error={errors.file_no?.message}>
                  <div className="relative">
                    <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-300 pointer-events-none" />
                    <input
                      {...register('file_no')}
                      placeholder="Otomatik oluşturulacak…"
                      className={cn(inp, 'font-mono pl-9')}
                    />
                  </div>
                </Fld>
              )}
              <Fld label="Müşteri Referansı" className={editMode ? 'md:col-span-2' : ''}>
                <input
                  {...register('customer_ref')}
                  placeholder="Opsiyonel müşteri ref. no"
                  className={inp}
                />
              </Fld>
            </div>
          </div>

          {/* ── Section: Notlar ───────────────────────────────────────────── */}
          <div>
            <Section icon={StickyNote} label="Notlar" />
            <textarea
              {...register('notes')}
              rows={3}
              placeholder="Dosyayla ilgili notlar…"
              className={cn(inp, 'resize-none')}
            />
          </div>

          {/* ── Footer ──────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            {/* Sol: Sil (sadece edit modda) */}
            <div>
              {editMode && fileToEdit ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteFile.isPending}
                  className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-[12px] font-semibold text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleteFile.isPending ? 'Siliniyor…' : 'Dosyayı Sil'}
                </button>
              ) : <div />}
            </div>

            {/* Sağ: İptal + Kaydet */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="px-4 h-9 rounded-xl text-[12px] font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 h-9 rounded-xl text-[13px] font-bold text-white shadow-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center gap-2"
                style={{ background: accent }}
              >
                {saving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {editMode ? 'Kaydediliyor…' : 'Oluşturuluyor…'}
                  </>
                ) : (
                  editMode ? 'Kaydet' : 'Dosya Oluştur'
                )}
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
