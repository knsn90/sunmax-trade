import { useState, useMemo } from 'react';
import { useTransactions, useTransactionSummary, useDeleteTransaction } from '@/hooks/useTransactions';
import { useSaleInvoices, useDeleteInvoice } from '@/hooks/useDocuments';
import { useSettings, useBankAccounts } from '@/hooks/useSettings';
import { useAuth } from '@/hooks/useAuth';
import { canWriteTransactions, isAdmin } from '@/lib/permissions';
import { fDate, fCurrency, fUSD, fN } from '@/lib/formatters';
import { printInvoice, printReceipt, printTransactionInvoice } from '@/lib/printDocument';
import { TRANSACTION_TYPE_LABELS, PAYMENT_STATUS_LABELS } from '@/types/enums';
import type { TransactionType, PaymentStatus } from '@/types/enums';
import type { Transaction, Invoice } from '@/types/database';
import { TransactionModal } from '@/components/accounting/TransactionModal';
import { InvoiceModal } from '@/components/documents/InvoiceModal';
import { NativeSelect } from '@/components/ui/form-elements';
import { Badge } from '@/components/ui/form-elements';
import { LoadingSpinner } from '@/components/ui/shared';
import { DocStatusBadge } from '@/components/ui/DocStatusBadge';
import { ApprovalActions } from '@/components/ui/ApprovalActions';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import {
  TrendingUp, TrendingDown, DollarSign, Wallet, BarChart2,
  Printer, Pencil, Trash2, Plus, Search,
} from 'lucide-react';

type AccTab = 'all' | 'buy' | 'svc' | 'sale' | 'cash';

