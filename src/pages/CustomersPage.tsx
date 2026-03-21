import { useState } from 'react';
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from '@/hooks/useEntities';
import { useAuth } from '@/hooks/useAuth';
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
    defaultValues: { name: '', country: '', address: '', contact_email: '', contact_phone: '', notes: '' },
  });

  const { register, handleSubmit, formState: { errors }, reset } = form;

  function openNew() {
    setEditing(null);
    reset({ name: '', country: '', address: '', contact_email: '', contact_phone: '', notes: '' });
    setModalOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    reset({
      name: c.name,
      country: c.country,
      address: c.address,
      contact_email: c.contact_email,
      contact_phone: c.contact_phone,
      notes: c.notes,
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
    if (window.confirm('Remove this customer?')) {
      deleteCustomer.mutate(id);
    }
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      <PageHeader title="Customers">
        {writable && <Button onClick={openNew}>+ Add</Button>}
      </PageHeader>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['ID', 'Name', 'Country', 'Contact', 'Actions'].map((h) => (
                  <th key={h} className="px-2.5 py-2 text-left text-2xs font-bold uppercase text-muted-foreground border-b-2 border-border bg-gray-50">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr><td colSpan={5}><EmptyState message="No customers yet" /></td></tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="px-2.5 py-2 text-xs font-bold border-b border-border">{c.code}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{c.name}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{c.country}</td>
                    <td className="px-2.5 py-2 text-xs text-muted-foreground border-b border-border">
                      {c.contact_email || c.contact_phone || '—'}
                    </td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">
                      <div className="flex gap-1">
                        {writable && (
                          <Button variant="edit" size="xs" onClick={() => openEdit(c)}>Edit</Button>
                        )}
                        {admin && (
                          <Button variant="destructive" size="xs" onClick={() => handleDelete(c.id)}>Del</Button>
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
            <DialogTitle>{editing ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FormRow>
              <FormGroup label="Name *" error={errors.name?.message}>
                <Input {...register('name')} />
              </FormGroup>
              <FormGroup label="Country">
                <Input {...register('country')} />
              </FormGroup>
            </FormRow>
            <FormGroup label="Address" className="mb-2.5">
              <Input {...register('address')} />
            </FormGroup>
            <FormRow>
              <FormGroup label="Email" error={errors.contact_email?.message}>
                <Input type="email" {...register('contact_email')} />
              </FormGroup>
              <FormGroup label="Phone">
                <Input {...register('contact_phone')} />
              </FormGroup>
            </FormRow>
            <FormGroup label="Notes" className="mb-2.5">
              <Textarea rows={2} {...register('notes')} />
            </FormGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createCustomer.isPending || updateCustomer.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
