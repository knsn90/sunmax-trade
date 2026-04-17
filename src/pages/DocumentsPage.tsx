import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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

import { Search, Printer, Pencil, Trash2, Receipt, FileText, Package } from 'lucide-react';
import type { Invoice, PackingList, Proforma, TradeFile } from '@/types/database';
import { useTheme } from '@/contexts/ThemeContext';

type Tab = 'invoices' | 'proformas' | 'packing-lists';

// Static icon map — labels are resolved via t() in the page component
const TAB_ICONS: Record<Tab, typeof Receipt> = {
  'invoices':      Receipt,
  'proformas':     FileText,
  'packing-lists': Package,
};

const TAB_COLORS: Record<Tab, string> = {
  'invoices':      '#0ea5e9',
  'proformas':     '#8b5cf6',
  'packing-lists': '#10b981',
};

// ─── Shared helpers ────────────────────────────────────────────────────────────
function DocIcon({ tab, size = 'md' }: { tab: Tab; size?: 'sm' | 'md' }) {
  const Icon = TAB_ICONS[tab];
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
  const { t } = useTranslation('documents');
  const { t: tc } = useTranslation('common');
  const { profile } = useAuth();
  const { data: settings } = useSettings();
  const { data: bankAccounts } = useBankAccounts();
  const adminRole = isAdmin(profile?.role);
  const writable = canWrite(profile?.role);
  const { data: invoices = [] } = useInvoices();
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

  // isLoading guard kaldırıldı — sayfa hemen render edilir, içerik yüklenince görünür

  return (
    <>
      {/* Mobile cards */}
      <div className="md:hidden mx-0 rounded-2xl overflow-hidden shadow-sm bg-white divide-y divide-gray-50">
        {filtered.length === 0 ? <EmptyDocs message={t('empty.noInvoices')} /> : filtered.map(inv => (
          <div key={inv.id} className="flex items-start gap-3 px-4 py-3 active:bg-gray-50 transition-colors">
            <DocIcon tab="invoices" />
            <div className="flex-1 min-w-0">
              {/* Satır 1: Fatura no + tutar */}
              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                <span className="text-[13px] font-bold text-gray-900 truncate">{inv.invoice_no}</span>
                <span className="text-[13px] font-bold shrink-0" style={{ color: accent }}>{fCurrency(inv.total)}</span>
              </div>
              {/* Satır 2: Meta + tarih + butonlar */}
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] text-gray-400 truncate min-w-0">
                  <span className="font-mono text-gray-500">{(inv.trade_file as any)?.file_no ?? '—'}</span>
                  {' · '}{(inv.customer as any)?.name ?? '—'}
                </span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <span className="text-[10px] text-gray-400 mr-1">{fDate(inv.invoice_date)}</span>
                  <button onClick={() => handlePrint(inv)} title={tc('btn.print')} className="p-1 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                    <Printer className="h-3 w-3" />
                  </button>
                  {writable && <button onClick={() => openEdit(inv)} title={tc('btn.edit')} className="p-1 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors">
                    <Pencil className="h-3 w-3" />
                  </button>}
                  {adminRole && <button onClick={() => { if (window.confirm(t('confirm.deleteInvoice'))) deleteInv.mutate(inv.id); }} title={tc('btn.delete')} className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="h-3 w-3" />
                  </button>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {[t('table.invoiceNo'), t('table.fileNo'), t('table.customer'), t('table.admt'), t('table.unitPrice'), t('table.total'), t('table.date'), ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8}><EmptyDocs message={t('empty.noInvoices')} /></td></tr>
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
                    <button onClick={() => handlePrint(inv)} title={tc('btn.print')} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                    {writable && <button onClick={() => openEdit(inv)} title={tc('btn.edit')} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>}
                    {adminRole && <button onClick={() => { if (window.confirm(t('confirm.deleteInvoice'))) deleteInv.mutate(inv.id); }} title={tc('btn.delete')} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
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
  const { t } = useTranslation('documents');
  const { t: tc } = useTranslation('common');
  const { profile } = useAuth();
  const { data: settings } = useSettings();
  const { data: bankAccounts } = useBankAccounts();
  const adminRole = isAdmin(profile?.role);
  const writable = canWrite(profile?.role);
  const { data: proformas = [] } = useProformas();
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

  // isLoading guard kaldırıldı — sayfa hemen render edilir, içerik yüklenince görünür

  return (
    <>
      {/* Mobile */}
      <div className="md:hidden rounded-2xl overflow-hidden shadow-sm bg-white divide-y divide-gray-50">
        {filtered.length === 0 ? <EmptyDocs message={t('empty.noProformas')} /> : filtered.map(pi => (
          <div key={pi.id} className="flex items-start gap-3 px-4 py-3 active:bg-gray-50 transition-colors">
            <DocIcon tab="proformas" />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                <span className="text-[13px] font-bold text-gray-900 truncate">{pi.proforma_no}</span>
                <span className="text-[13px] font-bold shrink-0" style={{ color: accent }}>{fCurrency(pi.total)}</span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] text-gray-400 truncate min-w-0">
                  <span className="font-mono text-gray-500">{(pi.trade_file as any)?.file_no ?? '—'}</span>
                  {' · '}{fDate(pi.proforma_date)} · {fN(pi.quantity_admt, 3)} MT
                </span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => handlePrint(pi)} title={tc('btn.print')} className="p-1 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                    <Printer className="h-3 w-3" />
                  </button>
                  {writable && <button onClick={() => openEdit(pi)} title={tc('btn.edit')} className="p-1 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors">
                    <Pencil className="h-3 w-3" />
                  </button>}
                  {adminRole && <button onClick={() => { if (window.confirm(t('confirm.deleteProforma'))) deletePI.mutate(pi.id); }} title={tc('btn.delete')} className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="h-3 w-3" />
                  </button>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop */}
      <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {[t('table.piNo'), t('table.fileNo'), t('table.date'), t('table.quantity'), t('table.unitPrice'), t('table.total'), ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7}><EmptyDocs message={t('empty.noProformas')} /></td></tr>
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
                    <button onClick={() => handlePrint(pi)} title={tc('btn.print')} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                    {writable && <button onClick={() => openEdit(pi)} title={tc('btn.edit')} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>}
                    {adminRole && <button onClick={() => { if (window.confirm(t('confirm.deleteProforma'))) deletePI.mutate(pi.id); }} title={tc('btn.delete')} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
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
  const { t } = useTranslation('documents');
  const { t: tc } = useTranslation('common');
  const { profile } = useAuth();
  const { data: settings } = useSettings();
  const adminRole = isAdmin(profile?.role);
  const writable = canWrite(profile?.role);
  const { data: pls = [] } = usePackingLists();
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

  // isLoading guard kaldırıldı — sayfa hemen render edilir, içerik yüklenince görünür

  return (
    <>
      {/* Mobile */}
      <div className="md:hidden rounded-2xl overflow-hidden shadow-sm bg-white divide-y divide-gray-50">
        {filtered.length === 0 ? <EmptyDocs message={t('empty.noPackingLists')} /> : filtered.map(pl => (
          <div key={pl.id} className="flex items-start gap-3 px-4 py-3 active:bg-gray-50 transition-colors">
            <DocIcon tab="packing-lists" />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                <span className="text-[13px] font-bold text-gray-900 truncate">{pl.packing_list_no}</span>
                <span className="text-[12px] font-semibold text-gray-700 shrink-0">{fN(pl.total_admt, 3)} MT</span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] text-gray-400 truncate min-w-0">
                  <span className="font-mono text-gray-500">{(pl.trade_file as any)?.file_no ?? '—'}</span>
                  {' · '}{(pl.customer as any)?.name ?? '—'}
                </span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <span className="text-[10px] text-gray-400 mr-1">{pl.packing_list_items?.length ?? 0} {t('table.vehicles').toLowerCase()}</span>
                  <button onClick={() => handlePrint(pl)} title={tc('btn.print')} className="p-1 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                    <Printer className="h-3 w-3" />
                  </button>
                  {writable && <button onClick={() => openEdit(pl)} title={tc('btn.edit')} className="p-1 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors">
                    <Pencil className="h-3 w-3" />
                  </button>}
                  {adminRole && <button onClick={() => { if (window.confirm(t('confirm.delete'))) deletePL.mutate(pl.id); }} title={tc('btn.delete')} className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="h-3 w-3" />
                  </button>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop */}
      <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {[t('table.plNo'), t('table.fileNo'), t('table.customer'), t('table.vehicles'), t('table.admt'), t('table.grossWeight'), ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7}><EmptyDocs message={t('empty.noPackingLists')} /></td></tr>
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
                    <button onClick={() => handlePrint(pl)} title={tc('btn.print')} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                    {writable && <button onClick={() => openEdit(pl)} title={tc('btn.edit')} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>}
                    {adminRole && <button onClick={() => { if (window.confirm(t('confirm.delete'))) deletePL.mutate(pl.id); }} title={tc('btn.delete')} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
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
  const { t } = useTranslation('documents');
  const [activeTab, setActiveTab] = useState<Tab>('invoices');
  const [search, setSearch] = useState('');
  const { accent } = useTheme();

  const TABS: { key: Tab; label: string; icon: typeof Receipt }[] = [
    { key: 'invoices',      label: t('tabs.invoices'),     icon: Receipt },
    { key: 'proformas',     label: t('tabs.proformas'),    icon: FileText },
    { key: 'packing-lists', label: t('tabs.packingLists'), icon: Package },
  ];

  function handleTabChange(key: Tab) { setActiveTab(key); setSearch(''); }

  const searchKey = activeTab === 'invoices' ? 'invoices' : activeTab === 'proformas' ? 'proformas' : 'packingLists';

  return (
    <div>
      {/* Mobil: tab satırı ayrı, search altında — Desktop: tek satır */}
      <div className="mb-4 space-y-2 md:space-y-0 md:flex md:items-center md:gap-2">
        {/* Tab pilleri — mobilde tam genişlik */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto scrollbar-none">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex-1 md:flex-none shrink-0 flex items-center justify-center gap-1.5 px-3 h-9 md:h-8 rounded-xl text-[12px] font-semibold transition-all whitespace-nowrap ${
                  isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search — mobilde tam genişlik, desktopda sabit */}
        <div className="hidden md:block flex-1" />
        <div className="relative w-full md:w-44 shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <input
            className="w-full h-9 md:h-8 pl-8 pr-3 rounded-xl border border-gray-200 bg-white text-[12px] outline-none placeholder:text-gray-400 focus:border-blue-300"
            placeholder={t(`search.${searchKey}` as `search.${string}`)}
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
