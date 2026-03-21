import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  supplierSchema, type SupplierFormData,
  productSchema, type ProductFormData,
  serviceProviderSchema, type ServiceProviderFormData,
} from '@/types/forms';
import type { Supplier, Product, ServiceProvider } from '@/types/database';
import type { ServiceProviderType } from '@/types/enums';
import { SERVICE_PROVIDER_TYPE_LABELS } from '@/types/enums';
import {
  useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier,
  useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct,
  useServiceProviders, useCreateServiceProvider, useUpdateServiceProvider, useDeleteServiceProvider,
} from '@/hooks/useEntities';
import { useInvoices, useDeleteInvoice } from '@/hooks/useDocuments';
import { usePackingLists, useDeletePackingList } from '@/hooks/useDocuments';
import { useProformas, useDeleteProforma } from '@/hooks/useProformas';
import { useAuth } from '@/hooks/useAuth';
import { useSettings, useBankAccounts } from '@/hooks/useSettings';
import { canWrite, isAdmin } from '@/lib/permissions';
import { fDate, fCurrency, fN } from '@/lib/formatters';
import { printInvoice, printPackingList, printProforma } from '@/lib/printDocument';
import { InvoiceModal } from '@/components/documents/InvoiceModal';
import { PackingListModal } from '@/components/documents/PackingListModal';
import { ProformaModal } from '@/components/documents/ProformaModal';
import type { Invoice, PackingList, Proforma, TradeFile } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, Textarea } from '@/components/ui/form-elements';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, PageHeader, LoadingSpinner, EmptyState, FormRow, FormGroup } from '@/components/ui/shared';

