import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { newTradeFileSchema, type NewTradeFileFormData } from '@/types/forms';
import { useCustomers, useCreateCustomer, useProducts, useCreateProduct } from '@/hooks/useEntities';
import { useCreateTradeFile, useUpdateFileInfo, useTradeFiles } from '@/hooks/useTradeFiles';
import { generateTradeFileNo } from '@/lib/generators';
import { today } from '@/lib/formatters';
import type { TradeFile } from '@/types/database';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea, NativeSelect } from '@/components/ui/form-elements';
import { FormRow, FormGroup } from '@/components/ui/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { Plus } from 'lucide-react';
import { SmartFill } from '@/components/ui/SmartFill';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editMode?: boolean;
  fileToEdit?: TradeFile | null;
}

export function NewFileModal({ open, onOpenChange, editMode = false, fileToEdit }: Props) {
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';

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

  async function onSubmit(data: NewTradeFileFormData) {
    if (editMode && fileToEdit) {
      await updateFileInfo.mutateAsync({ id: fileToEdit.id, data });
      onOpenChange(false);
    } else {
      await createFile.mutateAsync({ ...data, file_no: data.file_no });
      reset(); setShowNewCust(false); setShowNewProd(false); onOpenChange(false);
    }
  }

  const isPending = createFile.isPending || updateFileInfo.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* ── Header ─────────────────────────────────────────── */}
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-[15px]">
                {editMode ? 'Dosya Bilgilerini Düzenle' : 'Yeni Dosya'}
              </DialogTitle>
              {/* Auto file-no preview badge */}
              {fileNoValue && (
                <div className="mt-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg">
                    # {fileNoValue}
                  </span>
                </div>
              )}
            </div>
            {!editMode && (
              <SmartFill
                mode="new_file"
                context={{ customers, products }}
                formName="New File"
                onResult={(r) => handleAIFill(r as Record<string, unknown>)}
              />
            )}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>

          {/* ── Müşteri + Ürün ──────────────────────────────── */}
          <FormRow>
            <FormGroup label="Müşteri *" error={errors.customer_id?.message}>
              <div className="flex gap-1.5">
                <NativeSelect {...register('customer_id')} className="flex-1">
                  <option value="">— Seçin —</option>
                  {(() => {
                    const parents = customers.filter(c => !c.parent_customer_id);
                    const subs    = customers.filter(c =>  c.parent_customer_id);
                    return parents.map((p) => {
                      const children = subs.filter(s => s.parent_customer_id === p.id);
                      return children.length > 0 ? (
                        // Ana firma optgroup başlığı (seçilemeyen), alt firmalar ↳ ile
                        <optgroup key={p.id} label={p.name}>
                          {children.map(s => (
                            <option key={s.id} value={s.id}>↳ {s.name}</option>
                          ))}
                        </optgroup>
                      ) : (
                        // Alt firması olmayan ana firma — normal seçenek
                        <option key={p.id} value={p.id}>{p.name}</option>
                      );
                    });
                  })()}
                </NativeSelect>
                <button
                  type="button"
                  onClick={() => setShowNewCust(!showNewCust)}
                  title="Yeni müşteri ekle"
                  className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center border text-sm font-bold transition-all shrink-0',
                    showNewCust
                      ? 'text-white border-transparent shadow-sm'
                      : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600',
                  )}
                  style={showNewCust ? { background: accent } : {}}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {showNewCust && (
                <div className="flex gap-1.5 mt-1.5">
                  <Input
                    placeholder="Müşteri adı"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    className="flex-1 h-8 text-[13px]"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCust(); } }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={addCust}
                    disabled={createCust.isPending || !newCustName.trim()}
                    className="px-3 h-8 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50 shrink-0 hover:opacity-90 transition-opacity"
                    style={{ background: accent }}
                  >
                    Ekle
                  </button>
                </div>
              )}
            </FormGroup>

            <FormGroup label="Ürün *" error={errors.product_id?.message}>
              <div className="flex gap-1.5">
                <NativeSelect {...register('product_id')} className="flex-1">
                  <option value="">— Seçin —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </NativeSelect>
                <button
                  type="button"
                  onClick={() => setShowNewProd(!showNewProd)}
                  title="Yeni ürün ekle"
                  className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center border text-sm font-bold transition-all shrink-0',
                    showNewProd
                      ? 'text-white border-transparent shadow-sm'
                      : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600',
                  )}
                  style={showNewProd ? { background: accent } : {}}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {showNewProd && (
                <div className="flex gap-1.5 mt-1.5">
                  <Input
                    placeholder="Ürün adı"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    className="flex-1 h-8 text-[13px]"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProd(); } }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={addProd}
                    disabled={createProd.isPending || !newProdName.trim()}
                    className="px-3 h-8 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50 shrink-0 hover:opacity-90 transition-opacity"
                    style={{ background: accent }}
                  >
                    Ekle
                  </button>
                </div>
              )}
            </FormGroup>
          </FormRow>

          {/* ── Tarih · ETA · Miktar ────────────────────────── */}
          <FormRow cols={3}>
            <FormGroup label="Tarih" error={errors.file_date?.message}>
              <Input type="date" {...register('file_date')} />
            </FormGroup>
            <FormGroup label="Tahmini Teslim (ETA)" error={errors.eta?.message}>
              <Input type="date" {...register('eta')} />
            </FormGroup>
            <FormGroup label="Miktar (MT)" error={errors.tonnage_mt?.message}>
              <Input type="number" step="0.001" {...register('tonnage_mt')} />
            </FormGroup>
          </FormRow>

          {/* ── Dosya No (create mode only) ──────────────────── */}
          {!editMode && (
            <FormGroup label="Dosya No" error={errors.file_no?.message} className="mb-2.5">
              <Input
                {...register('file_no')}
                placeholder="Otomatik oluşturulacak…"
                className="font-mono text-[13px]"
              />
            </FormGroup>
          )}

          {/* ── Müşteri Ref · Notlar ────────────────────────── */}
          <FormRow>
            <FormGroup label="Müşteri Ref">
              <Input {...register('customer_ref')} />
            </FormGroup>
            <FormGroup label="Notlar">
              <Textarea rows={2} {...register('notes')} />
            </FormGroup>
          </FormRow>

          {/* ── Footer ──────────────────────────────────────── */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              İptal
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="text-white shadow-sm hover:opacity-90 transition-opacity"
              style={{ background: accent }}
            >
              {isPending
                ? (editMode ? 'Kaydediliyor…' : 'Oluşturuluyor…')
                : (editMode ? 'Kaydet' : 'Dosya Oluştur')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
