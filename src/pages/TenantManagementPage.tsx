import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Building2, Plus, Search, Upload, Pencil, ToggleLeft, ToggleRight,
  ArrowLeft, Globe, Mail, Phone, Hash, Image, X, ExternalLink,
  Loader2, Eye,
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  useTenants, useCreateTenant, useUpdateTenant, useSetTenantActive,
  useUploadTenantLogo, useUploadTenantLoginBg, useUploadTenantFavicon,
} from '@/hooks/useTenants';
import type { Tenant } from '@/types/database';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

// ─── Form schema ────────────────────────────────────────────────────────────

const tenantFormSchema = z.object({
  name:           z.string().min(1, 'Firma adı zorunlu'),
  tax_id:         z.string().default(''),
  address:        z.string().default(''),
  phone:          z.string().default(''),
  email:          z.string().email('Geçerli e-posta giriniz').or(z.literal('')).default(''),
  primary_color:  z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Geçerli hex renk (#rrggbb)').default('#dc2626'),
  custom_domain:  z.string().default(''),
  logo_url:       z.string().default(''),
  login_bg_url:   z.string().default(''),
  favicon_url:    z.string().default(''),
});
type TenantFormData = z.infer<typeof tenantFormSchema>;

// ─── Color presets ──────────────────────────────────────────────────────────

const COLOR_PRESETS = [
  '#dc2626', '#ea580c', '#d97706', '#16a34a', '#0891b2',
  '#2563eb', '#7c3aed', '#db2777', '#374151', '#0f172a',
];

// ─── Tenant Form Modal ──────────────────────────────────────────────────────

interface TenantFormModalProps {
  tenant?: Tenant | null;
  onClose: () => void;
}

function TenantFormModal({ tenant, onClose }: TenantFormModalProps) {
  const isEdit = !!tenant;
  const createTenant = useCreateTenant();
  const updateTenant = useUpdateTenant();

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } =
    useForm<TenantFormData>({
      resolver: zodResolver(tenantFormSchema),
      defaultValues: {
        name:          tenant?.name          ?? '',
        tax_id:        tenant?.tax_id        ?? '',
        address:       tenant?.address       ?? '',
        phone:         tenant?.phone         ?? '',
        email:         tenant?.email         ?? '',
        primary_color: tenant?.primary_color ?? '#dc2626',
        custom_domain: tenant?.custom_domain ?? '',
        logo_url:      tenant?.logo_url      ?? '',
        login_bg_url:  tenant?.login_bg_url  ?? '',
        favicon_url:   tenant?.favicon_url   ?? '',
      },
    });

  const primaryColor = watch('primary_color');

  async function onSubmit(data: TenantFormData) {
    if (isEdit && tenant) {
      await updateTenant.mutateAsync({ id: tenant.id, data });
    } else {
      await createTenant.mutateAsync(data);
    }
    onClose();
  }

  const Field = ({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) => (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
      {error && <p className="text-[10px] text-red-500 mt-1">{error}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: primaryColor }}>
              <Building2 className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-[15px] font-extrabold text-gray-900">
              {isEdit ? 'Firma Düzenle' : 'Yeni Firma Ekle'}
            </h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          {/* Temel bilgiler */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Temel Bilgiler</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Firma Adı *" error={errors.name?.message}>
                  <Input {...register('name')} placeholder="Örn: ABC Ticaret A.Ş." />
                </Field>
              </div>
              <Field label="Vergi No" error={errors.tax_id?.message}>
                <Input {...register('tax_id')} placeholder="1234567890" />
              </Field>
              <Field label="E-posta" error={errors.email?.message}>
                <Input {...register('email')} type="email" placeholder="info@firma.com" />
              </Field>
              <Field label="Telefon">
                <Input {...register('phone')} placeholder="+90 555 000 0000" />
              </Field>
              <Field label="Özel Domain">
                <Input {...register('custom_domain')} placeholder="firma.com" />
              </Field>
              <div className="col-span-2">
                <Field label="Adres">
                  <Input {...register('address')} placeholder="Şehir, İlçe..." />
                </Field>
              </div>
            </div>
          </div>

          {/* Görsel özelleştirme */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Görsel Özelleştirme</p>
            <div className="space-y-3">
              {/* Tema rengi */}
              <Field label="Tema Rengi (Primary Color)" error={errors.primary_color?.message}>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={e => setValue('primary_color', e.target.value)}
                    className="w-10 h-10 rounded-xl cursor-pointer border-2 border-gray-200"
                  />
                  <Input {...register('primary_color')} className="flex-1" placeholder="#dc2626" />
                </div>
                {/* Presets */}
                <div className="flex gap-2 mt-2 flex-wrap">
                  {COLOR_PRESETS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setValue('primary_color', c)}
                      className={cn(
                        'w-6 h-6 rounded-lg border-2 transition-all',
                        primaryColor === c ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105',
                      )}
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                </div>
              </Field>

              {/* URL alanları — yükleme butonları edit modda tenant id'si gerektirir */}
              <Field label="Logo URL">
                <Input {...register('logo_url')} placeholder="https://..." />
              </Field>
              <Field label="Login Arka Plan URL">
                <Input {...register('login_bg_url')} placeholder="https://..." />
              </Field>
              <Field label="Favicon URL">
                <Input {...register('favicon_url')} placeholder="https://..." />
              </Field>
              {!isEdit && (
                <p className="text-[10px] text-gray-400 bg-gray-50 rounded-xl px-3 py-2">
                  💡 Firma oluşturulduktan sonra logo, arka plan ve favicon dosyalarını yükleyebilirsiniz.
                </p>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-xl text-[13px] font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-9 px-5 rounded-xl text-white text-[13px] font-semibold shadow-sm hover:opacity-90 disabled:opacity-60 transition-opacity flex items-center gap-2"
              style={{ background: primaryColor || '#dc2626' }}
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? 'Kaydet' : 'Firma Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Asset Upload Panel ─────────────────────────────────────────────────────

interface AssetPanelProps {
  tenant: Tenant;
}

function AssetPanel({ tenant }: AssetPanelProps) {
  const uploadLogo    = useUploadTenantLogo();
  const uploadLoginBg = useUploadTenantLoginBg();
  const uploadFavicon = useUploadTenantFavicon();
  const updateTenant  = useUpdateTenant();

  const logoRef    = useRef<HTMLInputElement>(null);
  const bgRef      = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (
    file: File,
    type: 'logo' | 'login_bg' | 'favicon',
  ) => {
    try {
      let url = '';
      if (type === 'logo')     url = await uploadLogo.mutateAsync({ tenantId: tenant.id, file });
      if (type === 'login_bg') url = await uploadLoginBg.mutateAsync({ tenantId: tenant.id, file });
      if (type === 'favicon')  url = await uploadFavicon.mutateAsync({ tenantId: tenant.id, file });

      // URL'yi DB'ye kaydet
      await updateTenant.mutateAsync({
        id: tenant.id,
        data: {
          logo_url:     type === 'logo'     ? url : tenant.logo_url,
          login_bg_url: type === 'login_bg' ? url : tenant.login_bg_url,
          favicon_url:  type === 'favicon'  ? url : tenant.favicon_url,
        },
      });
    } catch {
      // hook kendi toast'ını gösterir
    }
  };

  const AssetRow = ({
    label, url, inputRef, type, accept,
  }: {
    label: string;
    url: string;
    inputRef: React.RefObject<HTMLInputElement>;
    type: 'logo' | 'login_bg' | 'favicon';
    accept: string;
  }) => (
    <div className="flex items-center gap-3 py-2.5 border-b border-dashed border-gray-100 last:border-0">
      <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden shrink-0">
        {url
          ? <img src={url} alt={label} className="w-full h-full object-contain" />
          : <Image className="h-4 w-4 text-gray-300" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-gray-700">{label}</p>
        {url
          ? <p className="text-[10px] text-gray-400 truncate">{url.split('/').pop()}</p>
          : <p className="text-[10px] text-gray-400">Yüklenmedi</p>
        }
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f, type);
          e.target.value = '';
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="h-7 px-3 rounded-lg bg-gray-100 text-[11px] font-semibold text-gray-600 hover:bg-gray-200 transition-colors flex items-center gap-1.5"
      >
        <Upload className="h-3 w-3" />
        {url ? 'Değiştir' : 'Yükle'}
      </button>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/60">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Görseller</span>
      </div>
      <div className="px-5 py-1">
        <AssetRow label="Logo" url={tenant.logo_url ?? ''} inputRef={logoRef} type="logo" accept="image/*" />
        <AssetRow label="Login Arka Planı" url={tenant.login_bg_url ?? ''} inputRef={bgRef} type="login_bg" accept="image/*" />
        <AssetRow label="Favicon" url={tenant.favicon_url ?? ''} inputRef={faviconRef} type="favicon" accept="image/png,image/ico,image/svg+xml" />
      </div>
    </div>
  );
}

// ─── Tenant Row ──────────────────────────────────────────────────────────────

interface TenantRowProps {
  tenant: Tenant;
  onEdit: (t: Tenant) => void;
  onSelect: (t: Tenant) => void;
  isSelected: boolean;
}

function TenantRow({ tenant, onEdit, onSelect, isSelected }: TenantRowProps) {
  const setActive = useSetTenantActive();

  return (
    <tr
      className={cn(
        'border-b border-gray-50 transition-colors cursor-pointer',
        isSelected ? 'bg-amber-50/60' : 'hover:bg-gray-50/60',
      )}
      onClick={() => onSelect(tenant)}
    >
      {/* Renk + Logo */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {tenant.logo_url ? (
            <img src={tenant.logo_url} alt={tenant.name} className="w-8 h-8 rounded-xl object-contain bg-gray-50 border border-gray-100" />
          ) : (
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[12px] font-black shrink-0"
              style={{ background: tenant.primary_color || '#dc2626' }}
            >
              {tenant.name.charAt(0)}
            </div>
          )}
          <div>
            <p className="text-[13px] font-semibold text-gray-900">{tenant.name}</p>
            {tenant.email && <p className="text-[11px] text-gray-400">{tenant.email}</p>}
          </div>
        </div>
      </td>
      {/* Vergi no */}
      <td className="px-4 py-3 text-[12px] text-gray-500 font-mono">{tenant.tax_id || '—'}</td>
      {/* Domain */}
      <td className="px-4 py-3 text-[12px] text-gray-500">{tenant.custom_domain || '—'}</td>
      {/* Renk */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full border border-gray-200" style={{ background: tenant.primary_color || '#dc2626' }} />
          <span className="text-[11px] font-mono text-gray-400">{tenant.primary_color || '#dc2626'}</span>
        </div>
      </td>
      {/* Durum */}
      <td className="px-4 py-3">
        <button
          onClick={e => {
            e.stopPropagation();
            setActive.mutate({ id: tenant.id, is_active: !tenant.is_active });
          }}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors',
            tenant.is_active
              ? 'bg-green-50 text-green-700 hover:bg-green-100'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
          )}
        >
          {tenant.is_active
            ? <><ToggleRight className="h-3 w-3" /> Aktif</>
            : <><ToggleLeft className="h-3 w-3" /> Pasif</>
          }
        </button>
      </td>
      {/* Aksiyonlar */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onEdit(tenant)}
            className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
            title="Düzenle"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={() => window.open(`/view-as?tenant=${tenant.id}`, '_blank')}
            className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 hover:bg-amber-100 transition-colors"
            title="Firma panelini yeni sekmede görüntüle (Impersonation)"
          >
            <Eye className="h-3 w-3" />
          </button>
          <button
            onClick={() => window.open(`/login?tenant=${tenant.id}`, '_blank')}
            className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500 hover:bg-blue-100 transition-colors"
            title="Login sayfasını önizle"
          >
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function TenantManagementPage() {
  const navigate = useNavigate();
  const { accent } = useTheme();
  const { data: tenants = [], isLoading } = useTenants();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  const filtered = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (t.tax_id ?? '').includes(search),
  );

  function openCreate() {
    setEditingTenant(null);
    setShowModal(true);
  }

  function openEdit(t: Tenant) {
    setEditingTenant(t);
    setShowModal(true);
  }

  return (
    <>
      {/* Page */}
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-8 h-8 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 shadow-sm transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight">Firma Yönetimi</h1>
              <p className="text-[12px] text-gray-400">{tenants.length} firma kayıtlı</p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="h-9 px-4 rounded-xl text-white text-[13px] font-semibold shadow-sm hover:opacity-90 transition-opacity flex items-center gap-2"
            style={{ background: accent }}
          >
            <Plus className="h-4 w-4" />
            Firma Ekle
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-white rounded-xl px-3 h-9 shadow-sm border border-gray-100 max-w-sm">
          <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Firma ara..."
            className="flex-1 text-[13px] outline-none bg-transparent placeholder:text-gray-400"
          />
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
          {/* Table */}
          <div className={cn('xl:col-span-2', selectedTenant ? 'xl:col-span-2' : 'xl:col-span-3')}>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Building2 className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm font-medium text-gray-500">
                    {search ? 'Arama sonucu bulunamadı' : 'Henüz firma eklenmedi'}
                  </p>
                  {!search && (
                    <button
                      onClick={openCreate}
                      className="mt-3 text-[12px] font-semibold hover:underline"
                      style={{ color: accent }}
                    >
                      İlk firmayı ekle →
                    </button>
                  )}
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Firma</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Vergi No</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Domain</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Renk</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Durum</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(t => (
                      <TenantRow
                        key={t.id}
                        tenant={t}
                        onEdit={openEdit}
                        onSelect={t2 => setSelectedTenant(prev => prev?.id === t2.id ? null : t2)}
                        isSelected={selectedTenant?.id === t.id}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Side panel: asset uploads for selected tenant */}
          {selectedTenant && (
            <div className="xl:col-span-1 space-y-4">
              {/* Header */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-[11px] font-black"
                      style={{ background: selectedTenant.primary_color || '#dc2626' }}
                    >
                      {selectedTenant.name.charAt(0)}
                    </div>
                    <span className="text-[13px] font-bold text-gray-800 truncate max-w-[140px]">{selectedTenant.name}</span>
                  </div>
                  <button
                    onClick={() => setSelectedTenant(null)}
                    className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                  >
                    <X className="h-3 w-3 text-gray-400" />
                  </button>
                </div>
                <div className="px-5 py-3 space-y-1.5">
                  {selectedTenant.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3 w-3 text-gray-400" />
                      <span className="text-[12px] text-gray-600">{selectedTenant.email}</span>
                    </div>
                  )}
                  {selectedTenant.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3 w-3 text-gray-400" />
                      <span className="text-[12px] text-gray-600">{selectedTenant.phone}</span>
                    </div>
                  )}
                  {selectedTenant.custom_domain && (
                    <div className="flex items-center gap-2">
                      <Globe className="h-3 w-3 text-gray-400" />
                      <span className="text-[12px] text-gray-600">{selectedTenant.custom_domain}</span>
                    </div>
                  )}
                  {selectedTenant.tax_id && (
                    <div className="flex items-center gap-2">
                      <Hash className="h-3 w-3 text-gray-400" />
                      <span className="text-[12px] text-gray-600">{selectedTenant.tax_id}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Asset uploads */}
              <AssetPanel tenant={selectedTenant} />

              {/* Actions */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/60">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">İşlemler</span>
                </div>
                <div className="divide-y divide-gray-50">
                  <button
                    onClick={() => openEdit(selectedTenant)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group text-left"
                  >
                    <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-red-50 transition-colors">
                      <Pencil className="h-3.5 w-3.5 text-gray-500 group-hover:text-red-600" />
                    </div>
                    <span className="text-[13px] font-semibold text-gray-800">Bilgileri Düzenle</span>
                  </button>
                  <button
                    onClick={() => window.open(`/login?tenant=${selectedTenant.id}`, '_blank')}
                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group text-left"
                  >
                    <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-blue-50 transition-colors">
                      <ExternalLink className="h-3.5 w-3.5 text-gray-500 group-hover:text-blue-600" />
                    </div>
                    <div>
                      <span className="text-[13px] font-semibold text-gray-800">Login Önizle</span>
                      <p className="text-[10px] text-gray-400">Firma login sayfasını yeni sekmede aç</p>
                    </div>
                  </button>
                  {selectedTenant.custom_domain && (
                    <button
                      onClick={() => window.open(`https://${selectedTenant.custom_domain}`, '_blank')}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group text-left"
                    >
                      <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-green-50 transition-colors">
                        <Globe className="h-3.5 w-3.5 text-gray-500 group-hover:text-green-600" />
                      </div>
                      <div>
                        <span className="text-[13px] font-semibold text-gray-800">Domain'e Git</span>
                        <p className="text-[10px] text-gray-400">{selectedTenant.custom_domain}</p>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <TenantFormModal
          tenant={editingTenant}
          onClose={() => { setShowModal(false); setEditingTenant(null); }}
        />
      )}
    </>
  );
}
