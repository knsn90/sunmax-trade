import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { useTradeFiles } from '@/hooks/useTradeFiles';
import { useTransactionSummary } from '@/hooks/useTransactions';
import { useAuth } from '@/hooks/useAuth';
import { fUSD, fDate } from '@/lib/formatters';
import { LoadingSpinner } from '@/components/ui/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  ChevronRight, FileText, BarChart2,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isOverdueEta(eta: string | null) {
  if (!eta) return false;
  return new Date(eta + 'T00:00:00') < new Date(new Date().toDateString());
}
function daysUntil(dateStr: string | null) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
}
function getMonthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function formatMonthLabel(key: string) {
  const [y, m] = key.split('-');
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1] + ' ' + y.slice(2);
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { dot: string; text: string; label: string }> = {
  request:   { dot: 'bg-amber-400',  text: 'text-amber-700',  label: 'Request' },
  sale:      { dot: 'bg-blue-400',   text: 'text-blue-700',   label: 'Sale' },
  delivery:  { dot: 'bg-violet-400', text: 'text-violet-700', label: 'Delivery' },
  completed: { dot: 'bg-green-400',  text: 'text-green-700',  label: 'Completed' },
  cancelled: { dot: 'bg-gray-300',   text: 'text-gray-500',   label: 'Cancelled' },
};

