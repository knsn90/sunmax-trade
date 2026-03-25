import { useState, useMemo } from 'react';
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
import { LoadingSpinner } from '@/components/ui/shared';
import { Search, Printer, Pencil, Trash2, Receipt, FileText, Package } from 'lucide-react';
import type { Invoice, PackingList, Proforma, TradeFile } from '@/types/database';
import { useTheme } from '@/contexts/ThemeContext';

type Tab = 'invoices' | 'proformas' | 'packing-lists';

const TABS: { key: Tab; label: string; icon: typeof Receipt }[] = [
  { key: 'invoices',      label: 'Invoices',      icon: Receipt },
  { key: 'proformas',     label: 'Proformas',     icon: FileText },
  { key: 'packing-lists', label: 'Packing Lists', icon: Package },
];

const TAB_COLORS: Record<Tab, string> = {
  'invoices':      '#0ea5e9',
  'proformas':     '#8b5cf6',
  'packing-lists': '#10b981',
};

// ─── Shared helpers ────────────────────────────────────────────────────────────
function DocIcon({ tab, size = 'md' }: { tab: Tab; size?: 'sm' | 'md' }) {
  const Icon = TABS.find(t => t.key === tab)!.icon;
  const color = TAB_COLORS[tab];
  const cls = size === 'md'
    ? 'w-10 h-10 rounded-xl flex items-center justify-center shrink-0'
    : 'w-8 h-8 rounded-lg flex items-center justify-center shrink-0';
  return (
    <div className={cls} style={{ background: color + '18' }}>
      <Icon className={size === 'md' ? 'h-5 w-5' : 'h-4 w-4'} style={{ color }} />
    </div>
  );
}

