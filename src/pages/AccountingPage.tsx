import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/form-elements';
import { Badge } from '@/components/ui/form-elements';
import { LoadingSpinner, EmptyState } from '@/components/ui/shared';
import { DocStatusBadge } from '@/components/ui/DocStatusBadge';
import { ApprovalActions } from '@/components/ui/ApprovalActions';

type AccTab = 'all' | 'buy' | 'svc' | 'sale' | 'cash';

const TAB_LABELS: Record<AccTab, string> = {
  all: 'All',
  buy: 'Purchase Invoices',
  svc: 'Service Invoices',
  sale: 'Sale Invoices',
  cash: 'Cash Flow',
};

export function AccountingPage() {
  const { profile } = useAuth();
  const writable = canWriteTransactions(profile?.role);
  const admin = isAdmin(profile?.role);

  const [activeTab, setActiveTab] = useState<AccTab>('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

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
    all: undefined,
    buy: 'purchase_inv',
    svc: 'svc_inv',
    sale: undefined,
    cash: 'receipt',
  };

  function openNew() {
    setEditingTxn(null);
    setTxnModalOpen(true);
  }

  function openEdit(txn: Transaction) {
    setEditingTxn(txn);
    setTxnModalOpen(true);
  }

  function handleDelete(id: string) {
    if (window.confirm('Delete this transaction? This cannot be undone.')) {
      deleteTxn.mutate(id);
    }
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      {/* Action bar */}
      {writable && (
        <div className="flex justify-end mb-6">
          <Button onClick={openNew} className="bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-sm">
            + New Transaction
          </Button>
        </div>
      )}

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Receivable',   value: fUSD(summary.totalReceivable),                    icon: '👆', color: 'blue',   featured: true },
            { label: 'Payable',      value: fUSD(summary.totalPayable),                       icon: '👇', color: 'red',    featured: false },
            { label: 'Revenue',      value: fUSD(summary.totalRevenue),                       icon: '📈', color: 'green',  featured: false },
            { label: 'Costs',        value: fUSD(summary.totalCost),                          icon: '📉', color: 'amber',  featured: false },
            {
              label: 'Profit / Loss',
              value: fUSD(summary.totalRevenue - summary.totalCost),
              icon: summary.totalRevenue - summary.totalCost >= 0 ? '✅' : '🔴',
              color: summary.totalRevenue - summary.totalCost >= 0 ? 'green' : 'red',
              featured: false,
            },
          ].map((card) => (
            card.featured ? (
              <div key={card.label} className="rounded-2xl p-4 text-white shadow-md col-span-2 sm:col-span-1" style={{ background: '#7f1d1d' }}>
                <div className="text-[10px] font-bold uppercase tracking-wide text-white/60 mb-1">{card.label}</div>
                <div className="text-xl font-black">{card.value}</div>
              </div>
            ) : (
              <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">{card.label}</div>
                <div className="text-base font-black text-gray-900">{card.value}</div>
              </div>
            )
          ))}
        </div>
      )}

      {/* Tabs — Donezo underline style */}
      <div className="flex gap-1 border-b border-gray-200 mb-4 overflow-x-auto">
        {(Object.entries(TAB_LABELS) as [AccTab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              activeTab === key
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="flex gap-2.5 flex-wrap items-center">
          <NativeSelect className="w-full sm:w-[180px]" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            {Object.entries(TRANSACTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
          <NativeSelect className="w-full sm:w-[150px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
        </div>
      </div>

      {/* Sale Invoices Tab */}
      {activeTab === 'sale' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Invoice No', 'File', 'Customer', 'Date', 'ADMT', 'Unit Price', 'Total', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {saleInvoices.length === 0 ? (
                  <tr><td colSpan={8}><EmptyState message="No sale invoices yet" /></td></tr>
                ) : (
                  saleInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-2.5 py-2 text-xs font-bold border-b border-gray-50 text-green-700">{inv.invoice_no}</td>
                      <td className="px-2.5 py-2 text-xs border-b border-gray-50">{inv.trade_file?.file_no ?? '—'}</td>
                      <td className="px-2.5 py-2 text-xs border-b border-gray-50">{inv.customer?.name ?? '—'}</td>
                      <td className="px-2.5 py-2 text-[10px] text-muted-foreground border-b border-gray-50">{fDate(inv.invoice_date)}</td>
                      <td className="px-2.5 py-2 text-xs border-b border-gray-50">{fN(inv.quantity_admt, 3)}</td>
                      <td className="px-2.5 py-2 text-xs border-b border-gray-50">{fCurrency(inv.unit_price)}</td>
                      <td className="px-2.5 py-2 text-right font-semibold text-xs border-b border-gray-50 text-green-700">{fCurrency(inv.total)}</td>
                      <td className="px-2.5 py-2 border-b border-gray-50">
                        <DocStatusBadge status={inv.doc_status ?? 'draft'} />
                      </td>
                      <td className="px-2.5 py-2 border-b border-gray-50">
                        <div className="flex gap-1 flex-wrap">
                          <ApprovalActions table="invoices" id={inv.id} currentStatus={inv.doc_status ?? 'draft'} />
                          {writable && (inv.doc_status ?? 'draft') !== 'approved' && (
                            <Button variant="edit" size="xs" onClick={() => { setEditingSaleInv(inv); setSaleInvModalOpen(true); }}>
                              Edit
                            </Button>
                          )}
                          {settings && (
                            <Button variant="outline" size="xs" onClick={() => printInvoice(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved')}>
                              🖨 Print
                            </Button>
                          )}
                          {admin && (inv.doc_status ?? 'draft') !== 'approved' && (
                            <Button variant="destructive" size="xs" onClick={() => { if (window.confirm('Delete sale invoice?')) deleteInvoice.mutate(inv.id); }}>
                              Del
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction table */}
      {activeTab !== 'sale' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Date', 'Type', 'File', 'Party', 'Description', 'Amount', 'Remaining', 'Pay Status', 'Doc Status', 'Actions'].map((h) => (
                    <th key={h} className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txns.length === 0 ? (
                  <tr>
                    <td colSpan={9}><EmptyState message="No transactions found" /></td>
                  </tr>
                ) : (
                  txns.map((t) => {
                    const remaining = t.amount - (t.paid_amount ?? 0);
                    const partyName =
                      t.customer?.name ?? t.supplier?.name ?? t.service_provider?.name ?? t.party_name ?? '—';

                    return (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-2.5 py-2 text-[10px] text-muted-foreground border-b border-gray-50">
                          {fDate(t.transaction_date)}
                        </td>
                        <td className="px-2.5 py-2 border-b border-gray-50">
                          <Badge variant={t.transaction_type as TransactionType}>
                            {TRANSACTION_TYPE_LABELS[t.transaction_type]}
                          </Badge>
                        </td>
                        <td className="px-2.5 py-2 text-[11px] font-bold border-b border-gray-50">
                          {t.trade_file?.file_no ?? '—'}
                        </td>
                        <td className="px-2.5 py-2 text-[11px] border-b border-gray-50">
                          {partyName}
                        </td>
                        <td className="px-2.5 py-2 text-[11px] text-gray-700 max-w-[160px] truncate border-b border-gray-50">
                          {t.description}
                        </td>
                        <td className="px-2.5 py-2 text-right font-semibold text-xs border-b border-gray-50">
                          {fCurrency(t.amount, t.currency)}
                        </td>
                        <td className="px-2.5 py-2 text-right text-xs border-b border-gray-50">
                          {fCurrency(remaining, t.currency)}
                        </td>
                        <td className="px-2.5 py-2 border-b border-gray-50">
                          <Badge variant={t.payment_status as PaymentStatus}>
                            {PAYMENT_STATUS_LABELS[t.payment_status]}
                          </Badge>
                        </td>
                        <td className="px-2.5 py-2 border-b border-gray-50">
                          <DocStatusBadge status={t.doc_status ?? 'draft'} />
                        </td>
                        <td className="px-2.5 py-2 border-b border-gray-50">
                          <div className="flex gap-1 flex-wrap">
                            <ApprovalActions table="transactions" id={t.id} currentStatus={t.doc_status ?? 'draft'} />
                            {(t.transaction_type === 'receipt' || t.transaction_type === 'payment') && (
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => printReceipt(t, settings!, (t.doc_status ?? 'draft') !== 'approved')}
                              >
                                🖨 {t.transaction_type === 'receipt' ? 'Receipt' : 'Voucher'}
                              </Button>
                            )}
                            {(t.transaction_type === 'purchase_inv' || t.transaction_type === 'svc_inv' || t.transaction_type === 'sale_inv') && (
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => printTransactionInvoice(t, settings!, (t.doc_status ?? 'draft') !== 'approved')}
                              >
                                🖨 Print
                              </Button>
                            )}
                            {writable && (t.doc_status ?? 'draft') !== 'approved' && (
                              <Button variant="edit" size="xs" onClick={() => openEdit(t)}>
                                Edit
                              </Button>
                            )}
                            {admin && (t.doc_status ?? 'draft') !== 'approved' && (
                              <Button variant="destructive" size="xs" onClick={() => handleDelete(t.id)}>
                                Delete
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
    </>
  );
}
