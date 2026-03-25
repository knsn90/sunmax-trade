import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSettings, useBankAccounts } from '@/hooks/useSettings';
import { canWrite, isAdmin } from '@/lib/permissions';
import { fDate, fCurrency, fN } from '@/lib/formatters';
import { printInvoice, printPackingList, printProforma } from '@/lib/printDocument';
import { useInvoices, useDeleteInvoice } from '@/hooks/useDocuments';
import { usePackingLists, useDeletePackingList } from '@/hooks/useDocuments';
import { useProformas, useDeleteProforma } from '@/hooks/useProformas';
import { InvoiceModal } from '@/components/documents/InvoiceModal';
import { PackingListModal } from '@/components/documents/PackingListModal';
import { ProformaModal } from '@/components/documents/ProformaModal';
import { Card, LoadingSpinner, EmptyState } from '@/components/ui/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Invoice, PackingList, Proforma, TradeFile } from '@/types/database';

type Tab = 'invoices' | 'proformas' | 'packing-lists';

const TABS: { key: Tab; label: string }[] = [
  { key: 'invoices',      label: 'Invoices' },
  { key: 'proformas',     label: 'Proformas' },
  { key: 'packing-lists', label: 'Packing Lists' },
];

// ─── Invoices Tab ─────────────────────────────────────────────────────────────
function InvoicesTab() {
  const { profile } = useAuth();
  const { data: settings } = useSettings();
  const { data: bankAccounts } = useBankAccounts();
  const adminRole = isAdmin(profile?.role);
  const writable = canWrite(profile?.role);
  const { data: invoices = [], isLoading } = useInvoices();
  const deleteInv = useDeleteInvoice();
  const [editInv, setEditInv] = useState<Invoice | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  function openEdit(inv: Invoice) { setEditInv(inv); setEditOpen(true); }
  function handlePrint(inv: Invoice) {
    if (!settings) return;
    const bank = bankAccounts?.find(b => b.is_default) ?? bankAccounts?.[0] ?? null;
    printInvoice(inv, settings, bank);
  }

  if (isLoading) return <LoadingSpinner />;
  return (
    <>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              {['Invoice No', 'File No', 'Customer', 'ADMT', 'Unit Price', 'Total', 'Date', 'Actions'].map(h =>
                <th key={h} className="px-2.5 py-2 text-left text-2xs font-bold uppercase text-muted-foreground border-b-2 border-border bg-gray-50">{h}</th>
              )}
            </tr></thead>
            <tbody>
              {invoices.length === 0
                ? <tr><td colSpan={8}><EmptyState message="No invoices yet" /></td></tr>
                : invoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50/50">
                    <td className="px-2.5 py-2 text-xs font-bold border-b border-border">{inv.invoice_no}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{(inv.trade_file as any)?.file_no ?? '—'}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{(inv.customer as any)?.name ?? '—'}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{fN(inv.quantity_admt, 3)}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{fCurrency(inv.unit_price)}</td>
                    <td className="px-2.5 py-2 text-xs font-bold text-brand-500 border-b border-border">{fCurrency(inv.total)}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{fDate(inv.invoice_date)}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">
                      <div className="flex gap-1">
                        {writable && <Button variant="edit" size="xs" onClick={() => openEdit(inv)}>Edit</Button>}
                        <Button variant="outline" size="xs" onClick={() => handlePrint(inv)}>🖨 Print</Button>
                        {adminRole && <Button variant="destructive" size="xs" onClick={() => { if (window.confirm('Delete invoice?')) deleteInv.mutate(inv.id); }}>Del</Button>}
                      </div>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </Card>
      <InvoiceModal open={editOpen} onOpenChange={setEditOpen} file={editInv?.trade_file as TradeFile ?? null} invoice={editInv} />
    </>
  );
}

// ─── Proformas Tab ────────────────────────────────────────────────────────────
function ProformasTab() {
  const { profile } = useAuth();
  const { data: settings } = useSettings();
  const { data: bankAccounts } = useBankAccounts();
  const adminRole = isAdmin(profile?.role);
  const writable = canWrite(profile?.role);
  const { data: proformas = [], isLoading } = useProformas();
  const deletePI = useDeleteProforma();
  const [editPI, setEditPI] = useState<Proforma | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  function openEdit(pi: Proforma) { setEditPI(pi); setEditOpen(true); }
  function handlePrint(pi: Proforma) {
    if (!settings) return;
    const bank = bankAccounts?.find(b => b.is_default) ?? bankAccounts?.[0] ?? null;
    printProforma(pi, settings, bank, pi.trade_file as TradeFile ?? null);
  }

  if (isLoading) return <LoadingSpinner />;
  return (
    <>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              {['PI No', 'File No', 'Date', 'Quantity', 'Unit Price', 'Total', 'Actions'].map(h =>
                <th key={h} className="px-2.5 py-2 text-left text-2xs font-bold uppercase text-muted-foreground border-b-2 border-border bg-gray-50">{h}</th>
              )}
            </tr></thead>
            <tbody>
              {proformas.length === 0
                ? <tr><td colSpan={7}><EmptyState message="No proformas yet" /></td></tr>
                : proformas.map(pi => (
                  <tr key={pi.id} className="hover:bg-gray-50/50">
                    <td className="px-2.5 py-2 text-xs font-bold border-b border-border">{pi.proforma_no}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{(pi.trade_file as any)?.file_no ?? '—'}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{fDate(pi.proforma_date)}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{fN(pi.quantity_admt, 3)}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{fCurrency(pi.unit_price)}</td>
                    <td className="px-2.5 py-2 text-xs font-bold text-brand-500 border-b border-border">{fCurrency(pi.total)}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">
                      <div className="flex gap-1">
                        {writable && <Button variant="edit" size="xs" onClick={() => openEdit(pi)}>Edit</Button>}
                        <Button variant="outline" size="xs" onClick={() => handlePrint(pi)}>🖨 Print</Button>
                        {adminRole && <Button variant="destructive" size="xs" onClick={() => { if (window.confirm('Delete proforma?')) deletePI.mutate(pi.id); }}>Del</Button>}
                      </div>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </Card>
      <ProformaModal open={editOpen} onOpenChange={setEditOpen} file={editPI?.trade_file as TradeFile ?? null} proforma={editPI} />
    </>
  );
}

// ─── Packing Lists Tab ────────────────────────────────────────────────────────
function PackingListsTab() {
  const { profile } = useAuth();
  const { data: settings } = useSettings();
  const adminRole = isAdmin(profile?.role);
  const writable = canWrite(profile?.role);
  const { data: pls = [], isLoading } = usePackingLists();
  const deletePL = useDeletePackingList();
  const [editPL, setEditPL] = useState<PackingList | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  function openEdit(pl: PackingList) { setEditPL(pl); setEditOpen(true); }
  function handlePrint(pl: PackingList) {
    if (!settings) return;
    printPackingList(pl, settings);
  }

  if (isLoading) return <LoadingSpinner />;
  return (
    <>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              {['PL No', 'File No', 'Customer', 'Vehicles', 'ADMT', 'Gross Weight', 'Actions'].map(h =>
                <th key={h} className="px-2.5 py-2 text-left text-2xs font-bold uppercase text-muted-foreground border-b-2 border-border bg-gray-50">{h}</th>
              )}
            </tr></thead>
            <tbody>
              {pls.length === 0
                ? <tr><td colSpan={7}><EmptyState message="No packing lists yet" /></td></tr>
                : pls.map(pl => (
                  <tr key={pl.id} className="hover:bg-gray-50/50">
                    <td className="px-2.5 py-2 text-xs font-bold border-b border-border">{pl.packing_list_no}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{(pl.trade_file as any)?.file_no ?? '—'}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{(pl.customer as any)?.name ?? '—'}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{pl.packing_list_items?.length ?? 0}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{fN(pl.total_admt, 3)}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{fN(pl.total_gross_kg, 0)}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">
                      <div className="flex gap-1">
                        {writable && <Button variant="edit" size="xs" onClick={() => openEdit(pl)}>Edit</Button>}
                        <Button variant="outline" size="xs" onClick={() => handlePrint(pl)}>🖨 Print</Button>
                        {adminRole && <Button variant="destructive" size="xs" onClick={() => { if (window.confirm('Delete?')) deletePL.mutate(pl.id); }}>Del</Button>}
                      </div>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </Card>
      <PackingListModal open={editOpen} onOpenChange={setEditOpen} file={editPL?.trade_file as TradeFile ?? null} packingList={editPL} />
    </>
  );
}

// ─── Documents Page ───────────────────────────────────────────────────────────
export function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('invoices');

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 shadow-sm w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-semibold transition-all',
              activeTab === t.key
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'invoices'      && <InvoicesTab />}
      {activeTab === 'proformas'     && <ProformasTab />}
      {activeTab === 'packing-lists' && <PackingListsTab />}
    </div>
  );
}
