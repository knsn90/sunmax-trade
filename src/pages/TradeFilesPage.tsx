import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useHeaderAction } from '@/contexts/HeaderContext';
import { useNavigate } from 'react-router-dom';
import { useTradeFilesPaginated, useDeleteTradeFileWithChoice } from '@/hooks/useTradeFiles';
import { DeleteTradeFileDialog } from '@/components/trade-files/DeleteTradeFileDialog';
import { useAuth } from '@/hooks/useAuth';
import { canWrite } from '@/lib/permissions';
import { fN, fDate } from '@/lib/formatters';
import { NewFileModal } from '@/components/trade-files/NewFileModal';
// LoadingSpinner kaldırıldı — inline spinner kullanılıyor
import { cn } from '@/lib/utils';
import { fCurrency } from '@/lib/formatters';
import { Search, Plus, ChevronRight, MoreVertical, Pencil, Trash2, FolderOpen } from 'lucide-react';
import type { TradeFile } from '@/types/database';
import { useTheme } from '@/contexts/ThemeContext';
import { FileActivityPopover } from '@/components/trade-files/FileActivityPopover';
import { EntityAvatar } from '@/components/ui/shared';

// ─── Status meta ───────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { dot: string; text: string }> = {
  request:   { dot: 'bg-amber-400',  text: 'text-amber-700' },
  sale:      { dot: 'bg-blue-400',   text: 'text-blue-700' },
  delivery:  { dot: 'bg-violet-400', text: 'text-violet-700' },
  completed: { dot: 'bg-green-400',  text: 'text-green-700' },
  cancelled: { dot: 'bg-gray-300',   text: 'text-gray-400' },
};

type FilterKey = 'all' | 'request' | 'sale' | 'delivery' | 'completed' | 'cancelled';

const PAGE_SIZE = 25;