const TABS: { key: AccTab; label: string }[] = [
  { key: 'all',  label: 'All' },
  { key: 'buy',  label: 'Purchases' },
  { key: 'svc',  label: 'Services' },
  { key: 'sale', label: 'Sale Invoices' },
  { key: 'cash', label: 'Cash Flow' },
];

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
function TxnCard({ t, writable, admin, settings, onEdit, onDelete, onPrint }: {
  t: Transaction; writable: boolean; admin: boolean;
  settings: any; onEdit: () => void; onDelete: () => void; onPrint: () => void;
}) {
  const typeColor = TYPE_COLORS[t.transaction_type] ?? '#6b7280';
  const partyName = t.customer?.name ?? t.supplier?.name ?? t.service_provider?.name ?? t.party_name ?? '—';
  const remaining = t.amount - (t.paid_amount ?? 0);
  const isDraft = (t.doc_status ?? 'draft') !== 'approved';

  return (
    <div className="px-4 py-3 flex items-center gap-3">
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
            {TRANSACTION_TYPE_LABELS[t.transaction_type]}
          </Badge>
        </div>
        {t.description && (
          <div className="text-[10px] text-gray-400 truncate mt-0.5">{t.description}</div>
        )}
      </div>
      {/* Amount + status */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[13px] font-bold text-gray-900">{fCurrency(t.amount, t.currency)}</span>
        {remaining > 0 && remaining < t.amount && (
          <span className="text-[10px] text-amber-500 font-semibold">rem {fCurrency(remaining, t.currency)}</span>
        )}
        <Badge variant={t.payment_status as PaymentStatus} className="text-[9px] px-1.5 py-0">
          {PAYMENT_STATUS_LABELS[t.payment_status]}
        </Badge>
      </div>
      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0 ml-1">
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
  const { profile } = useAuth();
  const writable = canWriteTransactions(profile?.role);
  const admin = isAdmin(profile?.role);
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';

  const [activeTab, setActiveTab] = useState<AccTab>('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const txnTab = activeTab === 'sale' ? 'all' : activeTab;
  const { data: txns = [], isLoading } = useTransactions({
    tab: txnTab,
    type: typeFilter as TransactionType | undefined || undefined,
    status: statusFilter as PaymentStatus | undefined || undefined,
  });
  const { data: summary } = useTransactionSummary();
  const { data: settings } = useSettings();
  const { data: bankAccounts } = useBankAccounts();
  const defaultBank = bankAccounts?.find(b => b.is_default) ?? bankAccounts?.[0] ?? null;

  const [txnModalOpen, setTxnModalOpen] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const deleteTxn = useDeleteTransaction();

  const { data: saleInvoices = [] } = useSaleInvoices();
  const deleteInvoice = useDeleteInvoice();
  const [editingSaleInv, setEditingSaleInv] = useState<Invoice | null>(null);
  const [saleInvModalOpen, setSaleInvModalOpen] = useState(false);

  const tabDefaultType: Record<AccTab, string | undefined> = {
    all: undefined, buy: 'purchase_inv', svc: 'svc_inv', sale: undefined, cash: 'receipt',
  };

  function openNew() { setEditingTxn(null); setTxnModalOpen(true); }
  function openEdit(txn: Transaction) { setEditingTxn(txn); setTxnModalOpen(true); }
  function handleDelete(id: string) {
    if (window.confirm('Delete this transaction? This cannot be undone.')) deleteTxn.mutate(id);
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

  function handleTxnPrint(t: Transaction) {
    if (!settings) return;
    if (t.transaction_type === 'receipt' || t.transaction_type === 'payment') {
      printReceipt(t, settings, (t.doc_status ?? 'draft') !== 'approved');
    } else if (['purchase_inv', 'svc_inv', 'sale_inv'].includes(t.transaction_type)) {
      printTransactionInvoice(t, settings, (t.doc_status ?? 'draft') !== 'approved');
    }
  }

  if (isLoading) return <LoadingSpinner />;

  const profit = (summary?.totalRevenue ?? 0) - (summary?.totalCost ?? 0);

  return (
    <div className="-mx-4 md:mx-0 min-h-screen bg-gray-50 pb-28 md:pb-8">
      <div className="px-3 md:px-0 space-y-4">

        {/* ── KPI Row ──────────────────────────────────────────────────── */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-3 md:pt-0">
            <KpiCard label="Receivable"  value={fUSD(summary.totalReceivable)} icon={<TrendingUp className="h-4 w-4"/>}   color="#0ea5e9" />
            <KpiCard label="Payable"     value={fUSD(summary.totalPayable)}    icon={<TrendingDown className="h-4 w-4"/>} color="#ef4444" />
            <KpiCard label="Revenue"     value={fUSD(summary.totalRevenue)}    icon={<BarChart2 className="h-4 w-4"/>}    color="#10b981" />
            <KpiCard label="Costs"       value={fUSD(summary.totalCost)}       icon={<Wallet className="h-4 w-4"/>}       color="#f59e0b" />
            <KpiCard
              label="Profit / Loss"
              value={fUSD(profit)}
              icon={profit >= 0 ? <TrendingUp className="h-4 w-4"/> : <TrendingDown className="h-4 w-4"/>}
              color={profit >= 0 ? '#10b981' : '#ef4444'}
              sub={profit >= 0 ? 'Profitable' : 'Loss'}
            />
          </div>
        )}

        {/* ── Toolbar ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tabs — pill style */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  'shrink-0 px-3.5 h-8 rounded-full text-[12px] font-bold transition-all whitespace-nowrap',
                  activeTab === t.key ? 'text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300',
                )}
                style={activeTab === t.key ? { background: accent } : {}}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 hidden md:block" />

          {/* Search */}
          <div className="flex items-center gap-2 bg-white rounded-xl px-3 h-9 shadow-sm border border-gray-100 w-full md:w-56">
            <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <input
              className="flex-1 text-[13px] outline-none bg-transparent placeholder:text-gray-400"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Type + Status filters — desktop only */}
          {activeTab !== 'sale' && (
            <div className="hidden md:flex items-center gap-2">
              <NativeSelect className="h-9 rounded-xl border-gray-200 text-[12px] w-44" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="">All Types</option>
                {Object.entries(TRANSACTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
              <NativeSelect className="h-9 rounded-xl border-gray-200 text-[12px] w-40" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
            </div>
          )}

          {/* New Transaction btn */}
          {writable && (
            <button
              onClick={openNew}
              className="h-9 px-4 rounded-xl text-white text-[13px] font-semibold shadow-sm hover:opacity-90 transition-opacity whitespace-nowrap flex items-center gap-1.5"
              style={{ background: accent }}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden md:inline">New Transaction</span>
            </button>
          )}
        </div>

        {/* Mobile filters */}
        {activeTab !== 'sale' && (
          <div className="flex md:hidden gap-2">
            <NativeSelect className="flex-1 h-9 rounded-xl border-gray-200 text-[12px]" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">All Types</option>
              {Object.entries(TRANSACTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
            <NativeSelect className="flex-1 h-9 rounded-xl border-gray-200 text-[12px]" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
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
                  <p className="text-sm">No sale invoices yet</p>
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
                      <button onClick={() => { if (window.confirm('Delete sale invoice?')) deleteInvoice.mutate(inv.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
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
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[22%]">Customer / Date</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[16%]">ADMT / Unit Price</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[18%]">Total / Status</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[22%]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSaleInvoices.length === 0 ? (
                    <tr><td colSpan={5} className="py-14 text-center text-[13px] text-gray-400">No sale invoices yet</td></tr>
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
                        <div className="flex items-center gap-1 flex-wrap">
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
                            <button onClick={() => { if (window.confirm('Delete?')) deleteInvoice.mutate(inv.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
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
          </>
        )}

        {/* ── Transactions ──────────────────────────────────────────────── */}
        {activeTab !== 'sale' && (
          <>
            {/* Mobile */}
            <div className="md:hidden bg-white rounded-2xl shadow-sm divide-y divide-gray-50 overflow-hidden">
              {filteredTxns.length === 0 ? (
                <div className="flex flex-col items-center py-14 text-gray-400">
                  <BarChart2 className="h-8 w-8 mb-2 opacity-20" />
                  <p className="text-sm">No transactions found</p>
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
                />
              ))}
            </div>

            {/* Desktop — 6 merged columns, no scroll */}
            <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[18%]">Type / Date</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[20%]">File / Party</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[18%]">Description</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[16%]">Amount / Remaining</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[14%]">Status</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[14%]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTxns.length === 0 ? (
                    <tr><td colSpan={6} className="py-14 text-center text-[13px] text-gray-400">No transactions found</td></tr>
                  ) : filteredTxns.map(t => {
                    const remaining = t.amount - (t.paid_amount ?? 0);
                    const partyName = t.customer?.name ?? t.supplier?.name ?? t.service_provider?.name ?? t.party_name ?? '—';
                    const typeColor = TYPE_COLORS[t.transaction_type] ?? '#6b7280';
                    const isDraft = (t.doc_status ?? 'draft') !== 'approved';
                    return (
                      <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                        {/* Type + Date */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: typeColor }} />
                            <Badge variant={t.transaction_type as TransactionType}>
                              {TRANSACTION_TYPE_LABELS[t.transaction_type]}
                            </Badge>
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5 pl-3">{fDate(t.transaction_date)}</div>
                        </td>
                        {/* File + Party */}
                        <td className="px-4 py-3">
                          <div className="text-[12px] font-mono font-bold text-gray-700 truncate">{t.trade_file?.file_no ?? '—'}</div>
                          <div className="text-[11px] text-gray-500 truncate">{partyName}</div>
                        </td>
                        {/* Description */}
                        <td className="px-4 py-3 text-[11px] text-gray-500 truncate">{t.description || '—'}</td>
                        {/* Amount + Remaining */}
                        <td className="px-4 py-3">
                          <div className="text-[13px] font-bold text-gray-900">{fCurrency(t.amount, t.currency)}</div>
                          {remaining > 0 && remaining < t.amount && (
                            <div className="text-[10px] text-amber-500 font-semibold">rem {fCurrency(remaining, t.currency)}</div>
                          )}
                        </td>
                        {/* Pay + Doc status */}
                        <td className="px-4 py-3">
                          <Badge variant={t.payment_status as PaymentStatus}>{PAYMENT_STATUS_LABELS[t.payment_status]}</Badge>
                          <div className="mt-1"><DocStatusBadge status={t.doc_status ?? 'draft'} /></div>
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 flex-wrap">
                            <ApprovalActions table="transactions" id={t.id} currentStatus={t.doc_status ?? 'draft'} />
                            {settings && (
                              <button onClick={() => handleTxnPrint(t)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="Print">
                                <Printer className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {writable && isDraft && (
                              <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {admin && isDraft && (
                              <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
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
          </>
        )}

      </div>

      <TransactionModal
        open={txnModalOpen}
        onOpenChange={setTxnModalOpen}
        transaction={editingTxn}
        defaultType={tabDefaultType[activeTab]}
      />
      <InvoiceModal
        open={saleInvModalOpen}
        onOpenChange={setSaleInvModalOpen}
        file={editingSaleInv?.trade_file ?? null}
        invoice={editingSaleInv}
        invoiceType="sale"
      />
    </div>
  );
}
