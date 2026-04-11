import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/supabase';
import { journalService } from '@/services/journalService';
import { useTransactions, useInfiniteTransactions, useTransactionSummary, useDeleteTransaction } from '@/hooks/useTransactions';
import { useSaleInvoices, useDeleteInvoice } from '@/hooks/useDocuments';
import { useSettings, useBankAccounts } from '@/hooks/useSettings';
import { useAuth } from '@/hooks/useAuth';
import { canWriteTransactions, isAdmin } from '@/lib/permissions';
import { fDate, fCurrency, fUSD, fN } from '@/lib/formatters';
import { printInvoice, printReceipt, printTransactionInvoice } from '@/lib/printDocument';
import type { TransactionType, PaymentStatus } from '@/types/enums';
import type { Transaction, Invoice } from '@/types/database';
import { TransactionModal } from '@/components/accounting/TransactionModal';
import { KasaManager } from '@/components/accounting/KasaManager';
import { BankAccountManager } from '@/components/accounting/BankAccountManager';
import { InvoiceModal } from '@/components/documents/InvoiceModal';
import { PurchaseInvoiceModal } from '@/components/accounting/PurchaseInvoiceModal';
import { ServiceInvoiceModal } from '@/components/accounting/ServiceInvoiceModal';
import { NativeSelect } from '@/components/ui/form-elements';
import { Badge } from '@/components/ui/form-elements';
import { LoadingSpinner } from '@/components/ui/shared';
import { DocStatusBadge } from '@/components/ui/DocStatusBadge';
import { ApprovalActions } from '@/components/ui/ApprovalActions';
import { useTheme } from '@/contexts/ThemeContext';
import {
  TrendingUp, TrendingDown, DollarSign, Wallet, BarChart2,
  Printer, Pencil, Trash2, Plus, Search, AlertTriangle, BookCheck,
} from 'lucide-react';

type AccTab = 'all' | 'buy' | 'svc' | 'sale' | 'cash' | 'ayarlar';

const TYPE_COLORS: Record<string, string> = {
  purchase_inv: '#f59e0b',
  svc_inv:      '#8b5cf6',
  sale_inv:     '#10b981',
  receipt:      '#0ea5e9',
  payment:      '#ef4444',
  expense:      '#f97316',
};

