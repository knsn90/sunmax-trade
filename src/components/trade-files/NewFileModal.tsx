import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { newTradeFileSchema, type NewTradeFileFormData } from '@/types/forms';
import { useCustomers, useCreateCustomer, useProducts, useCreateProduct } from '@/hooks/useEntities';
import { useCreateTradeFile } from '@/hooks/useTradeFiles';
import { useSettings } from '@/hooks/useSettings';
import { generateFileNo } from '@/lib/generators';
import { today } from '@/lib/formatters';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea, NativeSelect } from '@/components/ui/form-elements';
import { FormRow, FormGroup } from '@/components/ui/shared';
import { Plus } from 'lucide-react';

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

export function NewFileModal({ open, onOpenChange }: Props) {
  const { data: customers = [] } = useCustomers();
  const { data: products = [] } = useProducts();
  const { data: settings } = useSettings();
  const createFile = useCreateTradeFile();
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

  async function onSubmit(data: NewTradeFileFormData) {
    const cust = customers.find((c) => c.id === data.customer_id);
    const fileNo = generateFileNo(cust?.name ?? 'FILE', settings?.file_prefix ?? 'ESN', 0);
    await createFile.mutateAsync({ ...data, file_no: fileNo });
    reset(); setShowNewCust(false); setShowNewProd(false); onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New File</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
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
            <Button type="submit" disabled={createFile.isPending}>{createFile.isPending ? 'Creating…' : 'Create File'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
