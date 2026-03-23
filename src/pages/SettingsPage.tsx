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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/form-elements';
import { Card, CardContent, PageHeader, LoadingSpinner, FormRow, FormGroup } from '@/components/ui/shared';
import { Upload, Trash2, Eye, EyeOff, Download, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getApiKeyFromCache, saveApiKeyToDb, deleteApiKeyFromDb, type ApiService } from '@/services/companySettingsService';
import { supabase } from '@/services/supabase';

type SettingsTab = 'company' | 'users' | 'backup';

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
    if (file.size > 2 * 1024 * 1024) {
      alert('Max 2MB');
      return;
    }
    uploadLogo.mutate(file);
  }

  if (isLoading) return <LoadingSpinner />;
  if (!admin) {
    return (
      <div className="text-center py-12 text-muted-foreground text-xs">
        Only administrators can access settings.
      </div>
    );
  }

  const defaultBank = bankAccounts[0];

  return (
    <>
      <PageHeader title="Settings" />

      {/* Tab bar */}
      <div className="flex gap-0 border-b-2 border-border mb-5">
        {([['company', 'Company'], ['users', 'Users'], ['backup', 'Backup']] as [SettingsTab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-5 py-2 text-xs font-semibold border-b-2 -mb-[2px] transition-colors ${
              activeTab === key
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && <UsersTab currentUserId={profile?.id} />}
      {activeTab === 'backup' && <BackupTab />}
      {activeTab === 'company' && <>

      {/* Logo */}
      <Card className="mb-4">
        <CardContent>
          <div className="text-[13px] font-bold mb-3">Company Logo</div>
          <div className="flex items-start gap-5">
            <div
              className="w-[180px] h-[88px] flex-shrink-0 border-2 border-dashed border-border rounded-lg flex items-center justify-center bg-gray-50 cursor-pointer hover:border-brand-500 transition overflow-hidden"
              onClick={() => fileRef.current?.click()}
            >
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="max-w-[176px] max-h-[84px] object-contain" />
              ) : (
                <span className="text-[11px] text-muted-foreground">Click to upload</span>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-2">Shown on all invoices and packing lists.</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" /> Upload
                </Button>
                {settings?.logo_url && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => { if (window.confirm('Remove logo?')) removeLogo.mutate(); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </Button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Company Info */}
      <Card className="mb-4">
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="text-[13px] font-bold mb-3">Company Information</div>
            <FormRow>
              <FormGroup label="Company Name" error={errors.company_name?.message}>
                <Input {...register('company_name')} placeholder="SunPlus Trade" />
              </FormGroup>
              <FormGroup label="Tax / VKN">
                <Input {...register('tax_id')} />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Address Line 1">
                <Input {...register('address_line1')} />
              </FormGroup>
              <FormGroup label="Address Line 2">
                <Input {...register('address_line2')} />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Phone">
                <Input {...register('phone')} />
              </FormGroup>
              <FormGroup label="Email" error={errors.email?.message}>
                <Input type="email" {...register('email')} />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Signatory">
                <Input {...register('signatory')} placeholder="Authorized person name" />
              </FormGroup>
              <FormGroup label="Default Currency">
                <NativeSelect {...register('default_currency')}>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="TRY">TRY</option>
                </NativeSelect>
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Default Port of Loading">
                <Input {...register('default_port_of_loading')} placeholder="MERSIN, TURKEY" />
              </FormGroup>
              <FormGroup label="Default Incoterms">
                <Input {...register('default_incoterms')} placeholder="CPT" />
              </FormGroup>
            </FormRow>
            <FormRow>
              <FormGroup label="Payment Terms">
                <Input {...register('payment_terms')} placeholder="T/T in advance" />
              </FormGroup>
              <FormGroup label="File Prefix" error={errors.file_prefix?.message}>
                <Input {...register('file_prefix')} placeholder="ESN" />
              </FormGroup>
            </FormRow>

            <div className="flex justify-end mt-3">
              <Button type="submit" disabled={updateSettings.isPending}>
                {updateSettings.isPending ? 'Saving…' : 'Save Settings'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Bank Info */}
      <Card>
        <CardContent>
          <div className="text-[13px] font-bold mb-3">Bank Information</div>
          <FormRow>
            <FormGroup label="Bank Name">
              <Input
                defaultValue={defaultBank?.bank_name ?? ''}
                onBlur={(e) => upsertBank.mutate({
                  id: defaultBank?.id ?? null,
                  data: { ...defaultBank, bank_name: e.target.value, is_default: true } as never,
                })}
              />
            </FormGroup>
            <FormGroup label="Account Name">
              <Input defaultValue={defaultBank?.account_name ?? ''} />
            </FormGroup>
          </FormRow>
          <FormRow>
            <FormGroup label="IBAN (USD)">
              <Input defaultValue={defaultBank?.iban_usd ?? ''} />
            </FormGroup>
            <FormGroup label="IBAN (EUR)">
              <Input defaultValue={defaultBank?.iban_eur ?? ''} />
            </FormGroup>
          </FormRow>
          <FormRow>
            <FormGroup label="SWIFT / BIC">
              <Input defaultValue={defaultBank?.swift_bic ?? ''} />
            </FormGroup>
            <FormGroup label="Correspondent Bank">
              <Input defaultValue={defaultBank?.correspondent_bank ?? ''} />
            </FormGroup>
          </FormRow>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card className="mt-4">
        <CardContent>
          <div className="text-[13px] font-bold mb-1">API Anahtarları</div>
          <p className="text-xs text-muted-foreground mb-3">
            Yalnızca tarayıcınızda saklanır — sunucularımıza gönderilmez.
          </p>
          <ApiKeyList />
        </CardContent>
      </Card>
      </>}
    </>
  );
}

// ─── API Key List ─────────────────────────────────────────────────────────────

const API_SERVICES = [
  {
    id: 'anthropic' as const,
    name: 'Anthropic (Claude)',
    description: 'Akıllı Form Doldurma — Sesli & yazılı Türkçe komutlarla form doldurma',
    placeholder: 'sk-ant-...',
    link: 'console.anthropic.com',
  },
  {
    id: 'openai' as const,
    name: 'OpenAI',
    description: 'OCR — PDF, resim, Excel belge okuma',
    placeholder: 'sk-...',
    link: 'platform.openai.com',
  },
] satisfies Array<{ id: 'openai' | 'anthropic'; name: string; description: string; placeholder: string; link: string }>;

function ApiKeyList() {
  return (
    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
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

  // Sync from cache when component mounts (in case keys loaded after render)
  useEffect(() => {
    const cached = getApiKeyFromCache(service.id as ApiService);
    if (cached) setStored(cached);
  }, [service.id]);

  function startEdit() {
    setValue(stored);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveApiKeyToDb(service.id as ApiService, value.trim());
      setStored(value.trim());
      setEditing(false);
      toast.success('API key kaydedildi');
    } catch (err) {
      toast.error('Kaydetme hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await deleteApiKeyFromDb(service.id as ApiService);
      setStored('');
      setEditing(false);
      toast.success('API key silindi');
    } catch (err) {
      toast.error('Silme hatası: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
    } finally {
      setSaving(false);
    }
  }

  const preview = stored
    ? stored.slice(0, 6) + '•••••••••••••••' + stored.slice(-4)
    : null;

  return (
    <div className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold">{service.name}</span>
            {stored ? (
              <span className="text-[10px] bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5 font-medium">✓ Configured</span>
            ) : (
              <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-medium">Not set</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{service.description}</p>
          {stored && !editing && (
            <p className="text-[11px] font-mono text-muted-foreground mt-1">{preview}</p>
          )}
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          {!editing && (
            <Button type="button" variant="outline" size="sm" onClick={startEdit}>
              {stored ? 'Düzenle' : 'Key Ekle'}
            </Button>
          )}
          {!editing && stored && (
            <Button type="button" variant="ghost" size="sm" onClick={handleDelete} disabled={saving} className="text-red-500 hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-2 flex gap-2 items-center">
          <div className="relative flex-1">
            <Input
              type={visible ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={service.placeholder}
              className="pr-8 text-xs"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <Button type="button" size="sm" onClick={handleSave} disabled={!value.trim() || saving}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>İptal</Button>
        </div>
      )}
    </div>
  );
}

// ─── Permissions Modal ────────────────────────────────────────────────────────
function PermissionsModal({ user, onClose }: { user: Profile; onClose: () => void }) {
  const updatePerms = useUpdatePermissions();
  const allKeys = PAGE_PERMISSIONS.map(p => p.key);
  const [selected, setSelected] = useState<string[]>(
    user.permissions ?? allKeys
  );

  function toggle(key: string) {
    setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  async function save() {
    const perms = selected.length === allKeys.length ? null : selected;
    await updatePerms.mutateAsync({ id: user.id, permissions: perms });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-[420px] mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-red-600 to-red-500 px-5 py-4">
          <div className="text-white font-bold text-sm">Sayfa Erişim İzinleri</div>
          <div className="text-white/75 text-xs mt-0.5">{user.full_name} — {user.email}</div>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-gray-500 mb-3">
            Hangi sayfalara erişebileceğini seç. Tümü seçiliyse kısıtlama yok.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {PAGE_PERMISSIONS.map(({ key, label }) => (
              <label key={key} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                selected.includes(key) ? 'bg-red-50 border-red-300' : 'border-gray-200 hover:bg-gray-50'
              }`}>
                <input
                  type="checkbox"
                  checked={selected.includes(key)}
                  onChange={() => toggle(key)}
                  className="accent-red-600"
                />
                <span className="text-xs font-medium text-gray-700">{label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 justify-between">
            <Button variant="outline" size="sm" onClick={() => setSelected(allKeys)} className="text-xs">
              Tümünü Seç
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>İptal</Button>
              <Button size="sm" onClick={save} disabled={updatePerms.isPending} className="bg-red-600 hover:bg-red-700 text-white">
                {updatePerms.isPending ? 'Kaydediliyor…' : 'Kaydet'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Users Tab ───────────────────────────────────────────────────────────────
function UsersTab({ currentUserId }: { currentUserId?: string }) {
  const { data: users = [], isLoading } = useUsers();
  const updateRole   = useUpdateUserRole();
  const toggleActive = useToggleUserActive();
  const deleteUser   = useDeleteUser();
  const createUser   = useCreateUser();

  const [showAddForm, setShowAddForm]   = useState(false);
  const [newEmail, setNewEmail]         = useState('');
  const [newPassword, setNewPassword]   = useState('');
  const [newName, setNewName]           = useState('');
  const [newRole, setNewRole]           = useState<UserRole>('viewer');
  const [permUser, setPermUser]         = useState<Profile | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  async function handleCreate() {
    if (!newEmail || !newPassword || !newName) { alert('Please fill all fields'); return; }
    await createUser.mutateAsync({ email: newEmail, password: newPassword, fullName: newName, role: newRole });
    setNewEmail(''); setNewPassword(''); setNewName(''); setNewRole('viewer'); setShowAddForm(false);
  }

  async function handleDelete(id: string) {
    await deleteUser.mutateAsync(id);
    setDeleteConfirm(null);
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      {permUser && <PermissionsModal user={permUser} onClose={() => setPermUser(null)} />}

      {/* Delete confirm dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-[320px] mx-4 p-6 text-center">
            <div className="text-3xl mb-2">⚠️</div>
            <div className="font-bold text-gray-800 mb-1">Kullanıcıyı sil?</div>
            <p className="text-xs text-gray-500 mb-4">Bu işlem geri alınamaz. Kullanıcı sisteme giriş yapamaz.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(null)}>İptal</Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={() => handleDelete(deleteConfirm)} disabled={deleteUser.isPending}>
                {deleteUser.isPending ? 'Siliniyor…' : 'Sil'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <div className="text-sm font-semibold">User Management</div>
        <Button size="sm" onClick={() => setShowAddForm((v) => !v)}>
          {showAddForm ? '✕ Cancel' : '+ Add User'}
        </Button>
      </div>

      {showAddForm && (
        <Card className="mb-4 border-brand-200 bg-brand-50/20">
          <CardContent>
            <div className="text-xs font-bold mb-3">New User</div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-medium block mb-1">Full Name *</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="John Doe" />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Email *</label>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="john@company.com" />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Temporary Password *</label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="min. 6 characters" />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Role</label>
                <NativeSelect value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)}>
                  {USER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </NativeSelect>
              </div>
            </div>
            <Button size="sm" onClick={handleCreate} disabled={createUser.isPending}>
              {createUser.isPending ? 'Creating…' : 'Create User'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                {['Name', 'Email', 'Role', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-2xs font-bold uppercase text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border hover:bg-gray-50/50">
                  <td className="px-3 py-2 text-xs font-medium">
                    {u.full_name || '—'}
                    {u.id === currentUserId && <span className="ml-1 text-2xs text-brand-500">(you)</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{u.email}</td>
                  <td className="px-3 py-2">
                    <NativeSelect
                      value={u.role}
                      disabled={u.id === currentUserId}
                      className="text-xs py-0.5 h-7"
                      onChange={(e) => updateRole.mutate({ id: u.id, role: e.target.value as UserRole })}
                    >
                      {USER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </NativeSelect>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-2xs px-2 py-0.5 rounded font-medium ${
                      u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {u.id !== currentUserId ? (
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="xs"
                          onClick={() => toggleActive.mutate({ id: u.id, isActive: !u.is_active })}>
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button variant="outline" size="xs" title="Sayfa İzinleri"
                          onClick={() => setPermUser(u)}
                          className="text-blue-600 border-blue-200 hover:bg-blue-50">
                          🔑
                        </Button>
                        <Button variant="outline" size="xs" title="Sil"
                          onClick={() => setDeleteConfirm(u.id)}
                          className="text-red-600 border-red-200 hover:bg-red-50">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-2xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
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
      const backup = {
        version: 1,
        exported_at: new Date().toISOString(),
        tables,
      };
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
      setRestoreMsg(`${totalRows} records restored successfully from backup dated ${backup.exported_at?.slice(0, 10) ?? 'unknown'}.`);
      setRestoreStatus('success');
      setTimeout(() => { setRestoreStatus('idle'); setRestoreMsg(''); }, 6000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setRestoreMsg(msg);
      setRestoreStatus('error');
    } finally {
      setPendingFile(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Export */}
      <Card>
        <CardContent>
          <div className="text-[13px] font-bold mb-1">Export Backup</div>
          <p className="text-xs text-muted-foreground mb-4">
            Downloads all your data as a JSON file. Store it somewhere safe.
          </p>
          <div className="flex items-center gap-3">
            <Button onClick={handleExport} disabled={exportStatus === 'loading'}>
              <Download className="h-3.5 w-3.5" />
              {exportStatus === 'loading' ? 'Exporting…' : 'Download Backup'}
            </Button>
            {exportStatus === 'success' && (
              <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> Backup downloaded
              </span>
            )}
            {exportStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-xs text-red-500 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" /> Export failed
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">
            Includes: customers, suppliers, products, trade files, invoices, proformas, packing lists, transactions, company settings.
          </p>
        </CardContent>
      </Card>

      {/* Restore */}
      <Card>
        <CardContent>
          <div className="text-[13px] font-bold mb-1">Restore from Backup</div>
          <p className="text-xs text-muted-foreground mb-4">
            Upload a previously exported backup file. Existing records with matching IDs will be overwritten.
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={restoreStatus === 'loading'}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {restoreStatus === 'loading' ? 'Restoring…' : 'Select Backup File'}
            </Button>
            {restoreStatus === 'success' && (
              <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> {restoreMsg}
              </span>
            )}
            {restoreStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-xs text-red-500 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" /> {restoreMsg}
              </span>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileSelect} />
        </CardContent>
      </Card>

      {/* Confirm dialog */}
      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/45">
          <div className="bg-white rounded-t-2xl md:rounded-xl p-6 w-full md:max-w-sm shadow-xl">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-bold mb-1">Restore Backup?</div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{pendingFile?.name}</span> will be applied.
                  Existing records with the same ID will be overwritten. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setConfirmRestore(false); setPendingFile(null); }}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={handleRestore}>
                Yes, Restore
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