export { CustomersPage } from './CustomersPage';

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIERS PAGE
// ═══════════════════════════════════════════════════════════════════════════
export function SuppliersPage() {
  const { profile } = useAuth();
  const writable = canWrite(profile?.role);
  const adminRole = isAdmin(profile?.role);
  const { data: suppliers = [], isLoading } = useSuppliers();
  const createS = useCreateSupplier(); const updateS = useUpdateSupplier(); const deleteS = useDeleteSupplier();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const { register, handleSubmit, formState: { errors }, reset } = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: '', country: '', city: '', contact_name: '', phone: '', email: '', notes: '' },
  });
  function openNew() { setEditing(null); reset({ name: '', country: '', city: '', contact_name: '', phone: '', email: '', notes: '' }); setModalOpen(true); }
  function openEdit(s: Supplier) { setEditing(s); reset({ name: s.name, country: s.country, city: s.city, contact_name: s.contact_name, phone: s.phone, email: s.email, notes: s.notes }); setModalOpen(true); }
  async function onSubmit(data: SupplierFormData) { editing ? await updateS.mutateAsync({ id: editing.id, data }) : await createS.mutateAsync(data); setModalOpen(false); }
  if (isLoading) return <LoadingSpinner />;
  return (
    <>
      <PageHeader title="Suppliers">{writable && <Button onClick={openNew}>+ Add</Button>}</PageHeader>
      <Card><div className="overflow-x-auto"><table className="w-full"><thead><tr>
        {['ID','Name','Country','City','Contact','Actions'].map(h=><th key={h} className="px-2.5 py-2 text-left text-2xs font-bold uppercase text-muted-foreground border-b-2 border-border bg-gray-50">{h}</th>)}
      </tr></thead><tbody>
        {suppliers.length===0?<tr><td colSpan={6}><EmptyState message="No suppliers yet"/></td></tr>:
        suppliers.map(s=><tr key={s.id} className="hover:bg-gray-50/50">
          <td className="px-2.5 py-2 text-xs font-bold border-b border-border">{s.code}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{s.name}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{s.country}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{s.city}</td>
          <td className="px-2.5 py-2 text-xs text-muted-foreground border-b border-border">{s.email||s.phone||'—'}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border"><div className="flex gap-1">
            {writable&&<Button variant="edit" size="xs" onClick={()=>openEdit(s)}>Edit</Button>}
            {adminRole&&<Button variant="destructive" size="xs" onClick={()=>{if(window.confirm('Remove?'))deleteS.mutate(s.id)}}>Del</Button>}
          </div></td></tr>)}
      </tbody></table></div></Card>
      <Dialog open={modalOpen} onOpenChange={setModalOpen}><DialogContent>
        <DialogHeader><DialogTitle>{editing?'Edit Supplier':'Add Supplier'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormRow><FormGroup label="Name *" error={errors.name?.message}><Input {...register('name')}/></FormGroup><FormGroup label="Country"><Input {...register('country')}/></FormGroup></FormRow>
          <FormRow><FormGroup label="City"><Input {...register('city')}/></FormGroup><FormGroup label="Contact"><Input {...register('contact_name')}/></FormGroup></FormRow>
          <FormRow><FormGroup label="Phone"><Input {...register('phone')}/></FormGroup><FormGroup label="Email" error={errors.email?.message}><Input type="email" {...register('email')}/></FormGroup></FormRow>
          <FormGroup label="Notes" className="mb-2.5"><Textarea rows={2} {...register('notes')}/></FormGroup>
          <DialogFooter><Button type="button" variant="outline" onClick={()=>setModalOpen(false)}>Cancel</Button><Button type="submit" disabled={createS.isPending||updateS.isPending}>Save</Button></DialogFooter>
        </form></DialogContent></Dialog>
    </>);
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTS PAGE
// ═══════════════════════════════════════════════════════════════════════════
export function ProductsPage() {
  const { profile } = useAuth();
  const writable = canWrite(profile?.role); const adminRole = isAdmin(profile?.role);
  const { data: products = [], isLoading } = useProducts();
  const createP = useCreateProduct(); const updateP = useUpdateProduct(); const deleteP = useDeleteProduct();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const { register, handleSubmit, formState: { errors }, reset } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema), defaultValues: { name: '', hs_code: '', unit: 'ADMT' },
  });
  function openNew() { setEditing(null); reset({ name: '', hs_code: '', unit: 'ADMT' }); setModalOpen(true); }
  function openEdit(p: Product) { setEditing(p); reset({ name: p.name, hs_code: p.hs_code, unit: p.unit }); setModalOpen(true); }
  async function onSubmit(data: ProductFormData) { editing ? await updateP.mutateAsync({ id: editing.id, data }) : await createP.mutateAsync(data); setModalOpen(false); }
  if (isLoading) return <LoadingSpinner />;
  return (
    <>
      <PageHeader title="Products">{writable && <Button onClick={openNew}>+ Add</Button>}</PageHeader>
      <Card><div className="overflow-x-auto"><table className="w-full"><thead><tr>
        {['ID','Name','HS Code','Unit','Actions'].map(h=><th key={h} className="px-2.5 py-2 text-left text-2xs font-bold uppercase text-muted-foreground border-b-2 border-border bg-gray-50">{h}</th>)}
      </tr></thead><tbody>
        {products.length===0?<tr><td colSpan={5}><EmptyState message="No products yet"/></td></tr>:
        products.map(p=><tr key={p.id} className="hover:bg-gray-50/50">
          <td className="px-2.5 py-2 text-xs font-bold border-b border-border">{p.code}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{p.name}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{p.hs_code||'—'}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{p.unit}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border"><div className="flex gap-1">
            {writable&&<Button variant="edit" size="xs" onClick={()=>openEdit(p)}>Edit</Button>}
            {adminRole&&<Button variant="destructive" size="xs" onClick={()=>{if(window.confirm('Remove?'))deleteP.mutate(p.id)}}>Del</Button>}
          </div></td></tr>)}
      </tbody></table></div></Card>
      <Dialog open={modalOpen} onOpenChange={setModalOpen}><DialogContent>
        <DialogHeader><DialogTitle>{editing?'Edit Product':'Add Product'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormRow><FormGroup label="Name *" error={errors.name?.message}><Input {...register('name')}/></FormGroup><FormGroup label="HS Code"><Input {...register('hs_code')}/></FormGroup></FormRow>
          <FormGroup label="Unit" className="mb-2.5"><NativeSelect {...register('unit')}><option value="ADMT">ADMT</option><option value="MT">MT</option><option value="KG">KG</option></NativeSelect></FormGroup>
          <DialogFooter><Button type="button" variant="outline" onClick={()=>setModalOpen(false)}>Cancel</Button><Button type="submit" disabled={createP.isPending||updateP.isPending}>Save</Button></DialogFooter>
        </form></DialogContent></Dialog>
    </>);
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE PROVIDERS PAGE
// ═══════════════════════════════════════════════════════════════════════════
export function ServiceProvidersPage() {
  const { profile } = useAuth();
  const writable = canWrite(profile?.role); const adminRole = isAdmin(profile?.role);
  const [typeFilter, setTypeFilter] = useState<ServiceProviderType|undefined>(undefined);
  const { data: providers = [], isLoading } = useServiceProviders(typeFilter);
  const createSP = useCreateServiceProvider(); const updateSP = useUpdateServiceProvider(); const deleteSP = useDeleteServiceProvider();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceProvider | null>(null);
  const { register, handleSubmit, formState: { errors }, reset } = useForm<ServiceProviderFormData>({
    resolver: zodResolver(serviceProviderSchema),
    defaultValues: { name: '', service_type: 'other', country: '', city: '', contact_name: '', phone: '', email: '', notes: '' },
  });
  function openNew() { setEditing(null); reset({ name: '', service_type: 'other', country: '', city: '', contact_name: '', phone: '', email: '', notes: '' }); setModalOpen(true); }
  function openEdit(sp: ServiceProvider) { setEditing(sp); reset({ name: sp.name, service_type: sp.service_type, country: sp.country, city: sp.city, contact_name: sp.contact_name, phone: sp.phone, email: sp.email, notes: sp.notes }); setModalOpen(true); }
  async function onSubmit(data: ServiceProviderFormData) { editing ? await updateSP.mutateAsync({ id: editing.id, data }) : await createSP.mutateAsync(data); setModalOpen(false); }
  if (isLoading) return <LoadingSpinner />;
  const typeOpts = Object.entries(SERVICE_PROVIDER_TYPE_LABELS) as [ServiceProviderType,string][];
  return (
    <>
      <PageHeader title="Service Providers">{writable && <Button onClick={openNew}>+ Add</Button>}</PageHeader>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        <Button variant={!typeFilter?'default':'outline'} size="sm" onClick={()=>setTypeFilter(undefined)}>All</Button>
        {typeOpts.map(([k,l])=><Button key={k} variant={typeFilter===k?'default':'outline'} size="sm" onClick={()=>setTypeFilter(typeFilter===k?undefined:k)}>{l}</Button>)}
      </div>
      <Card><div className="overflow-x-auto"><table className="w-full"><thead><tr>
        {['Name','Type','Contact','Phone/Email','City','Actions'].map(h=><th key={h} className="px-2.5 py-2 text-left text-2xs font-bold uppercase text-muted-foreground border-b-2 border-border bg-gray-50">{h}</th>)}
      </tr></thead><tbody>
        {providers.length===0?<tr><td colSpan={6}><EmptyState message="No service providers yet"/></td></tr>:
        providers.map(sp=><tr key={sp.id} className="hover:bg-gray-50/50">
          <td className="px-2.5 py-2 text-xs font-bold border-b border-border">{sp.name}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{SERVICE_PROVIDER_TYPE_LABELS[sp.service_type]??sp.service_type}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{sp.contact_name||'—'}</td>
          <td className="px-2.5 py-2 text-xs text-muted-foreground border-b border-border">{sp.email||sp.phone||'—'}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{sp.city||'—'}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border"><div className="flex gap-1">
            {writable&&<Button variant="edit" size="xs" onClick={()=>openEdit(sp)}>Edit</Button>}
            {adminRole&&<Button variant="destructive" size="xs" onClick={()=>{if(window.confirm('Remove?'))deleteSP.mutate(sp.id)}}>Del</Button>}
          </div></td></tr>)}
      </tbody></table></div></Card>
      <Dialog open={modalOpen} onOpenChange={setModalOpen}><DialogContent>
        <DialogHeader><DialogTitle>{editing?'Edit Service Provider':'Add Service Provider'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormRow><FormGroup label="Name *" error={errors.name?.message}><Input {...register('name')}/></FormGroup>
          <FormGroup label="Type *"><NativeSelect {...register('service_type')}>{typeOpts.map(([k,l])=><option key={k} value={k}>{l}</option>)}</NativeSelect></FormGroup></FormRow>
          <FormRow><FormGroup label="Contact"><Input {...register('contact_name')}/></FormGroup><FormGroup label="Phone"><Input {...register('phone')}/></FormGroup></FormRow>
          <FormRow><FormGroup label="Email" error={errors.email?.message}><Input type="email" {...register('email')}/></FormGroup>
          <FormGroup label="Country / City"><div className="flex gap-2"><Input {...register('country')} placeholder="Country"/><Input {...register('city')} placeholder="City"/></div></FormGroup></FormRow>
          <FormGroup label="Notes" className="mb-2.5"><Textarea rows={2} {...register('notes')}/></FormGroup>
          <DialogFooter><Button type="button" variant="outline" onClick={()=>setModalOpen(false)}>Cancel</Button><Button type="submit" disabled={createSP.isPending||updateSP.isPending}>Save</Button></DialogFooter>
        </form></DialogContent></Dialog>
    </>);
}

// ═══════════════════════════════════════════════════════════════════════════
// INVOICES LIST PAGE (#2 - documents section)
// ═══════════════════════════════════════════════════════════════════════════
export function InvoicesPage() {
  const { profile } = useAuth();
  const { data: settings } = useSettings();
  const { data: bankAccounts } = useBankAccounts();
  const adminRole = isAdmin(profile?.role);
  const writable = canWrite(profile?.role);
  const { data: invoices = [], isLoading } = useInvoices();
  const deleteInv = useDeleteInvoice();
  const [editInv, setEditInv] = useState<Invoice | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  function openEdit(inv: Invoice) { setEditInv(inv); setEditOpen(true); }
  function handlePrint(inv: Invoice) {
    if (!settings) return;
    const bank = bankAccounts?.find(b => b.is_default) ?? bankAccounts?.[0] ?? null;
    printInvoice(inv, settings, bank);
  }
  if (isLoading) return <LoadingSpinner />;
  return (
    <>
      <PageHeader title="Commercial Invoices" />
      <Card><div className="overflow-x-auto"><table className="w-full"><thead><tr>
        {['Invoice No','File No','Customer','ADMT','Unit Price','Total','Date','Actions'].map(h=>
          <th key={h} className="px-2.5 py-2 text-left text-2xs font-bold uppercase text-muted-foreground border-b-2 border-border bg-gray-50">{h}</th>)}
      </tr></thead><tbody>
        {invoices.length===0?<tr><td colSpan={8}><EmptyState message="No invoices yet"/></td></tr>:
        invoices.map(inv=><tr key={inv.id} className="hover:bg-gray-50/50">
          <td className="px-2.5 py-2 text-xs font-bold border-b border-border">{inv.invoice_no}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{(inv.trade_file as any)?.file_no??'—'}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{(inv.customer as any)?.name??'—'}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{fN(inv.quantity_admt,3)}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{fCurrency(inv.unit_price)}</td>
          <td className="px-2.5 py-2 text-xs font-bold text-brand-500 border-b border-border">{fCurrency(inv.total)}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{fDate(inv.invoice_date)}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border"><div className="flex gap-1">
            {writable&&<Button variant="edit" size="xs" onClick={()=>openEdit(inv)}>Edit</Button>}
            <Button variant="outline" size="xs" onClick={()=>handlePrint(inv)}>🖨 Print</Button>
            {adminRole&&<Button variant="destructive" size="xs" onClick={()=>{if(window.confirm('Delete invoice?'))deleteInv.mutate(inv.id)}}>Del</Button>}
          </div></td></tr>)}
      </tbody></table></div></Card>
      <InvoiceModal open={editOpen} onOpenChange={setEditOpen} file={editInv?.trade_file as TradeFile ?? null} invoice={editInv} />
    </>);
}

// ═══════════════════════════════════════════════════════════════════════════
// PACKING LISTS PAGE (#2)
// ═══════════════════════════════════════════════════════════════════════════
export function PackingListsPage() {
  const { profile } = useAuth();
  const { data: settings } = useSettings();
  const adminRole = isAdmin(profile?.role);
  const writable = canWrite(profile?.role);
  const { data: pls = [], isLoading } = usePackingLists();
  const deletePL = useDeletePackingList();
  const [editPL, setEditPL] = useState<PackingList | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  function openEdit(pl: PackingList) { setEditPL(pl); setEditOpen(true); }
  function handlePrint(pl: PackingList) {
    if (!settings) return;
    printPackingList(pl, settings);
  }
  if (isLoading) return <LoadingSpinner />;
  return (
    <>
      <PageHeader title="Packing Lists" />
      <Card><div className="overflow-x-auto"><table className="w-full"><thead><tr>
        {['PL No','File No','Customer','Vehicles','ADMT','Gross Weight','Actions'].map(h=>
          <th key={h} className="px-2.5 py-2 text-left text-2xs font-bold uppercase text-muted-foreground border-b-2 border-border bg-gray-50">{h}</th>)}
      </tr></thead><tbody>
        {pls.length===0?<tr><td colSpan={7}><EmptyState message="No packing lists yet"/></td></tr>:
        pls.map(pl=><tr key={pl.id} className="hover:bg-gray-50/50">
          <td className="px-2.5 py-2 text-xs font-bold border-b border-border">{pl.packing_list_no}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{(pl.trade_file as any)?.file_no??'—'}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{(pl.customer as any)?.name??'—'}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{pl.packing_list_items?.length??0}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{fN(pl.total_admt,3)}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{fN(pl.total_gross_kg,0)}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border"><div className="flex gap-1">
            {writable&&<Button variant="edit" size="xs" onClick={()=>openEdit(pl)}>Edit</Button>}
            <Button variant="outline" size="xs" onClick={()=>handlePrint(pl)}>🖨 Print</Button>
            {adminRole&&<Button variant="destructive" size="xs" onClick={()=>{if(window.confirm('Delete?'))deletePL.mutate(pl.id)}}>Del</Button>}
          </div></td></tr>)}
      </tbody></table></div></Card>
      <PackingListModal open={editOpen} onOpenChange={setEditOpen} file={editPL?.trade_file as TradeFile ?? null} packingList={editPL} />
    </>);
}

// ═══════════════════════════════════════════════════════════════════════════
// PROFORMAS PAGE (#2 - new section under Documents)
// ═══════════════════════════════════════════════════════════════════════════
export function ProformasPage() {
  const { profile } = useAuth();
  const { data: settings } = useSettings();
  const { data: bankAccounts } = useBankAccounts();
  const adminRole = isAdmin(profile?.role);
  const writable = canWrite(profile?.role);
  const { data: proformas = [], isLoading } = useProformas();
  const deletePI = useDeleteProforma();
  const [editPI, setEditPI] = useState<Proforma | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  function openEdit(pi: Proforma) { setEditPI(pi); setEditOpen(true); }
  function handlePrint(pi: Proforma) {
    if (!settings) return;
    const bank = bankAccounts?.find(b => b.is_default) ?? bankAccounts?.[0] ?? null;
    printProforma(pi, settings, bank, pi.trade_file as TradeFile ?? null);
  }
  if (isLoading) return <LoadingSpinner />;
  return (
    <>
      <PageHeader title="Proforma Invoices" />
      <Card><div className="overflow-x-auto"><table className="w-full"><thead><tr>
        {['PI No','File No','Date','Quantity','Unit Price','Total','Actions'].map(h=>
          <th key={h} className="px-2.5 py-2 text-left text-2xs font-bold uppercase text-muted-foreground border-b-2 border-border bg-gray-50">{h}</th>)}
      </tr></thead><tbody>
        {proformas.length===0?<tr><td colSpan={7}><EmptyState message="No proformas yet"/></td></tr>:
        proformas.map(pi=><tr key={pi.id} className="hover:bg-gray-50/50">
          <td className="px-2.5 py-2 text-xs font-bold border-b border-border">{pi.proforma_no}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{(pi.trade_file as any)?.file_no??'—'}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{fDate(pi.proforma_date)}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{fN(pi.quantity_admt,3)}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border">{fCurrency(pi.unit_price)}</td>
          <td className="px-2.5 py-2 text-xs font-bold text-brand-500 border-b border-border">{fCurrency(pi.total)}</td>
          <td className="px-2.5 py-2 text-xs border-b border-border"><div className="flex gap-1">
            {writable&&<Button variant="edit" size="xs" onClick={()=>openEdit(pi)}>Edit</Button>}
            <Button variant="outline" size="xs" onClick={()=>handlePrint(pi)}>🖨 Print</Button>
            {adminRole&&<Button variant="destructive" size="xs" onClick={()=>{if(window.confirm('Delete proforma?'))deletePI.mutate(pi.id)}}>Del</Button>}
          </div></td></tr>)}
      </tbody></table></div></Card>
      <ProformaModal open={editOpen} onOpenChange={setEditOpen} file={editPI?.trade_file as TradeFile ?? null} proforma={editPI} />
    </>);
}

export { ReportsPage } from './ReportsPage';
