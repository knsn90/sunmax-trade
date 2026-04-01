import { useState } from 'react';
import { useTrialBalance, useProfitLoss, useBalanceSheet } from '@/hooks/useFinancialReports';
import { useTheme } from '@/contexts/ThemeContext';
import { LoadingSpinner } from '@/components/ui/shared';
import { TrendingUp } from 'lucide-react';
import type { TrialBalanceRow, BalanceSheetRow } from '@/types/database';

function fN(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ─── Date range bar ───────────────────────────────────────────────────────────

function DateRangeBar({
  dateFrom, dateTo, onFrom, onTo, asOf, onAsOf, mode,
}: {
  dateFrom: string; dateTo: string;
  onFrom: (v: string) => void; onTo: (v: string) => void;
  asOf: string; onAsOf: (v: string) => void;
  mode: 'range' | 'asof';
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap gap-3 items-center">
      {mode === 'range' ? (
        <>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">From</span>
            <input type="date" value={dateFrom} onChange={e => onFrom(e.target.value)}
              className="h-8 px-3 text-xs border border-gray-200 rounded-xl focus:outline-none" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">To</span>
            <input type="date" value={dateTo} onChange={e => onTo(e.target.value)}
              className="h-8 px-3 text-xs border border-gray-200 rounded-xl focus:outline-none" />
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">As of</span>
          <input type="date" value={asOf} onChange={e => onAsOf(e.target.value)}
            className="h-8 px-3 text-xs border border-gray-200 rounded-xl focus:outline-none" />
        </div>
      )}
      <span className="text-xs text-gray-400">Leave blank for all-time</span>
    </div>
  );
}

// ─── Trial Balance ────────────────────────────────────────────────────────────

function TrialBalanceTab({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }) {
  const [hideZero, setHideZero] = useState(false);
  const { data = [], isLoading, error } = useTrialBalance(dateFrom, dateTo);

  const rows: TrialBalanceRow[] = hideZero ? data.filter(r => !r.is_zero) : data;
  const totalDr = rows.reduce((s, r) => s + r.total_debit,  0);
  const totalCr = rows.reduce((s, r) => s + r.total_credit, 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.01;

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  if (error) return <ErrorNote msg={(error as Error).message} />;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" checked={hideZero} onChange={e => setHideZero(e.target.checked)} className="rounded" />
          Hide zero-balance accounts
        </label>
        {data.length > 0 && (
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${balanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {balanced ? '✓ Balanced' : '✗ Unbalanced!'}
          </span>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {rows.length === 0 ? <EmptyNote /> : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="text-left px-4 py-3 font-semibold">Code</th>
                <th className="text-left px-4 py-3 font-semibold">Account</th>
                <th className="text-left px-4 py-3 font-semibold">Type</th>
                <th className="text-right px-4 py-3 font-semibold">Debit</th>
                <th className="text-right px-4 py-3 font-semibold">Credit</th>
                <th className="text-right px-4 py-3 font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.code} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-gray-600">{row.code}</td>
                  <td className="px-4 py-2.5 text-gray-800">{row.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${typeColor(row.account_type)}`}>
                      {row.account_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-700">
                    {row.total_debit  > 0 ? fN(row.total_debit)  : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-700">
                    {row.total_credit > 0 ? fN(row.total_credit) : ''}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${row.balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                    {fN(Math.abs(row.balance))}{row.balance < 0 ? ' (CR)' : ''}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                <td colSpan={3} className="px-4 py-2.5 text-xs text-gray-500">TOTAL</td>
                <td className="px-4 py-2.5 text-right font-mono">{fN(totalDr)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{fN(totalCr)}</td>
                <td className="px-4 py-2.5 text-right font-mono">
                  <span className={balanced ? 'text-green-700' : 'text-red-700'}>
                    {balanced ? '0.00 ✓' : fN(Math.abs(totalDr - totalCr)) + ' ✗'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Profit & Loss ────────────────────────────────────────────────────────────

function ProfitLossTab({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }) {
  const { data = [], isLoading, error } = useProfitLoss(dateFrom, dateTo);

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  if (error) return <ErrorNote msg={(error as Error).message} />;
  if (data.length === 0) return <EmptyNote />;

  const sections = ['Revenue', 'COGS', 'Expense'] as const;
  const bySection = (sec: string) =>
    data.filter(r => r.section === sec && r.code !== '----').sort((a, b) => a.sort_order - b.sort_order);

  const netRow = data.find(r => r.code === '----');

  const revenue  = bySection('Revenue').reduce((s, r) => s + r.amount, 0);
  const cogs     = bySection('COGS').reduce((s, r) => s + r.amount, 0);
  const grossProfit = revenue - cogs;

  const SECTION_STYLES: Record<string, { header: string; bg: string }> = {
    Revenue: { header: 'bg-green-50 text-green-700',   bg: '' },
    COGS:    { header: 'bg-amber-50 text-amber-700',   bg: '' },
    Expense: { header: 'bg-orange-50 text-orange-700', bg: '' },
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Revenue',      value: revenue,      color: '#10b981' },
          { label: 'COGS',         value: cogs,         color: '#f59e0b' },
          { label: 'Gross Profit', value: grossProfit,  color: '#2563eb' },
          { label: 'Net Income',   value: netRow?.amount ?? 0, color: (netRow?.amount ?? 0) >= 0 ? '#10b981' : '#ef4444' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="text-xs text-gray-400 mb-1">{kpi.label}</div>
            <div className="text-lg font-bold" style={{ color: kpi.color }}>
              {fN(kpi.value)}
            </div>
            <div className="text-[10px] text-gray-400">TRY</div>
          </div>
        ))}
      </div>

      {/* Detail table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-500">
              <th className="text-left px-4 py-3 font-semibold">Section</th>
              <th className="text-left px-4 py-3 font-semibold">Code</th>
              <th className="text-left px-4 py-3 font-semibold">Account</th>
              <th className="text-right px-4 py-3 font-semibold">Amount (TRY)</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(sec => {
              const rows = bySection(sec);
              const total = rows.reduce((s, r) => s + r.amount, 0);
              const st = SECTION_STYLES[sec];
              return (
                <>
                  <tr key={`${sec}-header`} className={st.header}>
                    <td colSpan={3} className="px-4 py-2 font-bold uppercase text-xs tracking-wide">{sec}</td>
                    <td className="px-4 py-2 text-right font-bold">{fN(total)}</td>
                  </tr>
                  {rows.map(row => (
                    <tr key={row.code} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-400" />
                      <td className="px-4 py-2 font-mono text-gray-600">{row.code}</td>
                      <td className="px-4 py-2 text-gray-700">{row.name}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-800">{fN(row.amount)}</td>
                    </tr>
                  ))}
                </>
              );
            })}
            {/* Net */}
            {netRow && (
              <tr className="border-t-2 border-gray-200">
                <td colSpan={3} className="px-4 py-3 font-bold text-gray-900">Net Profit / Loss</td>
                <td className={`px-4 py-3 text-right font-bold text-lg ${netRow.amount >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {fN(netRow.amount)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Balance Sheet ────────────────────────────────────────────────────────────

function BalanceSheetTab({ asOf }: { asOf?: string }) {
  const { data = [], isLoading, error } = useBalanceSheet(asOf);

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  if (error) return <ErrorNote msg={(error as Error).message} />;
  if (data.length === 0) return <EmptyNote />;

  const bySection = (sec: string) =>
    data.filter(r => r.section === sec).sort((a, b) => a.sort_order - b.sort_order);

  const totalAssets  = bySection('Asset').reduce((s, r) => s + r.balance, 0);
  const totalLiab    = bySection('Liability').reduce((s, r) => s + r.balance, 0);
  const totalEquity  = bySection('Equity').reduce((s, r) => s + r.balance, 0);
  const balanced     = Math.abs(totalAssets - (totalLiab + totalEquity)) < 0.01;

  const SECTION_STYLES: Record<string, string> = {
    Asset:     'bg-blue-50 text-blue-700',
    Liability: 'bg-red-50 text-red-700',
    Equity:    'bg-purple-50 text-purple-700',
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Assets',      value: totalAssets, color: '#2563eb' },
          { label: 'Total Liabilities', value: totalLiab,   color: '#ef4444' },
          { label: 'Total Equity',      value: totalEquity, color: '#7c3aed' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="text-xs text-gray-400 mb-1">{k.label}</div>
            <div className="text-lg font-bold" style={{ color: k.color }}>{fN(k.value)}</div>
            <div className="text-[10px] text-gray-400">TRY</div>
          </div>
        ))}
      </div>

      <div className={`text-xs font-semibold px-3 py-1.5 rounded-xl w-fit ${balanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
        {balanced ? '✓ Assets = Liabilities + Equity' : `✗ Unbalanced — diff: ${fN(Math.abs(totalAssets - totalLiab - totalEquity))}`}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Assets */}
        <SectionCard title="Assets" rows={bySection('Asset')} total={totalAssets} headerClass={SECTION_STYLES.Asset} />
        {/* Liabilities + Equity */}
        <div className="space-y-4">
          <SectionCard title="Liabilities" rows={bySection('Liability')} total={totalLiab} headerClass={SECTION_STYLES.Liability} />
          <SectionCard title="Equity" rows={bySection('Equity')} total={totalEquity} headerClass={SECTION_STYLES.Equity} />
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, rows, total, headerClass }: {
  title: string; rows: BalanceSheetRow[]; total: number; headerClass: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wide flex justify-between ${headerClass}`}>
        <span>{title}</span>
        <span>{fN(total)}</span>
      </div>
      <table className="w-full text-xs">
        <tbody>
          {rows.map(row => (
            <tr key={`${row.section}-${row.code}`} className="border-t border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-2 font-mono text-gray-500">{row.code}</td>
              <td className="px-4 py-2 text-gray-700">{row.name}</td>
              <td className="px-4 py-2 text-right font-mono font-medium text-gray-800">{fN(row.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function typeColor(t: string) {
  const m: Record<string, string> = {
    asset:     'bg-blue-50 text-blue-700',
    liability: 'bg-red-50 text-red-700',
    equity:    'bg-purple-50 text-purple-700',
    revenue:   'bg-green-50 text-green-700',
    expense:   'bg-orange-50 text-orange-700',
  };
  return m[t] ?? 'bg-gray-100 text-gray-600';
}

function EmptyNote() {
  return (
    <div className="p-10 text-center text-gray-400 text-sm">
      <p className="font-medium">No data yet</p>
      <p className="text-xs mt-1 text-orange-500">Run migrations 018–025 in Supabase and create some invoices/transactions first.</p>
    </div>
  );
}

function ErrorNote({ msg }: { msg: string }) {
  return (
    <div className="p-8 text-center">
      <p className="text-red-500 font-semibold text-sm">Error loading report</p>
      <p className="text-xs text-gray-400 mt-1">{msg}</p>
      <p className="text-xs text-orange-500 mt-2">Make sure migrations 018–025 are applied in Supabase.</p>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type FinTab = 'trial' | 'pnl' | 'bs';

const TABS: [FinTab, string][] = [
  ['trial', 'Trial Balance'],
  ['pnl',   'Profit & Loss'],
  ['bs',    'Balance Sheet'],
];

export function FinancialReportsPage() {
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';

  const [activeTab, setActiveTab] = useState<FinTab>('trial');
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [asOf, setAsOf]           = useState('');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: accent + '18' }}>
          <TrendingUp className="w-5 h-5" style={{ color: accent }} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Financial Reports</h1>
          <p className="text-xs text-gray-400">Accounting-grade reports from journal entries</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 h-8 rounded-xl text-xs font-semibold transition-all ${
              activeTab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Date filter */}
      <DateRangeBar
        dateFrom={dateFrom} dateTo={dateTo}
        onFrom={setDateFrom} onTo={setDateTo}
        asOf={asOf} onAsOf={setAsOf}
        mode={activeTab === 'bs' ? 'asof' : 'range'}
      />

      {/* Content */}
      {activeTab === 'trial' && <TrialBalanceTab dateFrom={dateFrom || undefined} dateTo={dateTo || undefined} />}
      {activeTab === 'pnl'   && <ProfitLossTab   dateFrom={dateFrom || undefined} dateTo={dateTo || undefined} />}
      {activeTab === 'bs'    && <BalanceSheetTab  asOf={asOf || undefined} />}
    </div>
  );
}
