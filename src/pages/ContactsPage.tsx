import { useState, useMemo, useRef, useEffect, type MutableRefObject } from 'react';
import { generateCustomerCode } from '@/lib/generators';
import { supabase } from '@/services/supabase';
import { useTranslation } from 'react-i18next';
import {
  useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer,
  useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier,
  useServiceProviders, useCreateServiceProvider, useUpdateServiceProvider, useDeleteServiceProvider,
} from '@/hooks/useEntities';
import { useAuth } from '@/hooks/useAuth';
import { canWrite, isAdmin } from '@/lib/permissions';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  customerSchema, type CustomerFormData,
  supplierSchema, type SupplierFormData,
  serviceProviderSchema, type ServiceProviderFormData,
} from '@/types/forms';
import type { Customer, Supplier, ServiceProvider } from '@/types/database';
import type { ServiceProviderType } from '@/types/enums';
import { SERVICE_PROVIDER_TYPE_LABELS } from '@/types/enums';
import { Input } from '@/components/ui/input';
import { NativeSelect, Textarea } from '@/components/ui/form-elements';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FormRow, FormGroup } from '@/components/ui/shared';
import { AIFormFill } from '@/components/ui/AIFormFill';
import { Search, Pencil, Trash2, Plus, Globe, Upload, X, Building2, RefreshCw } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { fetchCompanyLogo, batchFetchLogos } from '@/lib/logoFetch';
import { LogoPickerModal } from '@/components/ui/LogoPickerModal';
import { getCompanyContext } from '@/lib/companySearch';
import { customerService } from '@/services/customerService';
import { supplierService } from '@/services/supplierService';
import { serviceProviderService } from '@/services/serviceProviderService';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type Tab = 'customers' | 'suppliers' | 'service-providers';

const TAB_COLORS: Record<Tab, string> = {
  'customers':         '#0ea5e9',
  'suppliers':         '#f59e0b',
  'service-providers': '#10b981',
};