function EmptyDocs({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <FileText className="h-10 w-10 mb-3 opacity-20" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

// ─── Invoices Tab ─────────────────────────────────────────────────────────────
function InvoicesTab({ accent, search }: { accent: string; search: string }) {
  const { profile } = useAuth();
  const { data: settings } = useSettings();
  const { data: bankAccounts } = useBankAccounts();
  const adminRole = isAdmin(profile?.role);
  const writable = canWrite(profile?.role);
  const { data: invoices = [], isLoading } = useInvoices();
  const deleteInv = useDeleteInvoice();
  const [editInv, setEditInv] = useState<Invoice | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return invoices;
    const q = search.toLowerCase();
    return invoices.filter(i =>
      i.invoice_no?.toLowerCase().includes(q) ||
      (i.trade_file as any)?.file_no?.toLowerCase().includes(q) ||
      (i.customer as any)?.name?.toLowerCase().includes(q)
    );
  }, [invoices, search]);

  function openEdit(inv: Invoice) { setEditInv(inv); setEditOpen(true); }
  function handlePrint(inv: Invoice) {
    if (!settings) return;
    const bank = bankAccounts?.find(b => b.is_default) ?? bankAccounts?.[0] ?? null;
    printInvoice(inv, settings, bank);
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      {/* Mobile cards */}
      <div className="md:hidden mx-0 rounded-2xl overflow-hidden shadow-sm bg-white divide-y divide-gray-50">
        {filtered.length === 0 ? <EmptyDocs message="No invoices found" /> : filtered.map(inv => (
          <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
            <DocIcon tab="invoices" />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-gray-900">{inv.invoice_no}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                <span className="font-mono">{(inv.trade_file as any)?.file_no ?? '—'}</span>
                {' · '}{(inv.customer as any)?.name ?? '—'}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-[13px] font-bold" style={{ color: accent }}>{fCurrency(inv.total)}</span>
              <span className="text-[10px] text-gray-400">{fDate(inv.invoice_date)}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-1">
              <button onClick={() => handlePrint(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <Printer className="h-3.5 w-3.5" />
              </button>
              {writable && <button onClick={() => openEdit(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                <Pencil className="h-3.5 w-3.5" />
              </button>}
              {adminRole && <button onClick={() => { if (window.confirm('Delete?')) deleteInv.mutate(inv.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {['Invoice No', 'File No', 'Customer', 'ADMT', 'Unit Price', 'Total', 'Date', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8}><EmptyDocs message="No invoices found" /></td></tr>
            ) : filtered.map(inv => (
              <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <DocIcon tab="invoices" size="sm" />
                    <span className="text-[13px] font-bold text-gray-900">{inv.invoice_no}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[12px] font-mono text-gray-500">{(inv.trade_file as any)?.file_no ?? '—'}</td>
                <td className="px-4 py-3 text-[12px] text-gray-700">{(inv.customer as any)?.name ?? '—'}</td>
                <td className="px-4 py-3 text-[12px] text-gray-600">{fN(inv.quantity_admt, 3)}</td>
                <td className="px-4 py-3 text-[12px] text-gray-600">{fCurrency(inv.unit_price)}</td>
                <td className="px-4 py-3 text-[13px] font-bold" style={{ color: accent }}>{fCurrency(inv.total)}</td>
                <td className="px-4 py-3 text-[12px] text-gray-500">{fDate(inv.invoice_date)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => handlePrint(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="Print">
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                    {writable && <button onClick={() => openEdit(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>}
                    {adminRole && <button onClick={() => { if (window.confirm('Delete invoice?')) deleteInv.mutate(inv.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <InvoiceModal open={editOpen} onOpenChange={setEditOpen} file={editInv?.trade_file as TradeFile ?? null} invoice={editInv} />
    </>
  );
}

// ─── Proformas Tab ────────────────────────────────────────────────────────────
function ProformasTab({ accent, search }: { accent: string; search: string }) {
  const { profile } = useAuth();
  const { data: settings } = useSettings();
  const { data: bankAccounts } = useBankAccounts();
  const adminRole = isAdmin(profile?.role);
  const writable = canWrite(profile?.role);
  const { data: proformas = [], isLoading } = useProformas();
  const deletePI = useDeleteProforma();
  const [editPI, setEditPI] = useState<Proforma | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return proformas;
    const q = search.toLowerCase();
    return proformas.filter(p =>
      p.proforma_no?.toLowerCase().includes(q) ||
      (p.trade_file as any)?.file_no?.toLowerCase().includes(q)
    );
  }, [proformas, search]);

  function openEdit(pi: Proforma) { setEditPI(pi); setEditOpen(true); }
  function handlePrint(pi: Proforma) {
    if (!settings) return;
    const bank = bankAccounts?.find(b => b.is_default) ?? bankAccounts?.[0] ?? null;
    printProforma(pi, settings, bank, pi.trade_file as TradeFile ?? null);
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      {/* Mobile */}
      <div className="md:hidden rounded-2xl overflow-hidden shadow-sm bg-white divide-y divide-gray-50">
        {filtered.length === 0 ? <EmptyDocs message="No proformas found" /> : filtered.map(pi => (
          <div key={pi.id} className="flex items-center gap-3 px-4 py-3">
            <DocIcon tab="proformas" />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-gray-900">{pi.proforma_no}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                <span className="font-mono">{(pi.trade_file as any)?.file_no ?? '—'}</span>
                {' · '}{fDate(pi.proforma_date)}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-[13px] font-bold" style={{ color: accent }}>{fCurrency(pi.total)}</span>
              <span className="text-[10px] text-gray-400">{fN(pi.quantity_admt, 3)} MT</span>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-1">
              <button onClick={() => handlePrint(pi)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <Printer className="h-3.5 w-3.5" />
              </button>
              {writable && <button onClick={() => openEdit(pi)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                <Pencil className="h-3.5 w-3.5" />
              </button>}
              {adminRole && <button onClick={() => { if (window.confirm('Delete?')) deletePI.mutate(pi.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop */}
      <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {['PI No', 'File No', 'Date', 'Quantity', 'Unit Price', 'Total', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7}><EmptyDocs message="No proformas found" /></td></tr>
            ) : filtered.map(pi => (
              <tr key={pi.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <DocIcon tab="proformas" size="sm" />
                    <span className="text-[13px] font-bold text-gray-900">{pi.proforma_no}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[12px] font-mono text-gray-500">{(pi.trade_file as any)?.file_no ?? '—'}</td>
                <td className="px-4 py-3 text-[12px] text-gray-600">{fDate(pi.proforma_date)}</td>
                <td className="px-4 py-3 text-[12px] text-gray-600">{fN(pi.quantity_admt, 3)}</td>
                <td className="px-4 py-3 text-[12px] text-gray-600">{fCurrency(pi.unit_price)}</td>
                <td className="px-4 py-3 text-[13px] font-bold" style={{ color: accent }}>{fCurrency(pi.total)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => handlePrint(pi)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="Print">
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                    {writable && <button onClick={() => openEdit(pi)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>}
                    {adminRole && <button onClick={() => { if (window.confirm('Delete proforma?')) deletePI.mutate(pi.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ProformaModal open={editOpen} onOpenChange={setEditOpen} file={editPI?.trade_file as TradeFile ?? null} proforma={editPI} />
    </>
  );
}

// ─── Packing Lists Tab ────────────────────────────────────────────────────────
function PackingListsTab({ accent: _accent, search }: { accent: string; search: string }) {
  const { profile } = useAuth();
  const { data: settings } = useSettings();
  const adminRole = isAdmin(profile?.role);
  const writable = canWrite(profile?.role);
  const { data: pls = [], isLoading } = usePackingLists();
  const deletePL = useDeletePackingList();
  const [editPL, setEditPL] = useState<PackingList | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return pls;
    const q = search.toLowerCase();
    return pls.filter(p =>
      p.packing_list_no?.toLowerCase().includes(q) ||
      (p.trade_file as any)?.file_no?.toLowerCase().includes(q) ||
      (p.customer as any)?.name?.toLowerCase().includes(q)
    );
  }, [pls, search]);

  function openEdit(pl: PackingList) { setEditPL(pl); setEditOpen(true); }
  function handlePrint(pl: PackingList) {
    if (!settings) return;
    printPackingList(pl, settings);
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      {/* Mobile */}
      <div className="md:hidden rounded-2xl overflow-hidden shadow-sm bg-white divide-y divide-gray-50">
        {filtered.length === 0 ? <EmptyDocs message="No packing lists found" /> : filtered.map(pl => (
          <div key={pl.id} className="flex items-center gap-3 px-4 py-3">
            <DocIcon tab="packing-lists" />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-gray-900">{pl.packing_list_no}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                <span className="font-mono">{(pl.trade_file as any)?.file_no ?? '—'}</span>
                {' · '}{(pl.customer as any)?.name ?? '—'}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-[12px] font-semibold text-gray-700">{fN(pl.total_admt, 3)} MT</span>
              <span className="text-[10px] text-gray-400">{pl.packing_list_items?.length ?? 0} vehicles</span>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-1">
              <button onClick={() => handlePrint(pl)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <Printer className="h-3.5 w-3.5" />
              </button>
              {writable && <button onClick={() => openEdit(pl)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                <Pencil className="h-3.5 w-3.5" />
              </button>}
              {adminRole && <button onClick={() => { if (window.confirm('Delete?')) deletePL.mutate(pl.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop */}
      <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {['PL No', 'File No', 'Customer', 'Vehicles', 'ADMT', 'Gross Weight', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7}><EmptyDocs message="No packing lists found" /></td></tr>
            ) : filtered.map(pl => (
              <tr key={pl.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <DocIcon tab="packing-lists" size="sm" />
                    <span className="text-[13px] font-bold text-gray-900">{pl.packing_list_no}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[12px] font-mono text-gray-500">{(pl.trade_file as any)?.file_no ?? '—'}</td>
                <td className="px-4 py-3 text-[12px] text-gray-700">{(pl.customer as any)?.name ?? '—'}</td>
                <td className="px-4 py-3 text-[12px] text-gray-600">{pl.packing_list_items?.length ?? 0}</td>
                <td className="px-4 py-3 text-[12px] font-semibold text-gray-700">{fN(pl.total_admt, 3)}</td>
                <td className="px-4 py-3 text-[12px] text-gray-600">{fN(pl.total_gross_kg, 0)} kg</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => handlePrint(pl)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="Print">
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                    {writable && <button onClick={() => openEdit(pl)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>}
                    {adminRole && <button onClick={() => { if (window.confirm('Delete?')) deletePL.mutate(pl.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PackingListModal open={editOpen} onOpenChange={setEditOpen} file={editPL?.trade_file as TradeFile ?? null} packingList={editPL} />
    </>
  );
}

// ─── Documents Page ───────────────────────────────────────────────────────────
export function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('invoices');
  const [search, setSearch] = useState('');
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';

  function handleTabChange(key: Tab) { setActiveTab(key); setSearch(''); }

  const placeholder = activeTab === 'invoices' ? 'Search invoices...' : activeTab === 'proformas' ? 'Search proformas...' : 'Search packing lists...';

  return (
    <div>
      {/* Header row: tabs + search */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto scrollbar-none shrink-0">
          {TABS.map(t => {
            const Icon = t.icon;
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => handleTabChange(t.key)}
                className={`shrink-0 flex items-center gap-1.5 px-4 h-8 rounded-xl text-[12px] font-semibold transition-all whitespace-nowrap ${
                  isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <div className="relative w-44 shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <input
            className="w-full h-8 pl-8 pr-3 rounded-xl border border-gray-200 bg-white text-[12px] outline-none placeholder:text-gray-400 focus:border-blue-300"
            placeholder={placeholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'invoices'      && <InvoicesTab accent={accent} search={search} />}
      {activeTab === 'proformas'     && <ProformasTab accent={accent} search={search} />}
      {activeTab === 'packing-lists' && <PackingListsTab accent={accent} search={search} />}
    </div>
  );
}
