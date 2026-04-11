import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, FileText, ChevronDown, X, Printer, SlidersHorizontal } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { useTradeFiles } from '@/hooks/useTradeFiles';
import { useCustomers, useSuppliers, useServiceProviders } from '@/hooks/useEntities';
import { useTransactions, useTransactionsByEntityEnhanced } from '@/hooks/useTransactions';
import { useSettings } from '@/hooks/useSettings';
import { fDate, fCurrency, fN, fUSD } from '@/lib/formatters';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/form-elements';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import type { TradeFile } from '@/types/database';
import { buildFullHtml } from '@/lib/printDocument';

// ─── Print helper ──────────────────────────────────────────────────────────

function openPrint(html: string, title: string, companyName?: string) {
  const win = window.open('', '_blank', 'width=1100,height=860');
  if (!win) return;
  win.document.write(buildFullHtml(html, title, false, undefined, companyName));
  win.document.close();
}

type RepTab = 'sales' | 'analytics' | 'eta';

// ─── Sales Report ──────────────────────────────────────────────────────────

function SalesReportTab() {
  const { t } = useTranslation('reports');
  const { t: tc } = useTranslation('common');
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
      <div style="font-size:20px;font-weight:300;color:#374151;margin-bottom:16px">${t('tabs.sales')}</div>
      <table style="width:100%;border-collapse:collapse;font-size:10px">
        <thead><tr style="background:#1e40af;color:#fff">
          ${[t('sales.col_no'),t('sales.col_customer'),t('sales.col_product'),t('sales.col_admt'),t('sales.col_incoterms'),t('sales.col_transport'),t('sales.col_loading_port'),t('sales.col_discharge_port'),t('sales.col_selling_price'),t('sales.col_purchase_price'),t('sales.col_status'),t('sales.col_pi_no'),t('sales.col_reg_no'),t('sales.col_insurance_no')].map(h=>`<th style="padding:6px;text-align:left">${h}</th>`).join('')}
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
    openPrint(html, t('tabs.sales'));
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
            <label className="text-xs font-medium text-gray-600 block mb-1">{t('sales.customer')}</label>
            <NativeSelect value={custFilter} onChange={(e) => setCustFilter(e.target.value)}>
              <option value="">{t('sales.all_customers')}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">{t('sales.status')}</label>
            <NativeSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{tc('all')}</option>
              <option value="request">{tc('status.request')}</option>
              <option value="sale">{tc('status.sale')}</option>
              <option value="delivery">{tc('status.delivery')}</option>
            </NativeSelect>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">{t('sales.date_from')}</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">{t('sales.date_to')}</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setRan(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-white transition-colors hover:opacity-90"
            style={{ background: accent }}
          >
            {t('sales.show_report')}
          </button>
          <button
            onClick={() => { setCustFilter(''); setStatusFilter(''); setDateFrom(''); setDateTo(''); setRan(false); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            {t('sales.reset')}
          </button>
          {ran && results.length > 0 && (
            <button
              onClick={() => printSalesReport(results)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              {t('sales.print_pdf')}
            </button>
          )}
          {ran && results.length > 0 && (
            <button
              onClick={() => exportSalesExcel(results)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              {t('sales.excel')}
            </button>
          )}
        </div>
      </div>

      {ran && results.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="flex gap-3 flex-wrap mb-4">
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
              <div className="text-xs text-gray-400 mb-0.5">{t('sales.total_files')}</div>
              <div className="text-lg font-bold text-gray-900">{results.length}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
              <div className="text-xs text-gray-400 mb-0.5">{t('sales.total_admt')}</div>
              <div className="text-lg font-bold text-gray-900">{fN(totalAdmt, 3)}</div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
              <div className="text-xs text-gray-400 mb-0.5">{t('sales.estimated_revenue')}</div>
              <div className="text-lg font-bold text-gray-900">{fUSD(totalRevenue)}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    {[
                      t('sales.col_no'),
                      t('sales.col_customer'),
                      t('sales.col_product'),
                      t('sales.col_admt'),
                      t('sales.col_incoterms'),
                      t('sales.col_transport'),
                      t('sales.col_loading_port'),
                      t('sales.col_discharge_port'),
                      t('sales.col_selling_price'),
                      t('sales.col_purchase_price'),
                      t('sales.col_status'),
                      t('sales.col_pi_no'),
                      t('sales.col_reg_no'),
                      t('sales.col_insurance_no'),
                    ].map((h) => (
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
                      <td className="px-4 py-3 text-[12px] capitalize">{tc('status.' + f.status)}</td>
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
        <div className="text-center py-12 text-gray-400 text-sm">{t('sales.no_records')}</div>
      )}
      {!ran && (
        <div className="text-center py-12 text-gray-400 text-sm">{t('sales.prompt')}</div>
      )}
    </div>
  );
}

// ─── P&L Report ────────────────────────────────────────────────────────────

export function PnlReportTab() {
  const { t } = useTranslation('reports');
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';
  const { data: files = [] } = useTradeFiles();

  // ── Görünüm: tek dosya detayı veya tüm dosyalar özeti ──────────────────
  const [viewMode, setViewMode] = useState<'ozet' | 'tek'>('ozet');
  const [sortBy, setSortBy]     = useState<'profit' | 'margin' | 'revenue'>('profit');
  const [selectedFileId, setSelectedFileId] = useState('');

  const { data: txns = [] } = useTransactions(
    selectedFileId ? { tradeFileId: selectedFileId, approvedOnly: true } : { approvedOnly: true },
  );

  const selectedFile = useMemo(
    () => files.find((f) => f.id === selectedFileId) ?? null,
    [files, selectedFileId],
  );

  // ── Tek dosya P&L ───────────────────────────────────────────────────────
  const pnl = useMemo(() => {
    if (!selectedFile) return null;
    const qty     = selectedFile.delivered_admt ?? selectedFile.tonnage_mt ?? 0;
    const revenue = (selectedFile.selling_price ?? 0) * qty;
    const txnCosts = txns
      .filter((t) => ['purchase_inv', 'svc_inv'].includes(t.transaction_type))
      .reduce((s, t) => s + (t.amount_usd ?? t.amount ?? 0), 0);
    const freight = selectedFile.freight_cost ?? 0;
    const costs   = txnCosts + freight;
    const profit  = revenue - costs;
    const margin  = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, txnCosts, freight, costs, profit, margin };
  }, [txns, selectedFile]);

  const costRows = txns.filter((t) => ['purchase_inv', 'svc_inv'].includes(t.transaction_type));

  // ── Tüm dosyalar özeti — pnl_data veya tahmini ─────────────────────────
  const allFilesRows = useMemo(() => {
    return files
      .map(f => {
        // pnl_data varsa kullan, yoksa tahmini hesapla
        if (f.pnl_data) {
          return {
            file: f,
            revenue:  f.pnl_data.revenue,
            costs:    f.pnl_data.totalCost,
            profit:   f.pnl_data.netProfit,
            margin:   f.pnl_data.margin,
            currency: f.pnl_data.curr || f.sale_currency || f.currency,
            hasData:  true,
          };
        }
        // Tahmini: sadece file alanlarından
        const qty     = f.delivered_admt ?? f.tonnage_mt ?? 0;
        const revenue = (f.selling_price ?? 0) * qty;
        const costs   = (f.purchase_price ?? 0) * qty + (f.freight_cost ?? 0);
        const profit  = revenue - costs;
        const margin  = revenue > 0 ? (profit / revenue) * 100 : 0;
        return {
          file: f,
          revenue, costs, profit, margin,
          currency: f.sale_currency || f.currency,
          hasData: revenue > 0 || costs > 0,
        };
      })
      .filter(r => r.hasData)
      .sort((a, b) => {
        if (sortBy === 'margin')  return b.margin - a.margin;
        if (sortBy === 'revenue') return b.revenue - a.revenue;
        return b.profit - a.profit;
      });
  }, [files, sortBy]);

  // ── Ürün bazında özet ───────────────────────────────────────────────────
  const byProduct = useMemo(() => {
    const map: Record<string, { revenue: number; profit: number; count: number }> = {};
    for (const r of allFilesRows) {
      const key = r.file.product?.name ?? 'Diğer';
      if (!map[key]) map[key] = { revenue: 0, profit: 0, count: 0 };
      map[key].revenue += r.revenue;
      map[key].profit  += r.profit;
      map[key].count++;
    }
    return Object.entries(map).sort((a, b) => b[1].profit - a[1].profit);
  }, [allFilesRows]);

  const totalRevenue = allFilesRows.reduce((s, r) => s + r.revenue, 0);
  const totalProfit  = allFilesRows.reduce((s, r) => s + r.profit, 0);
  const avgMargin    = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  function col(v: number) { return v >= 0 ? '#10b981' : '#ef4444'; }

  function printPnl() {
    if (!selectedFile || !pnl) return;
    const rows = costRows.map((txn) =>
      `<tr style="border-bottom:1px solid #e5e7eb"><td style="padding:4px 8px;color:#555;padding-left:20px">— ${txn.description}</td><td style="padding:4px 8px;text-align:right">(${fUSD(txn.amount_usd ?? txn.amount ?? 0)})</td></tr>`
    ).join('');
    const freightRow = pnl.freight > 0
      ? `<tr style="border-bottom:1px solid #e5e7eb"><td style="padding:4px 8px;color:#555;padding-left:20px">— Navlun / Freight</td><td style="padding:4px 8px;text-align:right">(${fUSD(pnl.freight)})</td></tr>`
      : '';
    const html = `
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:20px;font-weight:300;color:#374151">${t('tabs.pnl')}</div>
        <div style="font-size:12px;color:#555;margin-top:4px">${selectedFile.file_no} — ${selectedFile.customer?.name ?? ''}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:16px;text-align:center">
        ${[{l:'Hasılat',v:fUSD(pnl.revenue),c:'#1e40af'},{l:'Toplam Maliyet',v:fUSD(pnl.costs),c:'#374151'},{l:'Net Kar',v:fUSD(pnl.profit),c:col(pnl.profit)},{l:'Kar Marjı',v:pnl.margin.toFixed(2)+'%',c:col(pnl.profit)}]
          .map(card=>`<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px"><div style="font-size:9px;color:#666;text-transform:uppercase;margin-bottom:4px">${card.l}</div><div style="font-size:16px;font-weight:700;color:${card.c}">${card.v}</div></div>`).join('')}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:6px 8px;color:#555">Hasılat (${fN(selectedFile.delivered_admt??selectedFile.tonnage_mt??0,3)} MT × ${selectedFile.selling_price?fCurrency(selectedFile.selling_price):'—'})</td><td style="padding:6px 8px;text-align:right;font-weight:600;color:#1e40af">${fUSD(pnl.revenue)}</td></tr>
        ${rows}${freightRow}
        <tr style="border-top:2px solid #374151"><td style="padding:8px;font-weight:700;font-size:13px">Net Kar</td><td style="padding:8px;text-align:right;font-weight:800;font-size:13px;color:${col(pnl.profit)}">${fUSD(pnl.profit)}</td></tr>
      </table>`;
    openPrint(html, `Kar/Zarar — ${selectedFile.file_no}`);
  }

  return (
    <div className="space-y-4">

      {/* ── Görünüm seçici ──────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit">
        {([
          { key: 'ozet', label: 'Tüm Dosyalar Özeti' },
          { key: 'tek',  label: 'Dosya Detayı' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setViewMode(tab.key)}
            className={`px-4 h-8 rounded-xl text-[12px] font-semibold transition-all whitespace-nowrap ${
              viewMode === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══ ÖZET MODU ═══════════════════════════════════════════════════ */}
      {viewMode === 'ozet' && (
        <>
          {/* KPI kartlar */}
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            {[
              { label: 'Toplam Hasılat', value: fUSD(totalRevenue), color: '#1e40af' },
              { label: 'Toplam Net Kar', value: fUSD(totalProfit),  color: col(totalProfit) },
              { label: 'Ort. Kar Marjı', value: avgMargin.toFixed(1) + '%', color: col(totalProfit) },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl md:rounded-2xl shadow-sm border border-gray-100 px-2 py-3 md:p-4 text-center overflow-hidden">
                <div className="text-[8px] md:text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 leading-tight">{card.label}</div>
                <div className="text-[13px] md:text-xl font-black leading-tight break-all" style={{ color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>

          {/* Ürün kategorisi özeti */}
          {byProduct.length > 1 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/60">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Ürün Bazında Karlılık</span>
              </div>
              <div className="divide-y divide-gray-50">
                {byProduct.map(([product, data]) => {
                  const margin = data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0;
                  const barW   = totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0;
                  return (
                    <div key={product} className="px-5 py-3 flex items-center gap-4">
                      <div className="w-28 shrink-0">
                        <div className="text-[12px] font-semibold text-gray-800 truncate">{product}</div>
                        <div className="text-[10px] text-gray-400">{data.count} dosya</div>
                      </div>
                      {/* Bar */}
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${barW}%`, background: accent }} />
                      </div>
                      <div className="w-28 text-right shrink-0">
                        <div className="text-[12px] font-semibold text-gray-800">{fUSD(data.revenue)}</div>
                        <div className="text-[10px]" style={{ color: col(data.profit) }}>
                          {fUSD(data.profit)} · %{margin.toFixed(1)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dosya tablosu */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/60 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                Dosya Bazında Kar/Zarar ({allFilesRows.length} dosya)
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">Sırala:</span>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as typeof sortBy)}
                  className="text-[11px] border border-gray-200 rounded-lg px-2 h-7 bg-white outline-none"
                >
                  <option value="profit">Net Kar</option>
                  <option value="margin">Kar Marjı</option>
                  <option value="revenue">Hasılat</option>
                </select>
              </div>
            </div>
            {allFilesRows.length === 0 ? (
              <div className="py-14 text-center text-sm text-gray-400">Hesaplanmış P&L verisi bulunamadı</div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Dosya / Müşteri</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Ürün</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Hasılat</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Maliyet</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Net Kar</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Marj %</th>
                    <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400">Durum</th>
                    <th className="px-4 py-2.5 w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {allFilesRows.map((row, i) => (
                    <tr key={row.file.id} className={`hover:bg-gray-50/60 transition-colors ${i % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="text-[12px] font-bold font-mono text-gray-800">{row.file.file_no}</div>
                        <div className="text-[10px] text-gray-400">{row.file.customer?.name ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-gray-600 truncate max-w-[120px]">
                        {row.file.product?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] font-semibold text-blue-700 tabular-nums">
                        {fUSD(row.revenue)}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] text-gray-600 tabular-nums">
                        ({fUSD(row.costs)})
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-[13px] font-black tabular-nums" style={{ color: col(row.profit) }}>
                          {fUSD(row.profit)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          row.margin >= 10 ? 'bg-green-100 text-green-700'
                          : row.margin >= 0  ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-600'
                        }`}>
                          %{row.margin.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          {row.file.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => { setSelectedFileId(row.file.id); setViewMode('tek'); }}
                          className="text-[11px] font-semibold hover:underline"
                          style={{ color: accent }}
                        >
                          Detay →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={2} className="px-4 py-2.5 text-[11px] font-bold text-gray-600">TOPLAM</td>
                    <td className="px-4 py-2.5 text-right text-[12px] font-black text-blue-700 tabular-nums">{fUSD(totalRevenue)}</td>
                    <td className="px-4 py-2.5 text-right text-[12px] font-bold text-gray-600 tabular-nums">
                      ({fUSD(allFilesRows.reduce((s, r) => s + r.costs, 0))})
                    </td>
                    <td className="px-4 py-2.5 text-right text-[13px] font-black tabular-nums" style={{ color: col(totalProfit) }}>
                      {fUSD(totalProfit)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[12px] font-black" style={{ color: col(totalProfit) }}>
                      %{avgMargin.toFixed(1)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ TEK DOSYA DETAYI ════════════════════════════════════════════ */}
      {viewMode === 'tek' && (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex gap-3 items-center flex-wrap">
              <NativeSelect
                value={selectedFileId}
                onChange={(e) => setSelectedFileId(e.target.value)}
                className="w-full md:min-w-[300px] md:w-auto"
              >
                <option value="">{t('pnl.select_file')}</option>
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
                  <Printer className="h-3.5 w-3.5" />
                  {t('pnl.print_pdf')}
                </button>
              )}
            </div>
          </div>

          {selectedFile && !selectedFile.selling_price && (
            <div className="text-center py-8 text-gray-400 text-sm">{t('pnl.no_selling_price')}</div>
          )}

          {selectedFile && pnl && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                {[
                  { label: t('pnl.revenue'),    value: fUSD(pnl.revenue), color: '#1e40af' },
                  { label: t('pnl.cost'),        value: fUSD(pnl.costs),  color: '#374151' },
                  { label: t('pnl.net_profit'),  value: fUSD(pnl.profit), color: col(pnl.profit) },
                  { label: t('pnl.margin'),      value: pnl.margin.toFixed(2) + '%', color: col(pnl.profit) },
                ].map((card) => (
                  <div key={card.label} className="bg-white rounded-xl md:rounded-2xl shadow-sm border border-gray-100 px-2 py-3 md:p-4 text-center overflow-hidden">
                    <div className="text-[8px] md:text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{card.label}</div>
                    <div className="text-[13px] md:text-xl font-black break-all leading-tight" style={{ color: card.color }}>{card.value}</div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <div className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-4">
                  {t('pnl.detail_title', { fileNo: selectedFile.file_no })}
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-2 text-gray-500">
                        {t('pnl.revenue')} ({fN(selectedFile.delivered_admt ?? selectedFile.tonnage_mt ?? 0, 3)} MT × {selectedFile.selling_price ? fCurrency(selectedFile.selling_price) : '—'})
                      </td>
                      <td className="py-2 text-right font-semibold text-blue-700">{fUSD(pnl.revenue)}</td>
                    </tr>
                    {costRows.map((txn) => (
                      <tr key={txn.id} className="border-b border-gray-100">
                        <td className="py-1.5 text-gray-500 pl-3">— {txn.description}</td>
                        <td className="py-1.5 text-right text-gray-700">({fUSD(txn.amount_usd ?? txn.amount ?? 0)})</td>
                      </tr>
                    ))}
                    {pnl.freight > 0 && (
                      <tr className="border-b border-gray-100">
                        <td className="py-1.5 text-gray-500 pl-3">— Navlun / Freight</td>
                        <td className="py-1.5 text-right text-gray-700">({fUSD(pnl.freight)})</td>
                      </tr>
                    )}
                    <tr className="border-t-2 border-gray-700">
                      <td className="py-2 font-bold text-sm">{t('pnl.net_profit')}</td>
                      <td className="py-2 text-right font-bold text-sm" style={{ color: col(pnl.profit) }}>{fUSD(pnl.profit)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!selectedFileId && (
            <div className="text-center py-12 text-gray-400 text-sm">{t('pnl.select_prompt')}</div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Account Statement ─────────────────────────────────────────────────────

type StatementLang = 'en' | 'tr' | 'fa';

const STMT_LABELS: Record<StatementLang, {
  title: string; entity: string; period: string; currency: string;
  totalDebit: string; totalCredit: string; netBalance: string; txnCount: string;
  date: string; type: string; ref: string; desc: string; debit: string; credit: string; balance: string; curr: string;
  outstanding: string; settled: string;
  openingBalance: string; recordCount: string; grandTotal: string;
  /** Bakiye yön etiketi: pozitif bakiye (borçlu) */
  debitSuffix: string;
  /** Bakiye yön etiketi: negatif bakiye (alacaklı) */
  creditSuffix: string;
  printBtn: string; dir: 'ltr' | 'rtl'; font?: string;
}> = {
  en: {
    title: 'Account Statement',
    entity: 'Account', period: 'Period', currency: 'Currency',
    totalDebit: 'Total Debit', totalCredit: 'Total Credit', netBalance: 'Net Balance', txnCount: 'transactions',
    date: 'Date', type: 'Transaction Type', ref: 'Ref. No', desc: 'Description',
    debit: 'Debit', credit: 'Credit', balance: 'Balance', curr: 'Curr.',
    outstanding: 'Outstanding', settled: 'Settled',
    openingBalance: 'Opening Balance', recordCount: 'Records', grandTotal: 'GRAND TOTAL',
    debitSuffix: '(Dr)', creditSuffix: '(Cr)',
    printBtn: 'Print / PDF', dir: 'ltr',
  },
  tr: {
    title: 'Cari Hesap Ekstresi',
    entity: 'Cari Unvan', period: 'Tarihler', currency: 'Para Birimi',
    totalDebit: 'Toplam Borç', totalCredit: 'Toplam Alacak', netBalance: 'Net Bakiye', txnCount: 'işlem',
    date: 'Tarih', type: 'İşlem Türü', ref: 'İşlem No', desc: 'Açıklama',
    debit: 'Borç', credit: 'Alacak', balance: 'Bakiye', curr: 'Döviz',
    outstanding: 'Bakiye Borç', settled: 'Kapandı',
    openingBalance: 'Rapor Öncesi Bakiye', recordCount: 'Kayıt Sayısı', grandTotal: 'GENEL TOPLAM',
    debitSuffix: '(B)', creditSuffix: '(A)',
    printBtn: 'Yazdır / PDF', dir: 'ltr',
  },
  fa: {
    title: 'صورتحساب جاری',
    entity: 'نام طرف حساب', period: 'دوره', currency: 'ارز',
    totalDebit: 'مجموع بدهکاری', totalCredit: 'مجموع بستانکاری', netBalance: 'موجودی خالص', txnCount: 'تراکنش',
    date: 'تاریخ', type: 'نوع معامله', ref: 'شماره سند', desc: 'توضیحات',
    debit: 'بدهکاری', credit: 'بستانکاری', balance: 'موجودی', curr: 'ارز',
    outstanding: 'مانده بدهی', settled: 'تسویه',
    openingBalance: 'مانده قبل از دوره', recordCount: 'تعداد سطر', grandTotal: 'جمع کل',
    debitSuffix: 'بدهکار', creditSuffix: 'بستانکار',
    printBtn: 'چاپ / PDF', dir: 'rtl',
    font: 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;900&display=swap',
  },
};

/** True → BORÇ (increases what they owe us / we owe them).  Entity-type aware. */
function isBorç(
  txnType: string,
  entityType: 'customer' | 'supplier' | 'service_provider',
): boolean {
  // advance → her zaman ALACAK (müşteri ön ödeme yaptı / biz tedarikçiye ön ödeme yaptık)
  // party_type DB'de null olabileceği için entityType ile inference yapıyoruz
  if (txnType === 'advance') return false;

  if (entityType === 'customer') {
    // BORÇ: sale_inv → müşteri bize borçlu
    // ALACAK: receipt → müşteri ödedi
    return txnType === 'sale_inv';
  }

  if (entityType === 'supplier') {
    // BORÇ: purchase_inv / svc_inv → biz onlara borçluyuz
    // ALACAK: payment → biz ödedik
    return txnType === 'purchase_inv' || txnType === 'svc_inv';
  }

  // service_provider
  return txnType === 'svc_inv';
}

const TXN_TYPE_OPTIONS = [
  { value: '',             label: 'Tüm İşlemler' },
  { value: 'sale_inv',     label: 'Satış Faturası' },
  { value: 'purchase_inv', label: 'Alım Faturası' },
  { value: 'svc_inv',      label: 'Hizmet Faturası' },
  { value: 'receipt',      label: 'Tahsilat' },
  { value: 'payment',      label: 'Ödeme' },
];

const STATUS_OPTIONS = [
  { value: '',        label: 'Tüm Durumlar' },
  { value: 'open',    label: 'Açık' },
  { value: 'partial', label: 'Kısmi' },
  { value: 'paid',    label: 'Ödendi' },
];

const ENTITY_TYPE_LABELS: Record<string, string> = {
  customer: 'Müşteri',
  supplier: 'Tedarikçi',
  service_provider: 'Hizmet Sağlayıcı',
};

export function AccountStatementTab() {
  const { t: tc } = useTranslation('common');
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';

  const { data: settings } = useSettings();
  const { data: customers = [], isLoading: loadingC, error: errC } = useCustomers();
  const { data: suppliers = [], isLoading: loadingS, error: errS } = useSuppliers();
  const { data: serviceProviders = [], isLoading: loadingSP, error: errSP } = useServiceProviders();

  const [entityType, setEntityType] = useState<'customer' | 'supplier' | 'service_provider'>('customer');
  const [entityId, setEntityId] = useState('');
  const [entityOpen, setEntityOpen] = useState(false);
  const [entitySearch, setEntitySearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const entityDropdownRef = useRef<HTMLDivElement>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [txnTypeFilter, setTxnTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: rawTxns = [], isLoading } = useTransactionsByEntityEnhanced(entityType, entityId || undefined, true);

  const entityOptions = entityType === 'customer'
    ? customers
    : entityType === 'supplier'
      ? suppliers
      : serviceProviders;

  // Seçili tür için ilk yükleme hâlâ devam ediyor mu?
  const loadingEntities = (entityType === 'customer' && loadingC)
    || (entityType === 'supplier' && loadingS)
    || (entityType === 'service_provider' && loadingSP);
  const entityError = (entityType === 'customer' && errC)
    || (entityType === 'supplier' && errS)
    || (entityType === 'service_provider' && errSP);

  const filteredEntityOptions = useMemo(() =>
    entitySearch.trim()
      ? entityOptions.filter(e => e.name.toLowerCase().includes(entitySearch.toLowerCase()))
      : entityOptions,
    [entityOptions, entitySearch],
  );

  const entityName = entityOptions.find((e) => e.id === entityId)?.name ?? '';

  // Close entity dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      // Trigger butonu (entityDropdownRef) veya portal içindeki element değilse kapat
      const inTrigger = entityDropdownRef.current?.contains(target);
      const inPortal  = (target as Element)?.closest?.('[data-entity-portal]');
      if (!inTrigger && !inPortal) {
        setEntityOpen(false);
        setEntitySearch('');
      }
    }
    if (entityOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [entityOpen]);

  // Filter panel state
  const [filterOpen, setFilterOpen] = useState(false);
  const filterBtnRef = useRef<HTMLDivElement>(null);
  const [filterPos, setFilterPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!filterOpen) return;
    function handler(e: MouseEvent) {
      const t = e.target as Element;
      if (!filterBtnRef.current?.contains(t) && !t.closest('[data-filter-portal]')) {
        setFilterOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen]);

  // Filter by date + type + status, sort ascending for running balance
  const txns = useMemo(() => {
    return rawTxns
      .filter((txn) => {
        if (dateFrom && txn.transaction_date < dateFrom) return false;
        if (dateTo   && txn.transaction_date > dateTo)   return false;
        if (txnTypeFilter && txn.transaction_type !== txnTypeFilter) return false;
        if (statusFilter  && txn.payment_status  !== statusFilter)   return false;
        return true;
      })
      .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
  }, [rawTxns, dateFrom, dateTo, txnTypeFilter, statusFilter]);

  // Running balance: positive = they owe us (customer) / we owe them (supplier)
  const txnsWithBalance = useMemo(() => {
    let balance = 0;
    return txns.map((txn) => {
      const debit = isBorç(txn.transaction_type, entityType);
      const amt   = txn.amount_usd ?? txn.amount ?? 0;   // her zaman USD bazlı
      balance     = debit ? balance + amt : balance - amt;
      return { ...txn, isDebit: debit, amt, balance };
    });
  }, [txns, entityType]);

  const totalBorç   = txnsWithBalance.reduce((s, t) =>  s + ( t.isDebit ? t.amt : 0), 0);
  const totalAlacak = txnsWithBalance.reduce((s, t) =>  s + (!t.isDebit ? t.amt : 0), 0);
  const netBakiye   = totalBorç - totalAlacak;   // positive = net borç (they owe us / we owe them)

  // ── Print ─────────────────────────────────────────────────────────────────
  function printStatement(printLang: StatementLang) {
    const L = STMT_LABELS[printLang];
    const isRtl = L.dir === 'rtl';
    const ff    = isRtl ? 'Vazirmatn, Arial, sans-serif' : 'Arial, sans-serif';

    // Dominant currency in this statement
    const currCounts: Record<string, number> = {};
    txnsWithBalance.forEach((t) => { if (t.currency) currCounts[t.currency] = (currCounts[t.currency] ?? 0) + 1; });
    void currCounts; // dominant currency now shown per-row — suppressed unused warning

    const periodLabel = (dateFrom || dateTo)
      ? `${dateFrom ? fDate(dateFrom) : '…'}  –  ${dateTo ? fDate(dateTo) : '…'}`
      : '—';

    // Dile göre bakiye yön etiketi
    const balSuffix = (b: number) =>
      b > 0 ? ` ${L.debitSuffix}` : b < 0 ? ` ${L.creditSuffix}` : '';
    const netSuffix = netBakiye > 0 ? ` ${L.debitSuffix}` : netBakiye < 0 ? ` ${L.creditSuffix}` : '';

    // Transaction type labels for print (no React hook inside)
    const TYPE_TR: Record<string, string> = {
      sale_inv: 'Satış Faturası', purchase_inv: 'Alım Faturası',
      svc_inv: 'Hizmet Faturası', receipt: 'Tahsilat', payment: 'Ödeme',
      advance: 'Ön Ödeme',
    };
    const TYPE_EN: Record<string, string> = {
      sale_inv: 'Sales Invoice', purchase_inv: 'Purchase Invoice',
      svc_inv: 'Service Invoice', receipt: 'Receipt', payment: 'Payment',
      advance: 'Advance Payment',
    };
    const TYPE_FA: Record<string, string> = {
      sale_inv: 'فاکتور فروش', purchase_inv: 'فاکتور خرید',
      svc_inv: 'فاکتور خدمات', receipt: 'دریافت', payment: 'پرداخت',
      advance: 'پیش پرداخت',
    };
    const TYPE_LABEL = printLang === 'fa' ? TYPE_FA : printLang === 'en' ? TYPE_EN : TYPE_TR;

    const companyName = settings?.company_name || 'SUNMAX TRADE';
    const today = fDate(new Date().toISOString().slice(0, 10));

    const rows = txnsWithBalance.map((txn, i) => {
      const bg = i % 2 === 0 ? '#fff' : '#f8fafc';
      const origAmt = txn.currency !== 'USD'
        ? `<div style="font-size:9px;color:#94a3b8;margin-top:1px">${fCurrency(txn.amount, txn.currency)}</div>` : '';
      return `
      <tr style="border-bottom:1px solid #e2e8f0;background:${bg}">
        <td style="padding:5px 8px;white-space:nowrap;color:#475569;font-size:10px">${fDate(txn.transaction_date)}</td>
        <td style="padding:5px 8px;color:#334155;font-size:10px">${TYPE_LABEL[txn.transaction_type] ?? txn.transaction_type}</td>
        <td style="padding:5px 8px;font-family:monospace;color:#64748b;font-size:9.5px">${txn.reference_no || '—'}</td>
        <td style="padding:5px 8px;color:#334155;font-size:10px;max-width:160px">${txn.description || '—'}</td>
        <td style="padding:5px 8px;text-align:center">
          <span style="font-size:10px;font-weight:700;color:#1e293b">${txn.currency}</span>
          ${origAmt}
        </td>
        <td style="padding:5px 8px;text-align:right;color:#b91c1c;font-weight:600;font-size:10px">${txn.isDebit  ? fUSD(txn.amt) : ''}</td>
        <td style="padding:5px 8px;text-align:right;color:#065f46;font-weight:600;font-size:10px">${!txn.isDebit ? fUSD(txn.amt) : ''}</td>
        <td style="padding:5px 8px;text-align:right;font-weight:700;font-size:10px;color:${txn.balance > 0 ? '#92400e' : txn.balance < 0 ? '#065f46' : '#94a3b8'}">${fUSD(Math.abs(txn.balance))}${balSuffix(txn.balance)}</td>
      </tr>`;
    }).join('');

    const netColor = netBakiye > 0 ? '#92400e' : netBakiye < 0 ? '#065f46' : '#64748b';

    // CSS embedded in the document content (not in outer BASE_CSS)
    const stmtCss = `<style>
      ${L.font ? `@import url('${L.font}');` : ''}
      .stmt-wrap{font-family:${ff};direction:${L.dir};color:#111}
      .stmt-doc-header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px;padding-bottom:12px;border-bottom:2px solid #1e293b}
      .stmt-co{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;margin-bottom:3px}
      .stmt-title{font-size:20px;font-weight:800;color:#111827;letter-spacing:-0.5px}
      .stmt-entity-label{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:#9ca3af;margin-bottom:2px;text-align:right}
      .stmt-entity-name{font-size:15px;font-weight:700;color:#1e293b;text-align:right}
      .kpi-row{display:flex;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px;overflow:hidden}
      .kpi{flex:1;padding:10px 14px;border-right:1px solid #e2e8f0}
      .kpi:last-child{border-right:none}
      .kpi-label{font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;margin-bottom:3px}
      .kpi-value{font-size:14px;font-weight:800}
      .kpi-debit .kpi-value{color:#b91c1c}
      .kpi-credit .kpi-value{color:#065f46}
      .kpi-net .kpi-value{color:#1e293b}
      .meta{display:flex;gap:20px;align-items:center;font-size:9.5px;color:#64748b;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #e2e8f0}
      .meta strong{color:#1e293b;font-weight:700}
      table{width:100%;border-collapse:collapse}
      thead tr{background:#f1f5f9;border-bottom:2px solid #cbd5e1}
      th{padding:6px 8px;font-size:8.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b;white-space:nowrap}
      .th-r{text-align:right}
      .th-c{text-align:center}
      tfoot tr{background:#f8fafc;border-top:2px solid #cbd5e1}
      tfoot td{padding:7px 8px;font-size:10px;font-weight:700}
      .stmt-footer{margin-top:12px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;font-size:8.5px;color:#94a3b8}
    </style>`;

    const html = `${stmtCss}
    <div class="stmt-wrap">
      <div class="stmt-doc-header">
        <div>
          <div class="stmt-co">${companyName}</div>
          <div class="stmt-title">${L.title}</div>
        </div>
        <div>
          <div class="stmt-entity-label">${L.entity}</div>
          <div class="stmt-entity-name">${entityName}</div>
        </div>
      </div>
      <div class="kpi-row">
        <div class="kpi kpi-debit">
          <div class="kpi-label">${L.totalDebit}</div>
          <div class="kpi-value">${fUSD(totalBorç)}</div>
        </div>
        <div class="kpi kpi-credit">
          <div class="kpi-label">${L.totalCredit}</div>
          <div class="kpi-value">${fUSD(totalAlacak)}</div>
        </div>
        <div class="kpi kpi-net">
          <div class="kpi-label">${L.netBalance}</div>
          <div class="kpi-value" style="color:${netColor}">${fUSD(Math.abs(netBakiye))} ${netSuffix ? `<span style="font-size:11px">${netSuffix.trim()}</span>` : ''}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">${L.txnCount}</div>
          <div class="kpi-value" style="color:#475569">${txnsWithBalance.length}</div>
        </div>
      </div>
      <div class="meta">
        <span>${L.period}: <strong>${periodLabel}</strong></span>
        <span>${L.currency}: <strong>USD</strong></span>
        <span style="margin-left:auto">${today}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>${L.date}</th>
            <th>${L.type}</th>
            <th>${L.ref}</th>
            <th>${L.desc}</th>
            <th class="th-c">${L.curr}</th>
            <th class="th-r">${L.debit} (USD)</th>
            <th class="th-r">${L.credit} (USD)</th>
            <th class="th-r">${L.balance} (USD)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="color:#64748b;font-size:9.5px">${L.recordCount}: ${txnsWithBalance.length}</td>
            <td></td>
            <td style="text-align:right;color:#b91c1c">${fUSD(totalBorç)}</td>
            <td style="text-align:right;color:#065f46">${fUSD(totalAlacak)}</td>
            <td style="text-align:right;color:${netColor}">${fUSD(Math.abs(netBakiye))}${netSuffix}</td>
          </tr>
        </tfoot>
      </table>
      <div class="stmt-footer">
        <span>${companyName} · ${L.title}</span>
        <span>${today}</span>
      </div>
    </div>`;

    openPrint(html, `${L.title} — ${entityName}`, companyName);
  }

  // ── Excel export ──────────────────────────────────────────────────────────
  function exportExcel() {
    const rows = txnsWithBalance.map((txn) => ({
      'Tarih / Date':        txn.transaction_date,
      'Tür / Type':          txn.transaction_type,
      'Referans / Ref':      txn.reference_no || '',
      'Açıklama / Desc':     txn.description  || '',
      'Döviz / Currency':    txn.currency     || '',
      'Borç / Debit':        txn.isDebit  ? txn.amt : '',
      'Alacak / Credit':    !txn.isDebit  ? txn.amt : '',
      'Bakiye / Balance':    txn.balance,
      'Durum / Status':      txn.payment_status || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, entityName.slice(0, 31) || 'Statement');
    XLSX.writeFile(wb, `cari-${entityName.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const hasData = entityId && txnsWithBalance.length > 0;
  const activeFilterCount = [txnTypeFilter, statusFilter, dateFrom, dateTo].filter(Boolean).length;

  return (
    <div className="space-y-4">

      {/* ── Filtre kartı (overflow-hidden KULLANMA — dropdown kırpılır) ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">

        {/* Kişi türü tab bar */}
        <div className="flex border-b border-gray-50">
          {(['customer', 'supplier', 'service_provider'] as const).map((type) => (
            <button
              key={type}
              onClick={() => { setEntityType(type); setEntityId(''); setEntityOpen(false); setEntitySearch(''); }}
              className={cn(
                'flex-1 py-2.5 text-[12px] font-semibold transition-all border-b-2 -mb-px',
                entityType === type ? '' : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50',
              )}
              style={entityType === type ? { borderBottomColor: accent, color: accent } : {}}
            >
              {ENTITY_TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="px-4 py-3 flex flex-wrap items-center gap-2">

          {/* Kişi seçimi */}
          <div ref={entityDropdownRef} className="relative flex-1 min-w-0" style={{ minWidth: 160 }}>
            <button
              type="button"
              onClick={() => {
                if (!entityOpen && entityDropdownRef.current) {
                  const r = entityDropdownRef.current.getBoundingClientRect();
                  setDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width });
                }
                setEntityOpen((v) => !v);
              }}
              className={cn(
                'w-full h-9 rounded-xl border px-3 text-[12px] font-medium transition-colors flex items-center gap-2 bg-white',
                entityId ? 'text-gray-900' : 'text-gray-400',
              )}
              style={{ borderColor: entityId ? `${accent}50` : '#e5e7eb' }}
            >
              <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <span className="flex-1 truncate text-left">
                {entityId ? entityName : `${ENTITY_TYPE_LABELS[entityType]} seçin…`}
              </span>
              {entityId
                ? <X className="h-3.5 w-3.5 text-gray-300 hover:text-red-400 shrink-0 transition-colors"
                    onClick={(e) => { e.stopPropagation(); setEntityId(''); setEntityOpen(false); }} />
                : <ChevronDown className="h-3.5 w-3.5 text-gray-300 shrink-0" />
              }
            </button>

            {entityOpen && dropdownPos && createPortal(
              <div
                data-entity-portal
                style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: Math.max(dropdownPos.width, 240), zIndex: 9999 }}
                className="bg-white border border-gray-200 rounded-xl shadow-xl"
              >
                <div className="p-2 border-b border-gray-100">
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <input autoFocus type="text" value={entitySearch}
                      onChange={(e) => setEntitySearch(e.target.value)}
                      placeholder="Ara…" className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-gray-400" />
                    {entitySearch && <button type="button" onClick={() => setEntitySearch('')}><X className="h-3 w-3 text-gray-400" /></button>}
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {entityError ? (
                    <div className="px-3 py-4 text-[12px] text-red-500 text-center">Hata: {(entityError as Error).message}</div>
                  ) : loadingEntities && entityOptions.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-5 text-[12px] text-gray-400">
                      <div className="w-4 h-4 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: accent }} />
                      Yükleniyor…
                    </div>
                  ) : filteredEntityOptions.length === 0 ? (
                    <div className="px-3 py-5 text-[12px] text-gray-400 text-center">
                      {entityOptions.length === 0 ? 'Kayıt bulunamadı' : 'Sonuç yok'}
                    </div>
                  ) : filteredEntityOptions.map((e) => (
                    <button key={e.id} type="button"
                      onClick={() => { setEntityId(e.id); setEntityOpen(false); setEntitySearch(''); }}
                      className="w-full text-left px-3 py-2.5 text-[13px] transition-colors hover:bg-gray-50 border-b border-gray-50 last:border-0"
                      style={entityId === e.id ? { color: accent, background: `${accent}08`, fontWeight: 600 } : {}}>
                      {e.name}
                    </button>
                  ))}
                </div>
              </div>
            , document.body)}
          </div>

          {/* Filtre butonu */}
          <div ref={filterBtnRef} className="relative shrink-0">
            <button
              onClick={() => {
                if (!filterOpen && filterBtnRef.current) {
                  const r = filterBtnRef.current.getBoundingClientRect();
                  const popW = 288; // w-72
                  const left = r.left + popW > window.innerWidth ? r.right - popW : r.left;
                  setFilterPos({ top: r.bottom + 4, left });
                }
                setFilterOpen((v) => !v);
              }}
              className="h-9 px-3 rounded-xl border text-[12px] font-semibold flex items-center gap-1.5 transition-colors bg-white"
              style={
                activeFilterCount > 0 || filterOpen
                  ? { borderColor: `${accent}50`, background: `${accent}08`, color: accent }
                  : { borderColor: '#e5e7eb', color: '#6b7280' }
              }
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtrele
              {activeFilterCount > 0 && (
                <span
                  className="w-4 h-4 rounded-full text-white text-[9px] font-extrabold flex items-center justify-center"
                  style={{ background: accent }}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>

            {filterOpen && filterPos && createPortal(
              <div
                data-filter-portal
                style={{ position: 'fixed', top: filterPos.top, left: filterPos.left, zIndex: 9999 }}
                className="w-72 bg-white border border-gray-200 rounded-2xl shadow-xl"
              >
                {/* Header */}
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Filtreler</span>
                  <button onClick={() => setFilterOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                    <X className="h-3.5 w-3.5 text-gray-400" />
                  </button>
                </div>

                {/* Filter fields */}
                <div className="px-4 py-3 space-y-3">
                  {/* Tarih aralığı */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1.5">Tarih Aralığı</label>
                    <div className="flex items-center gap-1.5">
                      <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                        className="h-8 flex-1 rounded-lg border border-gray-200 px-2 text-[11px] text-gray-700 outline-none focus:border-gray-300 bg-white" />
                      <span className="text-gray-300 text-[11px]">—</span>
                      <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                        className="h-8 flex-1 rounded-lg border border-gray-200 px-2 text-[11px] text-gray-700 outline-none focus:border-gray-300 bg-white" />
                    </div>
                  </div>

                  {/* İşlem türü */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1.5">İşlem Türü</label>
                    <select value={txnTypeFilter} onChange={(e) => setTxnTypeFilter(e.target.value)}
                      className="h-8 w-full rounded-lg border border-gray-200 px-2 text-[12px] text-gray-700 outline-none focus:border-gray-300 bg-white">
                      {TXN_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  {/* Durum */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1.5">Durum</label>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                      className="h-8 w-full rounded-lg border border-gray-200 px-2 text-[12px] text-gray-700 outline-none focus:border-gray-300 bg-white">
                      {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>

                  {/* Temizle */}
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => { setDateFrom(''); setDateTo(''); setTxnTypeFilter(''); setStatusFilter(''); setFilterOpen(false); }}
                      className="w-full h-8 rounded-xl text-[11px] font-semibold text-red-500 border border-red-100 bg-red-50 hover:bg-red-100 transition-colors"
                    >
                      Filtreleri Temizle
                    </button>
                  )}
                </div>
              </div>,
              document.body
            )}
          </div>

          {/* Print / Excel */}
          {hasData && (
            <div className="flex items-center gap-1 ml-auto shrink-0">
              {(['tr', 'en', 'fa'] as StatementLang[]).map((lang) => (
                <button key={lang} onClick={() => printStatement(lang)}
                  className="h-9 px-3 rounded-xl text-[11px] font-bold text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors border border-gray-200">
                  {lang.toUpperCase()}
                </button>
              ))}
              <button onClick={exportExcel}
                className="h-9 px-3 rounded-xl text-[11px] font-semibold text-gray-500 hover:bg-gray-50 transition-colors border border-gray-200 whitespace-nowrap">
                ↓ Excel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoading && entityId && (
        <div className="flex items-center justify-center py-12 bg-white rounded-2xl shadow-sm border border-gray-100 gap-2 text-[13px] text-gray-400">
          <div className="w-5 h-5 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: accent }} />
          Yükleniyor…
        </div>
      )}

      {/* Empty — seçim yapılmadı */}
      {!entityId && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl shadow-sm border border-gray-100">
          <Search className="h-8 w-8 mb-2 opacity-20" />
          <p className="text-[13px] font-medium text-gray-500">Hesap ekstresi görüntüle</p>
          <p className="text-[11px] mt-0.5 text-gray-400">Müşteri, tedarikçi veya hizmet sağlayıcı seçin</p>
        </div>
      )}

      {/* Empty — kayıt yok */}
      {entityId && !isLoading && txnsWithBalance.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl shadow-sm border border-gray-100">
          <FileText className="h-8 w-8 mb-2 opacity-20" />
          <p className="text-[13px] font-medium text-gray-500">İşlem bulunamadı</p>
          <p className="text-[11px] mt-0.5 text-gray-400">
            {activeFilterCount > 0 ? 'Filtrelerinizi değiştirmeyi deneyin' : 'Bu hesapta henüz işlem yok'}
          </p>
        </div>
      )}

      {hasData && !isLoading && (
        <>
          {/* Özet — 3 sütun quick info */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-gray-50">
              <div className="px-3 md:px-5 py-3 md:py-4">
                <div className="text-[8px] md:text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">Toplam Borç</div>
                <div className="text-[13px] md:text-[17px] font-extrabold text-red-600 break-all leading-tight">{fUSD(totalBorç)}</div>
                <div className="text-[10px] text-gray-400 mt-0.5 truncate">{entityName}</div>
              </div>
              <div className="px-3 md:px-5 py-3 md:py-4">
                <div className="text-[8px] md:text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">Toplam Alacak</div>
                <div className="text-[13px] md:text-[17px] font-extrabold text-green-700 break-all leading-tight">{fUSD(totalAlacak)}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{txnsWithBalance.length} işlem</div>
              </div>
              <div className="px-3 md:px-5 py-3 md:py-4" style={netBakiye !== 0 ? { background: netBakiye > 0 ? '#fffbeb' : '#f0fdf4' } : {}}>
                <div className="text-[8px] md:text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">Net Bakiye</div>
                <div className="flex items-baseline gap-1 flex-wrap">
                  <span className="text-[13px] md:text-[17px] font-extrabold break-all leading-tight"
                    style={{ color: netBakiye > 0 ? '#b45309' : netBakiye < 0 ? '#15803d' : '#6b7280' }}>
                    {fUSD(Math.abs(netBakiye))}
                  </span>
                  <span className="text-[9px] font-extrabold uppercase tracking-widest"
                    style={{ color: netBakiye > 0 ? '#b45309' : netBakiye < 0 ? '#15803d' : '#9ca3af' }}>
                    {netBakiye > 0 ? 'Borçlu' : netBakiye < 0 ? 'Alacaklı' : 'Sıfır'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* İşlem tablosu */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-50 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Hesap Ekstresi</span>
                {(dateFrom || dateTo) && (
                  <span className="text-[10px] text-gray-400 font-mono">
                    {dateFrom || '…'} – {dateTo || '…'}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-gray-400">{txnsWithBalance.length} kayıt</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Tarih', 'İşlem Türü', 'İşlem No', 'Açıklama', 'Döviz', 'Borç (USD)', 'Alacak (USD)', 'Bakiye (USD)'].map((h, i) => (
                      <th key={h} className={cn(
                        'px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap',
                        i >= 5 ? 'text-right' : 'text-left',
                      )}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txnsWithBalance.map((txn, i) => (
                    <tr key={txn.id} className={cn(
                      'border-b border-gray-50 hover:bg-gray-50/60 transition-colors',
                      i % 2 === 1 && 'bg-gray-50/40',
                    )}>
                      <td className="px-4 py-3 text-[12px] text-gray-500 whitespace-nowrap">{fDate(txn.transaction_date)}</td>
                      <td className="px-4 py-3 text-[12px] text-gray-700">{tc(`txType.${txn.transaction_type}`)}</td>
                      <td className="px-4 py-3 text-[11px] font-mono text-gray-400">{txn.reference_no || '—'}</td>
                      <td className="px-4 py-3 text-[12px] text-gray-600 max-w-[200px] truncate">{txn.description || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-bold text-gray-700 tabular-nums">{txn.currency}</span>
                          {txn.currency !== 'USD' && (
                            <span className="text-[10px] text-gray-400 tabular-nums">{fCurrency(txn.amount, txn.currency)}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {txn.isDebit ? (
                          <div className="text-[12px] font-semibold text-red-600 tabular-nums">{fUSD(txn.amt)}</div>
                        ) : ''}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!txn.isDebit ? (
                          <div className="text-[12px] font-semibold text-green-700 tabular-nums">{fUSD(txn.amt)}</div>
                        ) : ''}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-right font-bold whitespace-nowrap">
                        <span style={{ color: txn.balance > 0 ? '#b45309' : txn.balance < 0 ? '#16a34a' : '#9ca3af' }}>
                          {fUSD(Math.abs(txn.balance))}
                        </span>
                        {txn.balance !== 0 && (
                          <span className="ml-1 text-[10px] font-black"
                            style={{ color: txn.balance > 0 ? '#b45309' : '#16a34a' }}>
                            ({txn.balance > 0 ? 'B' : 'A'})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-100 bg-gray-50/60">
                    <td colSpan={4} className="px-4 py-3 text-[11px] text-gray-400">{txnsWithBalance.length} kayıt</td>
                    <td className="px-4 py-3 text-[10px] font-bold text-gray-500 text-right uppercase tracking-widest">Genel Toplam</td>
                    <td className="px-4 py-3 text-[13px] text-right font-black text-red-600">{fUSD(totalBorç)}</td>
                    <td className="px-4 py-3 text-[13px] text-right font-black text-green-700">{fUSD(totalAlacak)}</td>
                    <td className="px-4 py-3 text-[13px] text-right font-black whitespace-nowrap">
                      <span style={{ color: netBakiye > 0 ? '#b45309' : netBakiye < 0 ? '#16a34a' : '#9ca3af' }}>
                        {fUSD(Math.abs(netBakiye))}
                      </span>
                      {netBakiye !== 0 && (
                        <span className="ml-1 text-[10px] font-black"
                          style={{ color: netBakiye > 0 ? '#b45309' : '#16a34a' }}>
                          ({netBakiye > 0 ? 'B' : 'A'})
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Analytics Tab ─────────────────────────────────────────────────────────

const CHART_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16'];

function AnalyticsTab() {
  const { t, i18n } = useTranslation('reports');
  const { data: files = [] } = useTradeFiles();
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';
  const [period, setPeriod] = useState<'6m' | '12m' | 'all'>('12m');

  const filteredFiles = useMemo(() => {
    // Sadece tamamlanmış dosyalar K/Z raporuna işlenir
    const completed = files.filter(f => f.status === 'completed');
    if (period === 'all') return completed;
    const months = period === '6m' ? 6 : 12;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    return completed.filter(f => new Date(f.created_at ?? '') >= cutoff);
  }, [files, period]);

  // Monthly trend data
  const monthlyData = useMemo(() => {
    const map: Record<string, { label: string; revenue: number; cost: number; profit: number; files: number }> = {};
    filteredFiles.forEach(f => {
      const d = new Date(f.created_at ?? '');
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
      const label = new Intl.DateTimeFormat(i18n.language, { month: 'short', year: '2-digit' }).format(d);
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
  }, [filteredFiles, i18n.language]);

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
    const statusLabels: Record<string, string> = {
      request: t('analytics.status_request'),
      sale: t('analytics.status_sale'),
      delivery: t('analytics.status_delivery'),
      completed: t('analytics.status_completed'),
      cancelled: t('analytics.status_cancelled'),
    };
    return Object.entries(counts).map(([key, value]) => ({
      name: statusLabels[key] ?? key, value, fill: colors[key] ?? '#94a3b8',
    }));
  }, [filteredFiles, t]);

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

  const periodLabels: [typeof period, string][] = [
    ['6m', t('analytics.last_6m')],
    ['12m', t('analytics.last_12m')],
    ['all', t('analytics.all_time')],
  ];

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {periodLabels.map(([key, label]) => (
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
          {t('analytics.excel_export')}
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
        {[
          { label: t('analytics.kpi_total_files'), value: filteredFiles.length.toString(), color: 'text-blue-700' },
          { label: t('analytics.kpi_total_admt'), value: fN(totalAdmt, 0), color: 'text-purple-700' },
          { label: t('analytics.kpi_total_revenue'), value: fUSD(totalRevenue), color: 'text-green-700' },
          { label: t('analytics.kpi_total_cost'), value: fUSD(totalCost), color: 'text-red-600' },
          { label: t('analytics.kpi_net_profit_margin'), value: `${fUSD(totalProfit)} / ${avgMargin.toFixed(1)}%`, color: totalProfit >= 0 ? 'text-green-700' : 'text-red-600' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl md:rounded-2xl shadow-sm px-2 py-3 md:p-3 overflow-hidden">
            <div className="text-[8px] md:text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 leading-tight">{kpi.label}</div>
            <div className={`text-[12px] md:text-sm font-black break-all leading-tight ${kpi.color}`}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {noData ? (
        <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-2xl shadow-sm">
          {t('analytics.no_data')}
        </div>
      ) : (
        <>
          {/* Monthly trend chart */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="text-sm font-bold text-gray-800 mb-4">{t('analytics.chart_monthly_title')}</div>
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
                    name === 'revenue' ? t('analytics.legend_revenue') : name === 'cost' ? t('analytics.legend_cost') : t('analytics.legend_profit'),
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
              {[['#60a5fa', t('analytics.legend_revenue')], ['#f87171', t('analytics.legend_cost')], ['#4ade80', t('analytics.legend_profit')]].map(([c, l]) => (
                <div key={l} className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c }} />
                  <span className="text-[10px] text-gray-400">{l}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Customer revenue bar */}
            <div className="bg-white rounded-2xl shadow-sm p-5 md:col-span-3">
              <div className="text-sm font-bold text-gray-800 mb-4">{t('analytics.chart_customer_title')}</div>
              {customerData.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs">{t('analytics.no_data_short')}</div>
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
                        name === 'revenue' ? t('analytics.legend_revenue') : t('analytics.legend_profit'),
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
              <div className="text-sm font-bold text-gray-800 mb-4">{t('analytics.chart_status_title')}</div>
              {statusData.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs">{t('analytics.no_data_short')}</div>
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
              <div className="text-sm font-bold text-gray-800">{t('analytics.table_customer_perf')}</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {[
                      t('analytics.col_customer'),
                      t('analytics.col_files'),
                      t('analytics.col_total_admt'),
                      t('analytics.col_revenue'),
                      t('analytics.col_cost'),
                      t('analytics.col_net_profit'),
                      t('analytics.col_margin'),
                    ].map(h => (
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
  const { t } = useTranslation('reports');
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
      if (d === null) return { label: t('eta.status_arrived'), cls: 'bg-gray-100 text-gray-600' };
      if (d <= 0) return { label: t('eta.status_on_time'), cls: 'bg-green-100 text-green-700' };
      return { label: t('eta.status_delayed_days', { days: d }), cls: 'bg-red-100 text-red-700' };
    }
    if (f.revised_eta) return { label: t('eta.status_delayed'), cls: 'bg-amber-100 text-amber-700' };
    return { label: t('eta.status_pending'), cls: 'bg-blue-100 text-blue-700' };
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
          <div className="text-sm font-bold text-gray-800">{t('eta.title')}</div>
          <div className="text-xs text-gray-400 mt-0.5">{t('eta.subtitle', { count: etaFiles.length })}</div>
        </div>
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          {t('eta.export_csv')}
        </button>
      </div>

      {etaFiles.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-2xl shadow-sm">
          {t('eta.no_files')}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                {[
                  t('eta.col_file_no'),
                  t('eta.col_customer'),
                  t('eta.col_product'),
                  t('eta.col_promised_eta'),
                  t('eta.col_revised_eta'),
                  t('eta.col_actual_arrival'),
                  t('eta.col_delay'),
                  t('eta.col_status'),
                ].map(h => (
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

// ─── Customer Report Tab ───────────────────────────────────────────────────

const FARSI_FONTS = [
  { id: 'nazanin',   label: 'Nazanin',            family: 'Nazanin',             link: null },
  { id: 'vazirmatn', label: 'Vazirmatn',           family: 'Vazirmatn',            link: 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;900&display=swap' },
  { id: 'sahel',     label: 'Sahel',               family: 'Sahel',               link: 'https://cdn.jsdelivr.net/gh/rastikerdar/sahel-font@v4.2.0/dist/font-face.css' },
  { id: 'shabnam',   label: 'Shabnam',             family: 'Shabnam',             link: 'https://cdn.jsdelivr.net/gh/rastikerdar/shabnam-font@v5.0.1/dist/font-face.css' },
  { id: 'samim',     label: 'Samim',               family: 'Samim',               link: 'https://cdn.jsdelivr.net/gh/rastikerdar/samim-font@v4.1.0/dist/font-face.css' },
  { id: 'parastoo',  label: 'Parastoo',            family: 'Parastoo',            link: 'https://cdn.jsdelivr.net/gh/rastikerdar/parastoo-font@v4.1.0/dist/font-face.css' },
  { id: 'kalameh',   label: 'Kalameh',             family: 'Kalameh',             link: 'https://cdn.jsdelivr.net/gh/rastikerdar/kalameh-font@v1.1.0/dist/font-face.css' },
  { id: 'lalezar',   label: 'Lalezar',             family: 'Lalezar',             link: 'https://fonts.googleapis.com/css2?family=Lalezar&display=swap' },
  { id: 'amiri',     label: 'Amiri',               family: 'Amiri',               link: 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap' },
  { id: 'noto',      label: 'Noto Naskh Arabic',   family: 'Noto Naskh Arabic',   link: 'https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=swap' },
  { id: 'scheher',   label: 'Scheherazade New',    family: 'Scheherazade New',    link: 'https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&display=swap' },
  { id: 'lateef',    label: 'Lateef',              family: 'Lateef',              link: 'https://fonts.googleapis.com/css2?family=Lateef:wght@400;700&display=swap' },
] as const;
type FarsiFontId = typeof FARSI_FONTS[number]['id'];

export function CustomerReportTab() {
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';
  const { data: customers = [], isLoading: loadingC } = useCustomers();
  const { data: allFiles = [] } = useTradeFiles();
  const { data: settings } = useSettings();

  const [customerId, setCustomerId] = useState('');
  const [custOpen, setCustOpen] = useState(false);
  const [custSearch, setCustSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const custDropdownRef = useRef<HTMLDivElement>(null);

  // Report options
  const [reportLang, setReportLang] = useState<'tr' | 'en' | 'fa'>('tr');
  const [farsiFont] = useState<FarsiFontId>('vazirmatn');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [advDetail, setAdvDetail] = useState(true); // true = full list, false = total only

  // Hitap bilgileri (raporun kime hitap ettiği)
  const [toTitle, setToTitle] = useState<'agha' | 'khanom'>('agha');
  const [toName, setToName]   = useState(''); // kişi adı

  const LABELS = {
    tr: {
      payments: 'Ödemeler', products: 'Satın Alınan Ürünler', advances: 'Ön Ödemeler',
      infoOnly: 'Bilgi Amaçlı', totalPayments: 'Ödemeler Toplamı', totalProducts: 'Toplam Satın Alım',
      totalAdvances: 'Ön Ödemeler Toplamı', total: 'Toplam',
      balanceText: 'Satın alımlar eksi ödemeler sonrası net bakiye:',
      debtor: 'Borçlu', creditor: 'Alacaklı', closed: 'Kapalı',
      dear: 'Sayın', reportTitle: 'Müşteri Raporu',
      salutComp: 'Sayın', salutNameAgha: 'Sayın Bay', salutNameKhanom: 'Sayın Bayan',
      greeting: 'Hesap dökümünü saygılarımızla bilgilerinize sunarız:',
      payHdr: ['#', 'Tarih', 'Tutar', 'Para Birimi', 'USD Karşılığı', 'Açıklama'],
      prdHdr: ['#', 'Ürün', 'Birim Fiyat (USD)', 'Tonaj (ADMT)', 'Toplam (USD)', 'Dosya No'],
      advHdr: ['#', 'Tarih', 'Tutar', 'Para Birimi', 'USD Karşılığı', 'Açıklama'],
      noPayment: 'Ödeme yok', noProduct: 'Kayıt yok', noAdvance: 'Ön ödeme yok',
      dateLabel: 'Tarih', clientLabel: 'MÜŞTERİ', printBtn: 'Yazdır / PDF',
      dateFilter: 'Tarih:', advLabel: 'Ön ödemeler:', fullList: 'Tam liste', totalOnly: 'Sadece toplam',
      records: 'kayıt',
    },
    en: {
      payments: 'Payments', products: 'Products Purchased', advances: 'Advance Payments',
      infoOnly: 'Informational Only', totalPayments: 'Total Payments', totalProducts: 'Total Purchases',
      totalAdvances: 'Total Advances', total: 'Total',
      balanceText: 'Net balance after deducting payments from purchases:',
      debtor: 'Outstanding', creditor: 'Credit', closed: 'Settled',
      dear: 'Dear', reportTitle: 'Customer Report',
      salutComp: 'Dear', salutNameAgha: 'Dear Mr.', salutNameKhanom: 'Dear Ms.',
      greeting: 'Please find below our account statement:',
      payHdr: ['#', 'Date', 'Amount', 'Currency', 'USD Equiv.', 'Description'],
      prdHdr: ['#', 'Product', 'Unit Price (USD)', 'Tonnage (ADMT)', 'Total (USD)', 'File No'],
      advHdr: ['#', 'Date', 'Amount', 'Currency', 'USD Equiv.', 'Description'],
      noPayment: 'No payments', noProduct: 'No records', noAdvance: 'No advances',
      dateLabel: 'Date', clientLabel: 'CLIENT', printBtn: 'Print / PDF',
      dateFilter: 'Date:', advLabel: 'Advances:', fullList: 'Full list', totalOnly: 'Total only',
      records: 'records',
    },
    fa: {
      payments: 'پرداخت‌ها', products: 'محصولات خریداری‌شده', advances: 'پیش‌پرداخت‌ها',
      infoOnly: 'اطلاعاتی', totalPayments: 'جمع پرداخت‌ها', totalProducts: 'جمع خرید',
      totalAdvances: 'جمع پیش‌پرداخت‌ها', total: 'جمع',
      balanceText: 'ﻣﺎﻧﺪه ﺣﺴﺎب ﺷﻤﺎ ﺑﺎ در ﻧﻈﺮ ﮔﺮﻓﺘﻦ ﭘﺮداﺧﺘﯽ ﻫﺎی اﻧﺠﺎم ﺷﺪه و ﭘﯿﺶ ﭘﺮداﺧﺖ ﻫﺎ:',
      debtor: 'بدهکار', creditor: 'بستانکار', closed: 'تسویه',
      dear: 'جناب', reportTitle: 'صورتحساب',
      salutComp: 'مدیریت محترم شرکت', salutNameAgha: 'جناب آقای', salutNameKhanom: 'سرکار خانم',
      greeting: 'ﺑﺎ ﺳﻼم و ﻋﺮض ادب، ﺻﻮرت ﺣﺴﺎب ﻓﯽ ﻣﺎﺑﯿﻦ ﺑﻪ ﺷﺮح ذﯾﻞ ﺗﻘﺪﯾﻢ ﻣﯽ ﮔﺮدد:',
      payHdr: ['#', 'تاریخ', 'مبلغ', 'ارز', 'معادل دلار', 'توضیحات'],
      prdHdr: ['#', 'محصول', 'قیمت واحد (USD)', 'تناژ (ADMT)', 'جمع (USD)', 'شماره پرونده'],
      advHdr: ['#', 'تاریخ', 'مبلغ', 'ارز', 'معادل دلار', 'توضیحات'],
      noPayment: 'پرداختی موجود نیست', noProduct: 'رکوردی موجود نیست', noAdvance: 'پیش‌پرداختی موجود نیست',
      dateLabel: 'تاریخ', clientLabel: 'مشتری', printBtn: 'چاپ / PDF',
      dateFilter: 'تاریخ:', advLabel: 'پیش‌پرداخت‌ها:', fullList: 'لیست کامل', totalOnly: 'فقط جمع',
      records: 'رکورد',
    },
  };
  // UI always in Turkish; print output uses reportLang (see printReport below)
  const L = LABELS['tr'];

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const customerName = selectedCustomer?.name ?? '';

  const filteredCustomers = useMemo(
    () => customers.filter((c) => c.name.toLowerCase().includes(custSearch.toLowerCase())),
    [customers, custSearch],
  );

  const { data: rawTxns = [], isLoading: txnLoading } = useTransactionsByEntityEnhanced(
    'customer', customerId || undefined, true,
  );

  // Date-filtered transactions
  const filteredTxns = useMemo(() => rawTxns.filter((t) => {
    if (dateFrom && t.transaction_date < dateFrom) return false;
    if (dateTo && t.transaction_date > dateTo) return false;
    return true;
  }), [rawTxns, dateFrom, dateTo]);

  // Table 1: Regular payments (receipts only, no advances)
  const payments = useMemo(
    () => filteredTxns.filter((t) => t.transaction_type === 'receipt'),
    [filteredTxns],
  );

  // Satış faturası (sale_inv) oluşturulmuş dosyaların ID seti
  const invoicedFileIds = useMemo(
    () => new Set(
      rawTxns
        .filter((t) => t.transaction_type === 'sale_inv' && t.trade_file_id)
        .map((t) => t.trade_file_id as string),
    ),
    [rawTxns],
  );

  // Table 2 — Birincil kaynak: sale_inv işlemleri (muhasebe kayıtları)
  const saleInvoices = useMemo(
    () => filteredTxns.filter((t) => t.transaction_type === 'sale_inv'),
    [filteredTxns],
  );

  // Table 2 — Yedek kaynak: satış fiyatı olan ticaret dosyaları (sale_inv yoksa gösterilir)
  const customerFiles = useMemo(
    () => allFiles.filter(
      (f) => f.customer_id === customerId &&
             (f.selling_price ?? 0) > 0 &&
             (invoicedFileIds.has(f.id) || ['sale', 'delivery', 'completed'].includes(f.status)),
    ),
    [allFiles, customerId, invoicedFileIds],
  );

  // Table 3: Ön ödemeler — tedarikçi avansları hariç, TÜM müşteri ön ödemeleri gösterilir
  // (faturası kesilmiş dosyalara ait olanlar da dahil — müşterinin borcunu azaltır)
  // party_type NULL olabiliyor (advance tipi typeToParty haritasında yoktu)
  const advances = useMemo(
    () => filteredTxns.filter(
      (t) => t.transaction_type === 'advance' &&
             t.party_type !== 'supplier',
    ),
    [filteredTxns],
  );

  const totalPayments = payments.reduce((s, t) => s + (t.amount_usd ?? 0), 0);
  // sale_inv varsa onlardan topla; yoksa ticaret dosyası tutarlarından
  const totalProducts = saleInvoices.length > 0
    ? saleInvoices.reduce((s, t) => s + (t.amount_usd ?? 0), 0)
    : customerFiles.reduce((s, f) => {
        const qty = f.delivered_admt ?? f.tonnage_mt ?? 0;
        return s + qty * (f.selling_price ?? 0);
      }, 0);
  const totalAdvances = advances.reduce((s, t) => s + (t.amount_usd ?? 0), 0);
  // balance > 0: customer still owes us (borçlu); < 0: overpaid (alacaklı)
  // balance = products - advances (prepaid) - payments (post-invoice receipts)
  const balance = totalProducts - totalAdvances - totalPayments;

  // Outside-click handler — customer dropdown
  useEffect(() => {
    if (!custOpen) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (!custDropdownRef.current?.contains(target) && !(target as Element)?.closest?.('[data-cr-portal]')) {
        setCustOpen(false);
        setCustSearch('');
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [custOpen]);

  // Filter panel
  const [filterOpen, setFilterOpen] = useState(false);
  const filterBtnRef = useRef<HTMLDivElement>(null);
  const [filterPos, setFilterPos] = useState<{ top: number; left: number } | null>(null);
  const activeFilterCount = [dateFrom, dateTo].filter(Boolean).length;

  useEffect(() => {
    if (!filterOpen) return;
    function handler(e: MouseEvent) {
      const t = e.target as Element;
      if (!filterBtnRef.current?.contains(t) && !t.closest('[data-cr-filter-portal]')) {
        setFilterOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen]);

  const isLoading = txnLoading && !!customerId;

  // ── Print ─────────────────────────────────────────────────────────────────
  function printReport() {
    // Print uses the selected language; UI always stays in Turkish (L = LABELS['tr'])
    const L = LABELS[reportLang];
    // fa-IR-u-nu-latn: Farsça ay adları ama Latin (İngilizce) rakamlar
    const locale = reportLang === 'tr' ? 'tr-TR' : reportLang === 'fa' ? 'fa-IR-u-nu-latn' : 'en-GB';
    const isRtl = reportLang === 'fa';

    // Translate common Turkish trade terms in descriptions for EN/FA output
    const TR_DICT: Record<string, Record<'en' | 'fa', string>> = {
      'ön ödeme':    { en: 'advance payment', fa: 'پیش پرداخت' },
      'peşinat':     { en: 'down payment',    fa: 'پیش پرداخت' },
      'avans':       { en: 'advance',          fa: 'پیش پرداخت' },
      'ödeme':       { en: 'payment',          fa: 'پرداخت' },
      'tahsilat':    { en: 'collection',       fa: 'وصول' },
      'fatura':      { en: 'invoice',          fa: 'فاکتور' },
      'navlun':      { en: 'freight',          fa: 'کرایه حمل' },
      'sigorta':     { en: 'insurance',        fa: 'بیمه' },
      'gümrük':      { en: 'customs',          fa: 'گمرک' },
      'depo':        { en: 'warehouse',        fa: 'انبار' },
      'liman':       { en: 'port',             fa: 'بندر' },
      'nakliye':     { en: 'shipping',         fa: 'حمل و نقل' },
      'teslim':      { en: 'delivery',         fa: 'تحویل' },
      'bakiye':      { en: 'balance',          fa: 'مانده' },
      'alacak':      { en: 'credit',           fa: 'بستانکار' },
      'borç':        { en: 'debit',            fa: 'بدهی' },
      'kargo':       { en: 'cargo',            fa: 'بار' },
    };
    const translateDesc = (desc: string): string => {
      if (reportLang === 'tr' || !desc) return desc;
      let result = desc;
      // longer phrases first to avoid partial replacements
      const sorted = Object.entries(TR_DICT).sort((a, b) => b[0].length - a[0].length);
      for (const [tr, map] of sorted) {
        const translated = map[reportLang as 'en' | 'fa'];
        if (translated) result = result.replace(new RegExp(tr, 'gi'), translated);
      }
      return result;
    };
    const today = new Date().toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
    const companyName = settings?.company_name ?? 'SUNPLUS KİMYA';
    const companyTagline = 'SUNPLUS KİMYA SAN. TİC. LTD.';
    const logoHtml = settings?.logo_url
      ? `<div><img src="${settings.logo_url}" style="max-height:52px;max-width:150px;object-fit:contain;display:block"><div style="font-size:8px;color:#94a3b8;font-weight:500;letter-spacing:.04em;margin-top:3px">${companyTagline}</div></div>`
      : `<div><div style="font-size:20px;font-weight:900;letter-spacing:-0.5px;color:#111">${companyName}</div><div style="font-size:8px;color:#94a3b8;font-weight:500;letter-spacing:.04em;margin-top:2px">${companyTagline}</div></div>`;

    // Styles — Farsça için daha büyük font
    const fsBase  = isRtl ? '13.5px' : '10.5px';
    const fsHead  = isRtl ? '12px'   : '9px';
    const fsSec   = isRtl ? '15px'   : '12px';
    const fsCirc  = isRtl ? '13px'   : '11px';
    const circSz  = isRtl ? '28px'   : '24px';
    const fsDesc  = isRtl ? '12.5px' : '9.5px';   // tablo açıklama hücresi
    const fsTfLbl = isRtl ? '12.5px' : '10px';    // tfoot label
    const fsTfVal = isRtl ? '14px'   : '11px';    // tfoot value
    const TH = `padding:7px 10px;text-align:left;font-size:${fsHead};font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;white-space:nowrap;background:#f8fafc;border-bottom:1px solid #e2e8f0`;
    const TD = `padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:${fsBase};color:#374151`;
    const TDZ = TD + ';background:#fafbfc'; // zebra
    const hdr = (cols: string[], aligns: string[] = []) =>
      `<tr>${cols.map((c, i) => { const a = aligns[i] ?? (isRtl ? 'right' : 'left'); const ea = isRtl ? (a === 'left' ? 'right' : a === 'right' ? 'left' : a) : a; return `<th style="${TH};text-align:${ea}">${c}</th>`; }).join('')}</tr>`;

    const sectionHead = (num: number, title: string, color: string, badge?: string) =>
      `<div style="display:flex;align-items:center;gap:8px;margin:22px 0 8px">
        <div style="width:${circSz};height:${circSz};border-radius:50%;background:${color};color:#fff;font-size:${fsCirc};font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">${num}</div>
        <div style="font-size:${fsSec};font-weight:800;color:#1e293b">${title}</div>
        ${badge ? `<div style="font-size:${fsHead};font-weight:600;color:${color};border:1px solid ${color}30;background:${color}10;padding:2px 7px;border-radius:12px">${badge}</div>` : ''}
      </div>`;

    const payRows = payments.map((t, i) =>
      `<tr><td style="${i%2?TDZ:TD};color:#94a3b8;text-align:center;width:28px">${i+1}</td><td style="${i%2?TDZ:TD}">${fDate(t.transaction_date)}</td><td style="${i%2?TDZ:TD};text-align:right;font-weight:600">${fCurrency(t.amount, t.currency)}</td><td style="${i%2?TDZ:TD};color:#64748b">${t.currency}</td><td style="${i%2?TDZ:TD};text-align:right;font-weight:700;color:#1d4ed8">${fUSD(t.amount_usd ?? 0)}</td><td style="${i%2?TDZ:TD};color:#64748b;font-size:${fsDesc}">${translateDesc(t.description ?? '')}</td></tr>`
    ).join('');

    const prdRows = customerFiles.map((f, i) => {
      const qty = f.delivered_admt ?? f.tonnage_mt ?? 0;
      const tot = qty * (f.selling_price ?? 0);
      return `<tr><td style="${i%2?TDZ:TD};color:#94a3b8;text-align:center;width:28px">${i+1}</td><td style="${i%2?TDZ:TD};font-weight:600;color:#1e293b">${f.product?.name ?? '—'}</td><td style="${i%2?TDZ:TD};text-align:right">${fN(f.selling_price ?? 0)}</td><td style="${i%2?TDZ:TD};text-align:right">${fN(qty, 3)}</td><td style="${i%2?TDZ:TD};text-align:right;font-weight:700;color:#15803d">${fUSD(tot)}</td><td style="${i%2?TDZ:TD};font-family:monospace;font-size:${fsDesc};color:#94a3b8">${f.file_no}</td></tr>`;
    }).join('');

    const advRows = advances.map((t, i) => {
      const admt = t.trade_file?.delivered_admt ?? t.trade_file?.tonnage_mt;
      const product = t.trade_file?.product?.name;
      const fileInfo = [product, admt != null ? `${fN(admt, 3)} MT` : null].filter(Boolean).join(' — ');
      const desc = [fileInfo, t.description].filter(Boolean).join(' · ');
      return `<tr><td style="${i%2?TDZ:TD};color:#94a3b8;text-align:center;width:28px">${i+1}</td><td style="${i%2?TDZ:TD}">${fDate(t.transaction_date)}</td><td style="${i%2?TDZ:TD};text-align:right;font-weight:600">${fCurrency(t.amount, t.currency)}</td><td style="${i%2?TDZ:TD};color:#64748b">${t.currency}</td><td style="${i%2?TDZ:TD};text-align:right;font-weight:700;color:#6d28d9">${fUSD(t.amount_usd ?? 0)}</td><td style="${i%2?TDZ:TD};color:#374151;font-size:${fsDesc}">${translateDesc(desc) || '—'}</td></tr>`;
    }).join('');

    const tfootRow = (label: string, value: string, color: string, colspan = 4) =>
      `<tr style="background:#f8fafc"><td colspan="${colspan}" style="padding:7px 10px;font-size:${fsTfLbl};font-weight:700;color:#374151;text-align:right;border-top:2px solid #e2e8f0">${label}</td><td style="padding:7px 10px;font-size:${fsTfVal};font-weight:800;color:${color};text-align:right;border-top:2px solid #e2e8f0">${value}</td><td style="border-top:2px solid #e2e8f0"></td></tr>`;

    const balanceColor = balance > 0 ? '#b45309' : balance < 0 ? '#15803d' : '#6b7280';
    const balanceBg    = balance > 0 ? '#fffbeb' : balance < 0 ? '#f0fdf4' : '#f8fafc';
    const balanceBdr   = balance > 0 ? '#f59e0b' : balance < 0 ? '#22c55e' : '#cbd5e1';
    const balanceIcon  = balance > 0 ? '⚠' : balance < 0 ? '✓' : '–';
    const balanceLabel = balance > 0 ? L.debtor : balance < 0 ? L.creditor : L.closed;

    // $ simgesini küçük ve ince göster
    const dollarSz = isRtl ? '14px' : '11px';
    const fmtUSD = (v: number) =>
      fUSD(v).replace('$', `<span style="font-size:${dollarSz};font-weight:300;letter-spacing:-.01em">$</span>`);

    const advSection = advDetail
      ? `<table style="width:100%;border-collapse:collapse">
          <thead>${hdr(L.advHdr, ['center','left','right','left','right','left'])}</thead>
          <tbody>${advRows || `<tr><td colspan="6" style="padding:12px;color:#94a3b8;text-align:center;font-size:10px">${L.noAdvance}</td></tr>`}</tbody>
          <tfoot>${tfootRow(L.totalAdvances, fUSD(totalAdvances), '#6d28d9')}</tfoot>
        </table>`
      : `<div style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;background:#faf5ff;border:1px solid #ddd6fe;border-radius:8px">
          <span style="font-size:10px;color:#6b7280;font-weight:600">${L.totalAdvances}:</span>
          <span style="font-size:13px;font-weight:800;color:#6d28d9">${fUSD(totalAdvances)}</span>
        </div>`;

    const dateRange = (dateFrom || dateTo)
      ? `<span style="font-size:9px;color:#94a3b8;margin-left:8px">${dateFrom || '…'} → ${dateTo || '…'}</span>`
      : '';

    const origin = window.location.origin;
    // Font seçimi (sadece Farsça rapor için)
    const fontDef = FARSI_FONTS.find(f => f.id === farsiFont) ?? FARSI_FONTS[0];
    const nazaninRange = 'U+0600-06FF,U+200C-200F,U+FB50-FDFF,U+FE70-FEFF';
    const iranSansLink = isRtl
      ? fontDef.link === null
        ? `<style>@font-face{font-family:'Nazanin';src:url('${origin}/fonts/nazanin.ttf') format('truetype');font-weight:400;unicode-range:${nazaninRange}}@font-face{font-family:'Nazanin';src:url('${origin}/fonts/nazanin.ttf') format('truetype');font-weight:700;unicode-range:${nazaninRange}}</style>`
        : `<link rel="stylesheet" href="${fontDef.link}">`
      : '';
    const farsiFontStack = isRtl ? `'${fontDef.family}',Arial,Tahoma` : 'Arial,"Helvetica Neue"';
    // RTL + font override injected into content (buildFullHtml sidebarını bozmadan)
    const dirOverride = isRtl
      ? `${iranSansLink}<style>body,*{direction:rtl;font-family:${farsiFontStack},sans-serif!important}</style>`
      : '';

    // buildFullHtml <div class="page"> ekliyor — biz sadece içeriği veriyoruz
    const content = `
      ${dirOverride}
      <!-- HEADER -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #1e293b">
        <div>${logoHtml}</div>
        <div style="text-align:right">
          <div style="font-size:16px;font-weight:800;letter-spacing:-.3px;color:#1e293b;margin-bottom:3px">${L.reportTitle.toUpperCase()}</div>
          <div style="font-size:${isRtl ? '12px' : '10px'};color:#64748b">${L.dateLabel}: <strong style="color:#1e293b">${today}</strong>${dateRange}</div>
        </div>
      </div>

      <!-- TO / SALUTATION BLOCK -->
      <div style="margin-bottom:20px;${isRtl ? 'direction:rtl;text-align:right' : ''}">
        <div style="font-size:15px;font-weight:1000;color:#1e293b;margin-bottom:2px">${L.salutComp} ${customerName}</div>
        ${toName ? `<div style="font-size:15px;font-weight:1000;color:#1e293b;margin-bottom:4px">${toTitle === 'agha' ? L.salutNameAgha : L.salutNameKhanom} ${toName}</div>` : ''}
        <div style="font-size:14px;font-weight:1000;color:#374151">${L.greeting}</div>
      </div>

      <!-- TABLE 1: PAYMENTS -->
      ${sectionHead(1, L.payments, '#2563eb')}
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <thead>${hdr(L.payHdr, ['center','left','right','left','right','left'])}</thead>
        <tbody>${payRows || `<tr><td colspan="6" style="padding:14px;color:#94a3b8;text-align:center;font-size:10px">${L.noPayment}</td></tr>`}</tbody>
        <tfoot>${tfootRow(L.totalPayments, fUSD(totalPayments), '#1d4ed8')}</tfoot>
      </table>

      <!-- TABLE 2: PRODUCTS -->
      ${sectionHead(2, L.products, '#16a34a')}
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <thead>${hdr(L.prdHdr, ['center','left','right','right','right','left'])}</thead>
        <tbody>${prdRows || `<tr><td colspan="6" style="padding:14px;color:#94a3b8;text-align:center;font-size:10px">${L.noProduct}</td></tr>`}</tbody>
        <tfoot>${tfootRow(L.totalProducts, fUSD(totalProducts), '#15803d')}</tfoot>
      </table>

      <!-- TABLE 3: ADVANCES -->
      ${sectionHead(3, L.advances, '#7c3aed')}
      ${advSection}

      <!-- BALANCE -->
      <div style="margin-top:20px;border-radius:8px;border:1.5px solid ${balanceBdr};background:${balanceBg};overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;gap:16px;flex-wrap:wrap">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <span style="font-size:13px;color:${balanceColor};margin-top:1px;flex-shrink:0">${balanceIcon}</span>
            <div>
              <div style="font-size:${isRtl ? '13px' : '9.5px'};color:#475569;font-weight:600;margin-bottom:5px">${L.balanceText}</div>
              <div style="display:flex;gap:14px;flex-wrap:wrap">
                <span style="font-size:${isRtl ? '12px' : '9.5px'};color:#64748b">${L.products}: <strong style="color:#15803d;font-weight:1000">${fUSD(totalProducts)}</strong></span>
                ${totalAdvances > 0 ? `<span style="font-size:${isRtl ? '12px' : '9.5px'};color:#64748b">− ${L.advances}: <strong style="color:#7c3aed;font-weight:1000">${fUSD(totalAdvances)}</strong></span>` : ''}
                ${totalPayments > 0 ? `<span style="font-size:${isRtl ? '12px' : '9.5px'};color:#64748b">− ${L.payments}: <strong style="color:#1d4ed8;font-weight:1000">${fUSD(totalPayments)}</strong></span>` : ''}
              </div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:${isRtl ? 'flex-start' : 'flex-end'};gap:3px;flex-shrink:0">
            <div style="font-size:${isRtl ? '12px' : '9px'};color:${balanceColor};font-weight:1000;text-transform:uppercase;letter-spacing:.04em">${balanceLabel}</div>
            <div style="font-size:${isRtl ? '16px' : '14px'};font-weight:1000;color:${balanceColor}">${fmtUSD(Math.abs(balance))}</div>
          </div>
        </div>
      </div>

      <!-- FOOTER -->
      <div style="margin-top:28px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:9px;color:#94a3b8">${companyName}</div>
        <div style="font-size:9px;color:#cbd5e1">${today}</div>
      </div>`;

    openPrint(content, `${customerName} — ${L.reportTitle}`, companyName);
  }


  return (
    <div className="space-y-4">

      {/* ── Toolbar kartı (overflow-hidden KULLANMA — dropdown kırpılır) ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="px-4 py-3 flex flex-wrap items-center gap-2">

          {/* Müşteri seçimi */}
          <div ref={custDropdownRef} className="relative flex-1 min-w-0">
            <button
              type="button"
              onClick={() => {
                if (!custOpen && custDropdownRef.current) {
                  const r = custDropdownRef.current.getBoundingClientRect();
                  setDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width });
                }
                setCustOpen((v) => !v);
              }}
              className={cn(
                'w-full h-9 rounded-xl border px-3 text-[12px] font-medium transition-colors flex items-center gap-2 bg-white',
                customerId ? 'text-gray-900' : 'text-gray-400',
              )}
              style={{ borderColor: customerId ? `${accent}50` : '#e5e7eb' }}
            >
              <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <span className="flex-1 truncate text-left">{customerId ? customerName : 'Müşteri seçin…'}</span>
              {customerId
                ? <X className="h-3.5 w-3.5 text-gray-300 hover:text-red-400 shrink-0 transition-colors"
                    onClick={(e) => { e.stopPropagation(); setCustomerId(''); setCustOpen(false); }} />
                : <ChevronDown className="h-3.5 w-3.5 text-gray-300 shrink-0" />}
            </button>

            {custOpen && dropdownPos && createPortal(
              <div
                data-cr-portal
                style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: Math.max(dropdownPos.width, 240), zIndex: 9999 }}
                className="bg-white border border-gray-200 rounded-xl shadow-xl"
              >
                <div className="p-2 border-b border-gray-100">
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <input autoFocus type="text" value={custSearch} onChange={(e) => setCustSearch(e.target.value)}
                      placeholder="Ara…" className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-gray-400" />
                    {custSearch && <button type="button" onClick={() => setCustSearch('')}><X className="h-3 w-3 text-gray-400" /></button>}
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {loadingC && customers.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-5 text-[12px] text-gray-400">
                      <div className="w-4 h-4 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: accent }} />
                      Yükleniyor…
                    </div>
                  ) : filteredCustomers.length === 0 ? (
                    <div className="px-3 py-5 text-[12px] text-gray-400 text-center">Sonuç yok</div>
                  ) : filteredCustomers.map((c) => (
                    <button key={c.id} type="button"
                      onClick={() => { setCustomerId(c.id); setCustOpen(false); setCustSearch(''); }}
                      className="w-full text-left px-3 py-2.5 text-[13px] transition-colors hover:bg-gray-50 border-b border-gray-50 last:border-0"
                      style={customerId === c.id ? { color: accent, background: `${accent}08`, fontWeight: 600 } : {}}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            , document.body)}
          </div>

          {/* Filtre butonu */}
          <div ref={filterBtnRef} className="relative shrink-0">
            <button
              onClick={() => {
                if (!filterOpen && filterBtnRef.current) {
                  const r = filterBtnRef.current.getBoundingClientRect();
                  const popW = 288;
                  const left = r.left + popW > window.innerWidth ? r.right - popW : r.left;
                  setFilterPos({ top: r.bottom + 4, left });
                }
                setFilterOpen((v) => !v);
              }}
              className="h-9 px-3 rounded-xl border text-[12px] font-semibold flex items-center gap-1.5 transition-colors bg-white"
              style={
                activeFilterCount > 0 || filterOpen
                  ? { borderColor: `${accent}50`, background: `${accent}08`, color: accent }
                  : { borderColor: '#e5e7eb', color: '#6b7280' }
              }
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtrele
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full text-white text-[9px] font-extrabold flex items-center justify-center"
                  style={{ background: accent }}>
                  {activeFilterCount}
                </span>
              )}
            </button>

            {filterOpen && filterPos && createPortal(
              <div
                data-cr-filter-portal
                style={{ position: 'fixed', top: filterPos.top, left: filterPos.left, zIndex: 9999 }}
                className="w-72 bg-white border border-gray-200 rounded-2xl shadow-xl"
              >
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Rapor Seçenekleri</span>
                  <button onClick={() => setFilterOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                    <X className="h-3.5 w-3.5 text-gray-400" />
                  </button>
                </div>
                <div className="px-4 py-3 space-y-3">

                  {/* Tarih aralığı */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1.5">Tarih Aralığı</label>
                    <div className="flex items-center gap-1.5">
                      <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                        className="h-8 flex-1 rounded-lg border border-gray-200 px-2 text-[11px] text-gray-700 outline-none focus:border-gray-300 bg-white" />
                      <span className="text-gray-300 text-[11px]">—</span>
                      <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                        className="h-8 flex-1 rounded-lg border border-gray-200 px-2 text-[11px] text-gray-700 outline-none focus:border-gray-300 bg-white" />
                    </div>
                  </div>

                  {/* Ön ödemeler */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1.5">Ön Ödemeler</label>
                    <div className="flex gap-1">
                      {[{ val: true, label: L.fullList }, { val: false, label: L.totalOnly }].map(({ val, label }) => (
                        <button key={String(val)} type="button"
                          onClick={() => setAdvDetail(val)}
                          className={cn('px-3 h-8 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap flex-1',
                            advDetail === val ? 'text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
                          style={advDetail === val ? { background: accent } : {}}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rapor dili */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1.5">Rapor Dili</label>
                    <div className="flex gap-1">
                      {(['tr', 'en', 'fa'] as const).map((lang) => (
                        <button key={lang} type="button"
                          onClick={() => setReportLang(lang)}
                          className={cn('flex-1 h-8 rounded-xl text-[11px] font-bold transition-all',
                            reportLang === lang ? 'text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
                          style={reportLang === lang ? { background: accent } : {}}>
                          {lang.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Hitap */}
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1.5">Hitap</label>
                    <div className="flex gap-1 mb-1.5">
                      {([['agha', 'جناب آقای'], ['khanom', 'سرکار خانم']] as const).map(([val, label]) => (
                        <button key={val} type="button"
                          onClick={() => setToTitle(val)}
                          className={cn('flex-1 h-8 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap',
                            toTitle === val ? 'text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
                          style={toTitle === val ? { background: accent } : {}}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      placeholder="Ad Soyad (örn: محسن زرین)"
                      value={toName}
                      onChange={(e) => setToName(e.target.value)}
                      dir="auto"
                      className="h-8 w-full rounded-lg border border-gray-200 px-2.5 text-[12px] outline-none focus:border-gray-300 placeholder:text-gray-300"
                    />
                  </div>

                  {/* Temizle (sadece tarih filtresi için) */}
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => { setDateFrom(''); setDateTo(''); setFilterOpen(false); }}
                      className="w-full h-8 rounded-xl text-[11px] font-semibold text-red-500 border border-red-100 bg-red-50 hover:bg-red-100 transition-colors"
                    >
                      Tarih Filtresini Temizle
                    </button>
                  )}
                </div>
              </div>,
              document.body
            )}
          </div>

          {/* Yazdır */}
          {customerId && (
            <button
              onClick={printReport}
              className="h-9 px-3 rounded-xl text-[11px] font-semibold text-white flex items-center gap-1.5 hover:opacity-90 transition-opacity shrink-0 ml-auto"
              style={{ background: accent }}
            >
              <Printer className="h-3.5 w-3.5" />
              {L.printBtn}
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {!customerId && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <FileText className="h-8 w-8 mb-2 opacity-30" />
          <p className="text-sm font-medium text-gray-500">Müşteri seçin</p>
          <p className="text-xs mt-1">Raporu görüntülemek için yukarıdan bir müşteri seçin</p>
        </div>
      )}

      {/* Loading */}
      {customerId && isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: accent }} />
        </div>
      )}

      {customerId && !isLoading && (
        <>
          {/* Quick info 2×2 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-gray-50">
              <div className="px-5 py-4 border-b border-gray-50">
                <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">Ödemeler</div>
                <div className="text-[18px] font-extrabold text-blue-700">{fUSD(totalPayments)}</div>
              </div>
              <div className="px-5 py-4 border-b border-gray-50">
                <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">Satın Alım</div>
                <div className="text-[18px] font-extrabold text-green-700">{fUSD(totalProducts)}</div>
              </div>
              <div className="px-5 py-4">
                <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">Ön Ödemeler</div>
                <div className="text-[18px] font-extrabold text-violet-700">{fUSD(totalAdvances)}</div>
              </div>
              <div className="px-5 py-4" style={balance !== 0 ? { background: balance > 0 ? '#fffbeb' : '#f0fdf4' } : {}}>
                <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">Net Bakiye</div>
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-[18px] font-extrabold" style={{ color: balance > 0 ? '#b45309' : balance < 0 ? '#15803d' : '#6b7280' }}>
                    {fUSD(Math.abs(balance))}
                  </span>
                  <span className="text-[9px] font-extrabold uppercase tracking-widest" style={{ color: balance > 0 ? '#b45309' : balance < 0 ? '#15803d' : '#9ca3af' }}>
                    {balance > 0 ? 'Borçlu' : balance < 0 ? 'Alacaklı' : 'Kapalı'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Table 1: Payments */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-50 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[9px] font-extrabold flex items-center justify-center shrink-0">1</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{L.payments}</span>
              </div>
              <span className="text-[10px] text-gray-400">{payments.length} {L.records}</span>
            </div>
            {payments.length === 0 ? (
              <div className="px-5 py-10 text-center text-[12px] text-gray-400">{L.noPayment}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {L.payHdr.map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((t, i) => (
                      <tr key={t.id} className={cn('border-b border-gray-50 transition-colors', i % 2 === 1 ? 'bg-gray-50/40' : 'hover:bg-gray-50/60')}>
                        <td className="px-4 py-3 text-[11px] text-gray-400 text-center font-mono">{i + 1}</td>
                        <td className="px-4 py-3 text-[12px] text-gray-600">{fDate(t.transaction_date)}</td>
                        <td className="px-4 py-3 text-[12px] font-semibold text-gray-900 text-right">{fCurrency(t.amount, t.currency)}</td>
                        <td className="px-4 py-3 text-[11px] text-gray-400">{t.currency}</td>
                        <td className="px-4 py-3 text-[13px] font-bold text-blue-700 text-right">{fUSD(t.amount_usd ?? 0)}</td>
                        <td className="px-4 py-3 text-[11px] text-gray-400">{t.description ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-50/60 border-t-2 border-blue-100">
                      <td colSpan={4} className="px-4 py-3 text-[11px] font-bold text-right text-gray-600">{L.totalPayments}</td>
                      <td className="px-4 py-3 text-[14px] font-black text-blue-700 text-right">{fUSD(totalPayments)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Table 2: Products — sale_inv işlemleri (birincil) veya ticaret dosyaları (yedek) */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-50 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-green-100 text-green-700 text-[9px] font-extrabold flex items-center justify-center shrink-0">2</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{L.products}</span>
              </div>
              <span className="text-[10px] text-gray-400">
                {saleInvoices.length > 0
                  ? `${saleInvoices.length} ${L.records}`
                  : `${customerFiles.length} ${reportLang === 'fa' ? 'پرونده' : reportLang === 'tr' ? 'dosya' : 'files'}`}
              </span>
            </div>
            {saleInvoices.length === 0 && customerFiles.length === 0 ? (
              <div className="px-5 py-10 text-center text-[12px] text-gray-400">{L.noProduct}</div>
            ) : saleInvoices.length > 0 ? (
              /* Birincil görünüm: sale_inv muhasebe kayıtları */
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['#', 'Tarih', 'Açıklama', 'Tutar', 'Döviz', 'USD Karşılığı', 'Dosya / Ref'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {saleInvoices.map((t, i) => (
                      <tr key={t.id} className={cn('border-b border-gray-50 transition-colors', i % 2 === 1 ? 'bg-gray-50/40' : 'hover:bg-gray-50/60')}>
                        <td className="px-4 py-3 text-[11px] text-gray-400 text-center font-mono">{i + 1}</td>
                        <td className="px-4 py-3 text-[12px] text-gray-600">{fDate(t.transaction_date)}</td>
                        <td className="px-4 py-3 text-[12px] text-gray-700">{t.description || '—'}</td>
                        <td className="px-4 py-3 text-[12px] font-semibold text-gray-900 text-right">{fCurrency(t.amount, t.currency)}</td>
                        <td className="px-4 py-3 text-[11px] text-gray-400">{t.currency}</td>
                        <td className="px-4 py-3 text-[13px] font-bold text-green-700 text-right">{fUSD(t.amount_usd ?? 0)}</td>
                        <td className="px-4 py-3 text-[10px] font-mono text-gray-400">
                          {t.trade_file?.file_no ?? t.reference_no ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-green-50/60 border-t-2 border-green-100">
                      <td colSpan={5} className="px-4 py-3 text-[11px] font-bold text-right text-gray-600">{L.totalProducts}</td>
                      <td className="px-4 py-3 text-[14px] font-black text-green-700 text-right">{fUSD(totalProducts)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              /* Yedek görünüm: ticaret dosyası tutarları */
              <div className="overflow-x-auto">
                <table className="w-full">
                  <colgroup>
                    <col className="w-10" />
                    <col />
                    <col className="w-36" />
                    <col className="w-32" />
                    <col className="w-36" />
                    <col className="w-40" />
                  </colgroup>
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-100">
                      {L.prdHdr.map((h, hi) => (
                        <th
                          key={h}
                          className={cn(
                            'px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap',
                            hi === 0 ? 'text-center' : hi >= 2 && hi <= 4 ? 'text-right' : 'text-left',
                          )}
                        >{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {customerFiles.map((f, i) => {
                      const qty = f.delivered_admt ?? f.tonnage_mt ?? 0;
                      const tot = qty * (f.selling_price ?? 0);
                      return (
                        <tr key={f.id} className={cn('transition-colors', i % 2 === 1 ? 'bg-gray-50/30' : 'hover:bg-gray-50/60')}>
                          <td className="px-4 py-3.5 text-[11px] text-gray-300 text-center font-mono tabular-nums">{i + 1}</td>
                          <td className="px-4 py-3.5">
                            <span className="text-[13px] font-bold text-gray-900">{f.product?.name ?? '—'}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <span className="text-[12px] font-semibold text-gray-700 tabular-nums">{fN(f.selling_price ?? 0, 3)}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <span className="text-[13px] font-bold text-gray-800 tabular-nums">{fN(qty, 3)}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <span className="text-[14px] font-extrabold text-green-700 tabular-nums">{fUSD(tot)}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-block px-2 py-0.5 rounded-lg bg-gray-100 text-[10px] font-mono font-semibold text-gray-500 tracking-wide">{f.file_no}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-green-50 border-t-2 border-green-100">
                      <td colSpan={4} className="px-4 py-3.5 text-[11px] font-bold text-right text-gray-500 uppercase tracking-wider">{L.totalProducts}</td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-[15px] font-black text-green-700 tabular-nums">{fUSD(totalProducts)}</span>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Table 3: Advances */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-50 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-600 text-[9px] font-extrabold flex items-center justify-center shrink-0">3</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{L.advances}</span>
              </div>
              <span className="text-[10px] text-gray-400">{advances.length} {L.records}</span>
            </div>
            {advances.length === 0 ? (
              <div className="px-5 py-10 text-center text-[12px] text-gray-400">{L.noAdvance}</div>
            ) : advDetail ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {L.advHdr.map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {advances.map((t, i) => {
                      const admt = t.trade_file?.delivered_admt ?? t.trade_file?.tonnage_mt;
                      const product = t.trade_file?.product?.name;
                      const fileInfo = [product, admt != null ? `${fN(admt, 3)} MT` : null].filter(Boolean).join(' — ');
                      return (
                        <tr key={t.id} className={cn('border-b border-gray-50 transition-colors', i % 2 === 1 ? 'bg-gray-50/40' : 'hover:bg-gray-50/60')}>
                          <td className="px-4 py-3 text-[11px] text-gray-400 text-center font-mono">{i + 1}</td>
                          <td className="px-4 py-3 text-[12px] text-gray-600">{fDate(t.transaction_date)}</td>
                          <td className="px-4 py-3 text-[12px] font-semibold text-gray-900 text-right">{fCurrency(t.amount, t.currency)}</td>
                          <td className="px-4 py-3 text-[11px] text-gray-400">{t.currency}</td>
                          <td className="px-4 py-3 text-[13px] font-bold text-violet-700 text-right">{fUSD(t.amount_usd ?? 0)}</td>
                          <td className="px-4 py-3 text-[11px] text-gray-600">
                            {fileInfo && <span className="font-medium">{fileInfo}</span>}
                            {fileInfo && t.description ? <span className="text-gray-400"> · </span> : null}
                            {t.description || (!fileInfo ? '—' : null)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-violet-50/60 border-t-2 border-violet-100">
                      <td colSpan={4} className="px-4 py-3 text-[11px] font-bold text-right text-gray-600">{L.totalAdvances}</td>
                      <td className="px-4 py-3 text-[14px] font-black text-violet-700 text-right">{fUSD(totalAdvances)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="px-5 py-4 flex items-center gap-3">
                <span className="text-[12px] text-gray-500 font-medium">{L.totalAdvances}:</span>
                <span className="text-[16px] font-black text-violet-700">{fUSD(totalAdvances)}</span>
              </div>
            )}
          </div>

          {/* Net balance KV card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50 bg-gray-50/60 flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Hesap Özeti</span>
            </div>
            <div className="px-5 py-1">
              <div className="flex justify-between items-center py-2 border-b border-dashed border-gray-100">
                <span className="text-[12px] text-gray-500">{L.products}</span>
                <span className="text-[13px] font-bold text-green-700">+{fUSD(totalProducts)}</span>
              </div>
              {totalAdvances > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-dashed border-gray-100">
                  <span className="text-[12px] text-gray-500">{L.advances}</span>
                  <span className="text-[13px] font-bold text-violet-700">+{fUSD(totalAdvances)}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-2 border-b border-dashed border-gray-100">
                <span className="text-[12px] text-gray-500">{L.payments}</span>
                <span className="text-[13px] font-bold text-blue-700">−{fUSD(totalPayments)}</span>
              </div>
              <div className="flex justify-between items-center py-3">
                <span className="text-[13px] font-bold text-gray-900">Net Bakiye</span>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-[9px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full',
                    balance > 0 ? 'bg-amber-50 text-amber-700' : balance < 0 ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500',
                  )}>
                    {balance > 0 ? L.debtor : balance < 0 ? L.creditor : L.closed}
                  </span>
                  <span className="text-[16px] font-extrabold" style={{ color: balance > 0 ? '#b45309' : balance < 0 ? '#15803d' : '#6b7280' }}>
                    {fUSD(Math.abs(balance))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function ReportsPage() {
  const { t } = useTranslation('reports');
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';
  const [activeTab, setActiveTab] = useState<RepTab>('sales');

  const TAB_LABELS: [RepTab, string][] = [
    ['sales',     t('tabs.sales')],
    ['analytics', t('tabs.analytics')],
    ['eta',       t('tabs.eta')],
  ];

  return (
    <>
      {/* Tab bar */}
      <div className="flex border-b border-gray-100 mb-6 overflow-x-auto scrollbar-none">
        {TAB_LABELS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'shrink-0 px-4 py-2.5 text-[12px] font-semibold transition-all border-b-2 -mb-px whitespace-nowrap',
              activeTab === key ? 'text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50',
            )}
            style={activeTab === key ? { borderBottomColor: accent, color: accent } : {}}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'sales'     && <SalesReportTab />}
      {activeTab === 'analytics' && <AnalyticsTab />}
      {activeTab === 'eta'       && <EtaReportTab />}
    </>
  );
}
