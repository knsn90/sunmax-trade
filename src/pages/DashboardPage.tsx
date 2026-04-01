import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, DragEndEvent, DragOverlay, DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTradeFiles } from '@/hooks/useTradeFiles';
import { useTransactions, useTransactionSummary } from '@/hooks/useTransactions';
import { useAuth } from '@/hooks/useAuth';
import { fUSD, fDate } from '@/lib/formatters';
import { LoadingSpinner } from '@/components/ui/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { usePriceList } from '@/hooks/useEntities';
import { saveDashboardPrefs } from '@/services/userService';
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  ChevronRight, FileText, BarChart2, Package, DollarSign, Wallet, Tag,
  GripVertical, Maximize2, Minimize2,
} from 'lucide-react';

// ─── Widget order & sizes ─────────────────────────────────────────────────────
// 'kpi' is intentionally excluded — it's always fixed at the top
const DEFAULT_ORDER = ['pipeline', 'alerts', 'recent_files', 'delivery', 'latest_prices', 'revenue_chart'];

// Default column span per widget ('full' = col-span-2, 'half' = col-span-1)
const DEFAULT_SIZES: Record<string, 'full' | 'half'> = {
  recent_files: 'full', delivery: 'full',
  latest_prices: 'full', revenue_chart: 'full',
  pipeline: 'half', alerts: 'half',
};

function loadOrder(userId: string): string[] {
  try {
    const raw = localStorage.getItem(`dashboard_order_${userId}`);
    if (!raw) return DEFAULT_ORDER;
    const saved: string[] = JSON.parse(raw);
    const valid = saved.filter(id => DEFAULT_ORDER.includes(id));
    const missing = DEFAULT_ORDER.filter(id => !valid.includes(id));
    return [...valid, ...missing];
  } catch { return DEFAULT_ORDER; }
}
function saveOrder(userId: string, order: string[]) {
  localStorage.setItem(`dashboard_order_${userId}`, JSON.stringify(order));
}

