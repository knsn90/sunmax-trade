import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from '@/hooks/useEntities';
import { useAuth } from '@/hooks/useAuth';
import { NativeSelect } from '@/components/ui/form-elements';
import { canWrite, isAdmin } from '@/lib/permissions';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { customerSchema, type CustomerFormData } from '@/types/forms';
import type { Customer } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/form-elements';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Card, PageHeader, LoadingSpinner, EmptyState, FormRow, FormGroup } from '@/components/ui/shared';

export function CustomersPage() {
  const { t } = useTranslation('contacts');
  const { t: tc } = useTranslation('common');
  const { profile } = useAuth();
  const writable = canWrite(profile?.role);
  const admin = isAdmin(profile?.role);
  const { data: customers = [], isLoading } = useCustomers();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: '', code: '', country: '', address: '', contact_email: '', contact_phone: '', notes: '', parent_customer_id: '' },
  });

  const { register, handleSubmit, formState: { errors }, reset, watch, setValue } = form;
  const parentCustomerId = watch('parent_customer_id');
  // Ana firmalar (parent_customer_id === null)
  const parentCustomers = customers.filter(c => !c.parent_customer_id);

  function openNew() {
    setEditing(null);
    reset({ name: '', code: '', country: '', address: '', contact_email: '', contact_phone: '', notes: '', parent_customer_id: '' });
    setModalOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    reset({
      name: c.name,
      code: c.code ?? '',
      country: c.country,
      address: c.address,
      contact_email: c.contact_email,
      contact_phone: c.contact_phone,
      notes: c.notes,
      parent_customer_id: c.parent_customer_id ?? '',
    });
    setModalOpen(true);
  }

  async function onSubmit(data: CustomerFormData) {
    if (editing) {
      await updateCustomer.mutateAsync({ id: editing.id, data });
    } else {
      await createCustomer.mutateAsync(data);
    }
    setModalOpen(false);
  }

  function handleDelete(id: string) {
    if (window.confirm(t('confirm.removeCustomer'))) {
      deleteCustomer.mutate(id);
    }
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      <PageHeader title={t('tabs.customers')}>
        {writable && <Button onClick={openNew}>+ {tc('btn.add')}</Button>}
      </PageHeader>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {[tc('table.code'), tc('table.name'), tc('form.country'), t('table.contact'), tc('table.actions')].map((h) => (
                  <th key={h} className="px-2.5 py-2 text-left text-2xs font-bold uppercase text-muted-foreground border-b-2 border-border bg-gray-50">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr><td colSpan={5}><EmptyState message={t('empty.noCustomers')} /></td></tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="px-2.5 py-2 text-xs font-bold border-b border-border">{c.code}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">
                      <div className="flex items-center gap-1.5">
                        {c.parent_customer_id && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 uppercase tracking-wide shrink-0">Alt</span>
                        )}
                        {c.name}
                      </div>
                      {c.parent_customer_id && (
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          ↳ {customers.find(p => p.id === c.parent_customer_id)?.name ?? '—'}
                        </div>
                      )}
                    </td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{c.country}</td>
                    <td className="px-2.5 py-2 text-xs text-muted-foreground border-b border-border">
                      {c.contact_email || c.contact_phone || '—'}
                    </td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">
                      <div className="flex gap-1">
                        {writable && (
                          <Button variant="edit" size="xs" onClick={() => openEdit(c)}>{tc('btn.edit')}</Button>
                        )}
                        {admin && (
                          <Button variant="destructive" size="xs" onClick={() => handleDelete(c.id)}>{tc('btn.delete')}</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t('modal.editCustomer') : t('modal.newCustomer')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FormRow>
              <FormGroup label={`${tc('table.name')} *`} error={errors.name?.message}>
                <Input {...register('name')} />
              </FormGroup>
              <FormGroup label="Kısa Kod" error={errors.code?.message}>
                <Input
                  {...register('code')}
                  placeholder="ör. PB"
                  maxLength={6}
                  className="uppercase"
                  onChange={(e) => {
                    e.target.value = e.target.value.toUpperCase();
                    register('code').onChange(e);
                  }}
                />
                <p className="text-[10px] text-gray-400 mt-1">2-6 karakter, büyük harf. Dosya numarasında kullanılır (ör. PB → PB-P01-2025-04)</p>
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label={tc('form.country')}>
                <Input {...register('country')} />
              </FormGroup>
            </FormRow>
            <FormGroup label={tc('form.address')} className="mb-2.5">
              <Input {...register('address')} />
            </FormGroup>
            <FormRow>
              <FormGroup label={tc('form.email')} error={errors.contact_email?.message}>
                <Input type="email" {...register('contact_email')} />
              </FormGroup>
              <FormGroup label={tc('form.phone')}>
                <Input {...register('contact_phone')} />
              </FormGroup>
            </FormRow>
            <FormGroup label={tc('form.notes')} className="mb-2.5">
              <Textarea rows={2} {...register('notes')} />
            </FormGroup>

            {/* ── Alt Firma ── */}
            <div className="mb-2.5 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                Alt Firma (Opsiyonel)
              </label>
              <NativeSelect
                value={parentCustomerId ?? ''}
                onChange={e => setValue('parent_customer_id', e.target.value)}
                className="text-[12px]"
              >
                <option value="">— Bağımsız firma (alt firma değil) —</option>
                {parentCustomers
                  .filter(p => p.id !== editing?.id)
                  .map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </NativeSelect>
              {parentCustomerId && (
                <p className="text-[10px] text-violet-600 mt-1">
                  Bu firma seçilen ana firmanın alt şirketidir. Muhasebe ana firmadan yürür; evraklarda bu firma seçilebilir.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>{tc('btn.cancel')}</Button>
              <Button type="submit" disabled={createCustomer.isPending || updateCustomer.isPending}>
                {tc('btn.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
