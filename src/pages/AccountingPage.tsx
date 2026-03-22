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
import { Card, PageHeader, LoadingSpinner, EmptyState, StatCard } from '@/components/ui/shared';
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
      <PageHeader title="Accounting">
        {writable && (
          <Button onClick={openNew}>+ New Transaction</Button>
        )}
      </PageHeader>

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b-2 border-border mb-4 scrollbar-none">
        {(Object.entries(TAB_LABELS) as [AccTab, string][]).map(([key, label]) => (
          <button
            key={key}
            className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-[2px] transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === key
                ? 'text-brand-500 border-brand-500'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="flex gap-3 flex-wrap mb-4">
          <StatCard label="Total Receivable" value={fUSD(summary.totalReceivable)} color="brand" icon="👆" />
          <StatCard label="Total Payable" value={fUSD(summary.totalPayable)} color="red" icon="👇" />
          <StatCard label="Revenue" value={fUSD(summary.totalRevenue)} color="blue" icon="📈" />
          <StatCard label="Costs" value={fUSD(summary.totalCost)} color="amber" icon="📉" />
          <StatCard
            label="Profit / Loss"
            value={fUSD(summary.totalRevenue - summary.totalCost)}
            color={summary.totalRevenue - summary.totalCost >= 0 ? 'brand' : 'red'}
            icon={summary.totalRevenue - summary.totalCost >= 0 ? '✅' : '🔴'}
          />
        </div>
      )}

      {/* Filters */}
      <Card className="p-2.5 mb-4">
        <div className="flex gap-2.5 flex-wrap items-center">
          <NativeSelect
            className="w-full sm:w-[180px]"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Types</option>
            {Object.entries(TRANSACTION_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </NativeSelect>
          <NativeSelect
            className="w-full sm:w-[150px]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </NativeSelect>
        </div>
      </Card>

      {/* Sale Invoices Tab */}
      {activeTab === 'sale' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px]">
              <thead>
                <tr>
                  {['Invoice No', 'File', 'Customer', 'Date', 'ADMT', 'Unit Price', 'Total', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-2.5 py-2 text-left text-2xs font-bold uppercase text-muted-foreground border-b-2 border-border bg-gray-50">
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
                    <tr key={inv.id} className="hover:bg-gray-50/50">
                      <td className="px-2.5 py-2 text-xs font-bold border-b border-border text-green-700">{inv.invoice_no}</td>
                      <td className="px-2.5 py-2 text-xs border-b border-border">{inv.trade_file?.file_no ?? '—'}</td>
                      <td className="px-2.5 py-2 text-xs border-b border-border">{inv.customer?.name ?? '—'}</td>
                      <td className="px-2.5 py-2 text-[10px] text-muted-foreground border-b border-border">{fDate(inv.invoice_date)}</td>
                      <td className="px-2.5 py-2 text-xs border-b border-border">{fN(inv.quantity_admt, 3)}</td>
                      <td className="px-2.5 py-2 text-xs border-b border-border">{fCurrency(inv.unit_price)}</td>
                      <td className="px-2.5 py-2 text-right font-semibold text-xs border-b border-border text-green-700">{fCurrency(inv.total)}</td>
                      <td className="px-2.5 py-2 border-b border-border">
                        <DocStatusBadge status={inv.doc_status ?? 'draft'} />
                      </td>
                      <td className="px-2.5 py-2 border-b border-border">
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
        </Card>
      )}

      {/* Transaction table */}
      {activeTab !== 'sale' && <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr>
                {['Date', 'Type', 'File', 'Party', 'Description', 'Amount', 'Remaining', 'Pay Status', 'Doc Status', 'Actions'].map((h) => (
                  <th key={h} className="px-2.5 py-2 text-left text-2xs font-bold uppercase text-muted-foreground border-b-2 border-border bg-gray-50">
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
                    <tr key={t.id} className="hover:bg-gray-50/50">
                      <td className="px-2.5 py-2 text-[10px] text-muted-foreground border-b border-border">
                        {fDate(t.transaction_date)}
                      </td>
                      <td className="px-2.5 py-2 border-b border-border">
                        <Badge variant={t.transaction_type as TransactionType}>
                          {TRANSACTION_TYPE_LABELS[t.transaction_type]}
                        </Badge>
                      </td>
                      <td className="px-2.5 py-2 text-[11px] font-bold border-b border-border">
                        {t.trade_file?.file_no ?? '—'}
                      </td>
                      <td className="px-2.5 py-2 text-[11px] border-b border-border">
                        {partyName}
                      </td>
                      <td className="px-2.5 py-2 text-[11px] text-gray-700 max-w-[160px] truncate border-b border-border">
                        {t.description}
                      </td>
                      <td className="px-2.5 py-2 text-right font-semibold text-xs border-b border-border">
                        {fCurrency(t.amount, t.currency)}
                      </td>
                      <td className="px-2.5 py-2 text-right text-xs border-b border-border">
                        {fCurrency(remaining, t.currency)}
                      </td>
                      <td className="px-2.5 py-2 border-b border-border">
                        <Badge variant={t.payment_status as PaymentStatus}>
                          {PAYMENT_STATUS_LABELS[t.payment_status]}
                        </Badge>
                      </td>
                      <td className="px-2.5 py-2 border-b border-border">
                        <DocStatusBadge status={t.doc_status ?? 'draft'} />
                      </td>
                      <td className="px-2.5 py-2 border-b border-border">
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
      </Card>}

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
