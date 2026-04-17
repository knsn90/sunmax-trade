import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useHeaderAction } from '@/contexts/HeaderContext';
import { useNavigate } from 'react-router-dom';
import { useTradeFiles, useDeleteTradeFile } from '@/hooks/useTradeFiles';
import { useAuth } from '@/hooks/useAuth';
import { canWrite } from '@/lib/permissions';
import { PnlModal } from '@/components/pipeline/PnlModal';
import { NewFileModal } from '@/components/trade-files/NewFileModal';
import { ToSaleModal } from '@/components/trade-files/ToSaleModal';
import { DeliveryModal } from '@/components/trade-files/DeliveryModal';
import { InvoiceModal } from '@/components/documents/InvoiceModal';
import { ProformaModal } from '@/components/documents/ProformaModal';
import { PackingListModal } from '@/components/documents/PackingListModal';
// LoadingSpinner kaldırıldı — inline spinner kullanılıyor
import { cn } from '@/lib/utils';
import { fN, fDate } from '@/lib/formatters';
import {
  Search, Plus, TrendingUp, Truck, FileText, BarChart2,
  AlertTriangle, ChevronRight, X,
} from 'lucide-react';
import type { TradeFile } from '@/types/database';
import { useTheme } from '@/contexts/ThemeContext';

// ─── Status config ────────────────────────────────────────────────────────────
type FilterKey = 'all' | 'request' | 'sale' | 'delivery';

