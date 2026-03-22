import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { useTradeFiles } from '@/hooks/useTradeFiles';
import { useTransactionSummary } from '@/hooks/useTransactions';
import { fUSD } from '@/lib/formatters';
import { LoadingSpinner } from '@/components/ui/shared';
import {
  TrendingUp, TrendingDown, FileText, Clock, AlertTriangle, CheckCircle2,
  ArrowRight, Package, DollarSign, BarChart2, Inbox,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isOverdueEta(eta: string | null): boolean {
  if (!eta) return false;
  return new Date(eta + 'T00:00:00') < new Date(new Date().toDateString());
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m) - 1]} ${y.slice(2)}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon, trend, color = 'blue',
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'blue' | 'green' | 'red' | 'orange' | 'purple';
}) {
  const colors = {
    blue:   { bg: 'bg-blue-50',   icon: 'text-blue-500',   border: 'border-blue-100' },
    green:  { bg: 'bg-green-50',  icon: 'text-green-500',  border: 'border-green-100' },
    red:    { bg: 'bg-red-50',    icon: 'text-red-500',    border: 'border-red-100' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-500', border: 'border-orange-100' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-500', border: 'border-purple-100' },
  };
  const c = colors[color];
  return (
    <div className={`bg-white rounded-xl border ${c.border} p-4 flex items-start gap-3 shadow-sm`}>
      <div className={`${c.bg} ${c.icon} rounded-lg p-2.5 flex-shrink-0`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5 truncate">{label}</div>
        <div className="text-lg sm:text-xl font-bold text-foreground truncate">{value}</div>
        {sub && (
          <div className="flex items-center gap-1 mt-0.5">
            {trend === 'up'   && <TrendingUp  className="h-3 w-3 text-green-500" />}
            {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
            <span className="text-[11px] text-muted-foreground truncate">{sub}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function AlertCard({ items }: { items: { label: string; sub: string; href: string; type: 'danger' | 'warning' }[] }) {
  const navigate = useNavigate();
  if (items.length === 0) return (
    <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
      <CheckCircle2 className="h-8 w-8 text-green-400" />
      <div className="text-xs text-muted-foreground">No pending alerts 🎉</div>
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => navigate(item.href)}
          className={`flex items-start gap-2.5 p-2.5 rounded-lg text-left w-full transition-colors
            ${item.type === 'danger' ? 'bg-red-50 hover:bg-red-100 border border-red-100' : 'bg-amber-50 hover:bg-amber-100 border border-amber-100'}`}
        >
          <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${item.type === 'danger' ? 'text-red-500' : 'text-amber-500'}`} />
          <div>
            <div className={`text-xs font-semibold ${item.type === 'danger' ? 'text-red-700' : 'text-amber-700'}`}>{item.label}</div>
            <div className="text-[11px] text-muted-foreground">{item.sub}</div>
          </div>
          <ArrowRight className="h-3 w-3 ml-auto mt-0.5 text-muted-foreground flex-shrink-0" />
        </button>
      ))}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: files = [], isLoading: filesLoading } = useTradeFiles();
  const { data: summary, isLoading: summaryLoading } = useTransactionSummary();

  // ── Pipeline counts ──
  const byStatus = useMemo(() => ({
    request:   files.filter(f => f.status === 'request').length,
    sale:      files.filter(f => f.status === 'sale').length,
    delivery:  files.filter(f => f.status === 'delivery').length,
    completed: files.filter(f => f.status === 'completed').length,
    cancelled: files.filter(f => f.status === 'cancelled').length,
  }), [files]);

  const activeFiles = byStatus.request + byStatus.sale + byStatus.delivery;

  // ── This month stats ──
  const thisMonth = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthFiles = files.filter(f => f.created_at?.startsWith(key.slice(0, 7)));
    return { count: monthFiles.length };
  }, [files]);

  // ── Last 6 months chart data ──
  const chartData = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ key, label: formatMonthLabel(key) });
    }

    return months.map(({ key, label }) => {
      const monthFiles = files.filter(f => {
        const fKey = getMonthKey(f.created_at ?? '');
        return fKey === key;
      });
      const revenue = monthFiles.reduce((s, f) => {
        const qty = f.delivered_admt ?? f.tonnage_mt ?? 0;
        return s + (f.selling_price ?? 0) * qty;
      }, 0);
      const cost = monthFiles.reduce((s, f) => {
        const qty = f.delivered_admt ?? f.tonnage_mt ?? 0;
        const purchase = (f.purchase_price ?? 0) * qty;
        const freight = (f.freight_cost ?? 0) * qty;
        return s + purchase + freight;
      }, 0);
      const profit = revenue - cost;
      return { label, revenue, cost, profit, files: monthFiles.length };
    });
  }, [files]);

  // ── Alerts ──
  const alerts = useMemo(() => {
    const list: { label: string; sub: string; href: string; type: 'danger' | 'warning' }[] = [];

    // Overdue ETA sale/delivery files
    files
      .filter(f => ['sale', 'delivery'].includes(f.status) && f.eta && isOverdueEta(f.eta))
      .slice(0, 5)
      .forEach(f => {
        const d = daysUntil(f.eta);
        list.push({
          label: `${f.file_no} — ETA Overdue`,
          sub: `${Math.abs(d ?? 0)} day(s) late — ${f.customer?.name ?? ''}`,
          href: `/files/${f.id}`,
          type: 'danger',
        });
      });

    // Files with ETA within 7 days
    files
      .filter(f => ['sale', 'delivery'].includes(f.status) && f.eta && !isOverdueEta(f.eta))
      .filter(f => { const d = daysUntil(f.eta); return d !== null && d <= 7 && d >= 0; })
      .slice(0, 3)
      .forEach(f => {
        const d = daysUntil(f.eta);
        list.push({
          label: `${f.file_no} — ETA Approaching`,
          sub: `${d} day(s) remaining — ${f.customer?.name ?? ''}`,
          href: `/files/${f.id}`,
          type: 'warning',
        });
      });

    return list;
  }, [files]);

  // ── Recent files ──
  const recentFiles = useMemo(() =>
    [...files]
      .sort((a, b) => new Date(b.created_at ?? '').getTime() - new Date(a.created_at ?? '').getTime())
      .slice(0, 8),
    [files],
  );

  // ── Total estimated P&L from all completed files ──
  const totalProfit = useMemo(() => {
    return files
      .filter(f => f.status === 'completed')
      .reduce((s, f) => {
        const qty = f.delivered_admt ?? f.tonnage_mt ?? 0;
        const rev = (f.selling_price ?? 0) * qty;
        const cost = ((f.purchase_price ?? 0) + (f.freight_cost ?? 0)) * qty;
        return s + (rev - cost);
      }, 0);
  }, [files]);

  if (filesLoading || summaryLoading) return <LoadingSpinner />;

  const STATUS_COLORS: Record<string, string> = {
    request:   'bg-blue-100 text-blue-700',
    sale:      'bg-purple-100 text-purple-700',
    delivery:  'bg-amber-100 text-amber-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="space-y-5">

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Active Files"
          value={String(activeFiles)}
          sub={`${thisMonth.count} new file(s) this month`}
          icon={<FileText className="h-4 w-4" />}
          color="blue"
          trend="neutral"
        />
        <KpiCard
          label="Receivable"
          value={fUSD(summary?.totalReceivable ?? 0)}
          sub="Customer receivables"
          icon={<DollarSign className="h-4 w-4" />}
          color="green"
          trend="neutral"
        />
        <KpiCard
          label="Payable"
          value={fUSD(summary?.totalPayable ?? 0)}
          sub="Supplier / service payables"
          icon={<Inbox className="h-4 w-4" />}
          color="orange"
          trend="neutral"
        />
        <KpiCard
          label="Total Profit (Completed)"
          value={fUSD(totalProfit)}
          sub={`${byStatus.completed} completed file(s)`}
          icon={<BarChart2 className="h-4 w-4" />}
          color={totalProfit >= 0 ? 'green' : 'red'}
          trend={totalProfit >= 0 ? 'up' : 'down'}
        />
      </div>

      {/* ── Pipeline Summary + Alerts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Pipeline Summary */}
        <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
          <div className="text-xs font-bold mb-3 flex items-center gap-2">
            <Package className="h-3.5 w-3.5 text-brand-500" />
            Pipeline Status
          </div>
          <div className="space-y-2">
            {([
              ['request',   '📥 Request',      byStatus.request],
              ['sale',      '📝 Sale',       byStatus.sale],
              ['delivery',  '🚛 Delivery',    byStatus.delivery],
              ['completed', '✅ Completed',  byStatus.completed],
              ['cancelled', '❌ Cancelled',       byStatus.cancelled],
            ] as [string, string, number][]).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => navigate('/pipeline')}
                className="w-full flex items-center gap-3 hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors"
              >
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full min-w-[28px] text-center ${STATUS_COLORS[key]}`}>
                  {count}
                </span>
                <span className="text-xs text-foreground">{label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-1.5 mx-2">
                  <div
                    className={`h-1.5 rounded-full ${key === 'request' ? 'bg-blue-400' : key === 'sale' ? 'bg-purple-400' : key === 'delivery' ? 'bg-amber-400' : key === 'completed' ? 'bg-green-400' : 'bg-gray-300'}`}
                    style={{ width: files.length > 0 ? `${(count / files.length) * 100}%` : '0%' }}
                  />
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={() => navigate('/pipeline')}
            className="mt-3 w-full text-center text-[11px] text-brand-500 hover:text-brand-600 font-medium flex items-center justify-center gap-1"
          >
            Go to Pipeline <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {/* Alerts — 2 cols */}
        <div className="bg-white rounded-xl border border-border p-4 shadow-sm lg:col-span-2">
          <div className="text-xs font-bold mb-3 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            Alerts & Reminders
            {alerts.length > 0 && (
              <span className="ml-auto bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {alerts.length}
              </span>
            )}
          </div>
          <AlertCard items={alerts} />
        </div>
      </div>

      {/* ── P&L Chart + Recent Files ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* P&L Bar Chart */}
        <div className="bg-white rounded-xl border border-border p-4 shadow-sm lg:col-span-3">
          <div className="text-xs font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-green-500" />
            Last 6 Months — Estimated Revenue & Cost
          </div>
          {chartData.every(d => d.revenue === 0 && d.cost === 0) ? (
            <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
              <BarChart2 className="h-8 w-8 text-gray-200" />
              <div className="text-xs text-muted-foreground">No data yet</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name: any) => [
                    `$${Number(value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
                    name === 'revenue' ? 'Revenue' : name === 'cost' ? 'Cost' : 'Profit',
                  ]}
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                />
                <Bar dataKey="revenue" name="revenue" fill="#60a5fa" radius={[3, 3, 0, 0]} />
                <Bar dataKey="cost"    name="cost"    fill="#f87171" radius={[3, 3, 0, 0]} />
                <Bar dataKey="profit"  name="profit"  radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={entry.profit >= 0 ? '#4ade80' : '#fb923c'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="flex items-center gap-4 mt-2 justify-center">
            {[['#60a5fa', 'Revenue'], ['#f87171', 'Cost'], ['#4ade80', 'Profit']].map(([color, label]) => (
              <div key={label} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Files */}
        <div className="bg-white rounded-xl border border-border p-4 shadow-sm lg:col-span-2">
          <div className="text-xs font-bold mb-3 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-brand-500" />
            Recent Files
          </div>
          <div className="space-y-0">
            {recentFiles.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-6">No files</div>
            ) : recentFiles.map((f) => (
              <button
                key={f.id}
                onClick={() => navigate(`/files/${f.id}`)}
                className="w-full flex items-center gap-2 py-2 border-b border-border last:border-0 hover:bg-gray-50 rounded transition-colors px-1 group"
              >
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-[11px] font-semibold text-foreground truncate">{f.file_no}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{f.customer?.name ?? '—'}</div>
                </div>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[f.status]}`}>
                  {f.status === 'request' ? 'TALEP' : f.status === 'sale' ? 'SATIŞ' : f.status === 'delivery' ? 'TESLİMAT' : f.status === 'completed' ? 'TAMAM' : 'İPTAL'}
                </span>
                <ArrowRight className="h-3 w-3 text-gray-300 group-hover:text-brand-400 flex-shrink-0 transition-colors" />
              </button>
            ))}
          </div>
          <button
            onClick={() => navigate('/files')}
            className="mt-2 w-full text-center text-[11px] text-brand-500 hover:text-brand-600 font-medium flex items-center justify-center gap-1"
          >
            Tüm dosyaları gör <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>

    </div>
  );
}
