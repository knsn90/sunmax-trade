import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { companySettingsSchema, type CompanySettingsFormData } from '@/types/forms';
import { useSettings, useUpdateSettings, useUploadLogo, useRemoveLogo, useBankAccounts, useUpsertBankAccount } from '@/hooks/useSettings';
import { useTradeFiles, useChangeStatus } from '@/hooks/useTradeFiles';
import { useTransactions } from '@/hooks/useTransactions';
import { useNavigate } from 'react-router-dom';
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
  Check, X, UserPlus, Lock, Mail, Clock, ScanSearch, CircleCheck, Circle, ChevronRight,
} from 'lucide-react';
import {
  getBackupSettings, saveBackupSettings, sendBackupEmail,
  type BackupSchedule,
} from '@/hooks/useAutoBackupEmail';
import { getApiKeyFromCache, saveApiKeyToDb, deleteApiKeyFromDb, type ApiService } from '@/services/companySettingsService';
import { supabase } from '@/services/supabase';
import { setLanguage, SUPPORTED_LANGUAGES } from '@/i18n';
import { Globe } from 'lucide-react';

type SettingsTab = 'company' | 'users' | 'backup' | 'audit';

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

// ─── Static API service config (ids + colors only) ────────────────────────────
const API_SERVICE_IDS = [
  { id: 'anthropic' as const, link: 'console.anthropic.com', color: '#8b5cf6' },
  { id: 'openai'    as const, link: 'platform.openai.com',   color: '#10b981' },
];

