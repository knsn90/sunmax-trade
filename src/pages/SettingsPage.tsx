import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { companySettingsSchema, type CompanySettingsFormData } from '@/types/forms';
import { useSettings, useUpdateSettings, useUploadLogo, useRemoveLogo, useBankAccounts, useUpsertBankAccount } from '@/hooks/useSettings';
import { useAuth } from '@/hooks/useAuth';
import { isAdmin } from '@/lib/permissions';
import { useUsers, useCreateUser, useUpdateUserRole, useToggleUserActive, useUpdatePermissions, useDeleteUser } from '@/hooks/useUsers';
import { USER_ROLES, PAGE_PERMISSIONS, type UserRole } from '@/types/enums';
import type { Profile } from '@/types/database';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/form-elements';
import { LoadingSpinner } from '@/components/ui/shared';
import {
  Upload, Trash2, Eye, EyeOff, Download, RotateCcw, AlertTriangle, CheckCircle2,
  Building2, Users, Database, Key, CreditCard, ImageIcon, ShieldCheck,
  Check, X, UserPlus, Lock,
} from 'lucide-react';
import { getApiKeyFromCache, saveApiKeyToDb, deleteApiKeyFromDb, type ApiService } from '@/services/companySettingsService';
import { supabase } from '@/services/supabase';

type SettingsTab = 'company' | 'users' | 'backup';

// ─── Label helper ─────────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{children}</label>;
}

