import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, FileText, ChevronDown, X, Printer, SlidersHorizontal, ClipboardList } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { useTradeFiles, useAllTradeFiles } from '@/hooks/useTradeFiles';
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
  const { accent } = useTheme();

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
    <div className="space-y-4">
      {/* Filter panel */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Card header */}
        <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/60 flex items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Filtreler</span>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-[11px] text-gray-400 font-medium block mb-1.5">{t('sales.customer')}</label>
              <NativeSelect value={custFilter} onChange={(e) => setCustFilter(e.target.value)}>
                <option value="">{t('sales.all_customers')}</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </div>
            <div>
              <label className="text-[11px] text-gray-400 font-medium block mb-1.5">{t('sales.status')}</label>
              <NativeSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">{tc('all')}</option>
                <option value="request">{tc('status.request')}</option>
                <option value="sale">{tc('status.sale')}</option>
                <option value="delivery">{tc('status.delivery')}</option>
              </NativeSelect>
            </div>
            <div>
              <label className="text-[11px] text-gray-400 font-medium block mb-1.5">{t('sales.date_from')}</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 font-medium block mb-1.5">{t('sales.date_to')}</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-gray-50">
            <button
              onClick={() => setRan(true)}
              className="h-8 px-4 rounded-xl text-[12px] font-semibold text-white transition-colors hover:opacity-90"
              style={{ background: accent }}
            >
              {t('sales.show_report')}
            </button>
            <button
              onClick={() => { setCustFilter(''); setStatusFilter(''); setDateFrom(''); setDateTo(''); setRan(false); }}
              className="h-8 px-3 rounded-xl text-[12px] font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('sales.reset')}
            </button>
            {ran && results.length > 0 && (
              <>
                <div className="flex-1" />
                <button
                  onClick={() => printSalesReport(results)}
                  className="h-8 px-3 rounded-xl text-[12px] font-semibold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                >
                  <Printer className="h-3.5 w-3.5" />
                  {t('sales.print_pdf')}
                </button>
                <button
                  onClick={() => exportSalesExcel(results)}
                  className="h-8 px-3 rounded-xl text-[12px] font-semibold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  {t('sales.excel')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {ran && results.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: t('sales.total_files'),        value: String(results.length) },
              { label: t('sales.total_admt'),         value: fN(totalAdmt, 3) },
              { label: t('sales.estimated_revenue'),  value: fUSD(totalRevenue) },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4">
                <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">{card.label}</div>
                <div className="text-[17px] font-extrabold text-gray-900 tabular-nums">{card.value}</div>
              </div>
            ))}
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

      {(ran && results.length === 0) || !ran ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-white rounded-2xl shadow-sm border border-gray-100">
          <Search className="h-8 w-8 mb-2 opacity-20" />
          <p className="text-sm font-medium text-gray-500">
            {ran ? t('sales.no_records') : t('sales.prompt')}
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ─── P&L Report ────────────────────────────────────────────────────────────

export function PnlReportTab() {
  const { t } = useTranslation('reports');
  const { accent } = useTheme();
  const { data: files = [] } = useTradeFiles();
  // Batch dosyaları bulmak için (tradeFileService.list parent_file_id=null filtreler)
  const { data: allFiles = [] } = useAllTradeFiles();

  // ── Görünüm: tek dosya detayı veya tüm dosyalar özeti ──────────────────
  const [viewMode, setViewMode] = useState<'ozet' | 'tek'>('ozet');
  const [sortBy, setSortBy]     = useState<'profit' | 'margin' | 'revenue'>('profit');
  const [selectedFileId, setSelectedFileId] = useState('');

  const selectedFile = useMemo(
    () => files.find((f) => f.id === selectedFileId) ?? null,
    [files, selectedFileId],
  );

  // Ana dosya seçildiğinde batch alt-dosyalarını da dahil et
  // allFiles kullanıyoruz — tradeFileService.list() batch'leri hariç tutar
  const selectedFileIds = useMemo(() => {
    if (!selectedFileId) return undefined;
    const batchIds = allFiles
      .filter((f) => f.parent_file_id === selectedFileId)
      .map((f) => f.id);
    return [selectedFileId, ...batchIds];
  }, [selectedFileId, allFiles]);

  const { data: txns = [] } = useTransactions(
    selectedFileIds
      ? { tradeFileIds: selectedFileIds, approvedOnly: true }
      : { approvedOnly: true },
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

  // ── Tüm dosyalar özeti — gerçek işlemlerden hesapla ────────────────────
  // txns, selectedFileId=null olduğunda tüm onaylı işlemleri içerir.
  // Detay görünümüyle tutarlı olması için aynı yöntemi kullan:
  // maliyet = purchase_inv + svc_inv işlemlerinin toplamı + freight_cost
  const allFilesRows = useMemo(() => {
    // Tüm onaylı maliyet işlemlerini dosya bazında grupla
    const costByFile = new Map<string, number>();
    for (const t of txns) {
      if (!['purchase_inv', 'svc_inv'].includes(t.transaction_type)) continue;
      const tf = t.trade_file as any;
      // Batch transaction → attribute cost to parent file instead
      const fid = tf?.parent_file_id ?? t.trade_file_id ?? tf?.id;
      if (!fid) continue;
      costByFile.set(fid, (costByFile.get(fid) ?? 0) + (t.amount_usd ?? t.amount ?? 0));
    }

    return files
      .map(f => {
        const qty     = f.delivered_admt ?? f.tonnage_mt ?? 0;
        const revenue = (f.selling_price ?? 0) * qty;
        const txnCost = costByFile.get(f.id) ?? 0;
        const freight = f.freight_cost ?? 0;
        const costs   = txnCost > 0 ? txnCost + freight : (f.purchase_price ?? 0) * qty + freight;
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
  }, [files, txns, sortBy]);

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
    const qty = selectedFile.delivered_admt ?? selectedFile.tonnage_mt ?? 0;
    const purchaseRows  = costRows.filter(t => t.transaction_type === 'purchase_inv');
    const svcRows       = costRows.filter(t => t.transaction_type === 'svc_inv');
    const saleInvRows   = txns.filter(t => t.transaction_type === 'sale_inv');
    const purchaseTotal = purchaseRows.reduce((s, t) => s + (t.amount_usd ?? t.amount ?? 0), 0);
    const svcTotal      = svcRows.reduce((s, t) => s + (t.amount_usd ?? t.amount ?? 0), 0);
    const saleInvTotal  = saleInvRows.reduce((s, t) => s + (t.amount_usd ?? t.amount ?? 0), 0);
    const printRevenue  = saleInvTotal > 0 ? saleInvTotal : pnl.revenue;
    const printProfit   = printRevenue - pnl.costs;
    const printMargin   = printRevenue > 0 ? (printProfit / printRevenue) * 100 : 0;

    function makeGroupRows(rows: typeof costRows) {
      if (!rows.length) return '<tr><td colspan="2" style="padding:6px 8px;color:#aaa;font-style:italic">Kayıt yok</td></tr>';
      return rows.map(txn => `
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:5px 8px;color:#555;font-size:10px">${txn.description || '—'}</td>
          <td style="padding:5px 8px;text-align:right;color:#374151;font-size:10px;white-space:nowrap">(${fUSD(txn.amount_usd ?? txn.amount ?? 0)})</td>
        </tr>`).join('');
    }

    const saleInvRowsHtml = saleInvRows.length === 0
      ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
           <span style="font-size:11px;color:#6b7280">Gelir · ${fN(qty,3)} MT × ${selectedFile.selling_price ? fCurrency(selectedFile.selling_price) : '—'}</span>
           <span style="font-size:13px;font-weight:700;color:#111827">${fUSD(pnl.revenue)}</span>
         </div>`
      : `<div style="margin-bottom:14px">
           <div style="background:#f3f4f6;border-radius:8px 8px 0 0;padding:7px 10px;display:flex;justify-content:space-between;align-items:center;border:1px solid #e5e7eb;border-bottom:0">
             <span style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#374151">Satış Faturaları (${saleInvRows.length})</span>
             <span style="font-size:11px;font-weight:700;color:#374151">${fUSD(saleInvTotal)}</span>
           </div>
           <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-top:0">
             <tbody>${saleInvRows.map(txn => `
               <tr style="border-bottom:1px solid #f3f4f6">
                 <td style="padding:5px 8px;color:#555;font-size:10px">${txn.description || txn.reference_no || '—'}</td>
                 <td style="padding:5px 8px;text-align:right;color:#374151;font-size:10px;white-space:nowrap">${fUSD(txn.amount_usd ?? txn.amount ?? 0)}</td>
               </tr>`).join('')}
             </tbody>
           </table>
         </div>`;

    const html = `
      <div style="border-bottom:2px solid #e5e7eb;padding-bottom:12px;margin-bottom:16px">
        <div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;margin-bottom:4px">Kar / Zarar Raporu</div>
        <div style="font-size:18px;font-weight:800;color:#111">${selectedFile.file_no}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">${selectedFile.customer?.name ?? ''} · ${selectedFile.product?.name ?? ''} · ${fN(qty, 3)} MT</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:16px">
        ${[
          { l:'Gelir',     v:fUSD(printRevenue),            c:'#111827' },
          { l:'Maliyet',   v:fUSD(pnl.costs),               c:'#374151' },
          { l:'Net Kâr',   v:fUSD(printProfit),             c:col(printProfit) },
          { l:'Kâr Marjı', v:'%'+printMargin.toFixed(2),   c:col(printProfit) },
        ].map(card => `
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px">
            <div style="font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;margin-bottom:5px">${card.l}</div>
            <div style="font-size:14px;font-weight:900;color:${card.c}">${card.v}</div>
          </div>`).join('')}
      </div>

      ${saleInvRowsHtml}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
        <div>
          <div style="background:#f3f4f6;border-radius:8px 8px 0 0;padding:7px 10px;display:flex;justify-content:space-between;align-items:center;border:1px solid #e5e7eb;border-bottom:0">
            <span style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#374151">Satın Alma Faturaları (${purchaseRows.length})</span>
            <span style="font-size:11px;font-weight:700;color:#374151">(${fUSD(purchaseTotal)})</span>
          </div>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;overflow:hidden">
            <tbody>${makeGroupRows(purchaseRows)}</tbody>
          </table>
        </div>
        <div>
          <div style="background:#f3f4f6;border-radius:8px 8px 0 0;padding:7px 10px;display:flex;justify-content:space-between;align-items:center;border:1px solid #e5e7eb;border-bottom:0">
            <span style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#374151">Hizmet Faturaları (${svcRows.length})</span>
            <span style="font-size:11px;font-weight:700;color:#374151">(${fUSD(svcTotal)})</span>
          </div>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;overflow:hidden">
            <tbody>${makeGroupRows(svcRows)}</tbody>
          </table>
        </div>
      </div>

      ${pnl.freight > 0 ? `
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:7px 12px;margin-bottom:14px;display:flex;justify-content:space-between">
        <span style="font-size:11px;color:#6b7280">Navlun / Freight</span>
        <span style="font-size:11px;font-weight:600;color:#374151">(${fUSD(pnl.freight)})</span>
      </div>` : ''}

      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;background:#f9fafb">
        <div>
          <div style="font-size:11px;font-weight:700;color:#374151">Net Kâr</div>
          <div style="font-size:9px;color:#9ca3af;margin-top:2px">Toplam Maliyet: ${fUSD(pnl.costs)}</div>
        </div>
        <div style="font-size:20px;font-weight:900;color:${col(pnl.profit)}">${fUSD(pnl.profit)}</div>
      </div>`;

    openPrint(html, `Kar/Zarar — ${selectedFile.file_no}`);
  }

  return (
    <div className="space-y-4">

      {/* ── Görünüm seçici ──────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-full md:w-fit">
        {([
          { key: 'ozet', label: 'Tüm Dosyalar Özeti' },
          { key: 'tek',  label: 'Dosya Detayı' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setViewMode(tab.key)}
            className={`flex-1 md:flex-none px-4 h-9 rounded-xl text-[12px] font-semibold transition-all whitespace-nowrap ${
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
              { label: 'Toplam Hasılat', value: fUSD(totalRevenue), profit: false },
              { label: 'Toplam Net Kar', value: fUSD(totalProfit),  profit: true },
              { label: 'Ort. Kar Marjı', value: avgMargin.toFixed(1) + '%', profit: true },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl md:rounded-2xl shadow-sm border border-gray-100 px-2 py-3 md:p-4 text-center overflow-hidden">
                <div className="text-[8px] md:text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5 leading-tight">{card.label}</div>
                <div className="text-[11px] md:text-xl font-black leading-tight tabular-nums text-gray-900"
                  style={card.profit ? { color: col(totalProfit) } : undefined}>{card.value}</div>
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
              <>
                {/* Mobile: card list */}
                <div className="divide-y divide-gray-50 md:hidden">
                  {allFilesRows.map((row) => (
                    <button
                      key={row.file.id}
                      onClick={() => { setSelectedFileId(row.file.id); setViewMode('tek'); }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50/60 active:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[12px] font-bold font-mono text-gray-800">{row.file.file_no}</span>
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">{row.file.status}</span>
                          </div>
                          <div className="text-[11px] text-gray-400 truncate">{row.file.customer?.name ?? '—'}</div>
                          <div className="text-[10px] text-gray-300 truncate mt-0.5">{row.file.product?.name ?? '—'}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[13px] font-black tabular-nums" style={{ color: col(row.profit) }}>{fUSD(row.profit)}</div>
                          <div className="text-[10px] font-semibold tabular-nums mt-0.5" style={{ color: col(row.profit) }}>%{row.margin.toFixed(1)}</div>
                          <div className="text-[10px] text-gray-400 tabular-nums mt-0.5">{fUSD(row.revenue)}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                  {/* Mobile total row */}
                  <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-gray-600">TOPLAM</span>
                    <div className="text-right">
                      <div className="text-[13px] font-black tabular-nums" style={{ color: col(totalProfit) }}>{fUSD(totalProfit)}</div>
                      <div className="text-[10px] text-gray-400 tabular-nums">{fUSD(totalRevenue)} hasılat</div>
                    </div>
                  </div>
                </div>

                {/* Desktop: table */}
                <div className="hidden md:block overflow-x-auto">
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
                        <td className="px-4 py-3 text-right text-[12px] font-semibold text-gray-700 tabular-nums">
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
                          <span className="text-[11px] font-bold tabular-nums" style={{ color: col(row.profit) }}>
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
                      <td className="px-4 py-2.5 text-right text-[12px] font-black text-gray-700 tabular-nums">{fUSD(totalRevenue)}</td>
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
              </>
            )}
          </div>
        </>
      )}

      {/* ══ TEK DOSYA DETAYI ════════════════════════════════════════════ */}
      {viewMode === 'tek' && (
        <>
          {/* Toolbar: dosya seçici + yazdır */}
          <div className="flex gap-2 items-center">
            <NativeSelect
              value={selectedFileId}
              onChange={(e) => setSelectedFileId(e.target.value)}
              className="flex-1 h-9 text-[12px]"
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
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12px] font-semibold bg-white border border-gray-200 hover:bg-gray-50 shadow-sm transition-colors shrink-0"
              >
                <Printer className="h-3.5 w-3.5" />
                PDF
              </button>
            )}
          </div>

          {selectedFile && !selectedFile.selling_price && (
            <div className="text-center py-6 text-gray-400 text-sm">{t('pnl.no_selling_price')}</div>
          )}

          {selectedFile && pnl && (() => {
            const purchaseRows = costRows.filter(t => t.transaction_type === 'purchase_inv');
            const svcRows      = costRows.filter(t => t.transaction_type === 'svc_inv');
            const saleRows     = txns.filter(t => t.transaction_type === 'sale_inv');
            const purchaseTotal = purchaseRows.reduce((s, t) => s + (t.amount_usd ?? t.amount ?? 0), 0);
            const svcTotal      = svcRows.reduce((s, t) => s + (t.amount_usd ?? t.amount ?? 0), 0);
            const saleTotal     = saleRows.reduce((s, t) => s + (t.amount_usd ?? t.amount ?? 0), 0);
            // Fatura toplamı varsa onu kullan, yoksa formül bazlı gelir
            const displayRevenue = saleTotal > 0 ? saleTotal : pnl.revenue;
            const displayProfit  = displayRevenue - pnl.costs;
            const displayMargin  = displayRevenue > 0 ? (displayProfit / displayRevenue) * 100 : 0;
            const qty = selectedFile.delivered_admt ?? selectedFile.tonnage_mt ?? 0;

            return (
              <>
                {/* KPI satırı — kompakt */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { label: 'Gelir',     value: fUSD(displayRevenue), profit: false },
                    { label: 'Maliyet',   value: fUSD(pnl.costs),      profit: false },
                    { label: 'Net Kâr',   value: fUSD(displayProfit),  profit: true },
                    { label: 'Kâr Marjı', value: '%' + displayMargin.toFixed(2), profit: true },
                  ].map((card) => (
                    <div key={card.label} className="bg-white rounded-xl border border-gray-100 px-3 py-2.5">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">{card.label}</div>
                      <div className="text-[13px] font-black leading-tight tabular-nums text-gray-900" style={card.profit ? { color: col(displayProfit) } : undefined}>{card.value}</div>
                    </div>
                  ))}
                </div>

                {/* SATIŞ FATURALARI — sale_inv transaction'ları varsa göster */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between bg-gray-50/80 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Satış Faturaları</span>
                      <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full font-bold">{saleRows.length}</span>
                    </div>
                    <span className="text-[12px] font-semibold text-gray-600 tabular-nums">{fUSD(saleTotal || pnl.revenue)}</span>
                  </div>
                  {saleRows.length === 0 ? (
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-[11px] text-gray-400">{selectedFile.file_no} · {selectedFile.customer?.name ?? ''} · {fN(qty, 3)} MT × {selectedFile.selling_price ? fCurrency(selectedFile.selling_price) : '—'}</span>
                      <span className="text-[11px] font-semibold text-gray-700 tabular-nums">{fUSD(pnl.revenue)}</span>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {saleRows.map((txn) => (
                        <div key={txn.id} className="px-4 py-2.5 flex items-start justify-between gap-3 hover:bg-gray-50/60 transition-colors">
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] text-gray-700 leading-tight">{txn.description || txn.reference_no || '—'}</div>
                            {txn.trade_file?.file_no && txn.trade_file.file_no !== selectedFile.file_no && (
                              <div className="text-[10px] text-gray-400 mt-0.5">{txn.trade_file.file_no}</div>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[11px] font-semibold text-gray-700 tabular-nums">{fUSD(txn.amount_usd ?? txn.amount ?? 0)}</div>
                            {txn.currency !== 'USD' && (
                              <div className="text-[10px] text-gray-400 tabular-nums">{fCurrency(txn.amount, txn.currency)}</div>
                            )}
                          </div>
                        </div>
                      ))}
                      <div className="px-4 py-2.5 flex items-center justify-between bg-gray-50">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Ara Toplam</span>
                        <span className="text-[12px] font-bold text-gray-700 tabular-nums">{fUSD(saleTotal)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* İki sütun: Satın Alma | Hizmet */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* SATIN ALMA FATURALARI */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between bg-gray-50/80 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Satın Alma Faturaları</span>
                        <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full font-bold">{purchaseRows.length}</span>
                      </div>
                      <span className="text-[12px] font-semibold text-gray-600 tabular-nums">({fUSD(purchaseTotal)})</span>
                    </div>
                    {purchaseRows.length === 0 ? (
                      <div className="px-4 py-6 text-center text-[11px] text-gray-400">Kayıt yok</div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {purchaseRows.map((txn) => (
                          <div key={txn.id} className="px-4 py-2.5 flex items-start justify-between gap-3 hover:bg-gray-50/60 transition-colors">
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] text-gray-700 leading-tight">{txn.description || '—'}</div>
                              {txn.supplier?.name && (
                                <div className="text-[10px] text-gray-400 mt-0.5">{txn.supplier.name}</div>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-[11px] font-semibold text-gray-700 tabular-nums">({fUSD(txn.amount_usd ?? txn.amount ?? 0)})</div>
                              {txn.currency !== 'USD' && (
                                <div className="text-[10px] text-gray-400 tabular-nums">{fCurrency(txn.amount, txn.currency)}</div>
                              )}
                            </div>
                          </div>
                        ))}
                        <div className="px-4 py-2.5 flex items-center justify-between bg-gray-50">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Ara Toplam</span>
                          <span className="text-[12px] font-bold text-gray-700 tabular-nums">({fUSD(purchaseTotal)})</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* HİZMET FATURALARI */}
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between bg-gray-50/80 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Hizmet Faturaları</span>
                        <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full font-bold">{svcRows.length}</span>
                      </div>
                      <span className="text-[12px] font-semibold text-gray-600 tabular-nums">({fUSD(svcTotal)})</span>
                    </div>
                    {svcRows.length === 0 ? (
                      <div className="px-4 py-6 text-center text-[11px] text-gray-400">Kayıt yok</div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {svcRows.map((txn) => (
                          <div key={txn.id} className="px-4 py-2.5 flex items-start justify-between gap-3 hover:bg-gray-50/60 transition-colors">
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] text-gray-700 leading-tight">{txn.description || '—'}</div>
                              {txn.service_provider?.name && (
                                <div className="text-[10px] text-gray-400 mt-0.5">{txn.service_provider.name}</div>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-[11px] font-semibold text-gray-700 tabular-nums">({fUSD(txn.amount_usd ?? txn.amount ?? 0)})</div>
                              {txn.currency !== 'USD' && (
                                <div className="text-[10px] text-gray-400 tabular-nums">{fCurrency(txn.amount, txn.currency)}</div>
                              )}
                            </div>
                          </div>
                        ))}
                        <div className="px-4 py-2.5 flex items-center justify-between bg-gray-50">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Ara Toplam</span>
                          <span className="text-[12px] font-bold text-gray-700 tabular-nums">({fUSD(svcTotal)})</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Navlun + Net Kâr */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  {pnl.freight > 0 && (
                    <div className="px-5 py-3 flex items-center justify-between border-b border-gray-50">
                      <span className="text-[12px] text-gray-500">Navlun / Freight</span>
                      <span className="text-[12px] font-semibold text-gray-600 tabular-nums">({fUSD(pnl.freight)})</span>
                    </div>
                  )}
                  <div className="px-5 py-4 flex items-center justify-between bg-gray-50/60">
                    <div>
                      <div className="text-[13px] font-bold text-gray-700">Net Kâr</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">Toplam Maliyet: {fUSD(pnl.costs)}</div>
                    </div>
                    <div className="text-[22px] font-black tabular-nums" style={{ color: col(pnl.profit) }}>{fUSD(pnl.profit)}</div>
                  </div>
                </div>
              </>
            );
          })()}

          {!selectedFileId && (
            <div className="flex flex-col items-center py-16 text-gray-400">
              <FileText className="h-8 w-8 mb-2 opacity-20" />
              <p className="text-[13px] font-medium text-gray-500">{t('pnl.select_prompt')}</p>
            </div>
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
  const { accent } = useTheme();

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
        ? `<span style="font-size:7.5px;color:#94a3b8;display:block">${fCurrency(txn.amount, txn.currency)}</span>` : '';
      return `
      <tr style="border-bottom:1px solid #e2e8f0;background:${bg}">
        <td style="padding:3px 6px;white-space:nowrap;color:#475569;font-size:8.5px">${fDate(txn.transaction_date)}</td>
        <td style="padding:3px 6px;color:#334155;font-size:8.5px">${TYPE_LABEL[txn.transaction_type] ?? txn.transaction_type}</td>
        <td style="padding:3px 6px;font-family:monospace;color:#64748b;font-size:8px">${txn.reference_no || '—'}</td>
        <td style="padding:3px 6px;color:#334155;font-size:8.5px;max-width:140px">${txn.description || '—'}</td>
        <td style="padding:3px 6px;text-align:center">
          <span style="font-size:8.5px;font-weight:700;color:#1e293b">${txn.currency}</span>
          ${origAmt}
        </td>
        <td style="padding:3px 6px;text-align:right;color:#b91c1c;font-weight:600;font-size:8.5px">${txn.isDebit  ? fUSD(txn.amt) : ''}</td>
        <td style="padding:3px 6px;text-align:right;color:#065f46;font-weight:600;font-size:8.5px">${!txn.isDebit ? fUSD(txn.amt) : ''}</td>
        <td style="padding:3px 6px;text-align:right;font-weight:700;font-size:8.5px;color:${txn.balance > 0 ? '#92400e' : txn.balance < 0 ? '#065f46' : '#94a3b8'}">${fUSD(Math.abs(txn.balance))}${balSuffix(txn.balance)}</td>
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
      thead tr{background:#f1f5f9;border-bottom:1px solid #cbd5e1}
      th{padding:3px 6px;font-size:7.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b;white-space:nowrap}
      .th-r{text-align:right}
      .th-c{text-align:center}
      tfoot tr{background:#f8fafc;border-top:2px solid #cbd5e1}
      tfoot td{padding:4px 6px;font-size:8.5px;font-weight:700}
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
        <div className="px-3 pt-3 pb-1">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto scrollbar-none">
            {(['customer', 'supplier', 'service_provider'] as const).map((type) => (
              <button
                key={type}
                onClick={() => { setEntityType(type); setEntityId(''); setEntityOpen(false); setEntitySearch(''); }}
                className={cn(
                  'flex-1 h-8 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap outline-none',
                  entityType === type
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {ENTITY_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
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
          {/* ── Mono KPI kartları ── */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Toplam Borç</div>
              <div className="text-[15px] font-black leading-tight tabular-nums text-red-600">{fUSD(totalBorç)}</div>
              <div className="text-[10px] text-gray-400 mt-0.5 truncate">{entityName}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Toplam Alacak</div>
              <div className="text-[15px] font-black leading-tight tabular-nums text-green-700">{fUSD(totalAlacak)}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{txnsWithBalance.length} işlem</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Net Bakiye</div>
              <div className="text-[15px] font-black leading-tight tabular-nums"
                style={{ color: netBakiye > 0 ? '#b45309' : netBakiye < 0 ? '#16a34a' : '#9ca3af' }}>
                {fUSD(Math.abs(netBakiye))}
              </div>
              <div className="text-[10px] font-bold mt-0.5 uppercase tracking-widest"
                style={{ color: netBakiye > 0 ? '#b45309' : netBakiye < 0 ? '#16a34a' : '#9ca3af' }}>
                {netBakiye > 0 ? 'Borçlu' : netBakiye < 0 ? 'Alacaklı' : 'Sıfır'}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">İşlem Sayısı</div>
              <div className="text-[15px] font-black leading-tight tabular-nums text-gray-900">{txnsWithBalance.length}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">kayıt</div>
            </div>
          </div>

          {/* ── İşlem tablosu ── */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {/* Section header */}
            <div className="px-4 py-3 flex items-center justify-between bg-gray-50/80 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Hesap Ekstresi</span>
                {(dateFrom || dateTo) && (
                  <span className="text-[10px] text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded-full">
                    {dateFrom || '…'} – {dateTo || '…'}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full font-bold">{txnsWithBalance.length}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {[
                      { label: 'Tarih', right: false },
                      { label: 'İşlem Türü', right: false },
                      { label: 'İşlem No', right: false },
                      { label: 'Açıklama', right: false },
                      { label: 'Döviz', right: false },
                      { label: 'Borç (USD)', right: true },
                      { label: 'Alacak (USD)', right: true },
                      { label: 'Bakiye (USD)', right: true },
                    ].map((h) => (
                      <th key={h.label} className={cn(
                        'px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap',
                        h.right ? 'text-right' : 'text-left',
                      )}>
                        {h.label}
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
                      <td className="px-4 py-2.5 text-[11px] text-gray-500 whitespace-nowrap tabular-nums">{fDate(txn.transaction_date)}</td>
                      <td className="px-4 py-2.5 text-[12px] font-semibold text-gray-700">{tc(`txType.${txn.transaction_type}`)}</td>
                      <td className="px-4 py-2.5 text-[10px] font-mono text-gray-400">{txn.reference_no || '—'}</td>
                      <td className="px-4 py-2.5 text-[12px] text-gray-500 max-w-[180px] truncate">{txn.description || '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="text-[11px] font-bold text-gray-700 tabular-nums">{txn.currency}</div>
                        {txn.currency !== 'USD' && (
                          <div className="text-[10px] text-gray-400 tabular-nums">{fCurrency(txn.amount, txn.currency)}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {txn.isDebit && (
                          <span className="text-[12px] font-semibold text-red-600 tabular-nums">{fUSD(txn.amt)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {!txn.isDebit && (
                          <span className="text-[12px] font-semibold text-green-700 tabular-nums">{fUSD(txn.amt)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <span className="text-[12px] font-bold tabular-nums"
                          style={{ color: txn.balance > 0 ? '#b45309' : txn.balance < 0 ? '#16a34a' : '#9ca3af' }}>
                          {fUSD(Math.abs(txn.balance))}
                        </span>
                        {txn.balance !== 0 && (
                          <span className="ml-1 text-[9px] font-extrabold"
                            style={{ color: txn.balance > 0 ? '#b45309' : '#16a34a' }}>
                            {txn.balance > 0 ? 'B' : 'A'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Ara toplam footer */}
                <tfoot>
                  <tr className="border-t border-gray-100 bg-gray-50">
                    <td colSpan={4} className="px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wide">{txnsWithBalance.length} kayıt</td>
                    <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 text-right uppercase tracking-widest">Toplam</td>
                    <td className="px-4 py-2.5 text-[12px] font-bold text-right text-red-600 tabular-nums">{fUSD(totalBorç)}</td>
                    <td className="px-4 py-2.5 text-[12px] font-bold text-right text-green-700 tabular-nums">{fUSD(totalAlacak)}</td>
                    <td className="px-4 py-2.5 text-[12px] font-bold text-right whitespace-nowrap tabular-nums">
                      <span style={{ color: netBakiye > 0 ? '#b45309' : netBakiye < 0 ? '#16a34a' : '#9ca3af' }}>
                        {fUSD(Math.abs(netBakiye))}
                      </span>
                      {netBakiye !== 0 && (
                        <span className="ml-1 text-[9px] font-extrabold"
                          style={{ color: netBakiye > 0 ? '#b45309' : '#16a34a' }}>
                          {netBakiye > 0 ? 'B' : 'A'}
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
  const { accent } = useTheme();
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
      {/* Header row */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3.5 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-bold text-gray-900">{t('eta.title')}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">{t('eta.subtitle', { count: etaFiles.length })}</div>
          </div>
          <button
            onClick={exportCsv}
            className="h-8 px-3 rounded-xl text-[12px] font-semibold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            {t('eta.export_csv')}
          </button>
        </div>
      </div>

      {etaFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-white rounded-2xl shadow-sm border border-gray-100">
          <FileText className="h-8 w-8 mb-2 opacity-20" />
          <p className="text-sm font-medium text-gray-500">{t('eta.no_files')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
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
  const { accent } = useTheme();
  const { data: customers = [], isLoading: loadingC } = useCustomers();
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
      prdHdr: ['#', 'Açıklama', 'Tarih', 'Tutar', 'USD Karşılığı', 'Dosya No'],
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
      prdHdr: ['#', 'Description', 'Date', 'Amount', 'USD Equiv.', 'File No'],
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
      prdHdr: ['#', 'توضیحات', 'تاریخ', 'مبلغ', 'معادل دلار', 'شماره پرونده'],
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

  // Table 2 — sale_inv işlemleri (muhasebe kayıtları)
  const saleInvoices = useMemo(
    () => filteredTxns.filter((t) => t.transaction_type === 'sale_inv'),
    [filteredTxns],
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
  // Satış faturalarından topla
  const totalProducts = saleInvoices.reduce((s, t) => s + (t.amount_usd ?? 0), 0);
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
    const TD = `padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:${fsBase};color:#374151;white-space:nowrap`;
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
      `<tr><td style="${i%2?TDZ:TD};color:#94a3b8;text-align:center;width:28px">${i+1}</td><td style="${i%2?TDZ:TD}">${fDate(t.transaction_date)}</td><td style="${i%2?TDZ:TD};text-align:right;font-weight:600">${fCurrency(t.amount, t.currency)}</td><td style="${i%2?TDZ:TD};color:#64748b">${t.currency}</td><td style="${i%2?TDZ:TD};text-align:right;font-weight:700;color:#111827">${fUSD(t.amount_usd ?? 0)}</td><td style="${i%2?TDZ:TD};color:#64748b;font-size:${fsDesc}">${translateDesc(t.description ?? '')}</td></tr>`
    ).join('');

    const prdRows = saleInvoices.map((t, i) =>
      `<tr><td style="${i%2?TDZ:TD};color:#94a3b8;text-align:center;width:28px">${i+1}</td><td style="${i%2?TDZ:TD};color:#374151">${translateDesc(t.description ?? '') || (t.trade_file as any)?.product?.name || '—'}</td><td style="${i%2?TDZ:TD};color:#64748b">${fDate(t.transaction_date)}</td><td style="${i%2?TDZ:TD};text-align:right;font-weight:600">${fCurrency(t.amount, t.currency)} ${t.currency}</td><td style="${i%2?TDZ:TD};text-align:right;font-weight:700;color:#111827">${fUSD(t.amount_usd ?? 0)}</td><td style="${i%2?TDZ:TD};font-family:monospace;font-size:${fsDesc};color:#94a3b8">${(t.trade_file as any)?.file_no ?? t.reference_no ?? '—'}</td></tr>`
    ).join('');

    const advRows = advances.map((t, i) => {
      const admt = t.trade_file?.delivered_admt ?? t.trade_file?.tonnage_mt;
      const product = t.trade_file?.product?.name;
      const fileInfo = [product, admt != null ? `${fN(admt, 3)} MT` : null].filter(Boolean).join(' — ');
      const desc = [fileInfo, t.description].filter(Boolean).join(' · ');
      return `<tr><td style="${i%2?TDZ:TD};color:#94a3b8;text-align:center;width:28px">${i+1}</td><td style="${i%2?TDZ:TD}">${fDate(t.transaction_date)}</td><td style="${i%2?TDZ:TD};text-align:right;font-weight:600">${fCurrency(t.amount, t.currency)}</td><td style="${i%2?TDZ:TD};color:#64748b">${t.currency}</td><td style="${i%2?TDZ:TD};text-align:right;font-weight:700;color:#111827">${fUSD(t.amount_usd ?? 0)}</td><td style="${i%2?TDZ:TD};color:#374151;font-size:${fsDesc}">${translateDesc(desc) || '—'}</td></tr>`;
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
          <tfoot>${tfootRow(L.totalAdvances, fUSD(totalAdvances), '#111827')}</tfoot>
        </table>`
      : `<div style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
          <span style="font-size:10px;color:#6b7280;font-weight:600">${L.totalAdvances}:</span>
          <span style="font-size:13px;font-weight:800;color:#111827">${fUSD(totalAdvances)}</span>
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
      ${sectionHead(1, L.payments, '#374151')}
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <thead>${hdr(L.payHdr, ['center','left','right','left','right','left'])}</thead>
        <tbody>${payRows || `<tr><td colspan="6" style="padding:14px;color:#94a3b8;text-align:center;font-size:10px">${L.noPayment}</td></tr>`}</tbody>
        <tfoot>${tfootRow(L.totalPayments, fUSD(totalPayments), '#111827')}</tfoot>
      </table>

      <!-- TABLE 2: PRODUCTS -->
      ${sectionHead(2, L.products, '#374151')}
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <thead>${hdr(L.prdHdr, ['center','left','right','right','right','left'])}</thead>
        <tbody>${prdRows || `<tr><td colspan="6" style="padding:14px;color:#94a3b8;text-align:center;font-size:10px">${L.noProduct}</td></tr>`}</tbody>
        <tfoot>${tfootRow(L.totalProducts, fUSD(totalProducts), '#111827')}</tfoot>
      </table>

      <!-- TABLE 3: ADVANCES -->
      ${sectionHead(3, L.advances, '#374151')}
      ${advSection}

      <!-- BALANCE -->
      <div style="margin-top:20px;border-radius:8px;border:1.5px solid ${balanceBdr};background:${balanceBg};overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;gap:16px;flex-wrap:wrap">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <span style="font-size:13px;color:${balanceColor};margin-top:1px;flex-shrink:0">${balanceIcon}</span>
            <div>
              <div style="font-size:${isRtl ? '13px' : '9.5px'};color:#475569;font-weight:600;margin-bottom:5px">${L.balanceText}</div>
              <div style="display:flex;gap:14px;flex-wrap:wrap">
                <span style="font-size:${isRtl ? '12px' : '9.5px'};color:#64748b">${L.products}: <strong style="color:#374151;font-weight:1000">${fUSD(totalProducts)}</strong></span>
                ${totalAdvances > 0 ? `<span style="font-size:${isRtl ? '12px' : '9.5px'};color:#64748b">− ${L.advances}: <strong style="color:#374151;font-weight:1000">${fUSD(totalAdvances)}</strong></span>` : ''}
                ${totalPayments > 0 ? `<span style="font-size:${isRtl ? '12px' : '9.5px'};color:#64748b">− ${L.payments}: <strong style="color:#374151;font-weight:1000">${fUSD(totalPayments)}</strong></span>` : ''}
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
          {/* KPI row — 4 Mono kartı */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Ödemeler',    value: fUSD(totalPayments),  profit: false },
              { label: 'Satın Alım',  value: fUSD(totalProducts),  profit: false },
              { label: 'Ön Ödemeler', value: fUSD(totalAdvances),  profit: false },
              { label: 'Net Bakiye',  value: fUSD(Math.abs(balance)), profit: true,
                badge: balance > 0 ? 'Borçlu' : balance < 0 ? 'Alacaklı' : 'Kapalı',
                color: balance > 0 ? '#b45309' : balance < 0 ? '#15803d' : '#6b7280' },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white rounded-xl border border-gray-100 px-3 py-2.5">
                <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">{kpi.label}</div>
                <div
                  className="text-[14px] font-black leading-tight tabular-nums"
                  style={{ color: kpi.profit ? kpi.color : '#111827' }}
                >
                  {kpi.value}
                </div>
                {kpi.profit && kpi.badge && (
                  <div className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color: kpi.color }}>
                    {kpi.badge}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Table 1: Payments */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-50 bg-gray-50/60">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-700 text-[9px] font-extrabold flex items-center justify-center shrink-0">1</span>
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
                        <td className="px-4 py-3 text-[13px] font-bold text-gray-900 text-right">{fUSD(t.amount_usd ?? 0)}</td>
                        <td className="px-4 py-3 text-[11px] text-gray-400">{t.description ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-100">
                      <td colSpan={4} className="px-4 py-3 text-[11px] font-bold text-right text-gray-600">{L.totalPayments}</td>
                      <td className="px-4 py-3 text-[14px] font-black text-gray-900 text-right">{fUSD(totalPayments)}</td>
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
                <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-700 text-[9px] font-extrabold flex items-center justify-center shrink-0">2</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{L.products}</span>
              </div>
              <span className="text-[10px] text-gray-400">
                {saleInvoices.length} {L.records}
              </span>
            </div>
            {saleInvoices.length === 0 ? (
              <div className="px-5 py-10 text-center text-[12px] text-gray-400">{L.noProduct}</div>
            ) : (
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
                        <td className="px-4 py-3 text-[13px] font-bold text-gray-900 text-right">{fUSD(t.amount_usd ?? 0)}</td>
                        <td className="px-4 py-3 text-[10px] font-mono text-gray-400">
                          {t.trade_file?.file_no ?? t.reference_no ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-100">
                      <td colSpan={5} className="px-4 py-3 text-[11px] font-bold text-right text-gray-600">{L.totalProducts}</td>
                      <td className="px-4 py-3 text-[14px] font-black text-gray-900 text-right">{fUSD(totalProducts)}</td>
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
                <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-700 text-[9px] font-extrabold flex items-center justify-center shrink-0">3</span>
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
                          <td className="px-4 py-3 text-[13px] font-bold text-gray-900 text-right">{fUSD(t.amount_usd ?? 0)}</td>
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
                    <tr className="bg-gray-50 border-t-2 border-gray-100">
                      <td colSpan={4} className="px-4 py-3 text-[11px] font-bold text-right text-gray-600">{L.totalAdvances}</td>
                      <td className="px-4 py-3 text-[14px] font-black text-gray-900 text-right">{fUSD(totalAdvances)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="px-5 py-4 flex items-center gap-3">
                <span className="text-[12px] text-gray-500 font-medium">{L.totalAdvances}:</span>
                <span className="text-[16px] font-black text-gray-900">{fUSD(totalAdvances)}</span>
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
                <span className="text-[13px] font-bold text-gray-700">+{fUSD(totalProducts)}</span>
              </div>
              {totalAdvances > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-dashed border-gray-100">
                  <span className="text-[12px] text-gray-500">{L.advances}</span>
                  <span className="text-[13px] font-bold text-gray-700">+{fUSD(totalAdvances)}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-2 border-b border-dashed border-gray-100">
                <span className="text-[12px] text-gray-500">{L.payments}</span>
                <span className="text-[13px] font-bold text-gray-700">−{fUSD(totalPayments)}</span>
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
  const { accent } = useTheme();
  const [activeTab, setActiveTab] = useState<RepTab>('sales');

  const TAB_LABELS: [RepTab, string][] = [
    ['sales',     t('tabs.sales')],
    ['analytics', t('tabs.analytics')],
    ['eta',       t('tabs.eta')],
  ];

  return (
    <>
      {/* Page Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
          <ClipboardList style={{ width: 18, height: 18 }} className="text-gray-600" />
        </div>
        <div>
          <h1 className="text-[15px] font-bold text-gray-900">Raporlar</h1>
          <p className="text-[11px] text-gray-400">Satış, analitik ve teslimat raporları</p>
        </div>
      </div>

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