// ─── Main Page ────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const { t, i18n } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
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
    if (file.size > 2 * 1024 * 1024) { toast.error(t('logo.errorSize')); return; }
    uploadLogo.mutate(file);
  }

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;
  if (!admin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
          <Lock className="h-5 w-5 text-gray-400" />
        </div>
        <p className="text-sm font-medium text-gray-500">{t('users.adminOnly')}</p>
      </div>
    );
  }

  const defaultBank = bankAccounts[0];
  const TABS: { key: SettingsTab; label: string; icon: React.ElementType }[] = [
    { key: 'company', label: t('tabs.company'), icon: Building2 },
    { key: 'users',   label: t('tabs.users'),   icon: Users },
    { key: 'backup',  label: t('tabs.backup'),  icon: Database },
    { key: 'audit',   label: 'Belge Denetimi',  icon: ScanSearch },
  ];

  const bankFields = [
    { label: t('bank.bankName'),         key: 'bank_name',          val: defaultBank?.bank_name },
    { label: t('bank.accountName'),      key: 'account_name',       val: defaultBank?.account_name },
    { label: t('bank.ibanUsd'),          key: 'iban_usd',           val: defaultBank?.iban_usd },
    { label: t('bank.ibanEur'),          key: 'iban_eur',           val: defaultBank?.iban_eur },
    { label: t('bank.swiftBic'),         key: 'swift_bic',          val: defaultBank?.swift_bic },
    { label: t('bank.correspondentBank'),key: 'correspondent_bank', val: defaultBank?.correspondent_bank },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
          <Building2 className="h-4.5 w-4.5 text-gray-600" style={{ width: 18, height: 18 }} />
        </div>
        <div>
          <h1 className="text-[15px] font-bold text-gray-900">{t('title')}</h1>
          <p className="text-[11px] text-gray-400">{t('subtitle')}</p>
        </div>
      </div>

      {/* Pill tabs */}
      <div className="flex gap-1.5 bg-gray-100 p-1 rounded-2xl overflow-x-auto scrollbar-none">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`shrink-0 flex items-center gap-1.5 px-4 h-8 rounded-xl text-[12px] font-semibold transition-all ${
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
            <SectionHeader icon={ImageIcon} title={t('logo.title')} description={t('logo.description')} />
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
                    <span className="text-[11px] text-gray-400">{t('logo.uploadHint')}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-xl border border-gray-200 text-[12px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Upload className="h-3.5 w-3.5" /> {t('logo.btnUpload')}
                </button>
                {settings?.logo_url && (
                  <button
                    onClick={() => { if (window.confirm(t('logo.confirm'))) removeLogo.mutate(); }}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-xl border border-red-200 text-[12px] font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {t('logo.btnRemove')}
                  </button>
                )}
                <p className="text-[10px] text-gray-400">{t('logo.hint')}</p>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </div>
          </div>

          {/* Company Info */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <SectionHeader icon={Building2} title={t('company.title')} />
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <FieldLabel>{t('company.name')}</FieldLabel>
                  <Input {...register('company_name')} placeholder="SunPlus Trade" className="h-9 text-sm" />
                  {errors.company_name && <p className="text-[11px] text-red-500 mt-1">{errors.company_name.message}</p>}
                </div>
                <div>
                  <FieldLabel>{t('company.taxVkn')}</FieldLabel>
                  <Input {...register('tax_id')} className="h-9 text-sm" />
                </div>
                <div>
                  <FieldLabel>{t('company.addressLine1')}</FieldLabel>
                  <Input {...register('address_line1')} className="h-9 text-sm" />
                </div>
                <div>
                  <FieldLabel>{t('company.addressLine2')}</FieldLabel>
                  <Input {...register('address_line2')} className="h-9 text-sm" />
                </div>
                <div>
                  <FieldLabel>{tc('form.phone')}</FieldLabel>
                  <Input {...register('phone')} className="h-9 text-sm" />
                </div>
                <div>
                  <FieldLabel>{tc('form.email')}</FieldLabel>
                  <Input type="email" {...register('email')} className="h-9 text-sm" />
                  {errors.email && <p className="text-[11px] text-red-500 mt-1">{errors.email.message}</p>}
                </div>
                <div>
                  <FieldLabel>{t('company.signatory')}</FieldLabel>
                  <Input {...register('signatory')} placeholder={t('company.signatoryPlaceholder')} className="h-9 text-sm" />
                </div>
                <div>
                  <FieldLabel>{t('company.defaultCurrency')}</FieldLabel>
                  <NativeSelect {...register('default_currency')} className="h-9 text-sm">
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="TRY">TRY</option>
                  </NativeSelect>
                </div>
                <div>
                  <FieldLabel>{t('company.defaultPort')}</FieldLabel>
                  <Input {...register('default_port_of_loading')} placeholder={t('company.defaultPortPlaceholder')} className="h-9 text-sm" />
                </div>
                <div>
                  <FieldLabel>{t('company.defaultIncoterms')}</FieldLabel>
                  <Input {...register('default_incoterms')} placeholder={t('company.defaultIncotermsPlaceholder')} className="h-9 text-sm" />
                </div>
                <div>
                  <FieldLabel>{tc('form.payment_terms')}</FieldLabel>
                  <Input {...register('payment_terms')} placeholder={t('company.paymentTermsPlaceholder')} className="h-9 text-sm" />
                </div>
                <div>
                  <FieldLabel>{t('company.filePrefix')}</FieldLabel>
                  <Input {...register('file_prefix')} placeholder={t('company.filePrefixPlaceholder')} className="h-9 text-sm" />
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
                    <><span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />{t('company.btnSaving')}</>
                  ) : (
                    <><Check className="h-3.5 w-3.5" />{t('company.btnSave')}</>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Bank Info */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <SectionHeader icon={CreditCard} title={t('bank.title')} description={t('bank.description')} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {bankFields.map(({ label, key, val }) => (
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
            <SectionHeader icon={Key} title={t('api.title')} description={t('api.description')} />
            <ApiKeyList />
          </div>

          {/* Language */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <SectionHeader icon={Globe} title={t('language.title')} description={t('language.description')} />
            <div className="flex gap-2">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const active = i18n.language?.slice(0, 2) === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => setLanguage(lang.code)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Users Tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'users' && <UsersTab currentUserId={profile?.id} />}

      {/* ── Backup Tab ───────────────────────────────────────────────────────── */}
      {activeTab === 'backup' && <BackupTab />}

      {/* ── Audit Tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'audit' && <DocumentAuditTab />}
    </div>
  );
}

// ─── Document Audit Tab ───────────────────────────────────────────────────────
function DocumentAuditTab() {
  const navigate = useNavigate();
  const { data: files = [], isLoading: filesLoading } = useTradeFiles();
  const { data: allTxns = [], isLoading: txnsLoading } = useTransactions({ approvedOnly: false });
  const changeStatus = useChangeStatus();
  const [fixing, setFixing] = useState<string | null>(null);

  const isLoading = filesLoading || txnsLoading;

  // Tüm tamamlandı dosyalarını denetle
  const auditRows = files
    .filter(f => f.status === 'completed')
    .map(f => {
      const qty = f.delivered_admt ?? f.tonnage_mt ?? 0;
      const expectedPurchase = (f.purchase_price ?? 0) * qty;
      const expectedSale     = (f.selling_price  ?? 0) * qty;

      const fileTxns = allTxns.filter(t => t.trade_file_id === f.id || (t.trade_file as any)?.id === f.id);
      const purchaseInvs  = fileTxns.filter(t => t.transaction_type === 'purchase_inv');
      const saleInvs      = fileTxns.filter(t => t.transaction_type === 'sale_inv');
      const svcInvs       = fileTxns.filter(t => t.transaction_type === 'svc_inv');
      const purchaseTotal = purchaseInvs.reduce((s, t) => s + (t.amount_usd ?? t.amount ?? 0), 0);
      const saleTotal     = saleInvs.reduce((s, t) => s + (t.amount_usd ?? t.amount ?? 0), 0);

      const checks = {
        purchaseCovered: purchaseInvs.length > 0 && (expectedPurchase === 0 || purchaseTotal >= expectedPurchase * 0.85),
        saleCovered:     saleInvs.length > 0     && (expectedSale     === 0 || saleTotal     >= expectedSale     * 0.85),
        hasSvcInv:       svcInvs.length > 0,
        hasProforma:     (f.proformas?.length ?? 0) > 0,
        hasPackingList:  (f.packing_lists?.length ?? 0) > 0,
        hasCommInvoice:  (f.invoices?.length ?? 0) > 0,
      };

      const missingCount = Object.values(checks).filter(v => !v).length;
      return { file: f, checks, missingCount };
    })
    .filter(r => r.missingCount > 0)
    .sort((a, b) => b.missingCount - a.missingCount);

  type CheckKeys = 'purchaseCovered' | 'saleCovered' | 'hasSvcInv' | 'hasProforma' | 'hasPackingList' | 'hasCommInvoice';
  const CHECK_LABELS: Record<CheckKeys, string> = {
    purchaseCovered: 'Satın Alma Faturası',
    saleCovered:     'Satış Faturası',
    hasSvcInv:       'Hizmet Faturası',
    hasProforma:     'Proforma Fatura',
    hasPackingList:  'Packing List',
    hasCommInvoice:  'Commercial Invoice',
  };

  async function handleRevert(fileId: string) {
    setFixing(fileId);
    try {
      await changeStatus.mutateAsync({ id: fileId, status: 'delivery' });
      toast.success('Dosya "Teslimat" durumuna geri alındı — eksik belgeleri tamamlayın');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setFixing(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
        Tüm dosyalar taranıyor…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <SectionHeader icon={ScanSearch} title="Belge Denetimi" description="Tamamlandı statüsündeki tüm dosyaları belgeler açısından tarar" />
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1.5 rounded-xl text-[12px] font-semibold ${auditRows.length === 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {auditRows.length === 0
              ? '✓ Tüm tamamlanmış dosyalar eksiksiz'
              : `${auditRows.length} dosyada eksik belge var`}
          </div>
          <span className="text-[11px] text-gray-400">{files.filter(f => f.status === 'completed').length} tamamlanmış dosya tarandı</span>
        </div>
      </div>

      {auditRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-100">
          <CheckCircle2 className="h-10 w-10 text-green-400 mb-3" />
          <p className="text-[14px] font-semibold text-gray-700">Tüm belgeler eksiksiz</p>
          <p className="text-[12px] text-gray-400 mt-1">Tamamlandı statüsündeki her dosya gerekli belgelere sahip</p>
        </div>
      ) : (
        <div className="space-y-3">
          {auditRows.map(({ file, checks, missingCount }) => (
            <div key={file.id} className="bg-white rounded-2xl border border-red-100 overflow-hidden">
              {/* File header */}
              <div className="px-5 py-3 bg-red-50/60 flex items-center justify-between gap-3 border-b border-red-100">
                <div className="flex items-center gap-3 min-w-0">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[13px] font-bold text-gray-900 font-mono">{file.file_no}</span>
                    <span className="text-[11px] text-gray-500 ml-2 truncate">{file.customer?.name ?? '—'}</span>
                    <span className="ml-2 text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">
                      {missingCount} eksik
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => navigate(`/files/${file.id}`)}
                    className="h-7 px-3 rounded-lg text-[11px] font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 flex items-center gap-1 transition-colors"
                  >
                    Aç <ChevronRight className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleRevert(file.id)}
                    disabled={fixing === file.id}
                    className="h-7 px-3 rounded-lg text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 flex items-center gap-1 transition-colors disabled:opacity-50"
                  >
                    {fixing === file.id ? (
                      <><span className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" /> Geri alınıyor…</>
                    ) : (
                      <><RotateCcw className="h-3 w-3" /> Teslimat'a Geri Al</>
                    )}
                  </button>
                </div>
              </div>

              {/* Check list */}
              <div className="px-5 py-3 grid grid-cols-2 md:grid-cols-3 gap-2">
                {(Object.entries(checks) as [keyof typeof checks, boolean][]).map(([key, ok]) => (
                  <div key={key} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${ok ? 'bg-green-50' : 'bg-red-50'}`}>
                    {ok
                      ? <CircleCheck className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      : <Circle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    }
                    <span className={`text-[11px] font-semibold ${ok ? 'text-green-700' : 'text-red-600'}`}>
                      {CHECK_LABELS[key]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── API Key List ─────────────────────────────────────────────────────────────
function ApiKeyList() {
  return (
    <div className="space-y-2.5">
      {API_SERVICE_IDS.map((svc) => (
        <ApiKeyRow key={svc.id} service={svc} />
      ))}
    </div>
  );
}

function ApiKeyRow({ service }: { service: typeof API_SERVICE_IDS[number] }) {
  const { t } = useTranslation('settings');
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
      toast.success(t('api.keySaved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await deleteApiKeyFromDb(service.id as ApiService);
      setStored('');
      setEditing(false);
      toast.success(t('api.keyRemoved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
    } finally { setSaving(false); }
  }

  const preview = stored ? stored.slice(0, 8) + '••••••••••••' + stored.slice(-4) : null;
  const name        = t(`api.${service.id}` as `api.${string}`);
  const description = t(`api.${service.id}Desc` as `api.${string}`);
  const placeholder = t(`api.${service.id}Placeholder` as `api.${string}`);

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
              <span className="text-[13px] font-semibold text-gray-800">{name}</span>
              {stored ? (
                <span className="text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-semibold flex items-center gap-1">
                  <Check className="h-2.5 w-2.5" /> {t('api.configured')}
                </span>
              ) : (
                <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-semibold">
                  {t('api.notSet')}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">{description}</p>
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
              {stored ? t('api.btnEdit') : t('api.btnAdd')}
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
              placeholder={placeholder}
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
            {saving ? '…' : t('api.btnSave')}
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
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
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
              <div className="font-bold text-[14px] text-gray-800">{t('users.pagePermissions')}</div>
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
              {t('users.selectAll')}
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-3 h-8 rounded-xl border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {tc('btn.cancel')}
              </button>
              <button
                onClick={save}
                disabled={updatePerms.isPending}
                className="px-3 h-8 rounded-xl bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {updatePerms.isPending ? tc('btn.saving') : tc('btn.save')}
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
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
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
    if (!newEmail || !newPassword || !newName) { toast.error(t('users.errorFillAll')); return; }
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
            <div className="font-bold text-gray-800 mb-1">{t('users.deleteTitle')}</div>
            <p className="text-[12px] text-gray-500 mb-4">{t('users.deleteDesc')}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 h-9 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {tc('btn.cancel')}
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleteUser.isPending}
                className="flex-1 h-9 rounded-xl bg-red-600 text-white text-[13px] font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteUser.isPending ? t('users.deleting') : tc('btn.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-bold text-gray-800">{t('users.userCount', { count: users.length })}</div>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className={`flex items-center gap-1.5 px-3 h-8 rounded-full text-[12px] font-semibold transition-all ${
            showAddForm
              ? 'bg-gray-200 text-gray-700'
              : 'bg-gray-900 text-white hover:bg-gray-800'
          }`}
        >
          {showAddForm
            ? <><X className="h-3.5 w-3.5" /> {tc('btn.cancel')}</>
            : <><UserPlus className="h-3.5 w-3.5" /> {t('users.btnAdd')}</>}
        </button>
      </div>

      {/* Add user form */}
      {showAddForm && (
        <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4">
          <div className="text-[12px] font-bold text-blue-800 mb-3">{t('users.newUser')}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <FieldLabel>{t('users.fullName')}</FieldLabel>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="John Doe" className="h-9 text-sm bg-white" />
            </div>
            <div>
              <FieldLabel>{tc('form.email')}</FieldLabel>
              <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="john@company.com" className="h-9 text-sm bg-white" />
            </div>
            <div>
              <FieldLabel>{t('users.tempPassword')}</FieldLabel>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t('users.tempPasswordPlaceholder')} className="h-9 text-sm bg-white" />
            </div>
            <div>
              <FieldLabel>{t('users.role')}</FieldLabel>
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
            {createUser.isPending ? t('users.creating') : <><Check className="h-3.5 w-3.5" /> {t('users.create')}</>}
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
                    <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 font-medium shrink-0">{t('users.you')}</span>
                  )}
                  <span className={`text-[10px] rounded-full px-2 py-0.5 font-semibold shrink-0 ${
                    u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {u.is_active ? tc('status.active') : tc('status.inactive')}
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
                    title={u.is_active ? t('users.deactivate') : t('users.activate')}
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
                    title={t('users.permissions')}
                    className="w-7 h-7 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 flex items-center justify-center transition-colors"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(u.id)}
                    title={tc('btn.delete')}
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

function BackupEmailCard() {
  const saved = getBackupSettings();
  const [email,    setEmail]    = useState(saved.email);
  const [schedule, setSchedule] = useState<BackupSchedule>(saved.schedule);
  const [lastSent, setLastSent] = useState<string | null>(saved.lastSent);
  const [sending,  setSending]  = useState(false);
  const [saveMsg,  setSaveMsg]  = useState('');

  function handleSave() {
    saveBackupSettings(email, schedule);
    setSaveMsg('Kaydedildi');
    setTimeout(() => setSaveMsg(''), 2000);
  }

  async function handleSendNow() {
    setSending(true);
    try {
      const result = await sendBackupEmail('manual');
      if (result && result.ok) {
        setLastSent(new Date().toISOString());
        toast.success(`Yedek ${email} adresine gönderildi`);
      } else {
        const errMsg = (result && result.error) ? result.error : 'Bilinmeyen hata';
        toast.error(`Gönderilemedi: ${errMsg}`);
      }
    } catch (err) {
      toast.error(`Hata: ${(err as Error).message}`);
    } finally {
      setSending(false);
    }
  }

  const scheduleLabels: Record<BackupSchedule, string> = {
    session_end: 'Her oturum kapandığında',
    daily:       'Günlük (her gün 00:00)',
    manual:      'Manuel (sadece butona basınca)',
  };

  const lastSentFormatted = lastSent
    ? new Date(lastSent).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
    : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <SectionHeader icon={Mail} title="E-posta Yedekleme" description="Yedek dosyası otomatik olarak mail ile gönderilsin" />

      <div className="space-y-3">
        {/* Email input */}
        <div>
          <FieldLabel>Yedek Gönderilecek E-posta</FieldLabel>
          <Input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="ornek@gmail.com"
            className="h-9 text-sm"
          />
        </div>

        {/* Schedule */}
        <div>
          <FieldLabel>Ne Zaman Gönderilsin</FieldLabel>
          <NativeSelect
            value={schedule}
            onChange={e => setSchedule(e.target.value as BackupSchedule)}
            className="h-9 text-sm"
          >
            {(Object.entries(scheduleLabels) as [BackupSchedule, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </NativeSelect>
          {schedule === 'daily' && (
            <p className="text-[11px] text-amber-600 mt-1.5 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Günlük gönderim için Supabase Cron Job kurulumu gerekir — belgeler için destek alın
            </p>
          )}
          {schedule === 'session_end' && (
            <p className="text-[11px] text-gray-400 mt-1.5">
              Tarayıcı/sekme kapatıldığında veya çıkış yapıldığında otomatik gönderilir
            </p>
          )}
        </div>

        {/* Son gönderim */}
        {lastSentFormatted && (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <Clock className="h-3 w-3" />
            Son gönderim: <span className="font-medium text-gray-600">{lastSentFormatted}</span>
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 h-9 rounded-xl bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-800 transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
            {saveMsg || 'Ayarları Kaydet'}
          </button>
          <button
            onClick={handleSendNow}
            disabled={sending}
            className="flex items-center gap-1.5 px-4 h-9 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {sending
              ? <><span className="h-3.5 w-3.5 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />Gönderiliyor…</>
              : <><Mail className="h-3.5 w-3.5" />Şimdi Gönder</>}
          </button>
        </div>

        {/* Setup info */}
        <div className="mt-2 p-3 rounded-xl bg-blue-50 border border-blue-100">
          <p className="text-[11px] font-semibold text-blue-700 mb-1">İlk kurulum için gerekli adımlar:</p>
          <ol className="text-[11px] text-blue-600 space-y-0.5 list-decimal list-inside">
            <li>resend.com → ücretsiz hesap aç → API Key al</li>
            <li className="font-mono">supabase secrets set RESEND_API_KEY=re_xxx</li>
            <li className="font-mono">supabase functions deploy send-backup-email</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function BackupTab() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
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
      {/* Email Backup Settings */}
      <BackupEmailCard />

      {/* Export */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <SectionHeader icon={Download} title={t('backup.exportTitle')} description={t('backup.exportDesc')} />
        <button
          onClick={handleExport}
          disabled={exportStatus === 'loading'}
          className="flex items-center gap-2 px-4 h-9 rounded-xl bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {exportStatus === 'loading'
            ? <><span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />{t('backup.exporting')}</>
            : <><Download className="h-3.5 w-3.5" />{t('backup.btnDownload')}</>}
        </button>
        {exportStatus === 'success' && (
          <p className="flex items-center gap-1.5 mt-3 text-[12px] text-emerald-600 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" /> {t('backup.exportSuccess')}
          </p>
        )}
        {exportStatus === 'error' && (
          <p className="flex items-center gap-1.5 mt-3 text-[12px] text-red-500 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> {t('backup.exportError')}
          </p>
        )}
        <p className="text-[11px] text-gray-400 mt-3">{t('backup.exportIncludes')}</p>
      </div>

      {/* Restore */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <SectionHeader icon={RotateCcw} title={t('backup.restoreTitle')} description={t('backup.restoreDesc')} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={restoreStatus === 'loading'}
          className="flex items-center gap-2 px-4 h-9 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {restoreStatus === 'loading'
            ? <><span className="h-3.5 w-3.5 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />{t('backup.restoring')}</>
            : <><RotateCcw className="h-3.5 w-3.5" />{t('backup.btnSelect')}</>}
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
        <p className="text-[11px] text-gray-400 mt-3">{t('backup.restoreWarning')}</p>
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
                <div className="text-[14px] font-bold text-gray-800 mb-1">{t('backup.confirmTitle')}</div>
                <p className="text-[12px] text-gray-500">
                  {t('backup.confirmDesc', { filename: pendingFile?.name ?? '' })}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setConfirmRestore(false); setPendingFile(null); }}
                className="flex-1 h-9 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {tc('btn.cancel')}
              </button>
              <button
                onClick={handleRestore}
                className="flex-1 h-9 rounded-xl bg-amber-500 text-white text-[13px] font-semibold hover:bg-amber-600 transition-colors"
              >
                {t('backup.confirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