function SectionHeader({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
        <Icon className="h-3.5 w-3.5 text-gray-600" />
      </div>
      <div>
        <div className="text-[13px] font-bold text-gray-800">{title}</div>
        {description && <div className="text-[11px] text-gray-400">{description}</div>}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const { profile } = useAuth();
  const admin = isAdmin(profile?.role);
  const { data: settings, isLoading } = useSettings();
  const { data: bankAccounts = [] } = useBankAccounts();
  const updateSettings = useUpdateSettings();
  const uploadLogo = useUploadLogo();
  const removeLogo = useRemoveLogo();
  const upsertBank = useUpsertBankAccount();
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('company');

  const form = useForm<CompanySettingsFormData>({
    resolver: zodResolver(companySettingsSchema),
  });

  const { register, handleSubmit, formState: { errors }, reset } = form;

  useEffect(() => {
    if (settings) {
      reset({
        company_name: settings.company_name,
        tax_id: settings.tax_id,
        address_line1: settings.address_line1,
        address_line2: settings.address_line2,
        phone: settings.phone,
        email: settings.email,
        signatory: settings.signatory,
        default_currency: settings.default_currency,
        default_port_of_loading: settings.default_port_of_loading,
        default_incoterms: settings.default_incoterms,
        payment_terms: settings.payment_terms,
        file_prefix: settings.file_prefix,
      });
    }
  }, [settings, reset]);

  async function onSubmit(data: CompanySettingsFormData) {
    await updateSettings.mutateAsync(data);
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Max 2MB'); return; }
    uploadLogo.mutate(file);
  }

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;
  if (!admin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
          <Lock className="h-5 w-5 text-gray-400" />
        </div>
        <p className="text-sm font-medium text-gray-500">Admins only</p>
      </div>
    );
  }

  const defaultBank = bankAccounts[0];
  const TABS: { key: SettingsTab; label: string; icon: React.ElementType }[] = [
    { key: 'company', label: 'Company',  icon: Building2 },
    { key: 'users',   label: 'Users',    icon: Users },
    { key: 'backup',  label: 'Backup',   icon: Database },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
          <Building2 className="h-4.5 w-4.5 text-gray-600" style={{ width: 18, height: 18 }} />
        </div>
        <div>
          <h1 className="text-[15px] font-bold text-gray-900">Settings</h1>
          <p className="text-[11px] text-gray-400">Manage your workspace</p>
        </div>
      </div>

      {/* Pill tabs */}
      <div className="flex gap-1.5 bg-gray-100 p-1 rounded-2xl w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 h-8 rounded-xl text-[12px] font-semibold transition-all ${
              activeTab === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Company Tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'company' && (
        <div className="space-y-4">

          {/* Logo */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <SectionHeader icon={ImageIcon} title="Company Logo" description="Shown on invoices and packing lists" />
            <div className="flex items-center gap-4">
              <div
                className="w-[160px] h-[72px] shrink-0 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center bg-gray-50 cursor-pointer hover:border-gray-400 hover:bg-gray-100 transition-colors overflow-hidden"
                onClick={() => fileRef.current?.click()}
              >
                {settings?.logo_url ? (
                  <img src={settings.logo_url} alt="Logo" className="max-w-[156px] max-h-[68px] object-contain" />
                ) : (
                  <div className="text-center">
                    <Upload className="h-5 w-5 text-gray-300 mx-auto mb-1" />
                    <span className="text-[11px] text-gray-400">Click to upload</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-xl border border-gray-200 text-[12px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Upload className="h-3.5 w-3.5" /> Upload
                </button>
                {settings?.logo_url && (
                  <button
                    onClick={() => { if (window.confirm('Remove logo?')) removeLogo.mutate(); }}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-xl border border-red-200 text-[12px] font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
                <p className="text-[10px] text-gray-400">PNG, JPG — max 2MB</p>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </div>
          </div>

          {/* Company Info */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <SectionHeader icon={Building2} title="Company Information" />
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Company Name</FieldLabel>
                  <Input {...register('company_name')} placeholder="SunPlus Trade" className="h-9 text-sm" />
                  {errors.company_name && <p className="text-[11px] text-red-500 mt-1">{errors.company_name.message}</p>}
                </div>
                <div>
                  <FieldLabel>Tax / VKN</FieldLabel>
                  <Input {...register('tax_id')} className="h-9 text-sm" />
                </div>
                <div>
                  <FieldLabel>Address Line 1</FieldLabel>
                  <Input {...register('address_line1')} className="h-9 text-sm" />
                </div>
                <div>
                  <FieldLabel>Address Line 2</FieldLabel>
                  <Input {...register('address_line2')} className="h-9 text-sm" />
                </div>
                <div>
                  <FieldLabel>Phone</FieldLabel>
                  <Input {...register('phone')} className="h-9 text-sm" />
                </div>
                <div>
                  <FieldLabel>Email</FieldLabel>
                  <Input type="email" {...register('email')} className="h-9 text-sm" />
                  {errors.email && <p className="text-[11px] text-red-500 mt-1">{errors.email.message}</p>}
                </div>
                <div>
                  <FieldLabel>Signatory</FieldLabel>
                  <Input {...register('signatory')} placeholder="Authorized person" className="h-9 text-sm" />
                </div>
                <div>
                  <FieldLabel>Default Currency</FieldLabel>
                  <NativeSelect {...register('default_currency')} className="h-9 text-sm">
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="TRY">TRY</option>
                  </NativeSelect>
                </div>
                <div>
                  <FieldLabel>Default Port of Loading</FieldLabel>
                  <Input {...register('default_port_of_loading')} placeholder="MERSIN, TURKEY" className="h-9 text-sm" />
                </div>
                <div>
                  <FieldLabel>Default Incoterms</FieldLabel>
                  <Input {...register('default_incoterms')} placeholder="CPT" className="h-9 text-sm" />
                </div>
                <div>
                  <FieldLabel>Payment Terms</FieldLabel>
                  <Input {...register('payment_terms')} placeholder="T/T in advance" className="h-9 text-sm" />
                </div>
                <div>
                  <FieldLabel>File Prefix</FieldLabel>
                  <Input {...register('file_prefix')} placeholder="ESN" className="h-9 text-sm" />
                  {errors.file_prefix && <p className="text-[11px] text-red-500 mt-1">{errors.file_prefix.message}</p>}
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={updateSettings.isPending}
                  className="flex items-center gap-1.5 px-4 h-9 rounded-xl bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {updateSettings.isPending ? (
                    <><span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />Saving…</>
                  ) : (
                    <><Check className="h-3.5 w-3.5" />Save Settings</>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Bank Info */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <SectionHeader icon={CreditCard} title="Bank Information" description="Shown on invoices" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { label: 'Bank Name',           key: 'bank_name',         val: defaultBank?.bank_name },
                { label: 'Account Name',        key: 'account_name',      val: defaultBank?.account_name },
                { label: 'IBAN (USD)',           key: 'iban_usd',          val: defaultBank?.iban_usd },
                { label: 'IBAN (EUR)',           key: 'iban_eur',          val: defaultBank?.iban_eur },
                { label: 'SWIFT / BIC',         key: 'swift_bic',         val: defaultBank?.swift_bic },
                { label: 'Correspondent Bank',  key: 'correspondent_bank',val: defaultBank?.correspondent_bank },
              ].map(({ label, key, val }) => (
                <div key={key}>
                  <FieldLabel>{label}</FieldLabel>
                  <Input
                    defaultValue={val ?? ''}
                    className="h-9 text-sm"
                    onBlur={(e) => upsertBank.mutate({
                      id: defaultBank?.id ?? null,
                      data: { ...defaultBank, [key]: e.target.value, is_default: true } as never,
                    })}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* API Keys */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <SectionHeader icon={Key} title="API Keys" description="For AI and OCR features" />
            <ApiKeyList />
          </div>
        </div>
      )}

      {/* ── Users Tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'users' && <UsersTab currentUserId={profile?.id} />}

      {/* ── Backup Tab ───────────────────────────────────────────────────────── */}
      {activeTab === 'backup' && <BackupTab />}
    </div>
  );
}

// ─── API Key List ─────────────────────────────────────────────────────────────
const API_SERVICES = [
  {
    id: 'anthropic' as const,
    name: 'Anthropic (Claude)',
    description: 'AI Form Fill — voice & text form filling',
    placeholder: 'sk-ant-...',
    link: 'console.anthropic.com',
    color: '#8b5cf6',
  },
  {
    id: 'openai' as const,
    name: 'OpenAI',
    description: 'OCR — PDF, image, Excel document reading',
    placeholder: 'sk-...',
    link: 'platform.openai.com',
    color: '#10b981',
  },
] satisfies Array<{ id: 'openai' | 'anthropic'; name: string; description: string; placeholder: string; link: string; color: string }>;

function ApiKeyList() {
  return (
    <div className="space-y-2.5">
      {API_SERVICES.map((svc) => (
        <ApiKeyRow key={svc.id} service={svc} />
      ))}
    </div>
  );
}

function ApiKeyRow({ service }: { service: typeof API_SERVICES[number] }) {
  const [stored, setStored] = useState(() => getApiKeyFromCache(service.id as ApiService));
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const cached = getApiKeyFromCache(service.id as ApiService);
    if (cached) setStored(cached);
  }, [service.id]);

  function startEdit() { setValue(stored); setEditing(true); }

  async function handleSave() {
    setSaving(true);
    try {
      await saveApiKeyToDb(service.id as ApiService, value.trim());
      setStored(value.trim());
      setEditing(false);
      toast.success('API key saved');
    } catch (err) {
      toast.error('Save error: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await deleteApiKeyFromDb(service.id as ApiService);
      setStored('');
      setEditing(false);
      toast.success('API key removed');
    } catch (err) {
      toast.error('Delete error: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally { setSaving(false); }
  }

  const preview = stored ? stored.slice(0, 8) + '••••••••••••' + stored.slice(-4) : null;

  return (
    <div className="rounded-xl border border-gray-100 p-3.5 bg-gray-50/50">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: service.color + '18' }}>
            <Key className="h-3.5 w-3.5" style={{ color: service.color }} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-gray-800">{service.name}</span>
              {stored ? (
                <span className="text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-semibold flex items-center gap-1">
                  <Check className="h-2.5 w-2.5" /> Configured
                </span>
              ) : (
                <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-semibold">
                  Not set
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">{service.description}</p>
            {stored && !editing && (
              <p className="text-[11px] font-mono text-gray-400 mt-1">{preview}</p>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {!editing && (
            <button
              onClick={startEdit}
              className="px-3 h-7 rounded-xl border border-gray-200 text-[12px] font-medium text-gray-700 hover:bg-white transition-colors"
            >
              {stored ? 'Edit' : 'Add Key'}
            </button>
          )}
          {!editing && stored && (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="w-7 h-7 rounded-xl border border-red-100 text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-3 flex gap-2 items-center">
          <div className="relative flex-1">
            <Input
              type={visible ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={service.placeholder}
              className="pr-9 text-sm h-9 rounded-xl"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
            <button
              type="button"
              onClick={() => setVisible(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={!value.trim() || saving}
            className="px-3 h-9 rounded-xl bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            {saving ? '…' : 'Save'}
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={saving}
            className="w-9 h-9 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Permissions Modal ────────────────────────────────────────────────────────
function PermissionsModal({ user, onClose }: { user: Profile; onClose: () => void }) {
  const updatePerms = useUpdatePermissions();
  const allKeys = PAGE_PERMISSIONS.map(p => p.key);
  const [selected, setSelected] = useState<string[]>(user.permissions ?? allKeys);

  function toggle(key: string) {
    setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  async function save() {
    const perms = selected.length === allKeys.length ? null : selected;
    await updatePerms.mutateAsync({ id: user.id, permissions: perms });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-[14px] text-gray-800">Page Permissions</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{user.full_name} — {user.email}</div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="grid grid-cols-2 gap-2 mb-4">
            {PAGE_PERMISSIONS.map(({ key, label }) => (
              <label key={key} className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                selected.includes(key) ? 'bg-blue-50 border-blue-300' : 'border-gray-100 hover:bg-gray-50'
              }`}>
                <input
                  type="checkbox"
                  checked={selected.includes(key)}
                  onChange={() => toggle(key)}
                  className="accent-blue-600"
                />
                <span className="text-[12px] font-medium text-gray-700">{label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 justify-between items-center">
            <button
              onClick={() => setSelected(allKeys)}
              className="text-[12px] text-blue-600 font-medium hover:underline"
            >
              Select all
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-3 h-8 rounded-xl border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={updatePerms.isPending}
                className="px-3 h-8 rounded-xl bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {updatePerms.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab({ currentUserId }: { currentUserId?: string }) {
  const { data: users = [], isLoading } = useUsers();
  const updateRole   = useUpdateUserRole();
  const toggleActive = useToggleUserActive();
  const deleteUser   = useDeleteUser();
  const createUser   = useCreateUser();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail]       = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName]         = useState('');
  const [newRole, setNewRole]         = useState<UserRole>('viewer');
  const [permUser, setPermUser]       = useState<Profile | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  async function handleCreate() {
    if (!newEmail || !newPassword || !newName) { toast.error('Please fill all fields'); return; }
    await createUser.mutateAsync({ email: newEmail, password: newPassword, fullName: newName, role: newRole });
    setNewEmail(''); setNewPassword(''); setNewName(''); setNewRole('viewer'); setShowAddForm(false);
  }

  async function handleDelete(id: string) {
    await deleteUser.mutateAsync(id);
    setDeleteConfirm(null);
  }

  if (isLoading) return <div className="flex justify-center py-12"><LoadingSpinner /></div>;

  return (
    <div className="space-y-4">
      {permUser && <PermissionsModal user={permUser} onClose={() => setPermUser(null)} />}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <div className="font-bold text-gray-800 mb-1">Delete user?</div>
            <p className="text-[12px] text-gray-500 mb-4">This cannot be undone. The user will lose access.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 h-9 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleteUser.isPending}
                className="flex-1 h-9 rounded-xl bg-red-600 text-white text-[13px] font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteUser.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-bold text-gray-800">{users.length} Users</div>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className={`flex items-center gap-1.5 px-3 h-8 rounded-full text-[12px] font-semibold transition-all ${
            showAddForm
              ? 'bg-gray-200 text-gray-700'
              : 'bg-gray-900 text-white hover:bg-gray-800'
          }`}
        >
          {showAddForm ? <><X className="h-3.5 w-3.5" /> Cancel</> : <><UserPlus className="h-3.5 w-3.5" /> Add User</>}
        </button>
      </div>

      {/* Add user form */}
      {showAddForm && (
        <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4">
          <div className="text-[12px] font-bold text-blue-800 mb-3">New User</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <FieldLabel>Full Name</FieldLabel>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="John Doe" className="h-9 text-sm bg-white" />
            </div>
            <div>
              <FieldLabel>Email</FieldLabel>
              <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="john@company.com" className="h-9 text-sm bg-white" />
            </div>
            <div>
              <FieldLabel>Temporary Password</FieldLabel>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="min. 6 characters" className="h-9 text-sm bg-white" />
            </div>
            <div>
              <FieldLabel>Role</FieldLabel>
              <NativeSelect value={newRole} onChange={e => setNewRole(e.target.value as UserRole)} className="h-9 text-sm bg-white">
                {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </NativeSelect>
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={createUser.isPending}
            className="flex items-center gap-1.5 px-4 h-9 rounded-xl bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {createUser.isPending ? 'Creating…' : <><Check className="h-3.5 w-3.5" /> Create User</>}
          </button>
        </div>
      )}

      {/* User cards */}
      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
        {users.map(u => {
          const color = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444'][(u.full_name ?? '').split('').reduce((a,c) => a + c.charCodeAt(0), 0) % 5];
          const ini = (u.full_name ?? '').split(' ').filter(Boolean).slice(0,2).map(w => w[0]).join('').toUpperCase() || '?';
          return (
            <div key={u.id} className="px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
              {/* Avatar */}
              <div className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center text-white text-[12px] font-bold"
                style={{ background: color }}>
                {ini}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[13px] font-semibold text-gray-800">{u.full_name || '—'}</span>
                  {u.id === currentUserId && (
                    <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 font-medium shrink-0">you</span>
                  )}
                  <span className={`text-[10px] rounded-full px-2 py-0.5 font-semibold shrink-0 ${
                    u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-gray-400 truncate">{u.email}</span>
                  <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 font-medium shrink-0">{u.role}</span>
                </div>
              </div>

              {/* Role select — desktop only */}
              <NativeSelect
                value={u.role}
                disabled={u.id === currentUserId}
                className="text-[12px] h-8 rounded-lg border-gray-200 shrink-0 hidden lg:block w-28"
                onChange={e => updateRole.mutate({ id: u.id, role: e.target.value as UserRole })}
              >
                {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </NativeSelect>

              {/* Actions */}
              {u.id !== currentUserId ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleActive.mutate({ id: u.id, isActive: !u.is_active })}
                    title={u.is_active ? 'Deactivate' : 'Activate'}
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors text-[10px] font-bold ${
                      u.is_active
                        ? 'border-amber-200 text-amber-600 hover:bg-amber-50'
                        : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                    }`}
                  >
                    {u.is_active ? '✕' : '✓'}
                  </button>
                  <button
                    onClick={() => setPermUser(u)}
                    title="Permissions"
                    className="w-7 h-7 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 flex items-center justify-center transition-colors"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(u.id)}
                    title="Delete"
                    className="w-7 h-7 rounded-lg border border-red-100 text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="w-7 h-7 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Backup Tab ───────────────────────────────────────────────────────────────
const BACKUP_TABLES = [
  'customers', 'suppliers', 'service_providers', 'products',
  'trade_files', 'proformas', 'invoices', 'packing_lists', 'packing_list_items',
  'transactions', 'company_settings', 'bank_accounts',
] as const;

type BackupStatus = 'idle' | 'loading' | 'success' | 'error';

function BackupTab() {
  const [exportStatus, setExportStatus] = useState<BackupStatus>('idle');
  const [restoreStatus, setRestoreStatus] = useState<BackupStatus>('idle');
  const [restoreMsg, setRestoreMsg] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setExportStatus('loading');
    try {
      const tables: Record<string, unknown[]> = {};
      for (const table of BACKUP_TABLES) {
        const { data, error } = await supabase.from(table).select('*');
        if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
        tables[table] = data ?? [];
      }
      const backup = { version: 1, exported_at: new Date().toISOString(), tables };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sunplus-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportStatus('success');
      setTimeout(() => setExportStatus('idle'), 3000);
    } catch (err) {
      console.error(err);
      setExportStatus('error');
      setTimeout(() => setExportStatus('idle'), 4000);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setConfirmRestore(true);
    e.target.value = '';
  }

  async function handleRestore() {
    if (!pendingFile) return;
    setConfirmRestore(false);
    setRestoreStatus('loading');
    setRestoreMsg('');
    try {
      const text = await pendingFile.text();
      const backup = JSON.parse(text);
      if (!backup.version || !backup.tables) throw new Error('Invalid backup file format');
      let totalRows = 0;
      for (const table of BACKUP_TABLES) {
        const rows = backup.tables[table];
        if (!rows || rows.length === 0) continue;
        const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
        if (error) throw new Error(`Failed to restore ${table}: ${error.message}`);
        totalRows += rows.length;
      }
      setRestoreMsg(`${totalRows} records restored from backup dated ${backup.exported_at?.slice(0, 10) ?? 'unknown'}.`);
      setRestoreStatus('success');
      setTimeout(() => { setRestoreStatus('idle'); setRestoreMsg(''); }, 6000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setRestoreMsg(msg);
      setRestoreStatus('error');
    } finally { setPendingFile(null); }
  }

  return (
    <div className="space-y-4">
      {/* Export */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <SectionHeader icon={Download} title="Export Backup" description="Download all data as a JSON file" />
        <button
          onClick={handleExport}
          disabled={exportStatus === 'loading'}
          className="flex items-center gap-2 px-4 h-9 rounded-xl bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {exportStatus === 'loading'
            ? <><span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />Exporting…</>
            : <><Download className="h-3.5 w-3.5" />Download Backup</>}
        </button>
        {exportStatus === 'success' && (
          <p className="flex items-center gap-1.5 mt-3 text-[12px] text-emerald-600 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" /> Backup downloaded successfully
          </p>
        )}
        {exportStatus === 'error' && (
          <p className="flex items-center gap-1.5 mt-3 text-[12px] text-red-500 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> Export failed
          </p>
        )}
        <p className="text-[11px] text-gray-400 mt-3">
          Includes: customers, suppliers, products, trade files, invoices, proformas, packing lists, transactions, company settings.
        </p>
      </div>

      {/* Restore */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <SectionHeader icon={RotateCcw} title="Restore from Backup" description="Upload a previously exported backup file" />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={restoreStatus === 'loading'}
          className="flex items-center gap-2 px-4 h-9 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {restoreStatus === 'loading'
            ? <><span className="h-3.5 w-3.5 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />Restoring…</>
            : <><RotateCcw className="h-3.5 w-3.5" />Select Backup File</>}
        </button>
        {restoreStatus === 'success' && (
          <p className="flex items-center gap-1.5 mt-3 text-[12px] text-emerald-600 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" /> {restoreMsg}
          </p>
        )}
        {restoreStatus === 'error' && (
          <p className="flex items-center gap-1.5 mt-3 text-[12px] text-red-500 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> {restoreMsg}
          </p>
        )}
        <p className="text-[11px] text-gray-400 mt-3">
          Existing records with matching IDs will be overwritten. This cannot be undone.
        </p>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileSelect} />
      </div>

      {/* Confirm dialog */}
      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/45 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="text-[14px] font-bold text-gray-800 mb-1">Restore Backup?</div>
                <p className="text-[12px] text-gray-500">
                  <span className="font-medium text-gray-700">{pendingFile?.name}</span> will be applied.
                  Existing records with the same ID will be overwritten. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setConfirmRestore(false); setPendingFile(null); }}
                className="flex-1 h-9 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRestore}
                className="flex-1 h-9 rounded-xl bg-amber-500 text-white text-[13px] font-semibold hover:bg-amber-600 transition-colors"
              >
                Yes, Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