function loadSizes(userId: string): Record<string, 'full' | 'half'> {
  try {
    const raw = localStorage.getItem(`dashboard_sizes_${userId}`);
    if (!raw) return { ...DEFAULT_SIZES };
    const saved = JSON.parse(raw) as Record<string, 'full' | 'half'>;
    // merge defaults for any new widgets
    return { ...DEFAULT_SIZES, ...saved };
  } catch { return { ...DEFAULT_SIZES }; }
}
function saveSizes(userId: string, sizes: Record<string, 'full' | 'half'>) {
  localStorage.setItem(`dashboard_sizes_${userId}`, JSON.stringify(sizes));
}

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
const STATUS_CFG: Record<string, { dot: string; text: string; bg: string; label: string }> = {
  request:   { dot: 'bg-amber-400',  text: 'text-amber-700',  bg: 'bg-amber-50',  label: 'Request' },
  sale:      { dot: 'bg-blue-400',   text: 'text-blue-700',   bg: 'bg-blue-50',   label: 'Sale' },
  delivery:  { dot: 'bg-violet-400', text: 'text-violet-700', bg: 'bg-violet-50', label: 'Delivery' },
  completed: { dot: 'bg-green-400',  text: 'text-green-700',  bg: 'bg-green-50',  label: 'Completed' },
  cancelled: { dot: 'bg-gray-300',   text: 'text-gray-500',   bg: 'bg-gray-50',   label: 'Cancelled' },
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
function KpiCard({ label, value, sub, trend, icon, accent }: {
  label: string; value: string; sub?: string;
  trend?: 'up' | 'down'; icon: React.ReactNode; accent: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-3.5 md:p-5 shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex flex-col gap-1 md:hidden">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
        <div className="text-[15px] font-black text-gray-900 leading-tight truncate">{value}</div>
        {sub && (
          <div className="flex items-center gap-1">
            {trend === 'up'   && <TrendingUp  className="h-2.5 w-2.5 text-green-500 shrink-0" />}
            {trend === 'down' && <TrendingDown className="h-2.5 w-2.5 text-red-500 shrink-0" />}
            <span className="text-[10px] text-gray-400 truncate">{sub}</span>
          </div>
        )}
      </div>
      <div className="hidden md:flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: accent + '18' }}>
          <span style={{ color: accent }}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</div>
          <div className="text-2xl font-black text-gray-900 leading-none">{value}</div>
          {sub && (
            <div className="flex items-center gap-1 mt-1.5">
              {trend === 'up'   && <TrendingUp  className="h-3 w-3 text-green-500 shrink-0" />}
              {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-500 shrink-0" />}
              <span className="text-[11px] text-gray-400">{sub}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ title, children, action, actionLabel, className, dragHandleProps, isFull, onToggleSize }: {
  title: string; children: React.ReactNode;
  action?: () => void; actionLabel?: string; className?: string;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  isFull?: boolean; onToggleSize?: () => void;
}) {
  return (
    <div className={cn('bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-[340px]', className)}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{title}</span>
        <div className="flex items-center gap-1.5">
          {action && (
            <button onClick={action} className="text-[11px] font-semibold text-gray-400 hover:text-gray-700 flex items-center gap-0.5 transition-colors mr-1">
              {actionLabel} <ChevronRight className="h-3 w-3" />
            </button>
          )}
          {/* Size toggle — desktop only */}
          {onToggleSize && (
            <button
              onClick={onToggleSize}
              className="hidden md:flex items-center justify-center w-6 h-6 rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title={isFull ? 'Shrink to half width' : 'Expand to full width'}
            >
              {isFull ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          )}
          {dragHandleProps && (
            <div
              {...dragHandleProps}
              className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none flex items-center justify-center w-6 h-6 rounded-md hover:bg-gray-100 transition-colors"
              title="Drag to reorder"
            >
              <GripVertical className="h-4 w-4" />
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

// ─── Sortable wrapper ─────────────────────────────────────────────────────────
function SortableWidget({ id, isFull, children }: {
  id: string;
  isFull: boolean;
  children: (dragHandleProps: React.HTMLAttributes<HTMLElement>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        isFull ? 'md:col-span-2' : 'md:col-span-1',
        isDragging && 'opacity-40',
      )}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: files = [], isLoading: filesLoading } = useTradeFiles();
  const { data: summary, isLoading: summaryLoading } = useTransactionSummary();
  const { data: transactions = [] } = useTransactions();
  const { data: priceEntries = [] } = usePriceList();
  const { theme } = useTheme();
  const isDonezo = theme === 'donezo';
  const accent = isDonezo ? '#dc2626' : '#2563eb';

  const userId = profile?.id ?? 'default';
  const dbPrefs = profile?.dashboard_prefs;

  const [widgetOrder, setWidgetOrder] = useState<string[]>(() => {
    if (dbPrefs?.order) {
      const valid = dbPrefs.order.filter((id: string) => DEFAULT_ORDER.includes(id));
      const missing = DEFAULT_ORDER.filter(id => !valid.includes(id));
      return [...valid, ...missing];
    }
    return loadOrder(userId);
  });

  const [widgetSizes, setWidgetSizes] = useState<Record<string, 'full' | 'half'>>(() => {
    if (dbPrefs?.sizes) return { ...DEFAULT_SIZES, ...dbPrefs.sizes };
    return loadSizes(userId);
  });
  const [activeId, setActiveId] = useState<string | null>(null);

  const toggleSize = useCallback((id: string) => {
    setWidgetSizes(prev => {
      const next: Record<string, 'full' | 'half'> = { ...prev, [id]: prev[id] === 'full' ? 'half' : 'full' };
      saveSizes(userId, next);
      if (profile?.id) saveDashboardPrefs(profile.id, { order: widgetOrder, sizes: next });
      return next;
    });
  }, [userId, profile?.id, widgetOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  }, []);

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setWidgetOrder(prev => {
      const oldIdx = prev.indexOf(String(active.id));
      const newIdx = prev.indexOf(String(over.id));
      const next = arrayMove(prev, oldIdx, newIdx);
      saveOrder(userId, next);
      if (profile?.id) saveDashboardPrefs(profile.id, { order: next, sizes: widgetSizes });
      return next;
    });
  }, [userId, profile?.id, widgetSizes]);

  // ── Computed data ─────────────────────────────────────────────────────────
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

    // ETA overdue
    files.filter(f => ['sale','delivery'].includes(f.status) && f.eta && isOverdueEta(f.eta)).slice(0,5)
      .forEach(f => list.push({ label: `${f.file_no} — ETA Overdue`, sub: `${Math.abs(daysUntil(f.eta) ?? 0)} day(s) late · ${f.customer?.name ?? ''}`, href: `/files/${f.id}`, type: 'danger' }));

    // ETA soon (≤7 days)
    files.filter(f => ['sale','delivery'].includes(f.status) && f.eta && !isOverdueEta(f.eta))
      .filter(f => { const d = daysUntil(f.eta); return d !== null && d <= 7 && d >= 0; }).slice(0,3)
      .forEach(f => list.push({ label: `${f.file_no} — ETA Soon`, sub: `${daysUntil(f.eta)} day(s) · ${f.customer?.name ?? ''}`, href: `/files/${f.id}`, type: 'warning' }));

    // Payment not received — ETA within 10 days
    // Build set of file IDs that have a fully paid receipt
    const paidFileIds = new Set(
      transactions
        .filter(t => t.transaction_type === 'receipt' && t.payment_status === 'paid' && t.trade_file_id)
        .map(t => t.trade_file_id as string)
    );
    files
      .filter(f => ['sale','delivery'].includes(f.status) && f.eta && !isOverdueEta(f.eta))
      .filter(f => { const d = daysUntil(f.eta); return d !== null && d <= 10 && d >= 0; })
      .filter(f => !paidFileIds.has(f.id))
      .slice(0, 5)
      .forEach(f => {
        const d = daysUntil(f.eta) ?? 0;
        list.push({
          label: `${f.file_no} — Payment Pending`,
          sub: `${d} day(s) to ETA · ${f.customer?.name ?? ''}`,
          href: `/files/${f.id}`,
          type: d <= 5 ? 'danger' : 'warning',
        });
      });

    return list;
  }, [files, transactions]);

  const recentFiles = useMemo(() =>
    [...files].sort((a, b) => new Date(b.created_at ?? '').getTime() - new Date(a.created_at ?? '').getTime()).slice(0, 8),
    [files]);

  const totalProfit = useMemo(() =>
    files.filter(f => f.status === 'completed').reduce((s, f) => {
      const qty = f.delivered_admt ?? f.tonnage_mt ?? 0;
      return s + (f.selling_price ?? 0) * qty - ((f.purchase_price ?? 0) + (f.freight_cost ?? 0)) * qty;
    }, 0), [files]);

  const hasChart = chartData.some(d => d.revenue > 0 || d.cost > 0);

  const delayData = useMemo(() => {
    const today = new Date(new Date().toDateString()).getTime();
    return files
      .filter(f => f.eta && ['sale', 'delivery', 'completed'].includes(f.status))
      .map(f => {
        const etaMs = new Date((f.eta as string) + 'T00:00:00').getTime();
        const compareMs = f.arrival_date ? new Date(f.arrival_date + 'T00:00:00').getTime() : today;
        const days = Math.round((compareMs - etaMs) / 86400000);
        let status: 'ontime' | 'late' | 'overdue' | 'pending';
        if (f.arrival_date) { status = days <= 0 ? 'ontime' : 'late'; }
        else if (days > 0)  { status = 'overdue'; }
        else                 { status = 'pending'; }
        return { file: f, days, status };
      });
  }, [files]);

  const delayPieData = useMemo(() => {
    const counts = { ontime: 0, late: 0, overdue: 0, pending: 0 };
    delayData.forEach(d => counts[d.status]++);
    return [
      { name: 'On Time',       value: counts.ontime,  color: '#4ade80' },
      { name: 'Late Delivery', value: counts.late,    color: '#f87171' },
      { name: 'Overdue',       value: counts.overdue, color: '#dc2626' },
      { name: 'Pending',       value: counts.pending, color: '#93c5fd' },
    ].filter(d => d.value > 0);
  }, [delayData]);

  const delayBarData = useMemo(() =>
    delayData.filter(d => d.status !== 'pending')
      .sort((a, b) => b.days - a.days).slice(0, 7)
      .map(d => ({
        name: d.file.file_no,
        days: d.days,
        fill: d.status === 'ontime' ? '#4ade80' : d.status === 'late' ? '#f87171' : '#dc2626',
      })),
    [delayData]
  );

  const latestPrices = useMemo(() => {
    const map = new Map<string, typeof priceEntries[0]>();
    [...priceEntries].sort((a, b) => a.price_date.localeCompare(b.price_date))
      .forEach(e => map.set(e.product_id, e));
    return Array.from(map.values()).sort((a, b) => (a.product?.name ?? '').localeCompare(b.product?.name ?? ''));
  }, [priceEntries]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const isFirstLoad = (filesLoading && files.length === 0) || (summaryLoading && !summary);
  if (isFirstLoad) return <LoadingSpinner />;

  // ── Widget renderer ───────────────────────────────────────────────────────
  function renderWidget(id: string, dragHandleProps: React.HTMLAttributes<HTMLElement>) {
    const isFull = widgetSizes[id] === 'full';
    const onToggleSize = () => toggleSize(id);

    switch (id) {

      case 'pipeline':
        return (
          <Card title="Pipeline" action={() => navigate('/pipeline')} actionLabel="See all" dragHandleProps={dragHandleProps} isFull={isFull} onToggleSize={onToggleSize}>
            <div className="px-5 py-1">
              {(['request','sale','delivery','completed','cancelled'] as const).map((key) => {
                const cfg = STATUS_CFG[key];
                const count = byStatus[key];
                const pct = files.length > 0 ? (count / files.length) * 100 : 0;
                return (
                  <button key={key} onClick={() => navigate('/pipeline')}
                    className="w-full flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded-xl -mx-1 px-1 transition-colors"
                  >
                    <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
                    <span className="text-[13px] text-gray-700 flex-1 text-left">{cfg.label}</span>
                    <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full', cfg.dot)} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={cn('text-[12px] font-bold w-5 text-right shrink-0', cfg.text)}>{count}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        );

      case 'alerts':
        return (
          <Card title={`Alerts${alerts.length > 0 ? ` · ${alerts.length}` : ''}`} dragHandleProps={dragHandleProps} isFull={isFull} onToggleSize={onToggleSize}>
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <CheckCircle2 className="h-8 w-8 text-green-400" />
                <span className="text-[12px] text-gray-400">All clear — no alerts</span>
              </div>
            ) : (
              <div className="px-5 py-1">
                {alerts.map((a, i) => (
                  <button key={i} onClick={() => navigate(a.href)}
                    className="w-full flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded-xl -mx-1 px-1 transition-colors text-left"
                  >
                    <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0', a.type === 'danger' ? 'bg-red-50' : 'bg-amber-50')}>
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
          </Card>
        );

      case 'recent_files':
        return (
          <Card title="Recent Files" action={() => navigate('/files')} actionLabel="All files" dragHandleProps={dragHandleProps} isFull={isFull} onToggleSize={onToggleSize}>
            {recentFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <FileText className="h-8 w-8 text-gray-200" />
                <span className="text-[12px] text-gray-400">No files yet</span>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentFiles.map((f) => {
                  const name = f.customer?.name ?? 'Unknown';
                  const cfg = STATUS_CFG[f.status] ?? STATUS_CFG.request;
                  return (
                    <button key={f.id} onClick={() => navigate(`/files/${f.id}`)}
                      className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                        style={{ background: avatarBg(name) }}>
                        {initials(name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-gray-900 truncate">{name}</div>
                        <div className="text-[11px] font-mono text-gray-400 mt-0.5">{f.file_no}</div>
                      </div>
                      <div className="hidden md:block text-[11px] text-gray-400 shrink-0">{fDate(f.file_date)}</div>
                      <span className={cn('text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0', cfg.text, cfg.bg)}>
                        {cfg.label}
                      </span>
                      <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        );

      case 'delivery':
        if (delayPieData.length === 0) return null;
        return (
          <Card title="Delivery Performance" action={() => navigate('/reports')} actionLabel="ETA Report" dragHandleProps={dragHandleProps} isFull={isFull} onToggleSize={onToggleSize}>
            <div className="px-5 py-4">
              <div className="flex items-center gap-6">
                <PieChart width={100} height={100}>
                  <Pie data={delayPieData} cx={45} cy={45} innerRadius={28} outerRadius={46}
                    dataKey="value" strokeWidth={2} stroke="#f9fafb" startAngle={90} endAngle={-270}>
                    {delayPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                </PieChart>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 flex-1">
                  {delayPieData.map(d => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                      <span className="text-[11px] text-gray-500 flex-1">{d.name}</span>
                      <span className="text-[13px] font-bold text-gray-900">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              {delayBarData.length > 0 && (
                <div className="mt-5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">Delay by File (days)</div>
                  <ResponsiveContainer width="100%" height={delayBarData.length * 28}>
                    <BarChart data={delayBarData} layout="vertical" barCategoryGap="25%" margin={{ left: 0, right: 16 }}>
                      <XAxis type="number" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}d`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} width={80} />
                      <Tooltip
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(v: any) => [`${v > 0 ? '+' : ''}${v} days`, 'vs ETA']}
                        contentStyle={{ fontSize: 11, borderRadius: 10, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}
                      />
                      <Bar dataKey="days" radius={[0, 4, 4, 0]}>
                        {delayBarData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </Card>
        );

      case 'latest_prices':
        return (
          <Card title="Latest Prices" action={() => navigate('/price-list')} actionLabel="Price List" dragHandleProps={dragHandleProps} isFull={isFull} onToggleSize={onToggleSize}>
            {latestPrices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Tag className="h-8 w-8 text-gray-200" />
                <span className="text-[12px] text-gray-400">No price entries yet</span>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {latestPrices.map(entry => {
                  const isExpired = entry.valid_until ? new Date(entry.valid_until) < new Date() : false;
                  const sym = ({ USD: '$', EUR: '€', TRY: '₺' } as Record<string,string>)[entry.currency] ?? '';
                  const priceNum = Number(entry.price);
                  const formatted = priceNum >= 1000
                    ? priceNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : priceNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
                  return (
                    <button key={entry.id} onClick={() => navigate('/price-list')}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: accent + '15' }}>
                        <Tag className="h-3.5 w-3.5" style={{ color: accent }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-gray-900 truncate">{entry.product?.name ?? '—'}</div>
                        <div className="text-[11px] text-gray-400 truncate mt-0.5">{entry.supplier?.name ?? '—'}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[13px] font-bold text-gray-900">{sym}{formatted} <span className="text-[10px] font-normal text-gray-400">{entry.currency}</span></div>
                        <div className="mt-0.5">
                          {entry.valid_until ? (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${isExpired ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                              {isExpired ? 'Expired' : `Until ${new Date(entry.valid_until + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-300">
                              {new Date(entry.price_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        );

      case 'revenue_chart':
        return (
          <Card title="Revenue & Cost · Last 6 Months" dragHandleProps={dragHandleProps} isFull={isFull} onToggleSize={onToggleSize}>
            <div className="px-5 py-5">
              {!hasChart ? (
                <div className="flex flex-col items-center justify-center h-36 gap-2">
                  <BarChart2 className="h-8 w-8 text-gray-200" />
                  <span className="text-[12px] text-gray-400">No data yet</span>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} barCategoryGap="40%" barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                        tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={40} />
                      <Tooltip
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(v: any, n: any) => [`$${Number(v).toLocaleString()}`, n === 'revenue' ? 'Revenue' : n === 'cost' ? 'Cost' : 'Profit']}
                        contentStyle={{ fontSize: 11, borderRadius: 10, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}
                      />
                      <Bar dataKey="revenue" fill={accent + '40'} radius={[4,4,0,0]} />
                      <Bar dataKey="cost"    fill="#f8717140" radius={[4,4,0,0]} />
                      <Bar dataKey="profit"  radius={[4,4,0,0]}>
                        {chartData.map((e, i) => <Cell key={i} fill={e.profit >= 0 ? '#4ade8066' : '#fb923c66'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex items-center justify-center gap-6 mt-3">
                    {([[accent + '40','Revenue'],['#f8717140','Cost'],['#4ade8066','Profit']] as [string,string][]).map(([c,l]) => (
                      <div key={l} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
                        <span className="text-[11px] text-gray-400">{l}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Card>
        );

      default: return null;
    }
  }

  return (
    <div className="-mx-4 md:mx-0 min-h-screen bg-gray-50 pb-28 md:pb-8">

      {/* Mobile greeting */}
      <div className="md:hidden px-4 py-4">
        <div className="text-[12px] text-gray-400 font-medium">{greeting}, {profile?.full_name?.split(' ')[0]} 👋</div>
      </div>

      <div className="px-3 md:px-6 space-y-3 md:space-y-4">

        {/* Desktop greeting */}
        <div className="hidden md:flex items-center justify-between bg-white rounded-2xl shadow-sm px-6 py-4">
          <div>
            <div className="text-[12px] text-gray-400 font-medium">{greeting} 👋</div>
            <div className="text-xl font-black text-gray-900 mt-0.5">{profile?.full_name ?? 'Dashboard'}</div>
          </div>
          <span className="text-[12px] text-gray-400">{fDate(new Date().toISOString().slice(0, 10))}</span>
        </div>

        {/* ── KPI Row — always fixed at top, not draggable ─────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <KpiCard label="Active Files" value={String(activeFiles)} sub={`${thisMonth} new this month`}
            icon={<Package className="h-5 w-5" />} accent={accent} />
          <KpiCard label="Total Profit" value={fUSD(totalProfit)} sub={`${byStatus.completed} completed`}
            trend={totalProfit >= 0 ? 'up' : 'down'} icon={<TrendingUp className="h-5 w-5" />} accent="#10b981" />
          <KpiCard label="Receivable" value={fUSD(summary?.totalReceivable ?? 0)} sub="From customers"
            icon={<DollarSign className="h-5 w-5" />} accent="#2563eb" />
          <KpiCard label="Payable" value={fUSD(summary?.totalPayable ?? 0)} sub="To suppliers"
            icon={<Wallet className="h-5 w-5" />} accent="#f59e0b" />
        </div>

        {/* Drag-and-drop sortable widget grid */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={widgetOrder} strategy={verticalListSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              {widgetOrder.map(id => (
                <SortableWidget key={id} id={id} isFull={widgetSizes[id] === 'full'}>
                  {(dragHandleProps) => {
                    const content = renderWidget(id, dragHandleProps);
                    return content ?? <></>;
                  }}
                </SortableWidget>
              ))}
            </div>
          </SortableContext>

          {/* Drag overlay — ghost card while dragging */}
          <DragOverlay>
            {activeId ? (
              <div className="bg-white rounded-2xl shadow-2xl border-2 border-gray-200 p-4 opacity-90 rotate-1">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-gray-400" />
                  <span className="text-[12px] font-bold text-gray-600 capitalize">{activeId.replace('_', ' ')}</span>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

      </div>
    </div>
  );
}
