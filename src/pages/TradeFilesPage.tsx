import { useState, useMemo, useEffect } from 'react';
import { useHeaderAction } from '@/contexts/HeaderContext';
import { useNavigate } from 'react-router-dom';
import { useTradeFiles, useDeleteTradeFile } from '@/hooks/useTradeFiles';
import { useAuth } from '@/hooks/useAuth';
import { canWrite } from '@/lib/permissions';
import { fN, fDate } from '@/lib/formatters';
import { NewFileModal } from '@/components/trade-files/NewFileModal';
import { LoadingSpinner } from '@/components/ui/shared';
import { cn } from '@/lib/utils';
import { fCurrency } from '@/lib/formatters';
import { Search, Plus, ChevronRight, MoreVertical } from 'lucide-react';
import type { TradeFile } from '@/types/database';
import { useTheme } from '@/contexts/ThemeContext';

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_FILTERS = [
  { key: 'all',       label: 'All' },
  { key: 'request',   label: 'Request' },
  { key: 'sale',      label: 'Sale' },
  { key: 'delivery',  label: 'Delivery' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;

type FilterKey = typeof STATUS_FILTERS[number]['key'];

const STATUS_META: Record<string, { dot: string; text: string }> = {
  request:   { dot: 'bg-amber-400',  text: 'text-amber-700' },
  sale:      { dot: 'bg-blue-400',   text: 'text-blue-700' },
  delivery:  { dot: 'bg-violet-400', text: 'text-violet-700' },
  completed: { dot: 'bg-green-400',  text: 'text-green-700' },
  cancelled: { dot: 'bg-gray-300',   text: 'text-gray-400' },
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

const PAGE_SIZE = 12;

// ─── List row ──────────────────────────────────────────────────────────────────
function FileRow({ file, onClick }: { file: TradeFile; onClick: () => void }) {
  const custName = file.customer?.name ?? 'Unknown';
  const meta = STATUS_META[file.status] ?? STATUS_META.request;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3.5 bg-white active:bg-gray-50 cursor-pointer"
      onClick={onClick}
    >
      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-[13px] font-bold shadow-sm"
        style={{ background: avatarColor(custName) }}
      >
        {initials(custName)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[13px] text-gray-900 truncate">{custName}</div>
        <div className="text-[11px] text-gray-400 mt-0.5 truncate">
          {file.file_no} · {file.product?.name ?? '—'}
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', meta.dot)} />
          <span className={cn('text-[10px] font-semibold capitalize', meta.text)}>
            {file.status}
          </span>
          {file.tonnage_mt > 0 && (
            <span className="text-[10px] text-gray-400">· {fN(file.tonnage_mt, 0)} MT</span>
          )}
          {file.selling_price && (
            <span className="text-[10px] text-gray-400">· {fCurrency(file.selling_price)}/MT</span>
          )}
        </div>
      </div>

      {/* Right side */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[11px] text-gray-400">{fDate(file.file_date)}</span>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
      </div>
    </div>
  );
}

// ─── Desktop table row ─────────────────────────────────────────────────────────
function DesktopRow({ file, onClick, onDelete, writable }: {
  file: TradeFile; onClick: () => void; onDelete: () => void; writable: boolean;
}) {
  const custName = file.customer?.name ?? 'Unknown';
  const meta = STATUS_META[file.status] ?? STATUS_META.request;
  return (
    <tr
      className="border-b border-gray-50 hover:bg-gray-50/60 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
            style={{ background: avatarColor(custName) }}
          >
            {initials(custName)}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-gray-900 truncate">{custName}</div>
            <div className="text-[10px] font-mono text-gray-400 truncate">{file.file_no}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-[12px] text-gray-600 whitespace-nowrap">{file.product?.name ?? '—'}</td>
      <td className="px-4 py-3 text-[12px] font-semibold text-gray-900 whitespace-nowrap">{fN(file.tonnage_mt, 0)} MT</td>
      <td className="px-4 py-3 text-[12px] text-gray-500 whitespace-nowrap">{fDate(file.file_date)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className={cn('w-2 h-2 rounded-full shrink-0', meta.dot)} />
          <span className={cn('text-[11px] font-semibold capitalize', meta.text)}>{file.status}</span>
        </div>
      </td>
      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
        {file.status === 'request' && writable && (
          <button
            onClick={onDelete}
            className="text-[11px] text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
          >
            Delete
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export function TradeFilesPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: files = [], isLoading } = useTradeFiles();
  const deleteFile = useDeleteTradeFile();
  const writable = canWrite(profile?.role);
  const { theme } = useTheme();
  const isDonezo = theme === 'donezo';
  const accent = isDonezo ? '#dc2626' : '#2563eb';

  const [newFileOpen, setNewFileOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [page, setPage] = useState(1);
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleDelete(id: string) {
    if (window.confirm('Delete this file?')) deleteFile.mutate(id);
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════
          MOBILE  (< md)
      ══════════════════════════════════════════════════════════════ */}
      <div className="md:hidden flex flex-col min-h-screen -mx-4 bg-gray-50">

        {/* Search bar */}
        <div className="px-4 pb-3">
          {searchOpen ? (
            <div className="flex items-center gap-2 bg-white rounded-full px-4 h-11 shadow-sm border border-gray-100">
              <Search className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                autoFocus
                className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
                placeholder="Customer, file no, product..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
              <button
                className="text-xs font-semibold shrink-0"
                style={{ color: accent }}
                onClick={() => { setSearchOpen(false); setSearch(''); }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="w-full h-11 rounded-full flex items-center justify-center gap-2 font-semibold text-sm active:opacity-70 border"
              style={{ background: 'rgba(0,0,0,0.04)', borderColor: 'rgba(0,0,0,0.08)', color: '#6b7280' }}
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-4 w-4" />
              Search
            </button>
          )}
        </div>

        {/* Filter pills */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl mx-4 mb-3 overflow-x-auto scrollbar-none">
          {STATUS_FILTERS.map(s => {
            const count = s.key === 'all'
              ? files.length
              : files.filter(f => f.status === s.key).length;
            const active = filter === s.key;
            return (
              <button
                key={s.key}
                onClick={() => { setFilter(s.key); setPage(1); }}
                className={`shrink-0 px-3.5 h-8 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap ${
                  active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {s.label} {count > 0 && <span className={active ? 'text-gray-500' : 'text-gray-400'}>({count})</span>}
              </button>
            );
          })}
        </div>

        {/* List */}
        <div className="flex-1 mx-3 rounded-2xl overflow-hidden shadow-sm bg-white divide-y divide-gray-50">
          {paged.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <MoreVertical className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No records found</p>
            </div>
          ) : (
            paged.map((f, i) => (
              <div key={f.id}>
                <FileRow file={f} onClick={() => navigate(`/files/${f.id}`)} />
                {i < paged.length - 1 && (
                  <div className="h-px bg-gray-50 mx-4" />
                )}
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1.5 py-4">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={cn(
                  'w-7 h-7 rounded-full text-[11px] font-bold transition-all',
                  p === currentPage
                    ? 'text-white shadow-sm scale-110'
                    : 'bg-white text-gray-400 border border-gray-200'
                )}
                style={p === currentPage ? { background: accent } : {}}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <div className="h-24" />
      </div>

      {/* ══════════════════════════════════════════════════════════════
          DESKTOP  (≥ md)
      ══════════════════════════════════════════════════════════════ */}
      <div className="hidden md:block">

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4">
          {/* Search */}
          <div className="flex items-center gap-2 bg-white rounded-xl px-3 h-9 shadow-sm border border-gray-100 flex-1 max-w-xs">
            <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <input
              className="flex-1 text-[13px] outline-none bg-transparent placeholder:text-gray-400"
              placeholder="Search files..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          {/* Filter pills */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto scrollbar-none">
            {STATUS_FILTERS.map(s => {
              const count = s.key === 'all'
                ? files.length
                : files.filter(f => f.status === s.key).length;
              const active = filter === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => { setFilter(s.key); setPage(1); }}
                  className={`shrink-0 px-3 h-8 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap ${
                    active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {s.label} {count > 0 && <span className={active ? 'text-gray-500' : 'text-gray-400'}>({count})</span>}
                </button>
              );
            })}
          </div>

          <div className="flex-1" />

          {writable && (
            <button
              onClick={() => setNewFileOpen(true)}
              className="h-9 px-4 rounded-xl text-white text-[13px] font-semibold shadow-sm hover:opacity-90 transition-opacity whitespace-nowrap"
              style={{ background: accent }}
            >
              + New File
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['Customer / File No', 'Product', 'Tonnage', 'Date', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-[13px] text-gray-400">
                    No records found
                  </td>
                </tr>
              ) : (
                paged.map(f => (
                  <DesktopRow
                    key={f.id}
                    file={f}
                    onClick={() => navigate(`/files/${f.id}`)}
                    onDelete={() => handleDelete(f.id)}
                    writable={writable}
                  />
                ))
              )}
            </tbody>
          </table>

          {/* Desktop pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 py-4 border-t border-gray-50">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    'w-7 h-7 rounded-full text-[11px] font-bold transition-all',
                    p === currentPage
                      ? 'text-white shadow-sm'
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                  )}
                  style={p === currentPage ? { background: accent } : {}}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <NewFileModal open={newFileOpen} onOpenChange={setNewFileOpen} />
    </>
  );
}
