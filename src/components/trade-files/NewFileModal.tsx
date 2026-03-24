import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { newTradeFileSchema, type NewTradeFileFormData } from '@/types/forms';
import { useCustomers, useCreateCustomer, useProducts, useCreateProduct } from '@/hooks/useEntities';
import { useCreateTradeFile, useUpdateFileInfo } from '@/hooks/useTradeFiles';
import { useSettings } from '@/hooks/useSettings';
import { generateFileNo } from '@/lib/generators';
import { today } from '@/lib/formatters';
import type { TradeFile } from '@/types/database';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea, NativeSelect } from '@/components/ui/form-elements';
import { FormRow, FormGroup } from '@/components/ui/shared';
import { Plus } from 'lucide-react';
import { SmartFill } from '@/components/ui/SmartFill';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editMode?: boolean;
  fileToEdit?: TradeFile | null;
}

export function NewFileModal({ open, onOpenChange, editMode = false, fileToEdit }: Props) {
  const { data: customers = [] } = useCustomers();
  const { data: products = [] } = useProducts();
  const { data: settings } = useSettings();
  const createFile = useCreateTradeFile();
  const updateFileInfo = useUpdateFileInfo();
  const createCust = useCreateCustomer();
  const createProd = useCreateProduct();
  const [showNewCust, setShowNewCust] = useState(false);
  const [showNewProd, setShowNewProd] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newProdName, setNewProdName] = useState('');

  const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm<NewTradeFileFormData>({
    resolver: zodResolver(newTradeFileSchema),
    defaultValues: { customer_id: '', product_id: '', file_date: today(), tonnage_mt: 0, customer_ref: '', notes: '' },
  });

  useEffect(() => {
    if (open && editMode && fileToEdit) {
      reset({
        customer_id: fileToEdit.customer_id ?? '',
        product_id: fileToEdit.product_id ?? '',
        file_date: fileToEdit.file_date ?? today(),
        tonnage_mt: fileToEdit.tonnage_mt ?? 0,
        customer_ref: fileToEdit.customer_ref ?? '',
        notes: fileToEdit.notes ?? '',
      });
    } else if (open && !editMode) {
      reset({ customer_id: '', product_id: '', file_date: today(), tonnage_mt: 0, customer_ref: '', notes: '' });
    }
  }, [open, editMode, fileToEdit, reset]);

  async function addCust() {
    if (!newCustName.trim()) return;
    const c = await createCust.mutateAsync({ name: newCustName.trim(), country: '', address: '', contact_email: '', contact_phone: '', notes: '' });
    setValue('customer_id', c.id); setNewCustName(''); setShowNewCust(false);
  }
  async function addProd() {
    if (!newProdName.trim()) return;
    const p = await createProd.mutateAsync({ name: newProdName.trim(), hs_code: '', unit: 'ADMT' });
    setValue('product_id', p.id); setNewProdName(''); setShowNewProd(false);
  }

  async function handleAIFill(fields: Record<string, unknown>) {
    // ── Customer ──────────────────────────────────────────────────────────────
    if (fields.customer_id && customers.find(c => c.id === fields.customer_id)) {
      // AI matched to an existing customer
      setValue('customer_id', String(fields.customer_id));
    } else if (fields.customer_name) {
      const name = String(fields.customer_name).trim();
      // Try a case-insensitive local match first (AI might hallucinate IDs)
      const local = customers.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (local) {
        setValue('customer_id', local.id);
      } else {
        // Not found → create automatically
        try {
          const created = await createCust.mutateAsync({
            name, country: '', address: '', contact_email: '', contact_phone: '', notes: '',
          });
          setValue('customer_id', created.id);
          toast.success(`"${name}" müşterisi oluşturuldu`);
        } catch {
          toast.error(`Müşteri oluşturulamadı: ${name}`);
        }
      }
    }

    // ── Product ───────────────────────────────────────────────────────────────
    if (fields.product_id && products.find(p => p.id === fields.product_id)) {
      setValue('product_id', String(fields.product_id));
    } else if (fields.product_name) {
      const name = String(fields.product_name).trim();
      const local = products.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (local) {
        setValue('product_id', local.id);
      } else {
        try {
          const created = await createProd.mutateAsync({ name, hs_code: '', unit: 'ADMT' });
          setValue('product_id', created.id);
          toast.success(`"${name}" ürünü oluşturuldu`);
        } catch {
          toast.error(`Ürün oluşturulamadı: ${name}`);
        }
      }
    }

    // ── Scalar fields ─────────────────────────────────────────────────────────
    if (fields.tonnage_mt != null)             setValue('tonnage_mt',   Number(fields.tonnage_mt));
    if (fields.file_date)                      setValue('file_date',    String(fields.file_date));
    if (fields.customer_ref !== undefined)     setValue('customer_ref', String(fields.customer_ref ?? ''));
    if (fields.notes !== undefined)            setValue('notes',        String(fields.notes ?? ''));
  }

  async function onSubmit(data: NewTradeFileFormData) {
    if (editMode && fileToEdit) {
      await updateFileInfo.mutateAsync({ id: fileToEdit.id, data });
      onOpenChange(false);
    } else {
      const cust = customers.find((c) => c.id === data.customer_id);
      const fileNo = generateFileNo(cust?.name ?? 'FILE', settings?.file_prefix ?? 'ESN', 0);
      await createFile.mutateAsync({ ...data, file_no: fileNo });
      reset(); setShowNewCust(false); setShowNewProd(false); onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editMode ? 'Edit File Info' : 'New File'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          {!editMode && (
            <div className="mb-3 flex justify-end">
              <SmartFill
                mode="new_file"
                context={{ customers, products }}
                formName="Yeni Dosya"
                onResult={(r) => handleAIFill(r as Record<string, unknown>)}
              />
            </div>
          )}
          <FormRow>
            <FormGroup label="Customer *" error={errors.customer_id?.message}>
              <div className="flex gap-1.5">
                <NativeSelect {...register('customer_id')} className="flex-1">
                  <option value="">— Select —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </NativeSelect>
                <Button type="button" variant="outline" size="default" onClick={() => setShowNewCust(!showNewCust)}><Plus className="h-3.5 w-3.5" /></Button>
              </div>
              {showNewCust && (
                <div className="flex gap-1.5 mt-1.5">
                  <Input placeholder="New customer name" value={newCustName} onChange={(e) => setNewCustName(e.target.value)} className="flex-1" />
                  <Button type="button" onClick={addCust} disabled={createCust.isPending}>Add</Button>
                </div>
              )}
            </FormGroup>
            <FormGroup label="Product *" error={errors.product_id?.message}>
              <div className="flex gap-1.5">
                <NativeSelect {...register('product_id')} className="flex-1">
                  <option value="">— Select —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </NativeSelect>
                <Button type="button" variant="outline" size="default" onClick={() => setShowNewProd(!showNewProd)}><Plus className="h-3.5 w-3.5" /></Button>
              </div>
              {showNewProd && (
                <div className="flex gap-1.5 mt-1.5">
                  <Input placeholder="New product name" value={newProdName} onChange={(e) => setNewProdName(e.target.value)} className="flex-1" />
                  <Button type="button" onClick={addProd} disabled={createProd.isPending}>Add</Button>
                </div>
              )}
            </FormGroup>
          </FormRow>
          <FormRow>
            <FormGroup label="Date" error={errors.file_date?.message}><Input type="date" {...register('file_date')} /></FormGroup>
            <FormGroup label="Tonnage (MT)" error={errors.tonnage_mt?.message}><Input type="number" step="0.001" {...register('tonnage_mt')} /></FormGroup>
          </FormRow>
          <FormRow>
            <FormGroup label="Customer Ref"><Input {...register('customer_ref')} /></FormGroup>
            <FormGroup label="Notes"><Textarea rows={2} {...register('notes')} /></FormGroup>
          </FormRow>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createFile.isPending || updateFileInfo.isPending}>
              {editMode
                ? (updateFileInfo.isPending ? 'Saving…' : 'Save Changes')
                : (createFile.isPending ? 'Creating…' : 'Create File')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
