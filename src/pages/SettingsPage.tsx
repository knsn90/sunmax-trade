import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { companySettingsSchema, type CompanySettingsFormData } from '@/types/forms';
import { useSettings, useUpdateSettings, useUploadLogo, useRemoveLogo, useBankAccounts, useUpsertBankAccount } from '@/hooks/useSettings';
import { useAuth } from '@/hooks/useAuth';
import { isAdmin } from '@/lib/permissions';
import { useUsers, useCreateUser, useUpdateUserRole, useToggleUserActive } from '@/hooks/useUsers';
import { USER_ROLES, type UserRole } from '@/types/enums';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/form-elements';
import { Card, CardContent, PageHeader, LoadingSpinner, FormRow, FormGroup } from '@/components/ui/shared';
import { Upload, Trash2, Eye, EyeOff, Download, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { THEME_PRESETS, applyTheme, getStoredTheme, type ThemePreset } from '@/lib/theme';
import { getOpenAIKey, saveOpenAIKey } from '@/lib/openai';
import { supabase } from '@/services/supabase';

type SettingsTab = 'company' | 'users' | 'theme' | 'backup';

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
        {([['company', 'Company'], ['users', 'Users'], ['theme', 'Theme'], ['backup', 'Backup']] as [SettingsTab, string][]).map(([key, label]) => (
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

      {activeTab === 'theme' && <ThemeTab />}
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
          <div className="text-[13px] font-bold mb-1">API Keys</div>
          <p className="text-xs text-muted-foreground mb-3">
            Stored in your browser only — never sent to our servers.
          </p>
          <ApiKeyField
            label="OpenAI API Key"
            loadKey={getOpenAIKey}
            saveKey={saveOpenAIKey}
            placeholder="sk-..."
            hint="Required for OCR document reading"
          />
        </CardContent>
      </Card>
      </>}
    </>
  );
}

// ─── API Key Field ────────────────────────────────────────────────────────────

function ApiKeyField({
  label, loadKey, saveKey, placeholder, hint,
}: {
  label: string;
  loadKey: () => string;
  saveKey: (key: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  const [value, setValue] = useState(loadKey());
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    saveKey(value);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <label className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
        {label}
      </label>
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Input
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="pr-8"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleSave}>
          {saved ? '✓ Saved' : 'Save'}
        </Button>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

// ─── Theme Tab ───────────────────────────────────────────────────────────────

function ThemeTab() {
  const [active, setActive] = useState<ThemePreset>(getStoredTheme());

  function handleSelect(preset: ThemePreset) {
    setActive(preset);
    applyTheme(preset);
  }

  return (
    <Card>
      <CardContent>
        <div className="text-[13px] font-bold mb-1">Brand Color</div>
        <p className="text-xs text-muted-foreground mb-4">
          Choose the primary color used throughout the application.
        </p>
        <div className="flex flex-wrap gap-3">
          {(Object.entries(THEME_PRESETS) as [ThemePreset, typeof THEME_PRESETS[ThemePreset]][]).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => handleSelect(key)}
              title={preset.name}
              className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all ${
                active === key
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-transparent hover:border-gray-200'
              }`}
            >
              <span
                className="w-8 h-8 rounded-full shadow-sm block"
                style={{ backgroundColor: preset.color500 }}
              />
              <span className="text-[10px] font-medium text-muted-foreground">{preset.name}</span>
            </button>
          ))}
        </div>
        {active && (
          <p className="mt-4 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{THEME_PRESETS[active].name}</span> theme applied. Changes are saved in your browser.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Users Tab ───────────────────────────────────────────────────────────────

function UsersTab({ currentUserId }: { currentUserId?: string }) {
  const { data: users = [], isLoading } = useUsers();
  const updateRole = useUpdateUserRole();
  const toggleActive = useToggleUserActive();
  const createUser = useCreateUser();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('viewer');

  async function handleCreate() {
    if (!newEmail || !newPassword || !newName) {
      alert('Please fill all fields');
      return;
    }
    await createUser.mutateAsync({ email: newEmail, password: newPassword, fullName: newName, role: newRole });
    setNewEmail('');
    setNewPassword('');
    setNewName('');
    setNewRole('viewer');
    setShowAddForm(false);
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
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
                    {u.id !== currentUserId && (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => toggleActive.mutate({ id: u.id, isActive: !u.is_active })}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
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