function ContactAvatar({ name, color, logoUrl }: { name: string; color: string; logoUrl?: string | null }) {
  const [imgErr, setImgErr] = useState(false);
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  if (logoUrl && !imgErr) {
    return (
      <div className="w-9 h-9 rounded-xl border border-gray-100 bg-white overflow-hidden shrink-0 flex items-center justify-center">
        <img src={logoUrl} alt={name} className="w-full h-full object-contain p-0.5" onError={() => setImgErr(true)} />
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm" style={{ background: color + '18', color }}>
      {initials || '?'}
    </div>
  );
}

// ─── Logo Field ────────────────────────────────────────────────────────────────
function LogoField({
  value, onChange, companyName, website,
}: {
  value: string | null | undefined;
  onChange: (url: string) => void;
  companyName: string;
  website?: string | null;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = ev => onChange(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function openPicker() {
    if (!companyName.trim()) { toast.error('Önce firma adını girin'); return; }
    setPickerOpen(true);
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-3 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
        <div className="w-12 h-12 rounded-xl border border-gray-200 bg-white overflow-hidden shrink-0 flex items-center justify-center">
          {value
            ? <img src={value} alt="Logo" className="w-full h-full object-contain p-1" onError={() => onChange('')} />
            : <Building2 className="h-5 w-5 text-gray-300" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex gap-1.5 mb-1">
            <button type="button" onClick={openPicker}
              className="flex-1 h-7 rounded-lg text-[11px] font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors flex items-center justify-center gap-1">
              <Globe className="h-3 w-3" />
              İnternetten Bul
            </button>
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex-1 h-7 rounded-lg text-[11px] font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors flex items-center justify-center gap-1">
              <Upload className="h-3 w-3" /> Yükle
            </button>
            {value && (
              <button type="button" onClick={() => onChange('')}
                className="w-7 h-7 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-gray-400">PNG / SVG — birden fazla sonuç arasından seçin</p>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/webp" className="hidden" onChange={handleFile} />
      </div>

      <LogoPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={onChange}
        companyName={companyName}
        website={website}
      />
    </>
  );
}

// ─── Customers Tab ─────────────────────────────────────────────────────────────
function CustomersTab({ accent, search, openNewRef }: { accent: string; search: string; openNewRef: MutableRefObject<(() => void) | null> }) {
  const { t } = useTranslation('contacts');
  const { t: tc } = useTranslation('common');
  const { profile } = useAuth();
  const writable = canWrite(profile?.role);
  const adminRole = isAdmin(profile?.role);
  const { data: customers = [] } = useCustomers();
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const remove = useDeleteCustomer();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const color = TAB_COLORS['customers'];

  const EMPTY: CustomerFormData = {
    name: '', code: '', country: '', city: '', address: '',
    contact_email: '', contact_phone: '',
    tax_id: '', website: '', payment_terms: '', notes: '',
    parent_customer_id: '', logo_url: '',
  };

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: EMPTY,
  });
  const { register, handleSubmit, formState: { errors }, reset, watch, setValue: setVal } = form;

  const parentCustomerId = watch('parent_customer_id');
  const logoUrl = watch('logo_url') ?? '';
  const watchedName = watch('name');
  const watchedWebsite = watch('website');
  // Ana firmalar: parent_customer_id olmayan müşteriler
  const parentCustomers = customers.filter(c => !c.parent_customer_id);

  // Auto-generate code from name when creating (if code still empty)
  const watchedCode = watch('code');
  useEffect(() => {
    if (editing) return;
    if (watchedCode) return;
    if (!watchedName?.trim()) return;
    setVal('code', generateCustomerCode(watchedName));
  }, [watchedName, watchedCode, editing, setVal]);

  // Auto-fetch logo when modal opens and no logo exists
  useEffect(() => {
    if (!modalOpen) return;
    const name = form.getValues('name');
    const logo = form.getValues('logo_url');
    const web  = form.getValues('website');
    if (!name?.trim() || logo) return;
    fetchCompanyLogo(name, web).then(url => { if (url) setVal('logo_url', url); }).catch(() => {});
  }, [modalOpen]); // eslint-disable-line

  // ── Auto AI form fill ──────────────────────────────────────────────────────
  const [autoFilling, setAutoFilling] = useState(false);
  const autoFillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!modalOpen || editing) return;
    const name = watchedName?.trim() ?? '';
    const website = watchedWebsite?.trim() ?? '';
    if (name.length < 3 && !website) return;
    // Skip if key fields are already filled
    const v = form.getValues();
    if (v.country || v.contact_email || v.city || v.address) return;
    if (autoFillTimer.current) clearTimeout(autoFillTimer.current);
    autoFillTimer.current = setTimeout(async () => {
      setAutoFilling(true);
      try {
        // İnternetten gerçek şirket bilgilerini topla, sonra AI'a ver
        const text = await getCompanyContext(name || '', website || undefined);
        const { data, error } = await supabase.functions.invoke('ai-form-fill', {
          body: { text, formType: 'new_customer', context: {} },
        });
        if (!error && data?.fields) {
          const { name: _n, code: _c, logo_url: _l, parent_customer_id: _p, ...rest } = data.fields as Record<string, unknown>;
          const current = form.getValues();
          reset({ ...current, ...(rest as Partial<CustomerFormData>) });
        }
      } catch { /* silent */ } finally { setAutoFilling(false); }
    }, 900);
    return () => { if (autoFillTimer.current) clearTimeout(autoFillTimer.current); };
  }, [watchedName, watchedWebsite]); // eslint-disable-line

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.code?.toLowerCase().includes(q) ||
      c.country?.toLowerCase().includes(q) ||
      c.contact_email?.toLowerCase().includes(q)
    );
  }, [customers, search]);

  function openNew() { setEditing(null); reset(EMPTY); setModalOpen(true); }
  useEffect(() => { openNewRef.current = openNew; });
  function openEdit(c: Customer) {
    setEditing(c);
    reset({
      name: c.name, code: c.code ?? '', country: c.country, city: c.city ?? '', address: c.address,
      contact_email: c.contact_email, contact_phone: c.contact_phone,
      tax_id: c.tax_id ?? '', website: c.website ?? '',
      payment_terms: c.payment_terms ?? '', notes: c.notes,
      parent_customer_id: c.parent_customer_id ?? '',
      logo_url: c.logo_url ?? '',
    });
    setModalOpen(true);
  }
  async function onSubmit(data: CustomerFormData) {
    if (editing) await update.mutateAsync({ id: editing.id, data });
    else await create.mutateAsync(data);
    setModalOpen(false);
  }

  // isLoading guard kaldırıldı — sayfa hemen render edilir, içerik yüklenince görünür

  return (
    <>
      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="py-14 text-center text-sm text-gray-400">{search ? tc('empty.no_results') : t('empty.noCustomers')}</div>
        ) : filtered.map(c => (
          <div key={c.id} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3">
            <ContactAvatar name={c.name} color={color} logoUrl={c.logo_url} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold text-gray-900 truncate">{c.name}</span>
                <span className="text-[10px] font-semibold text-gray-400 shrink-0">{c.code}</span>
              </div>
              {(c.country || c.city) && <div className="text-xs text-gray-500 truncate">{[c.city, c.country].filter(Boolean).join(', ')}</div>}
              {(c.contact_email || c.contact_phone) && <div className="text-xs text-gray-400 truncate">{c.contact_email || c.contact_phone}</div>}
              {c.payment_terms && <div className="text-[10px] text-gray-400 truncate">{tc('form.payment_terms')}: {c.payment_terms}</div>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {writable && (
                <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {adminRole && (
                <button onClick={() => { if (window.confirm(t('confirm.removeCustomer'))) remove.mutate(c.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: '8%' }} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '12%' }} />
          </colgroup>
          <thead>
            <tr className="border-b border-gray-100">
              {[tc('table.code'), tc('table.name'), t('table.countryCity'), t('table.contact'), t('table.paymentTerms'), tc('table.actions')].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="py-14 text-center text-sm text-gray-400">{search ? tc('empty.no_results') : t('empty.noCustomers')}</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                <td className="px-4 py-3 text-xs font-bold text-gray-400">{c.code}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <ContactAvatar name={c.name} color={color} logoUrl={c.logo_url} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {c.parent_customer_id && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 uppercase tracking-wide shrink-0">Alt</span>
                        )}
                        <span className="text-sm font-semibold text-gray-900 truncate">{c.name}</span>
                      </div>
                      {c.parent_customer_id && (
                        <div className="text-[10px] text-gray-400">↳ {customers.find(p => p.id === c.parent_customer_id)?.name ?? ''}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{[c.city, c.country].filter(Boolean).join(', ') || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500 truncate">{c.contact_email || c.contact_phone || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500 truncate">{c.payment_terms || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 flex-nowrap">
                    {writable && (
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {adminRole && (
                      <button onClick={() => { if (window.confirm(t('confirm.removeLabel'))) remove.mutate(c.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editing ? t('modal.editCustomer') : t('modal.newCustomer')}
              {autoFilling && (
                <span className="flex items-center gap-1 text-[11px] font-normal text-blue-500">
                  <span className="inline-block w-3 h-3 border border-blue-300 border-t-blue-500 rounded-full animate-spin" />
                  AI dolduruyor…
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <AIFormFill
              formType="new_customer"
              onFill={(fields) => reset({ ...form.getValues(), ...(fields as Partial<CustomerFormData>) })}
              enrichText={(q) => getCompanyContext(q)}
              placeholder='Firma adı veya websitesi girin — internetten aranır'
            />
            <FormRow>
              <FormGroup label={`${t('form.companyName')} *`} error={errors.name?.message}><Input {...register('name')} /></FormGroup>
              <FormGroup label="Kısa Kod" error={errors.code?.message}>
                <Input
                  {...register('code')}
                  placeholder="ör. ASJ"
                  maxLength={6}
                  onChange={e => { e.target.value = e.target.value.toUpperCase(); register('code').onChange(e); }}
                />
              </FormGroup>
            </FormRow>
            <LogoField value={logoUrl} onChange={url => setVal('logo_url', url)} companyName={watchedName ?? ''} website={watchedWebsite} />
            <FormRow>
              <FormGroup label={t('form.taxId')}><Input {...register('tax_id')} placeholder="e.g. 1234567890" /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label={tc('form.country')}><Input {...register('country')} /></FormGroup>
              <FormGroup label={tc('form.city')}><Input {...register('city')} /></FormGroup>
            </FormRow>
            <FormGroup label={tc('form.address')} className="mb-2.5"><Input {...register('address')} /></FormGroup>
            <FormRow>
              <FormGroup label={tc('form.email')} error={errors.contact_email?.message}><Input type="email" {...register('contact_email')} /></FormGroup>
              <FormGroup label={tc('form.phone')}><Input {...register('contact_phone')} /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label={tc('form.website')}><Input {...register('website')} placeholder="https://" /></FormGroup>
              <FormGroup label={tc('form.payment_terms')}><Input {...register('payment_terms')} placeholder="e.g. Net 30, L/C 90 days" /></FormGroup>
            </FormRow>
            <FormGroup label={tc('form.notes')} className="mb-2.5"><Textarea rows={2} {...register('notes')} /></FormGroup>

            {/* ── Alt Firma ── */}
            <div className="mb-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                Alt Firma (Opsiyonel)
              </label>
              <NativeSelect
                value={parentCustomerId ?? ''}
                onChange={e => setVal('parent_customer_id', e.target.value)}
                className="text-[12px]"
              >
                <option value="">— Bağımsız firma (alt firma değil) —</option>
                {parentCustomers
                  .filter(p => p.id !== editing?.id)
                  .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </NativeSelect>
              {parentCustomerId && (
                <p className="text-[10px] text-violet-600 mt-1.5">
                  Bu firma bir alt şirkettir. Muhasebe ana firmadan yürür; evraklarda alıcı firma olarak seçilebilir.
                </p>
              )}
            </div>

            <DialogFooter>
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 h-9 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">{tc('btn.cancel')}</button>
              <button type="submit" disabled={create.isPending || update.isPending} className="px-4 h-9 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50" style={{ background: accent }}>{tc('btn.save')}</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Suppliers Tab ─────────────────────────────────────────────────────────────
function SuppliersTab({ accent, search, openNewRef }: { accent: string; search: string; openNewRef: MutableRefObject<(() => void) | null> }) {
  const { t } = useTranslation('contacts');
  const { t: tc } = useTranslation('common');
  const { profile } = useAuth();
  const writable = canWrite(profile?.role);
  const adminRole = isAdmin(profile?.role);
  const { data: suppliers = [] } = useSuppliers();
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const remove = useDeleteSupplier();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const color = TAB_COLORS['suppliers'];

  const EMPTY: SupplierFormData = {
    name: '', country: '', city: '', address: '',
    contact_name: '', phone: '', email: '',
    tax_id: '', website: '', payment_terms: '',
    swift_code: '', iban: '', notes: '', logo_url: '',
  };

  const form = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: EMPTY,
  });
  const { register, handleSubmit, formState: { errors }, reset, watch: watchS, setValue: setValS } = form;
  const sLogoUrl = watchS('logo_url') ?? '';
  const sName    = watchS('name');
  const sWebsite = watchS('website');

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter(s =>
      s.name?.toLowerCase().includes(q) ||
      s.code?.toLowerCase().includes(q) ||
      s.country?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q)
    );
  }, [suppliers, search]);

  function openNew() { setEditing(null); reset(EMPTY); setModalOpen(true); }
  useEffect(() => { openNewRef.current = openNew; });

  // Auto-fetch logo on modal open when no logo exists
  useEffect(() => {
    if (!modalOpen) return;
    const n = form.getValues('name'), l = form.getValues('logo_url'), w = form.getValues('website');
    if (!n?.trim() || l) return;
    fetchCompanyLogo(n, w).then(url => { if (url) setValS('logo_url', url); }).catch(() => {});
  }, [modalOpen]); // eslint-disable-line

  // ── Auto AI form fill ──────────────────────────────────────────────────────
  const [sAutoFilling, setSAutoFilling] = useState(false);
  const sAutoFillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!modalOpen || editing) return;
    const name = sName?.trim() ?? '';
    const website = sWebsite?.trim() ?? '';
    if (name.length < 3 && !website) return;
    const v = form.getValues();
    if (v.country || v.email || v.city || v.address) return;
    if (sAutoFillTimer.current) clearTimeout(sAutoFillTimer.current);
    sAutoFillTimer.current = setTimeout(async () => {
      setSAutoFilling(true);
      try {
        const text = await getCompanyContext(name || '', website || undefined);
        const { data, error } = await supabase.functions.invoke('ai-form-fill', {
          body: { text, formType: 'new_supplier', context: {} },
        });
        if (!error && data?.fields) {
          const { name: _n, logo_url: _l, ...rest } = data.fields as Record<string, unknown>;
          const current = form.getValues();
          reset({ ...current, ...(rest as Partial<SupplierFormData>) });
        }
      } catch { /* silent */ } finally { setSAutoFilling(false); }
    }, 900);
    return () => { if (sAutoFillTimer.current) clearTimeout(sAutoFillTimer.current); };
  }, [sName, sWebsite]); // eslint-disable-line

  function openEdit(s: Supplier) {
    setEditing(s);
    reset({
      name: s.name, country: s.country, city: s.city, address: s.address ?? '',
      contact_name: s.contact_name, phone: s.phone, email: s.email,
      tax_id: s.tax_id ?? '', website: s.website ?? '',
      payment_terms: s.payment_terms ?? '',
      swift_code: s.swift_code ?? '', iban: s.iban ?? '', notes: s.notes,
      logo_url: s.logo_url ?? '',
    });
    setModalOpen(true);
  }
  async function onSubmit(data: SupplierFormData) {
    if (editing) await update.mutateAsync({ id: editing.id, data });
    else await create.mutateAsync(data);
    setModalOpen(false);
  }

  // isLoading guard kaldırıldı — sayfa hemen render edilir, içerik yüklenince görünür

  return (
    <>
      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="py-14 text-center text-sm text-gray-400">{search ? tc('empty.no_results') : t('empty.noSuppliers')}</div>
        ) : filtered.map(s => (
          <div key={s.id} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3">
            <ContactAvatar name={s.name} color={color} logoUrl={s.logo_url} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold text-gray-900 truncate">{s.name}</span>
                <span className="text-[10px] font-semibold text-gray-400 shrink-0">{s.code}</span>
              </div>
              {(s.country || s.city) && <div className="text-xs text-gray-500 truncate">{[s.city, s.country].filter(Boolean).join(', ')}</div>}
              {(s.email || s.phone) && <div className="text-xs text-gray-400 truncate">{s.email || s.phone}</div>}
              {s.payment_terms && <div className="text-[10px] text-gray-400 truncate">{tc('form.payment_terms')}: {s.payment_terms}</div>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {writable && (
                <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {adminRole && (
                <button onClick={() => { if (window.confirm(t('confirm.removeSupplier'))) remove.mutate(s.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: '8%' }} />
            <col style={{ width: '24%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '18%' }} />
          </colgroup>
          <thead>
            <tr className="border-b border-gray-100">
              {[tc('table.code'), tc('table.name'), t('table.countryCity'), t('table.contact'), t('table.emailPhone'), tc('table.actions')].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="py-14 text-center text-sm text-gray-400">{search ? tc('empty.no_results') : t('empty.noSuppliers')}</td></tr>
            ) : filtered.map(s => (
              <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                <td className="px-4 py-3 text-xs font-bold text-gray-400">{s.code}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <ContactAvatar name={s.name} color={color} logoUrl={s.logo_url} />
                    <span className="text-sm font-semibold text-gray-900 truncate">{s.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{[s.city, s.country].filter(Boolean).join(', ') || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500 truncate">{s.contact_name || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500 truncate">{s.email || s.phone || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 flex-nowrap">
                    {writable && (
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {adminRole && (
                      <button onClick={() => { if (window.confirm(t('confirm.removeLabel'))) remove.mutate(s.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editing ? t('modal.editSupplier') : t('modal.newSupplier')}
              {sAutoFilling && (
                <span className="flex items-center gap-1 text-[11px] font-normal text-blue-500">
                  <span className="inline-block w-3 h-3 border border-blue-300 border-t-blue-500 rounded-full animate-spin" />
                  AI dolduruyor…
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <AIFormFill
              formType="new_supplier"
              onFill={(fields) => reset({ ...form.getValues(), ...(fields as Partial<SupplierFormData>) })}
              enrichText={(q) => getCompanyContext(q)}
              placeholder='Firma adı veya websitesi girin — internetten aranır'
            />
            <FormRow>
              <FormGroup label={`${t('form.companyName')} *`} error={errors.name?.message}><Input {...register('name')} /></FormGroup>
              <FormGroup label={t('form.taxId')}><Input {...register('tax_id')} placeholder="e.g. 123456789" /></FormGroup>
            </FormRow>
            <LogoField value={sLogoUrl} onChange={url => setValS('logo_url', url)} companyName={sName ?? ''} website={sWebsite} />
            <FormRow>
              <FormGroup label={tc('form.country')}><Input {...register('country')} /></FormGroup>
              <FormGroup label={tc('form.city')}><Input {...register('city')} /></FormGroup>
            </FormRow>
            <FormGroup label={tc('form.address')} className="mb-2.5"><Input {...register('address')} /></FormGroup>
            <FormRow>
              <FormGroup label={t('form.contactPerson')}><Input {...register('contact_name')} /></FormGroup>
              <FormGroup label={tc('form.phone')}><Input {...register('phone')} /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label={tc('form.email')} error={errors.email?.message}><Input type="email" {...register('email')} /></FormGroup>
              <FormGroup label={tc('form.website')}><Input {...register('website')} placeholder="https://" /></FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label={tc('form.payment_terms')}><Input {...register('payment_terms')} placeholder="e.g. TT 30 days, Net 60" /></FormGroup>
              <FormGroup label={t('form.swiftBic')}><Input {...register('swift_code')} placeholder="e.g. AAAABBCCXXX" /></FormGroup>
            </FormRow>
            <FormGroup label={t('form.iban')} className="mb-2.5"><Input {...register('iban')} placeholder="e.g. TR00 0000 0000 0000 0000 0000 00" /></FormGroup>
            <FormGroup label={tc('form.notes')} className="mb-2.5"><Textarea rows={2} {...register('notes')} /></FormGroup>
            <DialogFooter>
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 h-9 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">{tc('btn.cancel')}</button>
              <button type="submit" disabled={create.isPending || update.isPending} className="px-4 h-9 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50" style={{ background: accent }}>{tc('btn.save')}</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Service Providers Tab ─────────────────────────────────────────────────────
function ServiceProvidersTab({ accent, search, openNewRef }: { accent: string; search: string; openNewRef: MutableRefObject<(() => void) | null> }) {
  const { t } = useTranslation('contacts');
  const { t: tc } = useTranslation('common');
  const { profile } = useAuth();
  const writable = canWrite(profile?.role);
  const adminRole = isAdmin(profile?.role);
  const [typeFilter, setTypeFilter] = useState<ServiceProviderType | undefined>(undefined);
  const { data: providers = [] } = useServiceProviders(typeFilter);
  const create = useCreateServiceProvider();
  const update = useUpdateServiceProvider();
  const remove = useDeleteServiceProvider();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceProvider | null>(null);
  const color = TAB_COLORS['service-providers'];

  const typeOpts = Object.entries(SERVICE_PROVIDER_TYPE_LABELS) as [ServiceProviderType, string][];

  const form = useForm<ServiceProviderFormData>({
    resolver: zodResolver(serviceProviderSchema),
    defaultValues: { name: '', service_type: 'other', country: '', city: '', address: '', contact_name: '', phone: '', email: '', notes: '', logo_url: '' },
  });
  const { register, handleSubmit, formState: { errors }, reset, watch: watchSP, setValue: setValSP } = form;
  const spLogoUrl = watchSP('logo_url') ?? '';
  const spName    = watchSP('name');

  const filtered = useMemo(() => {
    if (!search.trim()) return providers;
    const q = search.toLowerCase();
    return providers.filter(sp =>
      sp.name?.toLowerCase().includes(q) ||
      sp.country?.toLowerCase().includes(q) ||
      sp.email?.toLowerCase().includes(q) ||
      sp.contact_name?.toLowerCase().includes(q)
    );
  }, [providers, search]);

  function openNew() {
    setEditing(null);
    reset({ name: '', service_type: 'other', country: '', city: '', address: '', contact_name: '', phone: '', email: '', notes: '', logo_url: '' });
    setModalOpen(true);
  }
  useEffect(() => { openNewRef.current = openNew; });

  // Auto-fetch logo on modal open when no logo exists
  useEffect(() => {
    if (!modalOpen) return;
    const n = form.getValues('name'), l = form.getValues('logo_url');
    if (!n?.trim() || l) return;
    fetchCompanyLogo(n).then(url => { if (url) setValSP('logo_url', url); }).catch(() => {});
  }, [modalOpen]); // eslint-disable-line

  // ── Auto AI form fill ──────────────────────────────────────────────────────
  const [spAutoFilling, setSpAutoFilling] = useState(false);
  const spAutoFillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!modalOpen || editing) return;
    const name = spName?.trim() ?? '';
    if (name.length < 3) return;
    const v = form.getValues();
    if (v.country || v.email || v.city || v.address) return;
    if (spAutoFillTimer.current) clearTimeout(spAutoFillTimer.current);
    spAutoFillTimer.current = setTimeout(async () => {
      setSpAutoFilling(true);
      try {
        const text = await getCompanyContext(name);
        const { data, error } = await supabase.functions.invoke('ai-form-fill', {
          body: { text, formType: 'new_service_provider', context: {} },
        });
        if (!error && data?.fields) {
          const { name: _n, logo_url: _l, service_type: _st, ...rest } = data.fields as Record<string, unknown>;
          const current = form.getValues();
          reset({ ...current, ...(rest as Partial<ServiceProviderFormData>) });
        }
      } catch { /* silent */ } finally { setSpAutoFilling(false); }
    }, 900);
    return () => { if (spAutoFillTimer.current) clearTimeout(spAutoFillTimer.current); };
  }, [spName]); // eslint-disable-line

  function openEdit(sp: ServiceProvider) {
    setEditing(sp);
    reset({ name: sp.name, service_type: sp.service_type, country: sp.country, city: sp.city, address: sp.address ?? '', contact_name: sp.contact_name, phone: sp.phone, email: sp.email, notes: sp.notes, logo_url: sp.logo_url ?? '' });
    setModalOpen(true);
  }
  async function onSubmit(data: ServiceProviderFormData) {
    if (editing) await update.mutateAsync({ id: editing.id, data });
    else await create.mutateAsync(data);
    setModalOpen(false);
  }

  // isLoading guard kaldırıldı — sayfa hemen render edilir, içerik yüklenince görünür

  return (
    <>
      {/* Type filter pills */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit mb-4 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setTypeFilter(undefined)}
          className={`shrink-0 px-3 h-6 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
            !typeFilter ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {tc('all')}
        </button>
        {typeOpts.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTypeFilter(typeFilter === k ? undefined : k)}
            className={`shrink-0 px-3 h-6 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
              typeFilter === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="py-14 text-center text-sm text-gray-400">{search ? tc('empty.no_results') : t('empty.noServiceProviders')}</div>
        ) : filtered.map(sp => (
          <div key={sp.id} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3">
            <ContactAvatar name={sp.name} color={color} logoUrl={sp.logo_url} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold text-gray-900 truncate">{sp.name}</span>
                <span className="text-[10px] font-semibold shrink-0 px-1.5 py-0.5 rounded-full" style={{ background: color + '18', color }}>
                  {SERVICE_PROVIDER_TYPE_LABELS[sp.service_type] ?? sp.service_type}
                </span>
              </div>
              {(sp.country || sp.city) && <div className="text-xs text-gray-500 truncate">{[sp.city, sp.country].filter(Boolean).join(', ')}</div>}
              {(sp.email || sp.phone) && <div className="text-xs text-gray-400 truncate">{sp.email || sp.phone}</div>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {writable && (
                <button onClick={() => openEdit(sp)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {adminRole && (
                <button onClick={() => { if (window.confirm(t('confirm.removeServiceProvider'))) remove.mutate(sp.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: '24%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '12%' }} />
          </colgroup>
          <thead>
            <tr className="border-b border-gray-100">
              {[tc('table.name'), tc('table.type'), t('table.countryCity'), t('table.contact'), t('table.phoneEmail'), tc('table.actions')].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="py-14 text-center text-sm text-gray-400">{search ? tc('empty.no_results') : t('empty.noServiceProviders')}</td></tr>
            ) : filtered.map(sp => (
              <tr key={sp.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <ContactAvatar name={sp.name} color={color} logoUrl={sp.logo_url} />
                    <span className="text-sm font-semibold text-gray-900 truncate">{sp.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: color + '18', color }}>
                    {SERVICE_PROVIDER_TYPE_LABELS[sp.service_type] ?? sp.service_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{[sp.city, sp.country].filter(Boolean).join(', ') || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500 truncate">{sp.contact_name || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500 truncate">{sp.email || sp.phone || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 flex-nowrap">
                    {writable && (
                      <button onClick={() => openEdit(sp)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {adminRole && (
                      <button onClick={() => { if (window.confirm(t('confirm.removeLabel'))) remove.mutate(sp.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editing ? t('modal.editServiceProvider') : t('modal.newServiceProvider')}
              {spAutoFilling && (
                <span className="flex items-center gap-1 text-[11px] font-normal text-blue-500">
                  <span className="inline-block w-3 h-3 border border-blue-300 border-t-blue-500 rounded-full animate-spin" />
                  AI dolduruyor…
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <AIFormFill
              formType="new_service_provider"
              onFill={(fields) => reset({ ...form.getValues(), ...(fields as Partial<ServiceProviderFormData>) })}
              enrichText={(q) => getCompanyContext(q)}
              placeholder='Firma adı veya websitesi girin — internetten aranır'
            />
            <FormRow>
              <FormGroup label={`${tc('table.name')} *`} error={errors.name?.message}><Input {...register('name')} /></FormGroup>
              <FormGroup label={`${t('form.serviceType')} *`}>
                <NativeSelect {...register('service_type')}>
                  {typeOpts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </NativeSelect>
              </FormGroup>
            </FormRow>
            <LogoField value={spLogoUrl} onChange={url => setValSP('logo_url', url)} companyName={spName ?? ''} />
            <FormRow>
              <FormGroup label={tc('form.country')}><Input {...register('country')} /></FormGroup>
              <FormGroup label={tc('form.city')}><Input {...register('city')} /></FormGroup>
            </FormRow>
            <FormGroup label={tc('form.address')} className="mb-2.5"><Input {...register('address')} /></FormGroup>
            <FormRow>
              <FormGroup label={t('form.contactPerson')}><Input {...register('contact_name')} /></FormGroup>
              <FormGroup label={tc('form.phone')}><Input {...register('phone')} /></FormGroup>
            </FormRow>
            <FormGroup label={tc('form.email')} className="mb-2.5" error={errors.email?.message}><Input type="email" {...register('email')} /></FormGroup>
            <FormGroup label={tc('form.notes')} className="mb-2.5"><Textarea rows={2} {...register('notes')} /></FormGroup>
            <DialogFooter>
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 h-9 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">{tc('btn.cancel')}</button>
              <button type="submit" disabled={create.isPending || update.isPending} className="px-4 h-9 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50" style={{ background: accent }}>{tc('btn.save')}</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export function ContactsPage() {
  const { t } = useTranslation('contacts');
  const { t: tc } = useTranslation('common');
  const [activeTab, setActiveTab] = useState<Tab>('customers');
  const [search, setSearch] = useState('');
  const [batchRunning, setBatchRunning] = useState(false);
  const openNewRef = useRef<(() => void) | null>(null);
  const { accent } = useTheme();
  const { profile } = useAuth();
  const writable = canWrite(profile?.role);
  const qc = useQueryClient();

  const { data: allCustomers = [] }  = useCustomers();
  const { data: allSuppliers = [] }  = useSuppliers();
  const { data: allProviders = [] }  = useServiceProviders();

  async function handleBatchFetch() {
    setBatchRunning(true);
    toast.info('Logolar aranıyor, lütfen bekleyin…');
    try {
      const c = await batchFetchLogos(allCustomers,        (id, url) => customerService.patchLogo(id, url));
      const s = await batchFetchLogos(allSuppliers,        (id, url) => supplierService.patchLogo(id, url));
      const p = await batchFetchLogos(allProviders as (typeof allProviders[0] & { website?: string | null })[],
                                       (id, url) => serviceProviderService.patchLogo(id, url));
      const total = c + s + p;
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['service_providers'] });
      if (total > 0) toast.success(`${total} logo başarıyla çekildi!`);
      else toast.info('Yeni logo bulunamadı');
    } catch {
      toast.error('Toplu logo çekme sırasında hata oluştu');
    } finally {
      setBatchRunning(false);
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'customers',         label: t('tabs.customers') },
    { key: 'suppliers',         label: t('tabs.suppliers') },
    { key: 'service-providers', label: t('tabs.serviceProviders') },
  ];

  function handleTabChange(key: Tab) { setActiveTab(key); setSearch(''); }

  return (
    <div className="-mx-4 md:mx-0">
      {/* Header row: tabs + search + new */}
      <div className="px-4 md:px-0 mb-4 flex items-center gap-2">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto scrollbar-none shrink-0">
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`shrink-0 px-4 h-8 rounded-xl text-[12px] font-semibold transition-all whitespace-nowrap ${
                  isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <div className="relative w-40 shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`${tc('btn.search')}…`}
            className="w-full pl-8 pr-2 h-8 rounded-xl border border-gray-200 bg-white text-[12px] text-gray-800 placeholder:text-gray-400 outline-none focus:border-blue-300 transition"
          />
        </div>
        <button
          onClick={handleBatchFetch}
          disabled={batchRunning}
          title="Logo olmayan tüm firmalar için internetten logo çek"
          className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-blue-600 transition-colors disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${batchRunning ? 'animate-spin' : ''}`} />
        </button>
        {writable && (
          <button
            onClick={() => openNewRef.current?.()}
            className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm shrink-0"
            style={{ background: accent }}
          >
            <Plus className="h-3.5 w-3.5 text-white" />
          </button>
        )}
      </div>

      {/* Tab content */}
      <div className="px-4 md:px-0">
        {activeTab === 'customers' && <CustomersTab accent={accent} search={search} openNewRef={openNewRef} />}
        {activeTab === 'suppliers' && <SuppliersTab accent={accent} search={search} openNewRef={openNewRef} />}
        {activeTab === 'service-providers' && <ServiceProvidersTab accent={accent} search={search} openNewRef={openNewRef} />}
      </div>
    </div>
  );
}