const AVATAR_COLORS = ['#dc2626','#2563eb','#7c3aed','#059669','#d97706'];
function avatarBg(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(/\s+/).slice(0,2).map(w => w[0]).join('').toUpperCase();
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, trend, featured = false, accent = '#2563eb' }: {
  label: string; value: string; sub?: string;
  trend?: 'up' | 'down'; featured?: boolean; accent?: string;
}) {
  if (featured) {
    return (
      <div className="rounded-2xl p-4 text-white shadow-md col-span-2 relative overflow-hidden"
        style={{ background: accent }}>
        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-6 translate-x-6" />
        <div className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-1">{label}</div>
        <div className="text-3xl font-black">{value}</div>
        {sub && <div className="text-[11px] opacity-60 mt-1">{sub}</div>}
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">{label}</div>
      <div className="text-xl font-black text-gray-900">{value}</div>
      {sub && (
        <div className="flex items-center gap-1 mt-1">
          {trend === 'up'   && <TrendingUp  className="h-3 w-3 text-green-500" />}
          {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
          <span className="text-[10px] text-gray-400">{sub}</span>
        </div>
      )}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children, action, actionLabel }: {
  title: string; children: React.ReactNode;
  action?: () => void; actionLabel?: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{title}</span>
        {action && (
          <button onClick={action} className="text-[11px] font-semibold flex items-center gap-0.5" style={{ color: 'inherit' }}>
            {actionLabel} <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: files = [], isLoading: filesLoading } = useTradeFiles();
  const { data: summary, isLoading: summaryLoading } = useTransactionSummary();
  const { theme } = useTheme();
  const isDonezo = theme === 'donezo';
  const accent = isDonezo ? '#dc2626' : '#2563eb';

  const byStatus = useMemo(() => ({
    request:   files.filter(f => f.status === 'request').length,
    sale:      files.filter(f => f.status === 'sale').length,
    delivery:  files.filter(f => f.status === 'delivery').length,
    completed: files.filter(f => f.status === 'completed').length,
    cancelled: files.filter(f => f.status === 'cancelled').length,
  }), [files]);

  const activeFiles = byStatus.request + byStatus.sale + byStatus.delivery;

  const thisMonth = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return files.filter(f => f.created_at?.startsWith(key.slice(0, 7))).length;
  }, [files]);

  const chartData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const mf = files.filter(f => getMonthKey(f.created_at ?? '') === key);
      const revenue = mf.reduce((s, f) => s + (f.selling_price ?? 0) * (f.delivered_admt ?? f.tonnage_mt ?? 0), 0);
      const cost    = mf.reduce((s, f) => s + ((f.purchase_price ?? 0) + (f.freight_cost ?? 0)) * (f.delivered_admt ?? f.tonnage_mt ?? 0), 0);
      return { label: formatMonthLabel(key), revenue, cost, profit: revenue - cost };
    });
  }, [files]);

  const alerts = useMemo(() => {
    const list: { label: string; sub: string; href: string; type: 'danger' | 'warning' }[] = [];
    files.filter(f => ['sale','delivery'].includes(f.status) && f.eta && isOverdueEta(f.eta)).slice(0,5)
      .forEach(f => list.push({ label: `${f.file_no} — ETA Overdue`, sub: `${Math.abs(daysUntil(f.eta) ?? 0)} day(s) late · ${f.customer?.name ?? ''}`, href: `/files/${f.id}`, type: 'danger' }));
    files.filter(f => ['sale','delivery'].includes(f.status) && f.eta && !isOverdueEta(f.eta))
      .filter(f => { const d = daysUntil(f.eta); return d !== null && d <= 7 && d >= 0; }).slice(0,3)
      .forEach(f => list.push({ label: `${f.file_no} — ETA Soon`, sub: `${daysUntil(f.eta)} day(s) · ${f.customer?.name ?? ''}`, href: `/files/${f.id}`, type: 'warning' }));
    return list;
  }, [files]);

  const recentFiles = useMemo(() =>
    [...files].sort((a, b) => new Date(b.created_at ?? '').getTime() - new Date(a.created_at ?? '').getTime()).slice(0, 6),
    [files]);

  const totalProfit = useMemo(() =>
    files.filter(f => f.status === 'completed').reduce((s, f) => {
      const qty = f.delivered_admt ?? f.tonnage_mt ?? 0;
      return s + (f.selling_price ?? 0) * qty - ((f.purchase_price ?? 0) + (f.freight_cost ?? 0)) * qty;
    }, 0), [files]);

  const hasChart = chartData.some(d => d.revenue > 0 || d.cost > 0);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  if (filesLoading || summaryLoading) return <LoadingSpinner />;

  return (
    <div className="-mx-4 -mt-4 md:mx-0 md:mt-0 bg-gray-50 min-h-screen pb-28">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-4">
        <div className="text-[12px] text-gray-400 font-medium">{greeting} 👋</div>
        <div className="text-[20px] font-black text-gray-900 mt-0.5">
          {profile?.full_name?.split(' ')[0] ?? 'Dashboard'}
        </div>
      </div>

      <div className="px-3 space-y-3">

        {/* ── KPI Grid ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard
            label="Active Files"
            value={String(activeFiles)}
            sub={`${thisMonth} new this month`}
            featured
            accent={accent}
          />
          <KpiCard
            label="Receivable"
            value={fUSD(summary?.totalReceivable ?? 0)}
            sub="Customer"
          />
          <KpiCard
            label="Payable"
            value={fUSD(summary?.totalPayable ?? 0)}
            sub="Supplier / service"
          />
          <KpiCard
            label="Total Profit"
            value={fUSD(totalProfit)}
            sub={`${byStatus.completed} completed`}
            trend={totalProfit >= 0 ? 'up' : 'down'}
          />
        </div>

        {/* ── Pipeline Status ─────────────────────────────────────────────── */}
        <Section title="Pipeline" action={() => navigate('/pipeline')} actionLabel="See all">
          <div className="px-4 py-2">
            {(['request','sale','delivery','completed','cancelled'] as const).map((key) => {
              const cfg = STATUS_CFG[key];
              const count = byStatus[key];
              const pct = files.length > 0 ? (count / files.length) * 100 : 0;
              return (
                <button
                  key={key}
                  onClick={() => navigate('/pipeline')}
                  className="w-full flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 active:bg-gray-50"
                >
                  <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
                  <span className="text-[13px] text-gray-700 flex-1 text-left">{cfg.label}</span>
                  <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full', cfg.dot)} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={cn('text-[12px] font-bold w-5 text-right shrink-0', cfg.text)}>{count}</span>
                </button>
              );
            })}
          </div>
        </Section>

        {/* ── Alerts ──────────────────────────────────────────────────────── */}
        <Section
          title={`Alerts${alerts.length > 0 ? ` · ${alerts.length}` : ''}`}
        >
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <CheckCircle2 className="h-7 w-7 text-green-400" />
              <span className="text-[12px] text-gray-400">All clear — no alerts</span>
            </div>
          ) : (
            <div className="px-4 py-2">
              {alerts.map((a, i) => (
                <button
                  key={i}
                  onClick={() => navigate(a.href)}
                  className="w-full flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 active:bg-gray-50 text-left"
                >
                  <div className={cn(
                    'w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
                    a.type === 'danger' ? 'bg-red-50' : 'bg-amber-50'
                  )}>
                    <AlertTriangle className={cn('h-4 w-4', a.type === 'danger' ? 'text-red-500' : 'text-amber-500')} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-gray-900 truncate">{a.label}</div>
                    <div className="text-[11px] text-gray-400 truncate mt-0.5">{a.sub}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* ── Recent Files ────────────────────────────────────────────────── */}
        <Section title="Recent Files" action={() => navigate('/files')} actionLabel="All files">
          {recentFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <FileText className="h-7 w-7 text-gray-200" />
              <span className="text-[12px] text-gray-400">No files yet</span>
            </div>
          ) : (
            <div className="px-4 py-2">
              {recentFiles.map((f) => {
                const name = f.customer?.name ?? 'Unknown';
                const cfg = STATUS_CFG[f.status] ?? STATUS_CFG.request;
                return (
                  <button
                    key={f.id}
                    onClick={() => navigate(`/files/${f.id}`)}
                    className="w-full flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 active:bg-gray-50"
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                      style={{ background: avatarBg(name) }}
                    >
                      {initials(name)}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-[13px] font-semibold text-gray-900 truncate">{name}</div>
                      <div className="text-[10px] font-mono text-gray-400 mt-0.5">{f.file_no}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-1">
                        <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                        <span className={cn('text-[10px] font-semibold', cfg.text)}>{cfg.label}</span>
                      </div>
                      <span className="text-[10px] text-gray-400">{fDate(f.file_date)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        {/* ── P&L Chart ───────────────────────────────────────────────────── */}
        <Section title="Revenue & Cost · Last 6 Months">
          <div className="px-4 py-4">
            {!hasChart ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <BarChart2 className="h-8 w-8 text-gray-200" />
                <span className="text-[12px] text-gray-400">No data yet</span>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={chartData} barCategoryGap="35%" barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={36} />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(v: any, n: any) => [`$${Number(v).toLocaleString()}`, n === 'revenue' ? 'Revenue' : n === 'cost' ? 'Cost' : 'Profit']}
                      contentStyle={{ fontSize: 11, borderRadius: 10, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}
                    />
                    <Bar dataKey="revenue" fill={accent + '60'} radius={[4,4,0,0]} />
                    <Bar dataKey="cost"    fill="#f87171" radius={[4,4,0,0]} />
                    <Bar dataKey="profit"  radius={[4,4,0,0]}>
                      {chartData.map((e, i) => <Cell key={i} fill={e.profit >= 0 ? '#4ade80' : '#fb923c'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-4 mt-3">
                  {[[accent + '60','Revenue'],['#f87171','Cost'],['#4ade80','Profit']].map(([c,l]) => (
                    <div key={l} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                      <span className="text-[10px] text-gray-400">{l}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Section>

        {/* bottom safe area for nav */}
        <div className="h-4" />
      </div>
    </div>
  );
}