const STATUS_META: Record<string, {
  bg: string; text: string; dot: string;
  bar: string; border: string; pill: string;
}> = {
  request:  { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400',  bar: '#f59e0b', border: '#fbbf24', pill: 'bg-amber-50 text-amber-700' },
  sale:     { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-400',   bar: '#3b82f6', border: '#60a5fa', pill: 'bg-blue-50 text-blue-700' },
  delivery: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-400', bar: '#8b5cf6', border: '#a78bfa', pill: 'bg-violet-50 text-violet-700' },
  completed:{ bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-400',  bar: '#22c55e', border: '#86efac', pill: 'bg-green-50 text-green-700' },
};

const AVATAR_COLORS = [
  '#dc2626','#2563eb','#7c3aed','#059669','#d97706','#db2777','#0891b2',
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

const PAGE_SIZE = 15;

// ─── Progress helpers ─────────────────────────────────────────────────────────
function getProgress(f: TradeFile): number {
  if (f.status === 'completed') return 100;
  if (f.status === 'cancelled') return 0;
  if (f.status === 'delivery') {
    if (f.delivered_admt && f.tonnage_mt) {
      const ratio = Math.min(f.delivered_admt / f.tonnage_mt, 1);
      return Math.round(50 + ratio * 25);
    }
    return 55;
  }
  if (f.status === 'sale') return 33;
  return 12;
}

function getProgressColor(status: string): string {
  return STATUS_META[status]?.bar ?? '#f59e0b';
}

// Dairesel ilerleme — desktop kanban için
function CircleProgress({ pct, color, size = 52 }: { pct: number; color: string; size?: number }) {
  const stroke = size * 0.115;
  const r      = (size - stroke) / 2;
  const circ   = 2 * Math.PI * r;
  const dash   = (pct / 100) * circ;
  const cx     = size / 2;
  const gradId = `cpg-${color.replace('#', '')}-${size}`;
  const fontSize = size <= 44 ? 9 : size <= 52 ? 11 : 12;
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full bg-white" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }} />
      <svg width={size} height={size} className="absolute inset-0">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#f0f2f5" strokeWidth={stroke} />
        {pct > 0 && (
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={`url(#${gradId})`} strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cx})`} style={{ transition: 'stroke-dasharray 0.5s ease' }} />
        )}
      </svg>
      <span className="relative font-black leading-none" style={{ fontSize, color }}>{pct}%</span>
    </div>
  );
}

// ─── Delay helpers ────────────────────────────────────────────────────────────
function getDelayStatus(file: TradeFile): 'overdue' | 'delayed' | null {
  if (['completed', 'cancelled'].includes(file.status)) return null;
  if (!file.eta) return null;
  const etaMs = new Date(file.eta + 'T00:00:00').getTime();
  const todayMs = new Date(new Date().toDateString()).getTime();
  const isOverdue = etaMs < todayMs && !file.arrival_date;
  if (isOverdue) return 'overdue';
  if (file.revised_eta) return 'delayed';
  return null;
}

// ─── Mobile Card ─────────────────────────────────────────────────────────────
function PipelineCard({ file, onClick }: { file: TradeFile; onClick: () => void }) {
  const { t } = useTranslation('pipeline');
  const { t: tc } = useTranslation('common');
  const custName = file.customer?.name ?? t('unknown');
  const meta     = STATUS_META[file.status] ?? STATUS_META.request;
  const delay    = getDelayStatus(file);
  const pct      = getProgress(file);
  const color    = getProgressColor(file.status);

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
      style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
      onClick={onClick}
    >
      {/* Left accent bar + content */}
      <div className="flex items-stretch">
        {/* Status color bar */}
        <div className="w-[3px] shrink-0 rounded-l-2xl" style={{ background: meta.border }} />

        {/* Main content */}
        <div className="flex-1 px-4 pt-3.5 pb-3">

          {/* Top row: avatar + name + chevron */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[13px] font-bold shrink-0"
              style={{ background: avatarColor(custName) }}
            >
              {initials(custName)}
            </div>

            <div className="flex-1 min-w-0">
              <div
                className="text-[15px] font-extrabold text-gray-900 truncate leading-tight"
                style={{ fontFamily: 'Manrope, sans-serif' }}
              >
                {custName}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] font-mono text-gray-400">{file.file_no}</span>
                {file.product?.name && (
                  <span className="text-[10px] text-gray-300">·</span>
                )}
                {file.product?.name && (
                  <span className="text-[10px] text-gray-400 truncate">{file.product.name}</span>
                )}
              </div>
            </div>

            <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
          </div>

          {/* Middle row: status badge + tonnage + delay alert */}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold', meta.pill)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
              {tc(`status.${file.status}` as `status.${string}`)}
            </span>
            {file.tonnage_mt > 0 && (
              <span className="text-[11px] font-semibold text-gray-500">{fN(file.tonnage_mt, 0)} MT</span>
            )}
            {file.eta && (
              <span className={cn(
                'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                delay === 'overdue' ? 'bg-red-50 text-red-500' :
                delay === 'delayed' ? 'bg-amber-50 text-amber-600' :
                'bg-gray-100 text-gray-500'
              )}>
                ETA {fDate((file as TradeFile & { revised_eta?: string }).revised_eta ?? file.eta)}
              </span>
            )}
            {delay && (
              <span className={cn(
                'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full',
                delay === 'overdue' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'
              )}>
                <AlertTriangle className="h-2.5 w-2.5" />
                {delay === 'overdue' ? t('flags.etaOverdue') : t('flags.delayed')}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">İlerleme</span>
              <span className="text-[10px] font-bold" style={{ color }}>{pct}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}aa, ${color})` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────
function KpiStrip({ files }: { files: TradeFile[] }) {
  const { t: tc } = useTranslation('common');
  const stats = [
    { key: 'request',  color: '#f59e0b', bg: '#fffbeb', label: tc('status.request') },
    { key: 'sale',     color: '#3b82f6', bg: '#eff6ff', label: tc('status.sale') },
    { key: 'delivery', color: '#8b5cf6', bg: '#f5f3ff', label: tc('status.delivery') },
    { key: 'completed',color: '#22c55e', bg: '#f0fdf4', label: tc('status.completed') },
  ] as const;

  return (
    <div className="flex gap-2.5 px-4 pb-3 overflow-x-auto scrollbar-none">
      {stats.map(s => {
        const count = files.filter(f => f.status === s.key).length;
        return (
          <div
            key={s.key}
            className="flex-none flex flex-col items-center justify-center rounded-2xl px-4 py-2.5 min-w-[72px]"
            style={{ background: s.bg }}
          >
            <span
              className="text-[22px] font-black leading-tight"
              style={{ color: s.color, fontFamily: 'Manrope, sans-serif' }}
            >
              {count}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-widest mt-0.5" style={{ color: s.color + 'bb' }}>
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function PipelinePage() {
  const { t } = useTranslation('pipeline');
  const { t: tc } = useTranslation('common');
  const navigate  = useNavigate();
  const { profile } = useAuth();
  const { data: files = [], isLoading } = useTradeFiles();
  const deleteFile = useDeleteTradeFile();
  const writable   = canWrite(profile?.role);
  const { accent } = useTheme();

  const STATUS_FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all',      label: tc('all') },
    { key: 'request',  label: tc('status.request') },
    { key: 'sale',     label: tc('status.sale') },
    { key: 'delivery', label: tc('status.delivery') },
  ];

  const STAGES = [
    { key: 'request' as const,  label: t('kanban.request'),  dot: 'bg-amber-400',  text: 'text-amber-700' },
    { key: 'sale' as const,     label: t('kanban.sale'),     dot: 'bg-blue-400',   text: 'text-blue-700'  },
    { key: 'delivery' as const, label: t('kanban.delivery'), dot: 'bg-violet-400', text: 'text-violet-700'},
  ];

  const [newFileOpen, setNewFileOpen] = useState(false);
  const { setAction } = useHeaderAction();

  useEffect(() => {
    if (!writable) return;
    setAction(
      <button
        onClick={() => setNewFileOpen(true)}
        className="w-8 h-8 rounded-full flex items-center justify-center text-white shadow"
        style={{ background: accent }}
      >
        <Plus className="h-4 w-4" />
      </button>
    );
    return () => setAction(null);
  }, [writable, accent, setAction]);

  const [saleFile,     setSaleFile]     = useState<TradeFile | null>(null);
  const [deliveryFile, setDeliveryFile] = useState<TradeFile | null>(null);
  const [invoiceFile,  setInvoiceFile]  = useState<TradeFile | null>(null);
  const [proformaFile, setProformaFile] = useState<TradeFile | null>(null);
  const [packingFile,  setPackingFile]  = useState<TradeFile | null>(null);
  const [pnlFileId,    setPnlFileId]    = useState<string | null>(null);

  const [filter,      setFilter]      = useState<FilterKey>('all');
  const [search,      setSearch]      = useState('');
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [page,        setPage]        = useState(1);

  const findFile = (id: string) => files.find((x) => x.id === id) ?? null;
  function handleDelete(id: string) {
    if (window.confirm(t('confirm.deleteFile'))) deleteFile.mutate(id);
  }

  const filtered = useMemo(() => {
    let list = files;
    if (filter !== 'all') list = list.filter(f => f.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f =>
        f.file_no?.toLowerCase().includes(q) ||
        f.customer?.name?.toLowerCase().includes(q) ||
        f.product?.name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [files, filter, search]);

  const totalPages   = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage  = Math.min(page, totalPages);
  const paged        = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // isLoading guard kaldırıldı — sayfa hemen render edilir, içerik yüklenince görünür

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════
          MOBILE  (< md) — Kinetic Precision
      ══════════════════════════════════════════════════════════════ */}
      <div className="md:hidden flex flex-col min-h-screen -mx-4 pb-28" style={{ background: '#f7f9fc' }}>

        {/* ── KPI Strip ───────────────────────────────────────────── */}
        <div className="pt-4">
          <KpiStrip files={files} />
        </div>

        {/* ── Search ──────────────────────────────────────────────── */}
        <div className="px-4 pb-3">
          {searchOpen ? (
            <div
              className="flex items-center gap-2 bg-white rounded-2xl px-4 h-11"
              style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
            >
              <Search className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                autoFocus
                className="flex-1 text-[13px] outline-none bg-transparent placeholder:text-gray-400"
                placeholder={t('filters.search')}
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
              <button
                className="shrink-0 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center"
                onClick={() => { setSearchOpen(false); setSearch(''); }}
              >
                <X className="h-3 w-3 text-gray-500" />
              </button>
            </div>
          ) : (
            <button
              className="w-full h-11 rounded-2xl flex items-center justify-center gap-2 text-[13px] font-semibold text-gray-500 bg-white active:bg-gray-50 transition-colors"
              style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-4 w-4 text-gray-400" />
              {tc('btn.search')}
            </button>
          )}
        </div>

        {/* ── Filter Segment ──────────────────────────────────────── */}
        <div className="px-4 pb-4">
          <div className="flex gap-1 bg-white/70 p-1 rounded-2xl overflow-x-auto scrollbar-none"
            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            {STATUS_FILTERS.map(s => {
              const count = s.key === 'all'
                ? files.length
                : files.filter(f => f.status === s.key).length;
              const active = filter === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => { setFilter(s.key); setPage(1); }}
                  className={cn(
                    'shrink-0 flex-1 flex items-center justify-center gap-1 h-8 rounded-xl text-[11px] font-bold transition-all whitespace-nowrap px-2',
                    active
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-400 hover:text-gray-600',
                  )}
                >
                  {s.label}
                  {count > 0 && (
                    <span className={cn('text-[10px]', active ? 'text-gray-400' : 'text-gray-300')}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Section label ─────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 mb-2">
          <span
            className="text-[10px] font-extrabold uppercase tracking-widest"
            style={{ color: '#b70011' }}
          >
            {filter === 'all' ? t('kanban.allFiles') : tc(`status.${filter}` as `status.${string}`)}
          </span>
          <span className="text-[11px] font-semibold text-gray-400">{filtered.length}</span>
        </div>

        {/* ── Cards ────────────────────────────────────────────────── */}
        <div className="flex-1 px-4 space-y-2.5">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="w-5 h-5 border-2 border-gray-200 border-t-red-500 rounded-full animate-spin" />
            </div>
          ) : paged.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center mb-3"
                style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <Search className="h-6 w-6 opacity-30" />
              </div>
              <p className="text-[13px] font-semibold text-gray-500">{t('empty.noRecords')}</p>
            </div>
          ) : (
            paged.map(f => (
              <PipelineCard key={f.id} file={f} onClick={() => navigate(`/files/${f.id}`)} />
            ))
          )}
        </div>

        {/* ── Pagination ────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1.5 py-5">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={cn(
                  'w-8 h-8 rounded-full text-[11px] font-bold transition-all',
                  p === currentPage ? 'text-white shadow-sm' : 'bg-white text-gray-400',
                )}
                style={p === currentPage ? { background: 'linear-gradient(135deg, #b70011, #dc2626)' } : {}}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          DESKTOP  (≥ md) — Kanban
      ══════════════════════════════════════════════════════════════ */}
      <div className="hidden md:block">

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center gap-2 bg-white rounded-xl px-3 h-9 shadow-sm border border-gray-100 flex-1 max-w-xs">
            <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <input
              className="flex-1 text-[13px] outline-none bg-transparent placeholder:text-gray-400"
              placeholder={t('filters.search')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Desktop KPI pills */}
          <div className="flex gap-2 flex-1">
            {([
              { key: 'request',  label: tc('status.request'),  color: '#f59e0b', bg: '#fffbeb' },
              { key: 'sale',     label: tc('status.sale'),     color: '#3b82f6', bg: '#eff6ff' },
              { key: 'delivery', label: tc('status.delivery'), color: '#8b5cf6', bg: '#f5f3ff' },
            ] as const).map(s => (
              <div key={s.key} className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-[12px] font-semibold"
                style={{ background: s.bg, color: s.color }}>
                <span className="font-black text-[15px]">{files.filter(f => f.status === s.key).length}</span>
                <span className="opacity-70">{s.label}</span>
              </div>
            ))}
          </div>

          {writable && (
            <button
              onClick={() => setNewFileOpen(true)}
              className="h-9 px-4 rounded-xl text-white text-[13px] font-semibold shadow-sm hover:opacity-90 transition-opacity whitespace-nowrap flex items-center gap-1.5"
              style={{ background: 'linear-gradient(135deg, #b70011, #dc2626)' }}
            >
              <Plus className="h-3.5 w-3.5" />
              {t('buttons.newFile')}
            </button>
          )}
        </div>

        {/* 3-column Kanban */}
        <div className="grid grid-cols-3 gap-4 items-start">
          {STAGES.map(stage => {
            const stageFiles = files.filter(f => f.status === stage.key && (
              !search.trim() ||
              f.file_no?.toLowerCase().includes(search.toLowerCase()) ||
              f.customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
              f.product?.name?.toLowerCase().includes(search.toLowerCase())
            ));
            const meta = STATUS_META[stage.key];
            return (
              <div key={stage.key} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* Column header */}
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full shrink-0', stage.dot)} />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{stage.label}</span>
                  </div>
                  <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', meta.pill)}>
                    {stageFiles.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="divide-y divide-gray-50 max-h-[calc(100vh-220px)] overflow-y-auto scrollbar-thin">
                  {stageFiles.length === 0 ? (
                    <div className="py-10 text-center text-[12px] text-gray-400">{t('empty.noFiles')}</div>
                  ) : (
                    stageFiles.map(f => {
                      const custName = f.customer?.name ?? t('unknown');
                      const delay    = getDelayStatus(f);
                      return (
                        <div
                          key={f.id}
                          className="px-4 py-3 hover:bg-[#f7f9fc] cursor-pointer transition-colors group"
                          onClick={() => navigate(`/files/${f.id}`)}
                        >
                          <div className="flex items-start gap-2.5">
                            <div
                              className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[11px] font-bold shrink-0 mt-0.5"
                              style={{ background: avatarColor(custName) }}
                            >
                              {initials(custName)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-bold text-gray-900 truncate" style={{ fontFamily: 'Manrope, sans-serif' }}>{custName}</div>
                              <div className="text-[10px] font-mono text-gray-400">{f.file_no}</div>
                              <div className="text-[11px] text-gray-500 truncate mt-0.5">{f.product?.name ?? '—'}</div>
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                <span className="text-[11px] font-semibold text-gray-700">{fN(f.tonnage_mt, 0)} MT</span>
                                <span className="text-gray-300">·</span>
                                <span className="text-[10px] text-gray-400">{fDate(f.file_date)}</span>
                                {f.eta && (
                                  <span className={cn('text-[10px] font-medium',
                                    delay === 'overdue' ? 'text-red-500' :
                                    delay === 'delayed' ? 'text-amber-500' : 'text-gray-400')}>
                                    ETA {fDate((f as TradeFile & { revised_eta?: string }).revised_eta ?? f.eta)}
                                  </span>
                                )}
                              </div>
                              {delay === 'overdue' && (
                                <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                                  <AlertTriangle className="h-2.5 w-2.5" /> {t('flags.etaOverdue')}
                                </span>
                              )}
                              {delay === 'delayed' && (
                                <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                                  <AlertTriangle className="h-2.5 w-2.5" /> {t('flags.delayed')}
                                </span>
                              )}
                            </div>
                            <CircleProgress pct={getProgress(f)} color={getProgressColor(f.status)} size={48} />
                          </div>

                          {/* Action buttons */}
                          {writable && (
                            <div className="flex gap-1.5 mt-2.5" onClick={e => e.stopPropagation()}>
                              {f.status === 'request' && (
                                <>
                                  <button
                                    onClick={() => setSaleFile(findFile(f.id))}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white shadow-sm hover:opacity-90"
                                    style={{ background: 'linear-gradient(135deg, #b70011, #dc2626)' }}
                                  >
                                    <TrendingUp className="h-3 w-3" /> {t('buttons.toSale')}
                                  </button>
                                  <button
                                    onClick={() => handleDelete(f.id)}
                                    className="px-2 py-1 rounded-lg text-[11px] font-semibold text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                  >
                                    {tc('btn.delete')}
                                  </button>
                                </>
                              )}
                              {f.status === 'sale' && (
                                <>
                                  <button
                                    onClick={() => setDeliveryFile(findFile(f.id))}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white shadow-sm hover:opacity-90"
                                    style={{ background: 'linear-gradient(135deg, #b70011, #dc2626)' }}
                                  >
                                    <Truck className="h-3 w-3" /> {t(f.delivered_admt ? 'buttons.deliveryUpdate' : 'buttons.delivery')}
                                  </button>
                                  <button
                                    onClick={() => setInvoiceFile(findFile(f.id))}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200"
                                  >
                                    <FileText className="h-3 w-3" /> {t('buttons.invoice')}
                                  </button>
                                </>
                              )}
                              {f.status === 'delivery' && (
                                <button
                                  onClick={() => setInvoiceFile(findFile(f.id))}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200"
                                >
                                  <FileText className="h-3 w-3" /> {t('buttons.invoice')}
                                </button>
                              )}
                              <button
                                onClick={() => setPnlFileId(f.id)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200"
                              >
                                <BarChart2 className="h-3 w-3" /> {t('buttons.pnl')}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modals */}
      <NewFileModal      open={newFileOpen}     onOpenChange={setNewFileOpen} />
      <ToSaleModal       open={!!saleFile}       onOpenChange={() => setSaleFile(null)}     file={saleFile} />
      <DeliveryModal     open={!!deliveryFile}   onOpenChange={() => setDeliveryFile(null)} file={deliveryFile} />
      <InvoiceModal      open={!!invoiceFile}    onOpenChange={() => setInvoiceFile(null)}  file={invoiceFile} />
      <ProformaModal     open={!!proformaFile}   onOpenChange={() => setProformaFile(null)} file={proformaFile} />
      <PackingListModal  open={!!packingFile}    onOpenChange={() => setPackingFile(null)}  file={packingFile} />
      <PnlModal          open={!!pnlFileId}      onOpenChange={(v) => { if (!v) setPnlFileId(null); }} fileId={pnlFileId} />
    </>
  );
}