// ─── Mobile row menu ───────────────────────────────────────────────────────────
function MobileRowMenu({
  onEdit, onDelete, writable,
}: {
  onEdit: () => void; onDelete: () => void; writable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  if (!writable) return <ChevronRight className="h-3.5 w-3.5 text-gray-300" />;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[120px]">
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onEdit(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
          >
            <Pencil className="h-3.5 w-3.5 text-gray-400" /> Düzenle
          </button>
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onDelete(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Sil
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Mobile list row ───────────────────────────────────────────────────────────
function FileRow({ file, onClick, onEdit, onDelete, writable }: {
  file: TradeFile; onClick: () => void; onEdit: () => void; onDelete: () => void; writable: boolean;
}) {
  const { t } = useTranslation('tradeFiles');
  const { t: tc } = useTranslation('common');
  const custName = file.customer?.name ?? t('unknown');
  const meta = STATUS_META[file.status] ?? STATUS_META.request;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3.5 bg-white active:bg-gray-50 cursor-pointer"
      onClick={onClick}
    >
      <EntityAvatar name={custName} logoUrl={file.customer?.logo_url} size="md" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[13px] text-gray-900 truncate" style={{ fontFamily: 'Manrope, sans-serif' }}>{custName}</div>
        <div className="text-[11px] text-gray-400 mt-0.5 truncate">
          {file.file_no} · {file.product?.name ?? '—'}
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', meta.dot)} />
          <span className={cn('text-[10px] font-semibold', meta.text)}>
            {tc(`status.${file.status}` as `status.${string}`)}
          </span>
          {file.tonnage_mt > 0 && (
            <span className="text-[10px] text-gray-400">· {fN(file.tonnage_mt, 0)} {file.product?.unit ?? 'MT'}</span>
          )}
          {file.selling_price && (
            <span className="text-[10px] text-gray-400">· {fCurrency(file.selling_price)}/MT</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex flex-col items-end gap-1" onClick={e => e.stopPropagation()}>
          <span className="text-[11px] text-gray-400">{fDate(file.file_date)}</span>
          <div className="flex items-center gap-1">
            <FileActivityPopover file={file} />
            <MobileRowMenu onEdit={onEdit} onDelete={onDelete} writable={writable} />
          </div>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300 shrink-0" />
      </div>
    </div>
  );
}

// ─── Desktop table row ─────────────────────────────────────────────────────────
const ROW_BG: Record<string, string> = {
  completed: 'bg-[#16A34A]/[0.04] hover:bg-[#16A34A]/[0.07]',
  delivery:  'bg-[#B45309]/[0.04] hover:bg-[#B45309]/[0.07]',
};

function DesktopRow({ file, onClick, onEdit, onDelete, writable }: {
  file: TradeFile; onClick: () => void; onEdit: () => void; onDelete: () => void; writable: boolean;
}) {
  const { t } = useTranslation('tradeFiles');
  const { t: tc } = useTranslation('common');
  const custName = file.customer?.name ?? t('unknown');
  const meta = STATUS_META[file.status] ?? STATUS_META.request;
  const rowBg = ROW_BG[file.status] ?? 'hover:bg-[#FAF9F6]';
  return (
    <tr
      className={`border-b border-[#F4F2EE] cursor-pointer transition-colors ${rowBg}`}
      onClick={onClick}
    >
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <EntityAvatar name={custName} logoUrl={file.customer?.logo_url} size="sm" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[#0A0A0A] truncate">{custName}</div>
            <div className="text-[10px] font-mono text-[#A8A8AD] truncate">{file.file_no}</div>
            {file.creator?.full_name && (
              <div className="text-[10px] text-[#A8A8AD] truncate">↳ {file.creator.full_name}</div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5 text-[12px] text-[#6F6F6F] whitespace-nowrap">{file.product?.name ?? '—'}</td>
      <td className="px-4 py-3.5 text-[12px] font-semibold text-[#0A0A0A] whitespace-nowrap">{fN(file.tonnage_mt, 0)} {file.product?.unit ?? 'MT'}</td>
      <td className="px-4 py-3.5 text-[12px] text-[#8A8A8E] whitespace-nowrap">{fDate(file.file_date)}</td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-1.5">
          <span className={cn('w-2 h-2 rounded-full shrink-0', meta.dot)} />
          <span className={cn('text-[11px] font-semibold', meta.text)}>
            {tc(`status.${file.status}` as `status.${string}`)}
          </span>
        </div>
      </td>
      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          {/* Activity info icon — always visible */}
          <FileActivityPopover file={file} />

          {writable && (
            <>
              <button
                onClick={onEdit}
                className="flex items-center gap-1 text-[11px] font-medium text-[#8A8A8E] hover:text-[#0A0A0A] transition-colors px-2.5 py-1.5 rounded-full hover:bg-[#F4F2EE]"
              >
                <Pencil className="h-3 w-3" /> Düzenle
              </button>
              <button
                onClick={onDelete}
                className="flex items-center gap-1 text-[11px] font-medium text-[#8A8A8E] hover:text-[#EF4444] transition-colors px-2.5 py-1.5 rounded-full hover:bg-[#EF4444]/8"
              >
                <Trash2 className="h-3 w-3" /> Sil
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export function TradeFilesPage() {
  const { t } = useTranslation('tradeFiles');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const { profile } = useAuth();
  const deleteFile = useDeleteTradeFileWithChoice();
  const writable = canWrite(profile?.role);
  const { accent } = useTheme();

  const [newFileOpen, setNewFileOpen] = useState(false);
  const [editFile, setEditFile] = useState<TradeFile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TradeFile | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [page, setPage] = useState(1);
  const { setAction } = useHeaderAction();

  // Arama debounce — 350ms sonra sunucuya gönder
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(id);
  }, [search]);

  // Filtre veya arama değişince ilk sayfaya dön
  useEffect(() => { setPage(1); }, [filter, debouncedSearch]);

  const { data: pageResult, isLoading } = useTradeFilesPaginated(
    {
      status: filter !== 'all' ? filter as import('@/types/enums').TradeFileStatus : undefined,
      search: debouncedSearch,
    },
    page,
    PAGE_SIZE,
  );

  const paged      = pageResult?.data  ?? [];
  const totalCount = pageResult?.count ?? 0;
  const totalPages  = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const STATUS_FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all',       label: tc('all') },
    { key: 'request',   label: tc('status.request') },
    { key: 'sale',      label: tc('status.sale') },
    { key: 'delivery',  label: tc('status.delivery') },
    { key: 'completed', label: tc('status.completed') },
    { key: 'cancelled', label: tc('status.cancelled') },
  ];

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

  async function handleDeleteConfirm(keepDocuments: boolean) {
    if (!deleteTarget) return;
    await deleteFile.mutateAsync({ id: deleteTarget.id, keepDocuments });
    setDeleteTarget(null);
  }

  // isLoading guard kaldırıldı — sayfa hemen render edilir, içerik yüklenince görünür

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════
          MOBILE
      ══════════════════════════════════════════════════════════════ */}
      <div className="md:hidden flex flex-col min-h-screen -mx-4" style={{ background: '#f7f9fc' }}>

        {/* Hero */}
        {!searchOpen && (
          <div className="px-5 pt-2 pb-3">
            <div className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-2" style={{ background: 'rgba(183,0,17,0.08)', color: '#b70011' }}>
              Ticaret Dosyaları
            </div>
            <h2
              className="text-[26px] font-extrabold text-gray-900 leading-tight tracking-tight"
              style={{ fontFamily: 'Manrope, sans-serif' }}
            >
              {filter === 'all' ? 'Tüm Dosyalar' : tc(`status.${filter}`)}<br />
              <span style={{ color: '#b70011' }}>— {totalCount} dosya</span>
            </h2>
          </div>
        )}

        <div className="px-4 pb-3">
          {searchOpen ? (
            <div className="flex items-center gap-2 bg-white rounded-full px-4 h-11 shadow-sm border border-gray-100">
              <Search className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                autoFocus
                className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
                placeholder={t('filters.search')}
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
              <button
                className="text-xs font-semibold shrink-0"
                style={{ color: accent }}
                onClick={() => { setSearchOpen(false); setSearch(''); }}
              >
                {tc('btn.cancel')}
              </button>
            </div>
          ) : (
            <button
              className="w-full h-11 rounded-full flex items-center justify-center gap-2 font-semibold text-sm active:opacity-70 border"
              style={{ background: 'rgba(0,0,0,0.04)', borderColor: 'rgba(0,0,0,0.08)', color: '#6b7280' }}
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-4 w-4" />
              {tc('btn.search')}
            </button>
          )}
        </div>

        <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl mx-4 mb-3 overflow-x-auto scrollbar-none">
          {STATUS_FILTERS.map(s => {
            const active = filter === s.key;
            return (
              <button
                key={s.key}
                onClick={() => { setFilter(s.key); setPage(1); }}
                className={`shrink-0 px-3.5 h-8 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap ${
                  active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {s.label}{active && totalCount > 0 && <span className="ml-1 text-gray-500">({totalCount})</span>}
              </button>
            );
          })}
        </div>

        <div className="flex-1 mx-3 rounded-2xl overflow-hidden shadow-sm bg-white divide-y divide-gray-50">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-5 h-5 border-2 border-gray-200 border-t-red-500 rounded-full animate-spin" />
            </div>
          ) : paged.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <MoreVertical className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">{t('empty.noRecords')}</p>
            </div>
          ) : (
            paged.map((f, i) => (
              <div key={f.id}>
                <FileRow
                  file={f}
                  onClick={() => navigate(`/files/${f.id}`)}
                  onEdit={() => setEditFile(f)}
                  onDelete={() => setDeleteTarget(f)}
                  writable={writable}
                />
                {i < paged.length - 1 && <div className="h-px bg-gray-50 mx-4" />}
              </div>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1.5 py-4">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={cn(
                  'w-7 h-7 rounded-full text-[11px] font-bold transition-all',
                  p === currentPage ? 'text-white shadow-sm scale-110' : 'bg-white text-gray-400 border border-gray-200'
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
          DESKTOP
      ══════════════════════════════════════════════════════════════ */}
      <div className="hidden md:block md:-mt-6 md:-mx-6 min-h-screen" style={{ background: '#EFEDE8', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>
       <div className="px-8 pt-7 pb-8">

        {/* Page Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-white border border-[#ECECEC] shadow-[0_8px_24px_rgba(0,0,0,0.04)] flex items-center justify-center">
            <FolderOpen style={{ width: 20, height: 20 }} className="text-[#8A8A8E]" />
          </div>
          <div>
            <h1 className="text-[22px] font-bold text-[#0A0A0A] tracking-[-0.02em] leading-tight">Ticaret Dosyaları</h1>
            <p className="text-[13px] text-[#8A8A8E] mt-0.5">Tüm ithalat ve ihracat dosyaları</p>
          </div>
        </div>

        {/* Toolbar: search + new */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 bg-white rounded-full px-4 h-10 border border-[#ECECEC] flex-1 max-w-xs">
            <Search className="h-4 w-4 text-[#A8A8AD] shrink-0" />
            <input
              className="flex-1 text-[13px] text-[#0A0A0A] outline-none bg-transparent placeholder:text-[#A8A8AD]"
              placeholder={t('filters.search')}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div className="flex-1" />
          {writable && (
            <button
              onClick={() => setNewFileOpen(true)}
              className="h-10 px-5 rounded-full text-white text-[13px] font-semibold transition-colors whitespace-nowrap shadow-[0_8px_24px_rgba(0,0,0,0.04)]"
              style={{ background: accent }}
              onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, ${accent} 88%, #000)`; }}
              onMouseLeave={e => { e.currentTarget.style.background = accent; }}
            >
              {t('buttons.newFile')}
            </button>
          )}
        </div>

        {/* Filter pills (segment) */}
        <div className="flex gap-1 bg-[#EAE7E0] p-1 rounded-full mb-5 w-fit max-w-full overflow-x-auto scrollbar-none">
          {STATUS_FILTERS.map(s => {
            const active = filter === s.key;
            return (
              <button
                key={s.key}
                onClick={() => { setFilter(s.key); setPage(1); }}
                className={cn(
                  'shrink-0 px-4 h-8 rounded-full text-[12px] font-semibold transition-all whitespace-nowrap',
                  active ? 'bg-white text-[#0A0A0A] shadow-sm' : 'text-[#8A8A8E] hover:text-[#0A0A0A]',
                )}
              >
                {s.label}
                {active && totalCount > 0 && (
                  <span className="ml-1 text-[#A8A8AD]">{totalCount}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="bg-white rounded-[20px] border border-[#ECECEC] shadow-[0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#F4F2EE]">
                {[t('table.customerFileNo'), t('table.product'), t('table.tonnage'), tc('table.date'), tc('table.status'), ''].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A8A8AD]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="py-16 text-center"><div className="inline-block w-5 h-5 border-2 border-[#ECECEC] rounded-full animate-spin" style={{ borderTopColor: accent }} /></td></tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-[13px] text-[#A8A8AD]">
                    {t('empty.noRecords')}
                  </td>
                </tr>
              ) : (
                paged.map(f => (
                  <DesktopRow
                    key={f.id}
                    file={f}
                    onClick={() => navigate(`/files/${f.id}`)}
                    onEdit={() => setEditFile(f)}
                    onDelete={() => setDeleteTarget(f)}
                    writable={writable}
                  />
                ))
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 py-4 border-t border-[#F4F2EE]">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    'w-8 h-8 rounded-full text-[11px] font-bold transition-all',
                    p === currentPage ? 'text-white' : 'bg-[#F4F2EE] text-[#8A8A8E] hover:bg-[#EAE7E0]'
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
      </div>

      {/* Modals */}
      <NewFileModal open={newFileOpen} onOpenChange={setNewFileOpen} />
      <NewFileModal
        open={!!editFile}
        onOpenChange={v => { if (!v) setEditFile(null); }}
        editMode
        fileToEdit={editFile}
      />
      {deleteTarget && (
        <DeleteTradeFileDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          file={deleteTarget}
          txnCount={1}
          onConfirm={handleDeleteConfirm}
          isDeleting={deleteFile.isPending}
        />
      )}
    </>
  );
}
