import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { useTradeFiles } from '@/hooks/useTradeFiles';
import { useCustomers, useSuppliers, useServiceProviders } from '@/hooks/useEntities';
import { useTransactions, useTransactionsByEntityEnhanced } from '@/hooks/useTransactions';
import { fDate, fCurrency, fN, fUSD } from '@/lib/formatters';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/form-elements';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import type { TradeFile } from '@/types/database';

// ─── Print helper ──────────────────────────────────────────────────────────

const BASE_CSS = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;background:#888;padding:20px;color:#111}.page{background:#fff;width:210mm;margin:0 auto;padding:14mm;box-shadow:0 4px 24px rgba(0,0,0,.4)}.np{text-align:center;margin-bottom:14px}@media print{body{background:#fff;padding:0}.np{display:none}.page{box-shadow:none;width:100%;padding:10mm;margin:0}}`;
const PRINT_BAR = `<div class="np"><button onclick="window.print()" style="background:#c0392b;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-right:8px">Print / PDF</button><button onclick="window.close()" style="background:#f3f4f6;color:#374151;border:1px solid #ccc;padding:10px 20px;border-radius:8px;font-size:14px;cursor:pointer">Close</button></div>`;

function openPrint(html: string, title: string) {
  const win = window.open('', '_blank', 'width=980,height=800');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>${BASE_CSS}</style></head><body>${PRINT_BAR}<div class="page">${html}</div></body></html>`);
  win.document.close();
}

type RepTab = 'sales' | 'pnl' | 'cari' | 'analytics' | 'eta';

const TAB_LABELS: [RepTab, string][] = [
  ['sales',     'Sales Report'],
  ['pnl',       'P&L Report'],
  ['cari',      'Account Statement'],
  ['analytics', 'Analytics'],
  ['eta',       'ETA Report'],
];

// ─── Sales Report ──────────────────────────────────────────────────────────

function SalesReportTab() {
  const { data: files = [] } = useTradeFiles();
  const { data: customers = [] } = useCustomers();
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';

  const [custFilter, setCustFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [ran, setRan] = useState(false);

  const results = useMemo(() => {
    if (!ran) return [];
    return files.filter((f) => {
      if (custFilter && f.customer_id !== custFilter) return false;
      if (statusFilter && f.status !== statusFilter) return false;
      if (dateFrom && f.file_date < dateFrom) return false;
      if (dateTo && f.file_date > dateTo) return false;
      return true;
    });
  }, [ran, files, custFilter, statusFilter, dateFrom, dateTo]);

  const totalAdmt = results.reduce((s, f) => s + (f.delivered_admt ?? f.tonnage_mt ?? 0), 0);
  const totalRevenue = results.reduce((s, f) => {
    const admt = f.delivered_admt ?? f.tonnage_mt ?? 0;
    return s + admt * (f.selling_price ?? 0);
  }, 0);

  function printSalesReport(rows: TradeFile[]) {
    const tbody = rows.map((f) => `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:5px 6px;font-weight:700">${f.file_no}</td>
        <td style="padding:5px 6px">${f.customer?.name ?? '—'}</td>
        <td style="padding:5px 6px">${f.product?.name ?? '—'}</td>
        <td style="padding:5px 6px;text-align:right">${fN(f.delivered_admt ?? f.tonnage_mt ?? 0, 3)}</td>
        <td style="padding:5px 6px">${f.incoterms ?? '—'}</td>
        <td style="padding:5px 6px">${f.transport_mode ?? '—'}</td>
        <td style="padding:5px 6px">${f.port_of_loading ?? '—'}</td>
        <td style="padding:5px 6px">${f.port_of_discharge ?? '—'}</td>
        <td style="padding:5px 6px;text-align:right">${f.selling_price ? fCurrency(f.selling_price) : '—'}</td>
        <td style="padding:5px 6px;text-align:right">${f.purchase_price ? fCurrency(f.purchase_price) : '—'}</td>
        <td style="padding:5px 6px">${f.status}</td>
        <td style="padding:5px 6px">${f.proforma_ref ?? '—'}</td>
        <td style="padding:5px 6px">${f.register_no ?? '—'}</td>
        <td style="padding:5px 6px">${f.insurance_tr ?? '—'}</td>
      </tr>`).join('');
    const html = `
      <div style="font-size:20px;font-weight:300;color:#374151;margin-bottom:16px">Sales Report</div>
      <table style="width:100%;border-collapse:collapse;font-size:10px">
        <thead><tr style="background:#1e40af;color:#fff">
          ${['No','Customer','Product','ADMT','Incoterms','Transport','Loading Port','Discharge Port','Selling Price','Purchase Price','Status','PI No','Reg. No','Insurance'].map(h=>`<th style="padding:6px;text-align:left">${h}</th>`).join('')}
        </tr></thead>
        <tbody>${tbody}</tbody>
        <tfoot><tr style="background:#f9fafb;font-weight:700;border-top:2px solid #374151">
          <td colspan="3" style="padding:6px;text-align:right">TOTAL</td>
          <td style="padding:6px;text-align:right">${fN(totalAdmt, 3)}</td>
          <td colspan="4"></td>
          <td style="padding:6px;text-align:right;color:#1e40af">${fUSD(totalRevenue)}</td>
          <td colspan="4"></td>
        </tr></tfoot>
      </table>`;
    openPrint(html, 'Sales Report');
  }

  function exportSalesExcel(rows: TradeFile[]) {
    const data = rows.map((f) => ({
      'File No': f.file_no,
      'Date': f.file_date,
      'Customer': f.customer?.name ?? '',
      'Product': f.product?.name ?? '',
      'ADMT': f.delivered_admt ?? f.tonnage_mt ?? 0,
      'Incoterms': f.incoterms ?? '',
      'Transport': f.transport_mode ?? '',
      'Loading Port': f.port_of_loading ?? '',
      'Discharge Port': f.port_of_discharge ?? '',
      'Selling Price': f.selling_price ?? '',
      'Purchase Price': f.purchase_price ?? '',
      'Freight Cost': f.freight_cost ?? '',
      'Currency': f.currency ?? '',
      'Status': f.status,
      'PI No': f.proforma_ref ?? '',
      'Reg. No': f.register_no ?? '',
      'Insurance': f.insurance_tr ?? '',
      'ETA': f.eta ?? '',
      'BL No': f.bl_number ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Report');
    XLSX.writeFile(wb, `sales-report-${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  return (
    <div>
      {/* Filter panel */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Customer</label>
            <NativeSelect value={custFilter} onChange={(e) => setCustFilter(e.target.value)}>
              <option value="">All Customers</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
            <NativeSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="request">Request</option>
              <option value="sale">Sale</option>
              <option value="delivery">Delivery</option>
            </NativeSelect>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Date From</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Date To</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setRan(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-white transition-colors hover:opacity-90"
            style={{ background: accent }}
          >
            Show Report
          </button>
          <button
            onClick={() => { setCustFilter(''); setStatusFilter(''); setDateFrom(''); setDateTo(''); setRan(false); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Reset
          </button>
          {ran && results.length > 0 && (
            <button
              onClick={() => printSalesReport(results)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              🖨 Print / PDF
            </button>
          )}
          {ran && results.length > 0 && (
            <button
              onClick={() => exportSalesExcel(results)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              📥 Excel
            </button>
          )}
        </div>
      </div>

      {ran && results.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="flex gap-3 flex-wrap mb-4">
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
              <div className="text-xs text-gray-400 mb-0.5">Total Files</div>
              <div className="text-lg font-bold text-gray-900">{results.length}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
              <div className="text-xs text-gray-400 mb-0.5">Total ADMT</div>
              <div className="text-lg font-bold text-gray-900">{fN(totalAdmt, 3)}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
              <div className="text-xs text-gray-400 mb-0.5">Estimated Revenue</div>
              <div className="text-lg font-bold text-gray-900">{fUSD(totalRevenue)}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['No','Customer','Product','ADMT','Incoterms','Transport','Loading Port','Discharge Port','Selling Price','Purchase Price','Status','PI No','Reg. No','Insurance No'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((f) => (
                    <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3 text-[12px] font-bold">{f.file_no}</td>
                      <td className="px-4 py-3 text-[12px]">{f.customer?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-[12px]">{f.product?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-[12px] text-right">{fN(f.delivered_admt ?? f.tonnage_mt ?? 0, 3)}</td>
                      <td className="px-4 py-3 text-[12px]">{f.incoterms ?? '—'}</td>
                      <td className="px-4 py-3 text-[12px] capitalize">{f.transport_mode ?? '—'}</td>
                      <td className="px-4 py-3 text-[12px]">{f.port_of_loading ?? '—'}</td>
                      <td className="px-4 py-3 text-[12px]">{f.port_of_discharge ?? '—'}</td>
                      <td className="px-4 py-3 text-[12px] text-right">{f.selling_price ? fCurrency(f.selling_price) : '—'}</td>
                      <td className="px-4 py-3 text-[12px] text-right">{f.purchase_price ? fCurrency(f.purchase_price) : '—'}</td>
                      <td className="px-4 py-3 text-[12px] capitalize">{f.status}</td>
                      <td className="px-4 py-3 text-[12px]">{f.proforma_ref ?? '—'}</td>
                      <td className="px-4 py-3 text-[12px]">{f.register_no ?? '—'}</td>
                      <td className="px-4 py-3 text-[12px]">{f.insurance_tr ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {ran && results.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">No records match the selected filters.</div>
      )}
      {!ran && (
        <div className="text-center py-12 text-gray-400 text-sm">Select filters and click "Show Report"</div>
      )}
    </div>
  );
}

// ─── P&L Report ────────────────────────────────────────────────────────────

function PnlReportTab() {
  const { data: files = [] } = useTradeFiles();
  const [selectedFileId, setSelectedFileId] = useState('');

  const { data: txns = [] } = useTransactions(
    selectedFileId ? { tradeFileId: selectedFileId } : undefined,
  );

  const selectedFile = useMemo(
    () => files.find((f) => f.id === selectedFileId) ?? null,
    [files, selectedFileId],
  );

  const pnl = useMemo(() => {
    if (!selectedFile) return null;
    const qty = selectedFile.delivered_admt ?? selectedFile.tonnage_mt ?? 0;
    const revenue = (selectedFile.selling_price ?? 0) * qty;
    const costs = txns
      .filter((t) => ['purchase_inv', 'svc_inv'].includes(t.transaction_type))
      .reduce((s, t) => s + (t.amount_usd ?? t.amount ?? 0), 0);
    const profit = revenue - costs;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, costs, profit, margin };
  }, [txns, selectedFile]);

  const costRows = txns.filter((t) => ['purchase_inv', 'svc_inv'].includes(t.transaction_type));

  function col(v: number) { return v >= 0 ? '#10b981' : '#ef4444'; }

  function printPnl() {
    if (!selectedFile || !pnl) return;
    const rows = costRows.map((t) =>
      `<tr style="border-bottom:1px solid #e5e7eb"><td style="padding:4px 8px;color:#555;padding-left:20px">— ${t.description}</td><td style="padding:4px 8px;text-align:right">(${fUSD(t.amount_usd ?? t.amount ?? 0)})</td></tr>`
    ).join('');
    const html = `
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:20px;font-weight:300;color:#374151">P&L Report</div>
        <div style="font-size:12px;color:#555;margin-top:4px">${selectedFile.file_no} — ${selectedFile.customer?.name ?? ''}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:16px;text-align:center">
        ${[{l:'Revenue',v:fUSD(pnl.revenue),c:'#1e40af'},{l:'Cost',v:fUSD(pnl.costs),c:'#374151'},{l:'Net Profit',v:fUSD(pnl.profit),c:col(pnl.profit)},{l:'Margin',v:pnl.margin.toFixed(2)+'%',c:col(pnl.profit)}]
          .map(card=>`<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px"><div style="font-size:9px;color:#666;text-transform:uppercase;margin-bottom:4px">${card.l}</div><div style="font-size:16px;font-weight:700;color:${card.c}">${card.v}</div></div>`).join('')}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:6px 8px;color:#555">Revenue (${fN(selectedFile.delivered_admt??selectedFile.tonnage_mt??0,3)} ADMT × ${selectedFile.selling_price?fCurrency(selectedFile.selling_price):'—'})</td><td style="padding:6px 8px;text-align:right;font-weight:600;color:#1e40af">${fUSD(pnl.revenue)}</td></tr>
        ${rows}
        <tr style="border-top:2px solid #374151"><td style="padding:8px;font-weight:700;font-size:13px">Net Profit</td><td style="padding:8px;text-align:right;font-weight:800;font-size:13px;color:${col(pnl.profit)}">${fUSD(pnl.profit)}</td></tr>
      </table>`;
    openPrint(html, `P&L ${selectedFile.file_no}`);
  }

  return (
    <div>
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
        <div className="flex gap-3 items-center flex-wrap">
          <NativeSelect
            value={selectedFileId}
            onChange={(e) => setSelectedFileId(e.target.value)}
            className="min-w-[300px]"
          >
            <option value="">— Select file —</option>
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.file_no} — {f.customer?.name ?? ''} ({f.status})
              </option>
            ))}
          </NativeSelect>
          {selectedFile && pnl && (
            <button
              onClick={printPnl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              🖨 Print / PDF
            </button>
          )}
        </div>
      </div>

      {selectedFile && !selectedFile.selling_price && (
        <div className="text-center py-8 text-gray-400 text-sm">No selling price entered for this file.</div>
      )}

      {selectedFile && pnl && (
        <>
          {/* P&L Summary */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Revenue', value: fUSD(pnl.revenue), color: '#1e40af' },
              { label: 'Cost', value: fUSD(pnl.costs), color: '#374151' },
              { label: 'Net Profit', value: fUSD(pnl.profit), color: col(pnl.profit) },
              { label: 'Margin', value: pnl.margin.toFixed(2) + '%', color: col(pnl.profit) },
            ].map((card) => (
              <div key={card.label} className="bg-white rounded-2xl shadow-sm p-4 text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{card.label}</div>
                <div className="text-xl font-black" style={{ color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>

          {/* P&L Detail */}
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-5">
            <div className="text-sm font-bold text-gray-800 mb-4">
              P&L Detail — {selectedFile.file_no}
            </div>
            <table className="w-full text-xs">
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-1.5 text-gray-500">Revenue ({fN(selectedFile.delivered_admt ?? selectedFile.tonnage_mt ?? 0, 3)} ADMT × {selectedFile.selling_price ? fCurrency(selectedFile.selling_price) : '—'})</td>
                  <td className="py-1.5 text-right font-semibold text-blue-700">{fUSD(pnl.revenue)}</td>
                </tr>
                {costRows.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100">
                    <td className="py-1.5 text-gray-500 pl-3">— {t.description}</td>
                    <td className="py-1.5 text-right text-gray-700">({fUSD(t.amount_usd ?? t.amount ?? 0)})</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-700">
                  <td className="py-2 font-bold text-sm">Net Profit</td>
                  <td className="py-2 text-right font-bold text-sm" style={{ color: col(pnl.profit) }}>{fUSD(pnl.profit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {!selectedFileId && (
        <div className="text-center py-12 text-gray-400 text-sm">Select a file to view P&L</div>
      )}
    </div>
  );
}

// ─── Account Statement ─────────────────────────────────────────────────────

type StatementLang = 'en' | 'tr' | 'fa';

const STMT_LABELS: Record<StatementLang, {
  title: string; totalDebit: string; totalCredit: string; netBalance: string;
  date: string; type: string; ref: string; desc: string; debit: string; credit: string; balance: string;
  printBtn: string; dir: 'ltr' | 'rtl'; font?: string;
}> = {
  en: {
    title: 'Account Statement', totalDebit: 'Total Debit', totalCredit: 'Total Credit',
    netBalance: 'Net Balance', date: 'Date', type: 'Type', ref: 'Ref',
    desc: 'Description', debit: 'Debit', credit: 'Credit', balance: 'Balance',
    printBtn: 'Print / PDF', dir: 'ltr',
  },
  tr: {
    title: 'Cari Hesap Ekstresi', totalDebit: 'Toplam Borç', totalCredit: 'Toplam Alacak',
    netBalance: 'Net Bakiye', date: 'Tarih', type: 'Tür', ref: 'Ref',
    desc: 'Açıklama', debit: 'Borç', credit: 'Alacak', balance: 'Bakiye',
    printBtn: 'Yazdır / PDF', dir: 'ltr',
  },
  fa: {
    title: 'صورتحساب جاری', totalDebit: 'مجموع بدهکاری', totalCredit: 'مجموع بستانکاری',
    netBalance: 'موجودی خالص', date: 'تاریخ', type: 'نوع', ref: 'مرجع',
    desc: 'توضیحات', debit: 'بدهکاری', credit: 'بستانکاری', balance: 'موجودی',
    printBtn: 'چاپ / PDF', dir: 'rtl',
    font: 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;900&display=swap',
  },
};

function AccountStatementTab() {
  const { data: customers = [] } = useCustomers();
  const { data: suppliers = [] } = useSuppliers();
  const { data: serviceProviders = [] } = useServiceProviders();

  const [entityType, setEntityType] = useState<'customer' | 'supplier' | 'service_provider'>('customer');
  const [entityId, setEntityId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [lang] = useState<StatementLang>('en');

  const { data: rawTxns = [] } = useTransactionsByEntityEnhanced(entityType, entityId || undefined);

  const txns = useMemo(() => {
    return rawTxns.filter((t) => {
      if (dateFrom && t.transaction_date < dateFrom) return false;
      if (dateTo && t.transaction_date > dateTo) return false;
      return true;
    });
  }, [rawTxns, dateFrom, dateTo]);

  const entityOptions = entityType === 'customer'
    ? customers
    : entityType === 'supplier'
      ? suppliers
      : serviceProviders;

  // Running balance
  const txnsWithBalance = useMemo(() => {
    let balance = 0;
    return txns.map((t) => {
      const isDebit = t.transaction_type !== 'receipt';
      const amt = t.amount_usd ?? t.amount ?? 0;
      if (isDebit) balance -= amt; else balance += amt;
      return { ...t, isDebit, amt, balance };
    });
  }, [txns]);

  const totalDebit = txnsWithBalance.reduce((s, t) => s + (t.isDebit ? t.amt : 0), 0);
  const totalCredit = txnsWithBalance.reduce((s, t) => s + (!t.isDebit ? t.amt : 0), 0);
  const netBalance = totalCredit - totalDebit;

  const entityName = entityOptions.find((e) => e.id === entityId)?.name ?? '';

  function printStatement(printLang: StatementLang = lang) {
    const L = STMT_LABELS[printLang];
    const isRtl = L.dir === 'rtl';
    const fontFamily = isRtl ? 'Vazirmatn, Arial, sans-serif' : 'Arial, sans-serif';
    const thAlign = isRtl ? 'right' : 'left';

    const rows = txnsWithBalance.map((t) => `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:4px 6px">${fDate(t.transaction_date)}</td>
        <td style="padding:4px 6px">${t.transaction_type.replace('_',' ')}</td>
        <td style="padding:4px 6px">${t.reference_no||'—'}</td>
        <td style="padding:4px 6px">${t.description}</td>
        <td style="padding:4px 6px;text-align:right;color:#dc2626">${t.isDebit?fUSD(t.amt):'—'}</td>
        <td style="padding:4px 6px;text-align:right;color:#10b981">${!t.isDebit?fUSD(t.amt):'—'}</td>
        <td style="padding:4px 6px;text-align:right;font-weight:600;color:${t.balance>=0?'#10b981':'#dc2626'}">${fUSD(t.balance)}</td>
      </tr>`).join('');

    const fontLink = L.font ? `<link rel="stylesheet" href="${L.font}">` : '';
    const css = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:${fontFamily};font-size:11px;background:#888;padding:20px;color:#111;direction:${L.dir}}.page{background:#fff;width:210mm;margin:0 auto;padding:14mm;box-shadow:0 4px 24px rgba(0,0,0,.4)}.np{text-align:center;margin-bottom:14px}@media print{body{background:#fff;padding:0}.np{display:none}.page{box-shadow:none;width:100%;padding:10mm;margin:0}}`;
    const printBar = `<div class="np"><button onclick="window.print()" style="background:#374151;color:#fff;border:none;padding:10px 28px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;margin-right:8px">${L.printBtn}</button><button onclick="window.close()" style="background:#f3f4f6;color:#374151;border:1px solid #ccc;padding:10px 20px;border-radius:6px;font-size:13px;cursor:pointer">✕</button></div>`;

    const html = `
      <div style="font-size:18px;font-weight:700;color:#111;margin-bottom:2px">${L.title}</div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:16px">${entityName}${dateFrom||dateTo ? ` · ${dateFrom||''}${dateFrom&&dateTo?' – ':''}${dateTo||''}` : ''}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
        <div style="background:#fee2e2;border-radius:6px;padding:10px"><div style="font-size:9px;color:#991b1b;text-transform:uppercase;margin-bottom:3px">${L.totalDebit}</div><div style="font-size:15px;font-weight:700;color:#991b1b">${fUSD(totalDebit)}</div></div>
        <div style="background:#d1fae5;border-radius:6px;padding:10px"><div style="font-size:9px;color:#065f46;text-transform:uppercase;margin-bottom:3px">${L.totalCredit}</div><div style="font-size:15px;font-weight:700;color:#065f46">${fUSD(totalCredit)}</div></div>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px"><div style="font-size:9px;color:#374151;text-transform:uppercase;margin-bottom:3px">${L.netBalance}</div><div style="font-size:15px;font-weight:700;color:${netBalance>=0?'#10b981':'#dc2626'}">${fUSD(netBalance)}</div></div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:10px">
        <thead><tr style="background:#374151;color:#fff">${[L.date,L.type,L.ref,L.desc,L.debit,L.credit,L.balance].map(h=>`<th style="padding:6px;text-align:${thAlign}">${h}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`;

    const win = window.open('', '_blank', 'width=1010,height=860');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html dir="${L.dir}"><head><meta charset="UTF-8">${fontLink}<title>${L.title} — ${entityName}</title><style>${css}</style></head><body>${printBar}<div class="page">${html}</div></body></html>`);
    win.document.close();
  }

  return (
    <div>
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Entity Type</label>
            <NativeSelect value={entityType} onChange={(e) => { setEntityType(e.target.value as typeof entityType); setEntityId(''); }}>
              <option value="customer">Customer</option>
              <option value="supplier">Supplier</option>
              <option value="service_provider">Service Provider</option>
            </NativeSelect>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Entity</label>
            <NativeSelect value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              <option value="">— Select —</option>
              {entityOptions.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </NativeSelect>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Date From</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Date To</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        {entityId && txns.length > 0 && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">Print language:</span>
            <button
              onClick={() => printStatement('en')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              🖨 English
            </button>
            <button
              onClick={() => printStatement('tr')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              🖨 Turkish
            </button>
            <button
              onClick={() => printStatement('fa')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              🖨 فارسی
            </button>
          </div>
        )}
      </div>

      {entityId && txns.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Total Debit</div>
              <div className="text-lg font-black text-red-600">{fUSD(totalDebit)}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Total Credit</div>
              <div className="text-lg font-black text-green-600">{fUSD(totalCredit)}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Net Balance</div>
              <div className="text-lg font-black" style={{ color: netBalance >= 0 ? '#10b981' : '#ef4444' }}>{fUSD(netBalance)}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Date', 'Type', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txnsWithBalance.map((t) => (
                    <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3 text-[12px]">{fDate(t.transaction_date)}</td>
                      <td className="px-4 py-3 text-[12px] capitalize">{t.transaction_type.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-[12px]">{t.reference_no || '—'}</td>
                      <td className="px-4 py-3 text-[12px]">{t.description}</td>
                      <td className="px-4 py-3 text-[12px] text-right text-red-600">
                        {t.isDebit ? fUSD(t.amt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-right text-green-600">
                        {!t.isDebit ? fUSD(t.amt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-right font-semibold" style={{ color: t.balance >= 0 ? '#10b981' : '#ef4444' }}>
                        {fUSD(t.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {entityId && txns.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">No records found.</div>
      )}
      {!entityId && (
        <div className="text-center py-12 text-gray-400 text-sm">Select an entity to view their account statement</div>
      )}
    </div>
  );
}

// ─── Analytics Tab ─────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CHART_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16'];

function AnalyticsTab() {
  const { data: files = [] } = useTradeFiles();
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';
  const [period, setPeriod] = useState<'6m' | '12m' | 'all'>('12m');

  const filteredFiles = useMemo(() => {
    if (period === 'all') return files;
    const months = period === '6m' ? 6 : 12;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    return files.filter(f => new Date(f.created_at ?? '') >= cutoff);
  }, [files, period]);

  // Monthly trend data
  const monthlyData = useMemo(() => {
    const map: Record<string, { label: string; revenue: number; cost: number; profit: number; files: number }> = {};
    filteredFiles.forEach(f => {
      const d = new Date(f.created_at ?? '');
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
      const label = `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
      if (!map[key]) map[key] = { label, revenue: 0, cost: 0, profit: 0, files: 0 };
      const qty = f.delivered_admt ?? f.tonnage_mt ?? 0;
      const rev = (f.selling_price ?? 0) * qty;
      const cost = ((f.purchase_price ?? 0) + (f.freight_cost ?? 0)) * qty;
      map[key].revenue += rev;
      map[key].cost += cost;
      map[key].profit += rev - cost;
      map[key].files += 1;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [filteredFiles]);

  // Customer performance
  const customerData = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; profit: number; files: number; admt: number }> = {};
    filteredFiles.filter(f => f.customer_id).forEach(f => {
      const id = f.customer_id!;
      const name = f.customer?.name ?? id;
      if (!map[id]) map[id] = { name, revenue: 0, profit: 0, files: 0, admt: 0 };
      const qty = f.delivered_admt ?? f.tonnage_mt ?? 0;
      const rev = (f.selling_price ?? 0) * qty;
      const cost = ((f.purchase_price ?? 0) + (f.freight_cost ?? 0)) * qty;
      map[id].revenue += rev;
      map[id].profit += rev - cost;
      map[id].files += 1;
      map[id].admt += qty;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [filteredFiles]);

  // Status distribution
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredFiles.forEach(f => { counts[f.status] = (counts[f.status] ?? 0) + 1; });
    const colors: Record<string, string> = {
      request: '#60a5fa', sale: '#a78bfa', delivery: '#fbbf24',
      completed: '#4ade80', cancelled: '#9ca3af',
    };
    const labels: Record<string, string> = {
      request: 'Request', sale: 'Sale', delivery: 'Delivery',
      completed: 'Completed', cancelled: 'Cancelled',
    };
    return Object.entries(counts).map(([key, value]) => ({
      name: labels[key] ?? key, value, fill: colors[key] ?? '#94a3b8',
    }));
  }, [filteredFiles]);

  // Summary KPIs
  const totalRevenue = filteredFiles.reduce((s, f) => s + (f.selling_price ?? 0) * (f.delivered_admt ?? f.tonnage_mt ?? 0), 0);
  const totalCost    = filteredFiles.reduce((s, f) => s + ((f.purchase_price ?? 0) + (f.freight_cost ?? 0)) * (f.delivered_admt ?? f.tonnage_mt ?? 0), 0);
  const totalProfit  = totalRevenue - totalCost;
  const totalAdmt    = filteredFiles.reduce((s, f) => s + (f.delivered_admt ?? f.tonnage_mt ?? 0), 0);
  const avgMargin    = totalRevenue > 0 ? (totalProfit / totalRevenue * 100) : 0;

  function exportAnalyticsExcel() {
    const wb = XLSX.utils.book_new();
    const monthlyRows = monthlyData.map(m => ({
      'Month': m.label, 'Files': m.files,
      'Revenue ($)': Math.round(m.revenue), 'Cost ($)': Math.round(m.cost), 'Profit ($)': Math.round(m.profit),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyRows), 'Monthly Trend');
    const custRows = customerData.map(c => ({
      'Customer': c.name, 'Files': c.files, 'ADMT': c.admt.toFixed(3),
      'Revenue ($)': Math.round(c.revenue), 'Profit ($)': Math.round(c.profit),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(custRows), 'Customer Analysis');
    XLSX.writeFile(wb, `analytics-${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  const noData = monthlyData.length === 0;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {([['6m','Last 6M'],['12m','Last 12M'],['all','All Time']] as [typeof period, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={cn(
                'shrink-0 px-3 h-7 rounded-full text-[11px] font-bold transition-all whitespace-nowrap',
                period === key
                  ? 'text-white shadow-sm'
                  : 'bg-white text-gray-500 border border-gray-200'
              )}
              style={period === key ? { background: accent } : {}}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={exportAnalyticsExcel}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          📥 Excel Export
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Total Files', value: filteredFiles.length.toString(), color: 'text-blue-700' },
          { label: 'Total ADMT', value: fN(totalAdmt, 0), color: 'text-purple-700' },
          { label: 'Total Revenue', value: fUSD(totalRevenue), color: 'text-green-700' },
          { label: 'Total Cost', value: fUSD(totalCost), color: 'text-red-600' },
          { label: 'Net Profit / Margin', value: `${fUSD(totalProfit)} / ${avgMargin.toFixed(1)}%`, color: totalProfit >= 0 ? 'text-green-700' : 'text-red-600' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-2xl shadow-sm p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{kpi.label}</div>
            <div className={`text-sm font-black ${kpi.color}`}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {noData ? (
        <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-2xl shadow-sm">
          No data found for the selected period.
        </div>
      ) : (
        <>
          {/* Monthly trend chart */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="text-sm font-bold text-gray-800 mb-4">Monthly Revenue / Cost / Profit Trend</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name: any) => [
                    `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
                    name === 'revenue' ? 'Revenue' : name === 'cost' ? 'Cost' : 'Profit',
                  ]}
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                />
                <Bar dataKey="revenue" name="revenue" fill="#60a5fa" radius={[3,3,0,0]} />
                <Bar dataKey="cost"    name="cost"    fill="#f87171" radius={[3,3,0,0]} />
                <Bar dataKey="profit"  name="profit"  radius={[3,3,0,0]}>
                  {monthlyData.map((e, i) => <Cell key={i} fill={e.profit >= 0 ? '#4ade80' : '#fb923c'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 justify-center mt-1">
              {[['#60a5fa','Revenue'],['#f87171','Cost'],['#4ade80','Profit']].map(([c,l]) => (
                <div key={l} className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c }} />
                  <span className="text-[10px] text-gray-400">{l}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-5 gap-4">
            {/* Customer revenue bar */}
            <div className="bg-white rounded-2xl shadow-sm p-5 col-span-3">
              <div className="text-sm font-bold text-gray-800 mb-4">Revenue by Customer (Top 8)</div>
              {customerData.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={customerData} layout="vertical" barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={90} />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any, name: any) => [
                        `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
                        name === 'revenue' ? 'Revenue' : 'Profit',
                      ]}
                      contentStyle={{ fontSize: 11, borderRadius: 8 }}
                    />
                    <Bar dataKey="revenue" name="revenue" radius={[0,3,3,0]}>
                      {customerData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Status pie */}
            <div className="bg-white rounded-2xl shadow-sm p-5 col-span-2">
              <div className="text-sm font-bold text-gray-800 mb-4">File Status Distribution</div>
              {statusData.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="45%"
                      outerRadius={70} label={({ name, value }) => `${name}: ${value}`}
                      labelLine={false} fontSize={9}>
                      {statusData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Customer detail table */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="text-sm font-bold text-gray-800">Customer Performance</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Customer','Files','Total ADMT','Revenue','Cost','Net Profit','Margin'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {customerData.map((c, i) => {
                    const margin = c.revenue > 0 ? (c.profit / c.revenue * 100) : 0;
                    return (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3 text-[12px] font-semibold">{c.name}</td>
                        <td className="px-4 py-3 text-[12px] text-center">{c.files}</td>
                        <td className="px-4 py-3 text-[12px] text-right">{fN(c.admt, 3)}</td>
                        <td className="px-4 py-3 text-[12px] text-right font-medium text-blue-700">{fUSD(c.revenue)}</td>
                        <td className="px-4 py-3 text-[12px] text-right text-red-600">{fUSD(c.revenue - c.profit)}</td>
                        <td className="px-4 py-3 text-[12px] text-right font-bold" style={{ color: c.profit >= 0 ? '#10b981' : '#ef4444' }}>{fUSD(c.profit)}</td>
                        <td className="px-4 py-3 text-[12px] text-right">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${margin >= 10 ? 'bg-green-100 text-green-700' : margin >= 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                            {margin.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── ETA Report Tab ────────────────────────────────────────────────────────

function EtaReportTab() {
  const { data: files = [] } = useTradeFiles();

  const etaFiles = useMemo(() =>
    files
      .filter(f => f.eta || f.revised_eta)
      .sort((a, b) => (a.eta ?? '') < (b.eta ?? '') ? -1 : 1),
    [files]
  );

  function delayDays(f: TradeFile): number | null {
    const ref = f.eta;
    const actual = f.arrival_date;
    if (!ref || !actual) return null;
    return Math.round((new Date(actual).getTime() - new Date(ref).getTime()) / 86400000);
  }

  function statusCell(f: TradeFile) {
    if (f.arrival_date) {
      const d = delayDays(f);
      if (d === null) return { label: 'Arrived', cls: 'bg-gray-100 text-gray-600' };
      if (d <= 0) return { label: `On time ✅`, cls: 'bg-green-100 text-green-700' };
      return { label: `+${d} days 🔴`, cls: 'bg-red-100 text-red-700' };
    }
    if (f.revised_eta) return { label: 'Delayed ⏳', cls: 'bg-amber-100 text-amber-700' };
    return { label: 'Pending', cls: 'bg-blue-100 text-blue-700' };
  }

  function exportCsv() {
    const rows = [
      ['File No', 'Customer', 'Product', 'Status', 'Promised ETA', 'Revised ETA', 'Actual Arrival', 'Delay (days)', 'Delay Reason'],
      ...etaFiles.map(f => {
        const d = delayDays(f);
        return [
          f.file_no,
          f.customer?.name ?? '',
          f.product?.name ?? '',
          f.status,
          f.eta ?? '',
          f.revised_eta ?? '',
          f.arrival_date ?? '',
          d !== null ? String(d) : '',
          (f as TradeFile & { delay_notes?: string }).delay_notes ?? '',
        ];
      }),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `eta-report-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-gray-800">ETA Tracking Report</div>
          <div className="text-xs text-gray-400 mt-0.5">{etaFiles.length} files with ETA</div>
        </div>
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          Export CSV
        </button>
      </div>

      {etaFiles.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-2xl shadow-sm">
          No files with ETA found.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                {['File No','Customer','Product','Promised ETA','Revised ETA','Actual Arrival','Delay','Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {etaFiles.map(f => {
                const { label, cls } = statusCell(f);
                const d = delayDays(f);
                return (
                  <tr key={f.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 text-[12px] font-mono font-bold text-gray-800">{f.file_no}</td>
                    <td className="px-4 py-3 text-[12px] text-gray-700">{f.customer?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-[12px] text-gray-600">{f.product?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-[12px] text-gray-700">{f.eta ? fDate(f.eta) : '—'}</td>
                    <td className="px-4 py-3 text-[12px]">
                      {(f as TradeFile & { revised_eta?: string }).revised_eta
                        ? <span className="text-amber-600 font-semibold">{fDate((f as TradeFile & { revised_eta?: string }).revised_eta!)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-gray-700">{f.arrival_date ? fDate(f.arrival_date) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-[12px] font-semibold">
                      {d !== null
                        ? <span className={d > 0 ? 'text-red-600' : 'text-green-600'}>{d > 0 ? `+${d}d` : `${d}d`}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[12px]">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`}>{label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Reports Page ─────────────────────────────────────────────────────

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<RepTab>('sales');

  return (
    <>
      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit mb-6 overflow-x-auto scrollbar-none">
        {TAB_LABELS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`shrink-0 px-4 h-8 rounded-xl text-[12px] font-semibold transition-all whitespace-nowrap ${
              activeTab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'sales'     && <SalesReportTab />}
      {activeTab === 'pnl'       && <PnlReportTab />}
      {activeTab === 'cari'      && <AccountStatementTab />}
      {activeTab === 'analytics' && <AnalyticsTab />}
      {activeTab === 'eta'       && <EtaReportTab />}
    </>
  );
}