function KpiCard({ label, value, icon, color, sub }: {
  label: string; value: string; icon: React.ReactNode; color: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + '18' }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">{label}</div>
        <div className="text-[15px] font-black text-gray-900 truncate">{value}</div>
        {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ─── Mobile transaction card ───────────────────────────────────────────────────
function TxnCard({ t, writable, admin, settings, onEdit, onDelete, onPrint, selected, onSelect }: {
  t: Transaction; writable: boolean; admin: boolean;
  settings: any; onEdit: () => void; onDelete: () => void; onPrint: () => void;
  selected?: boolean; onSelect?: () => void;
}) {
  const { t: tc } = useTranslation('common');
  const typeColor = TYPE_COLORS[t.transaction_type] ?? '#6b7280';
  const partyName = t.customer?.name ?? t.supplier?.name ?? t.service_provider?.name ?? t.party_name ?? '—';
  const isDraft = (t.doc_status ?? 'draft') !== 'approved';

  return (
    <div className={`px-4 py-3 flex items-center gap-3 ${selected ? 'bg-blue-50/60' : ''}`}>
      {/* Checkbox */}
      {onSelect && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={onSelect}
          onClick={e => e.stopPropagation()}
          className="w-4 h-4 rounded accent-red-600 shrink-0 cursor-pointer"
        />
      )}
      {/* Type dot */}
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: typeColor + '18' }}>
        <DollarSign className="h-4 w-4" style={{ color: typeColor }} />
      </div>
      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-bold text-gray-900 truncate">{partyName}</span>
        </div>
        <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span className="font-mono">{t.trade_file?.file_no ?? '—'}</span>
          <span>·</span>
          <Badge variant={t.transaction_type as TransactionType} className="text-[9px] px-1.5 py-0">
            {tc('txType.' + t.transaction_type)}
          </Badge>
        </div>
        {t.description && (
          <div className="text-[10px] text-gray-400 truncate mt-0.5">{t.description}</div>
        )}
      </div>
      {/* Amount + status */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[13px] font-bold text-gray-900">{fUSD(t.amount_usd ?? t.amount)}</span>
        {t.currency !== 'USD' && (
          <span className="text-[10px] text-gray-400 tabular-nums">{fCurrency(t.amount, t.currency)}</span>
        )}
        <Badge variant={t.payment_status as PaymentStatus} className="text-[9px] px-1.5 py-0">
          {tc('payStatus.' + t.payment_status)}
        </Badge>
      </div>
      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0 ml-1">
        <ApprovalActions table="transactions" id={t.id} currentStatus={t.doc_status ?? 'draft'} />
        {settings && (
          <button onClick={onPrint} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <Printer className="h-3.5 w-3.5" />
          </button>
        )}
        {writable && isDraft && (
          <button onClick={onEdit} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {admin && isDraft && (
          <button onClick={onDelete} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function AccountingPage() {
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const { profile } = useAuth();
  const writable = canWriteTransactions(profile?.role);
  const admin = isAdmin(profile?.role);
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';

  const TABS: { key: AccTab; label: string }[] = [
    { key: 'all',     label: t('tabs.all') },
    { key: 'buy',     label: t('tabs.purchases') },
    { key: 'svc',     label: t('tabs.services') },
    { key: 'sale',    label: t('tabs.saleInvoices') },
    { key: 'cash',    label: t('tabs.cashFlow') },
    { key: 'ayarlar', label: 'Ayarlar' },
  ];

  const location = useLocation();
  const [activeTab, setActiveTab] = useState<AccTab>(() => {
    const t = (location.state as { tab?: string } | null)?.tab;
    return (['all','buy','svc','sale','cash','ayarlar'].includes(t ?? '') ? t : 'all') as AccTab;
  });
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  // 'all' tab loads everything at once (for client-side search)
  // buy / svc / cash / sale tabs use paginated infinite loading
  const isPaginatedTab = activeTab === 'buy' || activeTab === 'svc' || activeTab === 'cash';
  const paginatedFilters = {
    tab: activeTab as 'buy' | 'svc' | 'cash',
    type: typeFilter as TransactionType | undefined || undefined,
    status: statusFilter as PaymentStatus | undefined || undefined,
  };
  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: infiniteLoading,
  } = useInfiniteTransactions(paginatedFilters);

  const { data: allTxns = [], isLoading: allLoading } = useTransactions(
    activeTab === 'all' ? {
      type: typeFilter as TransactionType | undefined || undefined,
      status: statusFilter as PaymentStatus | undefined || undefined,
    } : undefined,
  );

  const isLoading = isPaginatedTab ? infiniteLoading : allLoading;
  const txns = useMemo(() => {
    if (isPaginatedTab) return infiniteData?.pages.flatMap(p => p.data) ?? [];
    return allTxns;
  }, [isPaginatedTab, infiniteData, allTxns]);
  const totalCount = isPaginatedTab ? (infiniteData?.pages[0]?.count ?? 0) : txns.length;

  // sale_inv transactions (advance receivables) shown separately in sale tab
  const { data: saleInvTxns = [] } = useTransactions(
    activeTab === 'sale' ? { tab: 'sale' } : undefined,
  );
  const { data: summary } = useTransactionSummary();
  const { data: settings } = useSettings();
  const { data: bankAccounts } = useBankAccounts();
  const defaultBank = bankAccounts?.find(b => b.is_default) ?? bankAccounts?.[0] ?? null;

  const [txnModalOpen, setTxnModalOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [pendingTxnType, setPendingTxnType] = useState<string | undefined>(undefined);
  const deleteTxn = useDeleteTransaction();

  const { data: saleInvoices = [] } = useSaleInvoices();
  const deleteInvoice = useDeleteInvoice();
  const [editingSaleInv, setEditingSaleInv] = useState<Invoice | null>(null);
  const [saleInvModalOpen, setSaleInvModalOpen] = useState(false);
  const [purchaseInvModalOpen, setPurchaseInvModalOpen] = useState(false);
  const [editingPurchaseInv, setEditingPurchaseInv] = useState<Transaction | null>(null);
  const [svcInvModalOpen, setSvcInvModalOpen] = useState(false);
  const [editingSvcInv, setEditingSvcInv] = useState<Transaction | null>(null);

  // ── Bulk selection ─────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteInput, setBulkDeleteInput] = useState('');

  // Reset selection when tab changes
  useEffect(() => { setSelectedIds(new Set()); }, [activeTab]);

  const tabDefaultType: Record<AccTab, string | undefined> = {
    all: undefined, buy: 'purchase_inv', svc: 'svc_inv', sale: undefined, cash: 'receipt', ayarlar: undefined,
  };

  // ── Unposted advances ──────────────────────────────────────────────────────
  const qc = useQueryClient();
  const [postingId, setPostingId] = useState<string | null>(null);

  // Customer advance: sale_inv not yet posted
  const { data: unpostedAdvances = [] } = useQuery({
    queryKey: ['unposted-advances'],
    enabled: activeTab === 'sale',
    queryFn: async () => {
      const { data: files } = await supabase
        .from('trade_files')
        .select('id, file_no, advance_rate, selling_price, tonnage_mt, currency, sale_currency, customer_id, customer:customers!customer_id(id, name)')
        .eq('status', 'sale')
        .gt('advance_rate', 0);
      if (!files?.length) return [];
      const { data: posted } = await supabase
        .from('transactions')
        .select('trade_file_id')
        .eq('transaction_type', 'advance')
        .eq('party_type', 'customer')
        .in('trade_file_id', files.map((f: any) => f.id));
      const postedIds = new Set((posted ?? []).map((p: any) => p.trade_file_id));
      return files.filter((f: any) => !postedIds.has(f.id));
    },
  });

  // Supplier advance: obligations with party=supplier & type=advance not yet posted
  const { data: unpostedSupplierAdvances = [] } = useQuery({
    queryKey: ['unposted-supplier-advances'],
    enabled: activeTab === 'buy',
    queryFn: async () => {
      // 1. Get all supplier advance obligations
      const { data: obs } = await supabase
        .from('trade_obligations')
        .select(`
          id, amount, currency, supplier_id, trade_file_id,
          trade_file:trade_files!trade_file_id(id, file_no, status),
          supplier:suppliers!supplier_id(id, name)
        `)
        .eq('party', 'supplier')
        .eq('type', 'advance')
        .neq('status', 'cancelled');
      if (!obs?.length) return [];

      const fileIds = [...new Set(obs.map((o: any) => o.trade_file_id))];

      // 2. Get already-posted supplier advance transactions for these files
      const { data: posted } = await supabase
        .from('transactions')
        .select('trade_file_id')
        .eq('transaction_type', 'advance')
        .eq('party_type', 'supplier')
        .in('trade_file_id', fileIds);

      const postedIds = new Set((posted ?? []).map((p: any) => p.trade_file_id));

      // 3. Return unposted ones (one per file — use largest obligation per file)
      const byFile = new Map<string, any>();
      for (const ob of obs) {
        const fid = ob.trade_file_id;
        if (postedIds.has(fid)) continue;
        if (!byFile.has(fid) || ob.amount > byFile.get(fid).amount) {
          byFile.set(fid, ob);
        }
      }
      return Array.from(byFile.values());
    },
  });

  async function postAdvance(file: any) {
    const rate    = Number(file.advance_rate ?? 0);
    const selling = Number(file.selling_price ?? 0);
    const tonnage = Number(file.tonnage_mt ?? 0);
    const amount  = Math.round(selling * tonnage * rate / 100 * 100) / 100;
    if (!amount || !file.customer_id) return;
    setPostingId(file.id);
    try {
      await journalService.postAdvanceReceivable({
        tradeFileId:  file.id,
        fileNo:       file.file_no,
        customerId:   file.customer_id,
        customerName: (file.customer as any)?.name ?? '',
        amount,
        currency:     file.sale_currency ?? file.currency ?? 'USD',
        advanceRate:  rate,
      });
      qc.invalidateQueries({ queryKey: ['unposted-advances'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    } finally {
      setPostingId(null);
    }
  }

  async function postSupplierAdvance(ob: any) {
    // ob is a trade_obligation row with trade_file and supplier joined
    const fileId   = ob.trade_file_id;
    const fileNo   = (ob.trade_file as any)?.file_no ?? ob.trade_file_id;
    const amount   = Number(ob.amount ?? 0);
    const currency = ob.currency ?? 'USD';
    if (!amount || !ob.supplier_id) return;
    setPostingId(fileId + '_sup');
    try {
      await journalService.postAdvancePayable({
        tradeFileId:  fileId,
        fileNo,
        supplierId:   ob.supplier_id,
        supplierName: (ob.supplier as any)?.name ?? '',
        amount,
        currency,
        advanceRate:  0, // obligation amount already exact, rate not needed
      });
      qc.invalidateQueries({ queryKey: ['unposted-supplier-advances'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    } finally {
      setPostingId(null);
    }
  }

  function openNew() { setEditingTxn(null); setTxnModalOpen(true); }
  function openEdit(txn: Transaction) {
    if (txn.transaction_type === 'purchase_inv') {
      setEditingPurchaseInv(txn);
      setPurchaseInvModalOpen(true);
    } else if (txn.transaction_type === 'svc_inv') {
      setEditingSvcInv(txn);
      setSvcInvModalOpen(true);
    } else {
      setEditingTxn(txn);
      setTxnModalOpen(true);
    }
  }
  function handleDelete(id: string) {
    if (window.confirm(t('confirm.deleteTransaction'))) deleteTxn.mutate(id);
  }

  function toggleSelectAll(txns: typeof filteredTxns) {
    const allSel = txns.length > 0 && txns.every(tx => selectedIds.has(tx.id));
    if (allSel) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(txns.map(tx => tx.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function executeBulkDelete() {
    if (bulkDeleteInput.trim().toUpperCase() !== 'SIL') return;
    const ids = Array.from(selectedIds);
    setBulkDeleteOpen(false);
    setBulkDeleteInput('');
    setSelectedIds(new Set());
    for (const id of ids) {
      await deleteTxn.mutateAsync(id);
    }
  }

  const filteredTxns = useMemo(() => {
    if (!search.trim()) return txns;
    const q = search.toLowerCase();
    return txns.filter(t =>
      t.trade_file?.file_no?.toLowerCase().includes(q) ||
      (t.customer?.name ?? t.supplier?.name ?? t.service_provider?.name ?? t.party_name ?? '').toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q)
    );
  }, [txns, search]);

  const filteredSaleInvoices = useMemo(() => {
    if (!search.trim()) return saleInvoices;
    const q = search.toLowerCase();
    return saleInvoices.filter(i =>
      i.invoice_no?.toLowerCase().includes(q) ||
      i.trade_file?.file_no?.toLowerCase().includes(q) ||
      i.customer?.name?.toLowerCase().includes(q)
    );
  }, [saleInvoices, search]);

  const allSelected = filteredTxns.length > 0 && filteredTxns.every(tx => selectedIds.has(tx.id));
  const someSelected = selectedIds.size > 0;

  function handleTxnPrint(t: Transaction) {
    if (!settings) return;
    if (t.transaction_type === 'receipt' || t.transaction_type === 'payment') {
      printReceipt(t, settings, (t.doc_status ?? 'draft') !== 'approved');
    } else if (['purchase_inv', 'svc_inv', 'sale_inv'].includes(t.transaction_type)) {
      printTransactionInvoice(t, settings, (t.doc_status ?? 'draft') !== 'approved');
    }
  }

  // isLoading = no cached data + fetching. isFetching = any in-flight fetch.
  // Only block on true first-load (no data at all). Refetch happens in background.
  if (isLoading && !txns.length) return <LoadingSpinner />;

  const profit = (summary?.totalRevenue ?? 0) - (summary?.totalCost ?? 0);

  return (
    <div className="-mx-4 md:mx-0 min-h-screen bg-gray-50 pb-28 md:pb-8">
      <div className="px-3 md:px-0 space-y-4">

        {/* ── KPI Row ──────────────────────────────────────────────────── */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-3 md:pt-0">
            <KpiCard label={t('kpi.receivable')}  value={fUSD(summary.totalReceivable)} icon={<TrendingUp className="h-4 w-4"/>}   color="#0ea5e9" />
            <KpiCard label={t('kpi.payable')}     value={fUSD(summary.totalPayable)}    icon={<TrendingDown className="h-4 w-4"/>} color="#ef4444" />
            <KpiCard label={t('kpi.revenue')}     value={fUSD(summary.totalRevenue)}    icon={<BarChart2 className="h-4 w-4"/>}    color="#10b981" />
            <KpiCard label={t('kpi.costs')}       value={fUSD(summary.totalCost)}       icon={<Wallet className="h-4 w-4"/>}       color="#f59e0b" />
            <KpiCard
              label={t('kpi.profitLoss')}
              value={fUSD(profit)}
              icon={profit >= 0 ? <TrendingUp className="h-4 w-4"/> : <TrendingDown className="h-4 w-4"/>}
              color={profit >= 0 ? '#10b981' : '#ef4444'}
              sub={profit >= 0 ? tc('status.profitable') : tc('status.loss')}
            />
          </div>
        )}


        {/* ── Toolbar ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto scrollbar-none">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`shrink-0 px-4 h-8 rounded-xl text-[12px] font-semibold transition-all whitespace-nowrap ${
                  activeTab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 hidden md:block" />

          {/* Type + Status filters — desktop only */}
          {activeTab !== 'sale' && activeTab !== 'ayarlar' && (
            <div className="hidden md:flex items-center gap-2">
              <NativeSelect className="h-9 rounded-xl border-gray-200 text-[12px] w-44" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="">{t('filters.allTypes')}</option>
                {(['svc_inv','purchase_inv','receipt','payment','sale_inv','advance'] as const).map(k => <option key={k} value={k}>{tc('txType.' + k)}</option>)}
              </NativeSelect>
              <NativeSelect className="h-9 rounded-xl border-gray-200 text-[12px] w-40" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">{t('filters.allStatuses')}</option>
                {(['open','partial','paid'] as const).map(k => <option key={k} value={k}>{tc('payStatus.' + k)}</option>)}
              </NativeSelect>
            </div>
          )}

          {/* Search + Transfer + New Transaction */}
          {activeTab !== 'ayarlar' && (
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="flex items-center gap-2 bg-white rounded-xl px-3 h-9 shadow-sm border border-gray-100 flex-1 md:w-56">
                <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <input
                  className="flex-1 text-[13px] outline-none bg-transparent placeholder:text-gray-400"
                  placeholder={t('filters.search')}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              {writable && (
                <button
                  onClick={() => {
                    if (activeTab === 'sale') {
                      setEditingSaleInv(null);
                      setSaleInvModalOpen(true);
                    } else if (activeTab === 'buy') {
                      setEditingPurchaseInv(null);
                      setPurchaseInvModalOpen(true);
                    } else if (activeTab === 'svc') {
                      setEditingSvcInv(null);
                      setSvcInvModalOpen(true);
                    } else {
                      openNew();
                    }
                  }}
                  title={activeTab === 'sale' ? 'Yeni Satış Faturası' : activeTab === 'buy' ? 'Yeni Satın Alma Faturası' : 'New Transaction'}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm hover:opacity-90 transition-opacity shrink-0"
                  style={{ background: accent }}
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Mobile filters */}
        {activeTab !== 'sale' && activeTab !== 'ayarlar' && (
          <div className="flex md:hidden gap-2">
            <NativeSelect className="flex-1 h-9 rounded-xl border-gray-200 text-[12px]" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">{t('filters.allTypes')}</option>
              {(['svc_inv','purchase_inv','receipt','payment','sale_inv','advance'] as const).map(k => <option key={k} value={k}>{tc('txType.' + k)}</option>)}
            </NativeSelect>
            <NativeSelect className="flex-1 h-9 rounded-xl border-gray-200 text-[12px]" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">{t('filters.allStatuses')}</option>
              {(['open','partial','paid'] as const).map(k => <option key={k} value={k}>{tc('payStatus.' + k)}</option>)}
            </NativeSelect>
          </div>
        )}

        {/* ── Unposted advances banner ──────────────────────────────────── */}
        {activeTab === 'sale' && unpostedAdvances.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-100">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-[12px] font-bold text-amber-700">
                Muhasebeye İşlenmemiş Ön Ödemeler ({unpostedAdvances.length})
              </span>
              <span className="text-[11px] text-amber-500 ml-1">— aşağıdaki butona tıklayarak işleyin</span>
            </div>
            <div className="divide-y divide-amber-100">
              {unpostedAdvances.map((file: any) => {
                const rate   = Number(file.advance_rate ?? 0);
                const amount = Math.round(Number(file.selling_price ?? 0) * Number(file.tonnage_mt ?? 0) * rate / 100 * 100) / 100;
                const cur    = file.sale_currency ?? file.currency ?? 'USD';
                return (
                  <div key={file.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] font-bold font-mono text-gray-700">{file.file_no}</span>
                      <span className="text-[11px] text-gray-500 ml-2">{(file.customer as any)?.name ?? '—'}</span>
                      <span className="text-[11px] text-amber-600 ml-2 font-semibold">
                        %{rate} · {fCurrency(amount, cur)}
                      </span>
                    </div>
                    <button
                      onClick={() => postAdvance(file)}
                      disabled={postingId === file.id}
                      className="flex items-center gap-1.5 h-7 px-3 rounded-xl text-[11px] font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 transition-colors shrink-0"
                    >
                      <BookCheck className="h-3 w-3" />
                      {postingId === file.id ? 'İşleniyor…' : 'Muhasebeye İşle'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Unposted supplier advances banner (Alımlar tab) ───────────── */}
        {activeTab === 'buy' && unpostedSupplierAdvances.length > 0 && (
          <div className="bg-violet-50 border border-violet-200 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-violet-100">
              <AlertTriangle className="h-4 w-4 text-violet-500 shrink-0" />
              <span className="text-[12px] font-bold text-violet-700">
                Muhasebeye İşlenmemiş Satıcı Ön Ödemeleri ({unpostedSupplierAdvances.length})
              </span>
              <span className="text-[11px] text-violet-500 ml-1">— satıcı alacaklı olarak kaydedilecek</span>
            </div>
            <div className="divide-y divide-violet-100">
              {unpostedSupplierAdvances.map((ob: any) => {
                const fileNo  = (ob.trade_file as any)?.file_no ?? ob.trade_file_id;
                const supName = (ob.supplier as any)?.name ?? '—';
                const amount  = Number(ob.amount ?? 0);
                const cur     = ob.currency ?? 'USD';
                const supId   = ob.trade_file_id + '_sup';
                return (
                  <div key={ob.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] font-bold font-mono text-gray-700">{fileNo}</span>
                      <span className="text-[11px] text-gray-500 ml-2">{supName}</span>
                      <span className="text-[11px] text-violet-600 ml-2 font-semibold">
                        {fCurrency(amount, cur)}
                      </span>
                    </div>
                    <button
                      onClick={() => postSupplierAdvance(ob)}
                      disabled={postingId === supId}
                      className="flex items-center gap-1.5 h-7 px-3 rounded-xl text-[11px] font-semibold text-white bg-violet-500 hover:bg-violet-600 disabled:opacity-50 transition-colors shrink-0"
                    >
                      <BookCheck className="h-3 w-3" />
                      {postingId === supId ? 'İşleniyor…' : 'Muhasebeye İşle'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Sale Invoices ─────────────────────────────────────────────── */}
        {activeTab === 'sale' && (
          <>
            {/* Mobile */}
            <div className="md:hidden bg-white rounded-2xl shadow-sm divide-y divide-gray-50 overflow-hidden">
              {filteredSaleInvoices.length === 0 ? (
                <div className="flex flex-col items-center py-14 text-gray-400">
                  <BarChart2 className="h-8 w-8 mb-2 opacity-20" />
                  <p className="text-sm">{t('empty.noSaleInvoices')}</p>
                </div>
              ) : filteredSaleInvoices.map(inv => (
                <div key={inv.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#10b98118' }}>
                    <BarChart2 className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-bold text-gray-900">{inv.invoice_no}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      <span className="font-mono">{inv.trade_file?.file_no ?? '—'}</span>
                      {' · '}{inv.customer?.name ?? '—'}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[13px] font-bold text-emerald-600">{fCurrency(inv.total)}</span>
                    <DocStatusBadge status={inv.doc_status ?? 'draft'} />
                  </div>
                  <div className="flex items-center gap-0.5 ml-1 shrink-0">
                    <ApprovalActions table="invoices" id={inv.id} currentStatus={inv.doc_status ?? 'draft'} />
                    {writable && (inv.doc_status ?? 'draft') !== 'approved' && (
                      <button onClick={() => { setEditingSaleInv(inv); setSaleInvModalOpen(true); }} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {settings && (
                      <button onClick={() => printInvoice(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved')} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                        <Printer className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {admin && (inv.doc_status ?? 'draft') !== 'approved' && (
                      <button onClick={() => { if (window.confirm(t('confirm.deleteSaleInvoice'))) deleteInvoice.mutate(inv.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop — 5 merged columns, no scroll */}
            <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[22%]">Invoice / File</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[21%]">Customer / Date</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[15%]">ADMT / Unit Price</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[16%]">Total / Status</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[26%]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSaleInvoices.length === 0 ? (
                    <tr><td colSpan={5} className="py-14 text-center text-[13px] text-gray-400">{t('empty.noSaleInvoices')}</td></tr>
                  ) : filteredSaleInvoices.map(inv => (
                    <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="text-[13px] font-bold text-emerald-700 truncate">{inv.invoice_no}</div>
                        <div className="text-[11px] font-mono text-gray-400 truncate">{inv.trade_file?.file_no ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-[12px] text-gray-800 truncate">{inv.customer?.name ?? '—'}</div>
                        <div className="text-[11px] text-gray-400">{fDate(inv.invoice_date)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-[12px] font-semibold text-gray-800">{fN(inv.quantity_admt, 3)} MT</div>
                        <div className="text-[11px] text-gray-400">{fCurrency(inv.unit_price)}/MT</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-[13px] font-bold text-emerald-700">{fCurrency(inv.total)}</div>
                        <div className="mt-0.5"><DocStatusBadge status={inv.doc_status ?? 'draft'} /></div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-nowrap">
                          <ApprovalActions table="invoices" id={inv.id} currentStatus={inv.doc_status ?? 'draft'} />
                          {writable && (inv.doc_status ?? 'draft') !== 'approved' && (
                            <button onClick={() => { setEditingSaleInv(inv); setSaleInvModalOpen(true); }} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {settings && (
                            <button onClick={() => printInvoice(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved')} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="Print">
                              <Printer className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {admin && (inv.doc_status ?? 'draft') !== 'approved' && (
                            <button onClick={() => { if (window.confirm(t('confirm.deleteLabel'))) deleteInvoice.mutate(inv.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
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

            {/* ── Advance receivables from transactions table ── */}
            {saleInvTxns.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Ön Ödeme Alacakları
                  </span>
                  <span className="ml-auto text-[10px] text-gray-400">{saleInvTxns.length} kayıt</span>
                </div>
                <table className="w-full table-fixed">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[14%]">Tarih</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[18%]">Dosya / Müşteri</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[28%]">Açıklama</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[16%]">Tutar</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[12%]">Durum</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[12%]">Notlar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saleInvTxns.map(txn => (
                      <tr key={txn.id} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-2.5 text-[12px] text-gray-500">{fDate(txn.transaction_date)}</td>
                        <td className="px-4 py-2.5">
                          <div className="text-[12px] font-mono font-bold text-gray-700 truncate">{txn.trade_file?.file_no ?? txn.reference_no ?? '—'}</div>
                          <div className="text-[11px] text-gray-400 truncate">{txn.customer?.name ?? txn.party_name ?? '—'}</div>
                        </td>
                        <td className="px-4 py-2.5 text-[11px] text-gray-500 truncate">{txn.description || '—'}</td>
                        <td className="px-4 py-2.5">
                          <div className="text-[13px] font-bold text-blue-700">{fUSD(txn.amount_usd ?? txn.amount)}</div>
                          {txn.currency !== 'USD' && (
                            <div className="text-[10px] text-gray-400 tabular-nums">{fCurrency(txn.amount, txn.currency)}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant={txn.payment_status as PaymentStatus}>
                            {tc('payStatus.' + txn.payment_status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-[10px] text-gray-400 truncate">{txn.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Transactions ──────────────────────────────────────────────── */}
        {activeTab !== 'sale' && activeTab !== 'ayarlar' && (
          <>
            {/* Mobile */}
            <div className="md:hidden bg-white rounded-2xl shadow-sm divide-y divide-gray-50 overflow-hidden">
              {filteredTxns.length === 0 ? (
                <div className="flex flex-col items-center py-14 text-gray-400">
                  <BarChart2 className="h-8 w-8 mb-2 opacity-20" />
                  <p className="text-sm">{t('empty.noTransactions')}</p>
                </div>
              ) : filteredTxns.map(t => (
                <TxnCard
                  key={t.id}
                  t={t}
                  writable={writable}
                  admin={admin}
                  settings={settings}
                  onEdit={() => openEdit(t)}
                  onDelete={() => handleDelete(t.id)}
                  onPrint={() => handleTxnPrint(t)}
                  selected={selectedIds.has(t.id)}
                  onSelect={admin && (t.doc_status ?? 'draft') !== 'approved' ? () => toggleSelect(t.id) : undefined}
                />
              ))}
            </div>

            {/* Kayıt sayacı — paginated tablarda göster */}
            {isPaginatedTab && txns.length > 0 && (
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[11px] text-gray-400">
                  {txns.length} / {totalCount} kayıt gösteriliyor
                </span>
              </div>
            )}

            {/* Desktop — responsive register table, no horizontal scroll */}
            <div className="hidden md:block bg-white rounded-2xl shadow-sm">
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[36px]" />
                  <col className="w-[88px]" />
                  <col className="w-[15%]" />
                  <col className="w-[18%]" />
                  <col className="hidden lg:table-column" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col className="w-[72px]" />
                  <col className="w-[76px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="px-2 py-2.5 text-center">
                      {admin && (
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => toggleSelectAll(filteredTxns)}
                          className="w-4 h-4 rounded accent-red-600 cursor-pointer"
                        />
                      )}
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Tarih</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">ID / Dosya</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Firma</th>
                    <th className="hidden lg:table-cell px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Açıklama</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Borç</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Alacak</th>
                    <th className="px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400">Onay</th>
                    <th className="px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredTxns.length === 0 ? (
                    <tr><td colSpan={9} className="py-14 text-center text-[13px] text-gray-400">{t('empty.noTransactions')}</td></tr>
                  ) : filteredTxns.map(txn => {
                    const partyName = txn.customer?.name ?? txn.supplier?.name ?? txn.service_provider?.name ?? txn.party_name ?? '—';
                    const isDraft   = (txn.doc_status ?? 'draft') !== 'approved';
                    const isChecked = selectedIds.has(txn.id);
                    // BORÇ (debit): alacaklar ve ödenen borçlar
                    //   sale_inv              → müşteri bize borçlu
                    //   payment               → satıcıya ödeme yaptık
                    //   advance (customer)    → müşteriden ön ödeme alacağı
                    // ALACAK (credit): borçlar ve gelen tahsilatlar
                    //   purchase_inv / svc_inv → satıcıya borcumuz arttı
                    //   receipt               → müşteri ödedi
                    //   advance (supplier)    → tedarikçiye ön ödeme borcu
                    const isDebit   = ['sale_inv', 'payment'].includes(txn.transaction_type)
                      || (txn.transaction_type === 'advance' && txn.party_type === 'customer');
                    const typeColor = TYPE_COLORS[txn.transaction_type] ?? '#6b7280';
                    return (
                      <tr key={txn.id} className={`hover:bg-blue-50/20 transition-colors ${isChecked ? 'bg-blue-50/40' : isDraft ? 'bg-amber-50/20' : ''}`}>
                        {/* Checkbox */}
                        <td className="px-2 py-3 text-center">
                          {admin && isDraft && (
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelect(txn.id)}
                              className="w-4 h-4 rounded accent-red-600 cursor-pointer"
                            />
                          )}
                        </td>
                        {/* Date */}
                        <td className="px-3 py-3 text-[11px] text-gray-500">{fDate(txn.transaction_date)}</td>
                        {/* ID */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1 min-w-0">
                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: typeColor }} />
                            <span className="text-[11px] font-bold font-mono text-gray-700 truncate">
                              {txn.trade_file?.file_no ?? txn.reference_no ?? '—'}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-400 pl-2.5 mt-0.5 truncate">{tc('txType.' + txn.transaction_type)}</div>
                        </td>
                        {/* Entity */}
                        <td className="px-3 py-3">
                          <div className="text-[12px] text-gray-700 truncate">{partyName}</div>
                          {txn.creator?.full_name && (
                            <div className="text-[10px] text-gray-400 truncate mt-0.5">
                              ↳ {txn.creator.full_name}
                            </div>
                          )}
                        </td>
                        {/* Description — hidden on md, visible on lg */}
                        <td className="hidden lg:table-cell px-3 py-3 text-[11px] text-gray-500 truncate">{txn.description || '—'}</td>
                        {/* Borç */}
                        <td className="px-3 py-3 text-right">
                          {isDebit ? (
                            <div>
                              <div className="text-[12px] font-semibold text-red-600 tabular-nums">{fUSD(txn.amount_usd ?? txn.amount)}</div>
                              {txn.currency !== 'USD' && (
                                <div className="text-[10px] text-gray-400 tabular-nums">{fCurrency(txn.amount, txn.currency)}</div>
                              )}
                            </div>
                          ) : <span className="text-gray-200 text-[11px]">—</span>}
                        </td>
                        {/* Alacak */}
                        <td className="px-3 py-3 text-right">
                          {!isDebit ? (
                            <div>
                              <div className="text-[12px] font-semibold text-emerald-600 tabular-nums">{fUSD(txn.amount_usd ?? txn.amount)}</div>
                              {txn.currency !== 'USD' && (
                                <div className="text-[10px] text-gray-400 tabular-nums">{fCurrency(txn.amount, txn.currency)}</div>
                              )}
                            </div>
                          ) : <span className="text-gray-200 text-[11px]">—</span>}
                        </td>
                        {/* Onay */}
                        <td className="px-2 py-3">
                          <div className="flex items-center justify-center gap-0.5">
                            <ApprovalActions table="transactions" id={txn.id} currentStatus={txn.doc_status ?? 'draft'} />
                          </div>
                        </td>
                        {/* Actions */}
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-0.5 justify-end">
                            {settings && (
                              <button onClick={() => handleTxnPrint(txn)} className="p-1 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Yazdır">
                                <Printer className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {writable && isDraft && (
                              <button onClick={() => openEdit(txn)} className="p-1 rounded-lg text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Düzenle">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {admin && isDraft && (
                              <button onClick={() => handleDelete(txn.id)} className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Sil">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Daha Fazla Yükle ──────────────────────────────────────── */}
            {isPaginatedTab && hasNextPage && (
              <div className="flex flex-col items-center py-4 gap-1">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white shadow-sm disabled:opacity-60 transition-opacity hover:opacity-90"
                  style={{ background: accent }}
                >
                  {isFetchingNextPage
                    ? 'Yükleniyor…'
                    : `Daha Fazla Yükle (${totalCount - txns.length} kaldı)`}
                </button>
              </div>
            )}
            {isPaginatedTab && !hasNextPage && txns.length > 0 && totalCount > 30 && (
              <p className="text-center text-[11px] text-gray-400 py-3">
                Tüm {totalCount} kayıt yüklendi
              </p>
            )}
          </>
        )}

        {/* ── Ayarlar Tab (Kasalar + Banka Hesapları) ──────────────────── */}
        {activeTab === 'ayarlar' && (
          <div className="space-y-4 max-w-3xl">
            <KasaManager />
            <BankAccountManager />
          </div>
        )}

      </div>

      {/* ── Bulk action bar ───────────────────────────────────────────────── */}
      {someSelected && admin && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-gray-900 text-white px-4 py-2.5 rounded-2xl shadow-xl">
            <span className="text-[13px] font-semibold">{selectedIds.size} kayıt seçildi</span>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-[11px] text-gray-400 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-gray-700"
            >
              İptal
            </button>
            <button
              onClick={() => { setBulkDeleteInput(''); setBulkDeleteOpen(true); }}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-[12px] font-semibold transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Toplu Sil
            </button>
          </div>
        </div>
      )}

      {/* ── Bulk delete password dialog ───────────────────────────────────── */}
      {bulkDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <div className="text-[14px] font-bold text-gray-900">Toplu Silme Onayı</div>
                <div className="text-[12px] text-gray-500">{selectedIds.size} kayıt kalıcı olarak silinecek</div>
              </div>
            </div>
            <p className="text-[12px] text-gray-600 mb-3">
              Onaylamak için aşağıya <span className="font-bold text-red-600">SIL</span> yazın:
            </p>
            <input
              type="text"
              value={bulkDeleteInput}
              onChange={e => setBulkDeleteInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') executeBulkDelete(); if (e.key === 'Escape') setBulkDeleteOpen(false); }}
              placeholder="SIL"
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[13px] outline-none focus:border-red-400 mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setBulkDeleteOpen(false); setBulkDeleteInput(''); }}
                className="flex-1 h-9 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={executeBulkDelete}
                disabled={bulkDeleteInput.trim().toUpperCase() !== 'SIL'}
                className="flex-1 h-9 rounded-xl bg-red-600 text-white text-[13px] font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}

      <TransactionModal
        open={txnModalOpen}
        onOpenChange={setTxnModalOpen}
        transaction={editingTxn}
        defaultType={pendingTxnType ?? tabDefaultType[activeTab]}
        onSaleInvRedirect={() => { setEditingSaleInv(null); setSaleInvModalOpen(true); }}
        onPurchaseInvRedirect={() => { setPurchaseInvModalOpen(true); }}
        onSvcInvRedirect={() => { setEditingSvcInv(null); setSvcInvModalOpen(true); }}
      />
      <InvoiceModal
        open={saleInvModalOpen}
        onOpenChange={setSaleInvModalOpen}
        file={editingSaleInv?.trade_file ?? null}
        invoice={editingSaleInv}
        invoiceType="sale"
        onSwitchToTransaction={(type) => {
          setSaleInvModalOpen(false);
          setPendingTxnType(type);
          setEditingTxn(null);
          setTxnModalOpen(true);
        }}
      />
      <PurchaseInvoiceModal
        open={purchaseInvModalOpen}
        onOpenChange={(v) => { setPurchaseInvModalOpen(v); if (!v) setEditingPurchaseInv(null); }}
        transaction={editingPurchaseInv}
        onSwitchToTransaction={(type) => {
          setPurchaseInvModalOpen(false);
          setEditingPurchaseInv(null);
          setPendingTxnType(type);
          setEditingTxn(null);
          setTxnModalOpen(true);
        }}
      />
      <ServiceInvoiceModal
        open={svcInvModalOpen}
        onOpenChange={(v) => { setSvcInvModalOpen(v); if (!v) setEditingSvcInv(null); }}
        transaction={editingSvcInv}
      />
    </div>
  );
}
