import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import { canWrite } from '@/lib/permissions';
import { fUSD, fDate } from '@/lib/formatters';
import { LoadingSpinner } from '@/components/ui/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { usePriceList } from '@/hooks/useEntities';
import { saveDashboardPrefs } from '@/services/userService';
import { NewFileModal } from '@/components/trade-files/NewFileModal';
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  ChevronRight, FileText, BarChart2, Package, DollarSign, Wallet, Tag,
  GripVertical, Maximize2, Minimize2, Plus,
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
function formatMonthLabel(key: string, lang: string) {
  const [y, m] = key.split('-');
  const date = new Date(+y, +m - 1, 1);
  return new Intl.DateTimeFormat(lang, { month: 'short', year: '2-digit' }).format(date);
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

// ─── Transaction type labels ──────────────────────────────────────────────────
const TXN_TYPE_LABELS: Record<string, string> = {
  receipt: 'Tahsilat', payment: 'Ödeme', advance: 'Ön Ödeme',
  sale_inv: 'Satış Faturası', purchase_inv: 'Satın Alma',
  svc_inv: 'Hizmet Faturası', expense: 'Gider', ic_transfer: 'İç Transfer',
};

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, trend, icon, accent, onClick }: {
  label: string; value: string; sub?: string;
  trend?: 'up' | 'down'; icon: React.ReactNode; accent: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl px-4 py-4 md:px-5 md:py-4 shadow-sm border border-gray-100 overflow-hidden${onClick ? ' cursor-pointer hover:shadow-md hover:border-gray-200 active:scale-[0.98] transition-all' : ''}`}
    >
      {/* Mobile */}
      <div className="flex items-center gap-3 md:hidden">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: accent + '18' }}>
          <span style={{ color: accent }}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{label}</div>
          <div className="text-[15px] font-extrabold text-gray-900 leading-tight tabular-nums" style={{ fontFamily: 'Manrope, sans-serif' }}>{value}</div>
          {sub && (
            <div className="flex items-center gap-1 mt-0.5">
              {trend === 'up'   && <TrendingUp  className="h-2.5 w-2.5 text-green-500 shrink-0" />}
              {trend === 'down' && <TrendingDown className="h-2.5 w-2.5 text-red-500 shrink-0" />}
              <span className="text-[10px] text-gray-400 truncate">{sub}</span>
            </div>
          )}
        </div>
      </div>
      {/* Desktop */}
      <div className="hidden md:flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: accent + '15' }}>
          <span style={{ color: accent }}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</div>
          <div className="text-[22px] font-extrabold text-gray-900 leading-none">{value}</div>
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
    <div className={cn('bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[340px]', className)}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50 shrink-0">
        <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">{title}</span>
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

// ─── Price Carousel ───────────────────────────────────────────────────────────

const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', EUR: '€', TRY: '₺' };

const CARD_GRADIENTS = [
  'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)',
  'linear-gradient(135deg, #2e1065 0%, #6d28d9 100%)',
  'linear-gradient(135deg, #052e16 0%, #065f46 100%)',
  'linear-gradient(135deg, #4c0519 0%, #be123c 100%)',
  'linear-gradient(135deg, #172554 0%, #1d4ed8 100%)',
  'linear-gradient(135deg, #042f2e 0%, #0f766e 100%)',
];

function PriceCarousel({ prices, onNavigate }: { prices: import('@/types/database').PriceList[]; onNavigate: () => void }) {
  const [activeDot, setActiveDot] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const updateCards = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const viewCenter = el.scrollLeft + el.offsetWidth / 2;
    cardRefs.current.forEach((card) => {
      if (!card) return;
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(viewCenter - cardCenter);
      const progress = Math.min(dist / (card.offsetWidth * 0.65), 1);
      card.style.transform = `scale(${1 - progress * 0.1})`;
      card.style.opacity   = `${1 - progress * 0.5}`;
      card.style.filter    = progress > 0.15 ? `blur(${(progress * 2.5).toFixed(1)}px)` : '';
    });
    const idx = Math.round(el.scrollLeft / el.offsetWidth);
    setActiveDot(Math.max(0, Math.min(idx, prices.length - 1)));
  }, [prices.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateCards, { passive: true });
    setTimeout(updateCards, 60);
    return () => el.removeEventListener('scroll', updateCards);
  }, [updateCards]);

  if (prices.length === 0) return <p className="text-[13px] text-gray-400 px-1">Fiyat girişi yok</p>;

  // spacer = (viewport - cardWidth) / 2 → card is calc(100vw - 88px), spacer = 44px
  return (
    <>
      <div
        ref={scrollRef}
        className="flex overflow-x-auto scrollbar-none -mx-5"
        style={{
          scrollSnapType: 'x mandatory',
          paddingTop: 12,
          paddingBottom: 60,
          marginTop: -4,
          marginBottom: -50,
        } as React.CSSProperties}
      >
        <div className="shrink-0 w-11" />
        {prices.map((entry, i) => (
          <div
            key={entry.id}
            ref={el => { cardRefs.current[i] = el; }}
            className="shrink-0 rounded-[1.75rem] p-5 cursor-pointer"
            style={{
              width: 'calc(100vw - 88px)',
              marginRight: i < prices.length - 1 ? 12 : 0,
              scrollSnapAlign: 'center',
              background: CARD_GRADIENTS[i % CARD_GRADIENTS.length],
              boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
              transition: 'transform 0.25s ease, opacity 0.25s ease, filter 0.25s ease',
              willChange: 'transform, opacity, filter',
            } as React.CSSProperties}
            onClick={onNavigate}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full bg-white/20 text-white">
                {entry.currency}
              </span>
              <span className="text-[10px] font-semibold text-white/50">
                {entry.price_date ? new Date(entry.price_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
              </span>
            </div>
            <div
              className="text-[36px] font-black text-white leading-none mb-3 tracking-tight"
              style={{ fontFamily: 'Manrope, sans-serif' }}
            >
              {CURRENCY_SYMBOL[entry.currency] ?? ''}{Number(entry.price).toLocaleString('tr-TR')}
            </div>
            <div className="h-px bg-white/15 mb-3" />
            <div className="text-[13px] font-bold text-white leading-snug mb-1">{entry.product?.name ?? '—'}</div>
            <div className="text-[10px] text-white/45 truncate">{entry.supplier?.name ?? '—'}</div>
          </div>
        ))}
        <div className="shrink-0 w-11" />
      </div>
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { t, i18n }  = useTranslation('dashboard');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: files = [], isLoading: filesLoading } = useTradeFiles();
  const { data: summary, isLoading: summaryLoading } = useTransactionSummary();
  const { data: transactions = [] } = useTransactions();
  const { data: priceEntries = [] } = usePriceList();
  const { accent } = useTheme();
  const writable = canWrite(profile?.role);
  const [newFileOpen, setNewFileOpen] = useState(false);

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
      return { label: formatMonthLabel(key, i18n.language), revenue, cost, profit: revenue - cost };
    });
  }, [files, i18n.language]);

  const alerts = useMemo(() => {
    const list: { label: string; sub: string; href: string; type: 'danger' | 'warning' }[] = [];

    // ETA overdue
    files.filter(f => ['sale','delivery'].includes(f.status) && f.eta && isOverdueEta(f.eta)).slice(0,5)
      .forEach(f => list.push({ label: `${f.file_no} — ${t('alerts.etaOverdue')}`, sub: t('alerts.daysLate', { count: Math.abs(daysUntil(f.eta) ?? 0), customer: f.customer?.name ?? '' }), href: `/files/${f.id}`, type: 'danger' }));

    // ETA soon (≤7 days)
    files.filter(f => ['sale','delivery'].includes(f.status) && f.eta && !isOverdueEta(f.eta))
      .filter(f => { const d = daysUntil(f.eta); return d !== null && d <= 7 && d >= 0; }).slice(0,3)
      .forEach(f => list.push({ label: `${f.file_no} — ${t('alerts.etaSoon')}`, sub: t('alerts.daysToEta', { count: daysUntil(f.eta), customer: f.customer?.name ?? '' }), href: `/files/${f.id}`, type: 'warning' }));

    // Payment not received — ETA within 10 days
    // Build set of file IDs that have a fully paid receipt
    const paidFileIds = new Set(
      transactions
        .filter(tx => tx.transaction_type === 'receipt' && tx.payment_status === 'paid' && tx.trade_file_id)
        .map(tx => tx.trade_file_id as string)
    );
    files
      .filter(f => ['sale','delivery'].includes(f.status) && f.eta && !isOverdueEta(f.eta))
      .filter(f => { const d = daysUntil(f.eta); return d !== null && d <= 10 && d >= 0; })
      .filter(f => !paidFileIds.has(f.id))
      .slice(0, 5)
      .forEach(f => {
        const d = daysUntil(f.eta) ?? 0;
        list.push({
          label: `${f.file_no} — ${t('alerts.paymentPending')}`,
          sub: t('alerts.daysToEtaPayment', { count: d, customer: f.customer?.name ?? '' }),
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
      { name: t('delivery.onTime'),      value: counts.ontime,  color: '#4ade80' },
      { name: t('delivery.lateDelivery'),value: counts.late,    color: '#f87171' },
      { name: t('delivery.overdue'),     value: counts.overdue, color: '#dc2626' },
      { name: t('delivery.pending'),     value: counts.pending, color: '#93c5fd' },
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

  // En güncel fiyatlar (price_date DESC)
  const latestPrices = useMemo(() =>
    [...priceEntries].sort((a, b) => b.price_date.localeCompare(a.price_date)),
  [priceEntries]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return t('greeting.morning');
    if (h < 18) return t('greeting.afternoon');
    return t('greeting.evening');
  }, [t]);

  const recentTxns = useMemo(() =>
    [...transactions].sort((a, b) =>
      new Date(b.transaction_date ?? '').getTime() - new Date(a.transaction_date ?? '').getTime()
    ).slice(0, 3),
  [transactions]);

  const isFirstLoad = (filesLoading && files.length === 0) || (summaryLoading && !summary);
  if (isFirstLoad) return <LoadingSpinner />;

  // ── Widget renderer ───────────────────────────────────────────────────────
  function renderWidget(id: string, dragHandleProps: React.HTMLAttributes<HTMLElement>) {
    const isFull = widgetSizes[id] === 'full';
    const onToggleSize = () => toggleSize(id);

    switch (id) {

      case 'pipeline':
        return (
          <Card title={t('widgets.pipeline')} action={() => navigate('/pipeline')} actionLabel={t('actions.seeAll')} dragHandleProps={dragHandleProps} isFull={isFull} onToggleSize={onToggleSize}>
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
                    <span className="text-[13px] text-gray-700 flex-1 text-left">{tc('status.' + key)}</span>
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
          <Card title={`${t('widgets.alerts')}${alerts.length > 0 ? ` · ${alerts.length}` : ''}`} dragHandleProps={dragHandleProps} isFull={isFull} onToggleSize={onToggleSize}>
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <CheckCircle2 className="h-8 w-8 text-green-400" />
                <span className="text-[12px] text-gray-400">{t('empty.allClear')}</span>
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
          <Card title={t('widgets.recentFiles')} action={() => navigate('/files')} actionLabel={t('actions.allFiles')} dragHandleProps={dragHandleProps} isFull={isFull} onToggleSize={onToggleSize}>
            {recentFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <FileText className="h-8 w-8 text-gray-200" />
                <span className="text-[12px] text-gray-400">{t('empty.noFiles')}</span>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentFiles.map((f) => {
                  const name = f.customer?.name ?? tc('unknown');
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
                        {tc('status.' + f.status)}
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
          <Card title={t('widgets.delivery')} action={() => navigate('/reports')} actionLabel={t('actions.etaReport')} dragHandleProps={dragHandleProps} isFull={isFull} onToggleSize={onToggleSize}>
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
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">{t('widgets.delayByFile')}</div>
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
          <Card title={t('widgets.latestPrices')} action={() => navigate('/price-list')} actionLabel={t('actions.priceList')} dragHandleProps={dragHandleProps} isFull={isFull} onToggleSize={onToggleSize}>
            {latestPrices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Tag className="h-8 w-8 text-gray-200" />
                <span className="text-[12px] text-gray-400">{t('empty.noPrices')}</span>
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
                              {isExpired ? t('prices.expired') : t('prices.until', { date: new Date(entry.valid_until + 'T00:00:00').toLocaleDateString(i18n.language, { day: '2-digit', month: 'short' }) })}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-300">
                              {new Date(entry.price_date + 'T00:00:00').toLocaleDateString(i18n.language, { day: '2-digit', month: 'short', year: '2-digit' })}
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
          <Card title={t('widgets.revenueChart')} dragHandleProps={dragHandleProps} isFull={isFull} onToggleSize={onToggleSize}>
            <div className="px-5 py-5">
              {!hasChart ? (
                <div className="flex flex-col items-center justify-center h-36 gap-2">
                  <BarChart2 className="h-8 w-8 text-gray-200" />
                  <span className="text-[12px] text-gray-400">{t('empty.noChartData')}</span>
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
                        formatter={(v: any, n: any) => [`$${Number(v).toLocaleString()}`, n === 'revenue' ? t('chart.revenue') : n === 'cost' ? t('chart.cost') : t('chart.profit')]}
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
                    {([[accent + '40', t('chart.revenue')],['#f8717140', t('chart.cost')],['#4ade8066', t('chart.profit')]] as [string,string][]).map(([c,l]) => (
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
    <div className="-mx-4 md:mx-0 min-h-screen pb-28 md:pb-8">

      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE — Kinetic Precision Design
      ════════════════════════════════════════════════════════════════════ */}
      <div className="md:hidden min-h-screen" style={{ background: '#f7f9fc' }}>

        {/* ── Top Header: Selamlama + Yeni Dosya ──────────────────────────── */}
        <div className="px-5 pt-6 pb-2 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: '#525a64' }}>
              {greeting}
            </div>
            <div
              className="text-[22px] font-extrabold text-gray-900 leading-tight tracking-tight"
              style={{ fontFamily: 'Manrope, sans-serif' }}
            >{profile?.full_name?.split(' ')[0] ?? 'Dashboard'}</div>
          </div>
          {writable && (
            <button
              onClick={() => setNewFileOpen(true)}
              className="flex items-center gap-2 px-5 py-3 rounded-full text-white text-[13px] font-bold shadow-lg active:scale-95 transition-transform"
              style={{
                background: 'linear-gradient(135deg, #b70011 0%, #dc2626 100%)',
                boxShadow: '0 8px 24px rgba(183,0,17,0.3)',
              }}
            >
              <Plus className="h-4 w-4" />
              Yeni Dosya
            </button>
          )}
        </div>

        {/* KPI Bento Cards */}
        <div className="px-5 pt-4">

          {/* Card 1 — Son Fiyatlar (Snap Carousel) */}
          <div className="mb-0">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(183,0,17,0.08)' }}>
                  <Tag className="h-3 w-3" style={{ color: '#b70011' }} />
                </div>
                <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#525a64' }}>Son Fiyatlar</p>
              </div>
              <button onClick={() => navigate('/price-list')} className="text-[11px] font-bold flex items-center gap-0.5" style={{ color: '#b70011' }}>
                Tümü <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            <PriceCarousel prices={latestPrices.slice(0, 6)} onNavigate={() => navigate('/price-list')} />
          </div>

          {/* Card 2 — Son Uyarılar */}
          <div
            className="relative z-10 rounded-[1.75rem] overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
            style={{ boxShadow: '0 4px 20px rgba(25,28,30,0.07)', marginTop: -24 }}
            onClick={() => navigate('/pipeline')}
          >
            <div className="h-1" style={{ background: alerts.length > 0 ? 'linear-gradient(90deg, #dc2626, #ef4444)' : 'linear-gradient(90deg, #16a34a, #22c55e)' }} />
            <div className="bg-white px-5 pt-4 pb-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={cn('w-7 h-7 rounded-xl flex items-center justify-center', alerts.length > 0 ? 'bg-red-50' : 'bg-green-50')}>
                    <AlertTriangle className={cn('h-3.5 w-3.5', alerts.length > 0 ? 'text-red-500' : 'text-green-600')} />
                  </div>
                  <p className="text-[12px] font-bold uppercase tracking-widest" style={{ color: '#525a64' }}>
                    Uyarılar
                  </p>
                  {alerts.length > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-extrabold text-white" style={{ background: '#dc2626' }}>{alerts.length}</span>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-gray-200" />
              </div>
              {alerts.length === 0 ? (
                <div className="flex items-center gap-2.5">
                  <span className="text-[14px] font-semibold text-green-600">Aktif uyarı yok</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.slice(0, 2).map((a, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0', a.type === 'danger' ? 'bg-red-50' : 'bg-amber-50')}>
                        <AlertTriangle className={cn('h-4 w-4', a.type === 'danger' ? 'text-red-500' : 'text-amber-500')} />
                      </div>
                      <div className="min-w-0 pt-0.5">
                        <div className="text-[13px] font-semibold text-gray-900 leading-snug truncate">{a.label}</div>
                        <div className="text-[11px] text-gray-400 truncate mt-0.5">{a.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Card 3 — Dosya Özeti (gradient) */}
          <div
            className="mt-5 rounded-[1.75rem] p-5 cursor-pointer active:scale-[0.98] transition-transform"
            style={{
              background: 'linear-gradient(135deg, #b70011 0%, #dc2626 100%)',
              boxShadow: '0 16px 40px rgba(183,0,17,0.22)',
            }}
            onClick={() => navigate('/pipeline')}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center">
                  <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-[12px] font-bold uppercase tracking-widest text-white/80">Dosya Durumu</p>
              </div>
              <ChevronRight className="h-4 w-4 text-white/40" />
            </div>
            {(() => {
              const STATUS_DONUT = [
                { key: 'request'   as const, label: 'Talep',      color: '#fde047' },
                { key: 'sale'      as const, label: 'Satış',      color: '#38bdf8' },
                { key: 'delivery'  as const, label: 'Teslimat',   color: '#fb923c' },
                { key: 'completed' as const, label: 'Tamamlandı', color: '#4ade80' },
              ];
              const pieData = STATUS_DONUT.map(s => ({ ...s, value: byStatus[s.key] }));
              const total = pieData.reduce((sum, d) => sum + d.value, 0);
              const hasAny = total > 0;
              return (
                <div className="flex items-center gap-4">
                  {/* Donut */}
                  <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
                    <PieChart width={120} height={120}>
                      <Pie
                        data={hasAny ? pieData : [{ value: 1, color: 'rgba(255,255,255,0.15)' }]}
                        cx={55}
                        cy={55}
                        innerRadius={36}
                        outerRadius={52}
                        paddingAngle={hasAny ? 3 : 0}
                        dataKey="value"
                        stroke="none"
                        startAngle={90}
                        endAngle={-270}
                      >
                        {(hasAny ? pieData : [{ color: 'rgba(255,255,255,0.15)' }]).map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                    {/* Center label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[22px] font-black text-white leading-none" style={{ fontFamily: 'Manrope, sans-serif' }}>{total}</span>
                      <span className="text-[8px] font-bold text-white/50 uppercase tracking-wider mt-0.5">Dosya</span>
                    </div>
                  </div>
                  {/* Legend */}
                  <div className="flex-1 space-y-2.5">
                    {STATUS_DONUT.map(({ key, label, color }) => (
                      <div key={key} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                          <span className="text-[11px] font-semibold text-white/70">{label}</span>
                        </div>
                        <span className="text-[13px] font-black text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>{byStatus[key]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* ── Son Fiyat Listesi Widget ─────────────────────────────────────── */}
        {latestPrices.length > 0 && (
          <div className="px-5 pt-8 pb-2">
            <div className="flex items-center justify-between mb-3">
              <h2
                className="text-[1.4rem] font-extrabold tracking-tight text-gray-900"
                style={{ fontFamily: 'Manrope, sans-serif' }}
              >Son Fiyat Listesi</h2>
              <div className="flex items-center gap-2">
                {writable && (
                  <button
                    onClick={() => navigate('/price-list')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-white text-[11px] font-bold active:scale-95 transition-transform"
                    style={{ background: 'linear-gradient(135deg, #b70011 0%, #dc2626 100%)' }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Yeni
                  </button>
                )}
                <button onClick={() => navigate('/price-list')} className="text-[12px] font-bold flex items-center gap-1" style={{ color: '#b70011' }}>
                  Tümü <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="bg-white rounded-[1.5rem] overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(25,28,30,0.05)' }}>
              {latestPrices.slice(0, 5).map((entry, i) => (
                <div
                  key={entry.id}
                  className={cn('flex items-center gap-3 px-4 py-3', i < Math.min(latestPrices.length, 5) - 1 && 'border-b border-gray-50')}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-gray-900 truncate">{entry.product?.name ?? '—'}</div>
                    <div className="text-[11px] text-gray-400 truncate">{entry.supplier?.name ?? '—'}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[14px] font-black text-gray-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                      {entry.currency} {Number(entry.price).toLocaleString('tr-TR')}
                    </div>
                    <div className="text-[10px] text-gray-400">{entry.price_date ? new Date(entry.price_date).toLocaleDateString('tr-TR') : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Transactions Section */}
        <div className="px-5 pt-8 pb-6">
          <div className="flex items-center justify-between mb-3">
            <h2
              className="text-[1.4rem] font-extrabold tracking-tight text-gray-900"
              style={{ fontFamily: 'Manrope, sans-serif' }}
            >Son İşlemler</h2>
            <div className="flex items-center gap-2">
              {writable && (
                <button
                  onClick={() => navigate('/accounting')}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-white text-[11px] font-bold active:scale-95 transition-transform"
                  style={{ background: 'linear-gradient(135deg, #b70011 0%, #dc2626 100%)' }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Yeni
                </button>
              )}
              <button onClick={() => navigate('/accounting')} className="text-[12px] font-bold flex items-center gap-1" style={{ color: '#b70011' }}>
                Tümü <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {recentTxns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <DollarSign className="h-8 w-8 mb-2 opacity-20" />
              <p className="text-[13px] font-semibold text-gray-500">İşlem bulunamadı</p>
            </div>
          ) : (
            <div className="bg-white rounded-[1.5rem] overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(25,28,30,0.05)' }}>
              {recentTxns.map((tx, i) => {
                const partyName = tx.customer?.name ?? tx.supplier?.name ?? tx.service_provider?.name ?? tx.party_name ?? '—';
                const typeLabel = TXN_TYPE_LABELS[tx.transaction_type] ?? tx.transaction_type;
                const status    = tx.payment_status;
                const statusCfg = status === 'paid'
                  ? { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Ödendi'  }
                  : status === 'partial'
                    ? { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Kısmi'   }
                    : { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Bekliyor' };
                const bg = avatarBg(partyName);
                const ini = initials(partyName);
                return (
                  <div
                    key={tx.id}
                    className={cn('flex items-center gap-3 px-4 py-3', i < recentTxns.length - 1 && 'border-b border-gray-50')}
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                      style={{ background: bg }}
                    >{ini}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-gray-900 truncate">{partyName}</div>
                      <span className="text-[10px] font-semibold text-gray-500">{typeLabel}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[13px] font-black text-gray-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{fUSD(tx.amount_usd ?? tx.amount)}</div>
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', statusCfg.bg, statusCfg.text)}>{statusCfg.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Pipeline Widget ──────────────────────────────────────────────── */}
        <div className="px-5 pb-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[1.4rem] font-extrabold tracking-tight text-gray-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Pipeline
            </h2>
            <button onClick={() => navigate('/pipeline')} className="text-[12px] font-bold flex items-center gap-1" style={{ color: '#b70011' }}>
              Tümü <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="bg-white rounded-[1.5rem] p-5 space-y-1" style={{ boxShadow: '0 2px 12px rgba(25,28,30,0.05)' }}>
            {(['request','sale','delivery','completed','cancelled'] as const).map((key) => {
              const cfg = STATUS_CFG[key];
              const count = byStatus[key];
              const pct = files.length > 0 ? (count / files.length) * 100 : 0;
              return (
                <button key={key} onClick={() => navigate('/pipeline')}
                  className="w-full flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 active:bg-gray-50 rounded-xl transition-colors"
                >
                  <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
                  <span className="text-[13px] text-gray-700 flex-1 text-left font-medium">{cfg.label}</span>
                  <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', cfg.dot)} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={cn('text-[13px] font-bold w-5 text-right shrink-0', cfg.text)}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Alerts Widget ────────────────────────────────────────────────── */}
        {alerts.length > 0 && (
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[1.4rem] font-extrabold tracking-tight text-gray-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Uyarılar
                <span className="ml-2 text-[13px] font-bold px-2 py-0.5 rounded-full text-white align-middle" style={{ background: '#dc2626' }}>{alerts.length}</span>
              </h2>
            </div>
            <div className="space-y-3">
              {alerts.slice(0, 4).map((a, i) => (
                <button key={i} onClick={() => navigate(a.href)}
                  className="w-full flex items-center gap-3 bg-white rounded-2xl p-4 text-left active:scale-[0.98] transition-transform"
                  style={{ boxShadow: '0 2px 12px rgba(25,28,30,0.05)' }}
                >
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', a.type === 'danger' ? 'bg-red-50' : 'bg-amber-50')}>
                    <AlertTriangle className={cn('h-4 w-4', a.type === 'danger' ? 'text-red-500' : 'text-amber-500')} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-gray-900 truncate">{a.label}</div>
                    <div className="text-[11px] text-gray-400 truncate mt-0.5">{a.sub}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Son Dosyalar Widget ───────────────────────────────────────────── */}
        <div className="px-5 pb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[1.4rem] font-extrabold tracking-tight text-gray-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Son Dosyalar
            </h2>
            <button onClick={() => navigate('/files')} className="text-[12px] font-bold flex items-center gap-1" style={{ color: '#b70011' }}>
              Tümü <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="bg-white rounded-[1.5rem] overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(25,28,30,0.05)' }}>
            {recentFiles.slice(0, 5).map((f) => {
              const name = f.customer?.name ?? '—';
              const cfg = STATUS_CFG[f.status] ?? STATUS_CFG.request;
              return (
                <button key={f.id} onClick={() => navigate(`/files/${f.id}`)}
                  className="w-full flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0 active:bg-gray-50 transition-colors text-left"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                    style={{ background: avatarBg(name) }}
                  >{initials(name)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-gray-900 truncate">{name}</div>
                    <div className="text-[11px] font-mono mt-0.5" style={{ color: '#5c403c' }}>{f.file_no}</div>
                  </div>
                  <span className={cn('text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0', cfg.text, cfg.bg)}>
                    {cfg.label}
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DESKTOP — Existing layout (unchanged)
      ════════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:block bg-gray-50 min-h-screen pb-8">
        <div className="px-6 space-y-4">

          {/* Desktop greeting */}
          <div className="flex items-center justify-between bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden px-6 py-4">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">{greeting}</div>
              <div className="text-[22px] font-extrabold text-gray-900 leading-tight">{profile?.full_name ?? 'Dashboard'}</div>
            </div>
            <div className="flex items-center gap-4">
              {writable && (
                <button
                  onClick={() => setNewFileOpen(true)}
                  className="flex items-center gap-2 h-9 px-4 rounded-xl text-white text-[13px] font-semibold shadow-sm hover:opacity-90 transition-opacity"
                  style={{ background: accent }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Yeni Dosya
                </button>
              )}
              <span className="text-[11px] text-gray-400">{fDate(new Date().toISOString().slice(0, 10))}</span>
            </div>
          </div>

          {/* KPI Row */}
          <div className="grid grid-cols-4 gap-4">
            <KpiCard label={t('kpi.activeFiles')} value={String(activeFiles)} sub={t('kpi.newThisMonth', { count: thisMonth })}
              icon={<Package className="h-5 w-5" />} accent={accent}
              onClick={() => navigate('/pipeline')} />
            <KpiCard label={t('kpi.totalProfit')} value={fUSD(totalProfit)} sub={t('kpi.completed', { count: byStatus.completed })}
              trend={totalProfit >= 0 ? 'up' : 'down'} icon={<TrendingUp className="h-5 w-5" />} accent="#10b981"
              onClick={() => navigate('/fin-reports')} />
            <KpiCard label={t('kpi.receivable')} value={fUSD(summary?.totalReceivable ?? 0)} sub={t('kpi.fromCustomers')}
              icon={<DollarSign className="h-5 w-5" />} accent="#2563eb"
              onClick={() => navigate('/accounting', { state: { tab: 'sale' } })} />
            <KpiCard label={t('kpi.payable')} value={fUSD(summary?.totalPayable ?? 0)} sub={t('kpi.toSuppliers')}
              icon={<Wallet className="h-5 w-5" />} accent="#f59e0b"
              onClick={() => navigate('/accounting', { state: { tab: 'buy' } })} />
          </div>

          {/* Drag-and-drop sortable widget grid */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={widgetOrder} strategy={verticalListSortingStrategy}>
              <div className="grid grid-cols-2 gap-4">
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

      {/* Modals */}
      <NewFileModal open={newFileOpen} onOpenChange={setNewFileOpen} />
    </div>
  );
}
