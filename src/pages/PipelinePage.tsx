import { useState, useMemo } from 'react';
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
import { LoadingSpinner } from '@/components/ui/shared';
import { cn } from '@/lib/utils';
import { fN, fDate } from '@/lib/formatters';
import { Search, Plus, MoreVertical, ChevronRight, TrendingUp, Truck, FileText, BarChart2 } from 'lucide-react';
import type { TradeFile } from '@/types/database';
import { useTheme } from '@/contexts/ThemeContext';

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'request',  label: 'Request' },
  { key: 'sale',     label: 'Sale' },
  { key: 'delivery', label: 'Delivery' },
] as const;

type FilterKey = typeof STATUS_FILTERS[number]['key'];

const STATUS_META: Record<string, { bg: string; text: string; dot: string }> = {
  request:  { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400' },
  sale:     { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-400' },
  delivery: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-400' },
  completed:{ bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-400' },
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

const PAGE_SIZE = 10;

// ─── Mobile list row ──────────────────────────────────────────────────────────
function PipelineRow({ file, onClick }: { file: TradeFile; onClick: () => void }) {
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export function PipelinePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: files = [], isLoading } = useTradeFiles();
  const deleteFile = useDeleteTradeFile();
  const writable = canWrite(profile?.role);
  const { theme } = useTheme();
  const isDonezo = theme === 'donezo';
  const accent = isDonezo ? '#dc2626' : '#2563eb';

  const [newFileOpen, setNewFileOpen] = useState(false);
  const [saleFile, setSaleFile] = useState<TradeFile | null>(null);
  const [deliveryFile, setDeliveryFile] = useState<TradeFile | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<TradeFile | null>(null);
  const [proformaFile, setProformaFile] = useState<TradeFile | null>(null);
  const [packingFile, setPackingFile] = useState<TradeFile | null>(null);
  const [pnlFileId, setPnlFileId] = useState<string | null>(null);

  // Mobile state
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [page, setPage] = useState(1);

  const findFile = (id: string) => files.find((x) => x.id === id) ?? null;
  function handleDelete(id: string) {
    if (window.confirm('Delete this file?')) deleteFile.mutate(id);
  }

  // Filtered list for mobile
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

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════
          MOBILE  (< md)
      ══════════════════════════════════════════════════════════════ */}
      <div className="md:hidden flex flex-col min-h-screen -mx-4 -mt-4 bg-gray-50">

        {/* Top bar */}
        <div className="flex items-center justify-end px-4 pt-4 pb-2 bg-gray-50">
          {writable && (
            <button
              onClick={() => setNewFileOpen(true)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white shadow"
              style={{ background: accent }}
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>

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
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-none">
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
                  'shrink-0 px-3.5 h-7 rounded-full text-[11px] font-bold transition-all',
                  active
                    ? 'text-white shadow-sm'
                    : 'bg-white text-gray-500 border border-gray-200'
                )}
                style={active ? { background: accent } : {}}
              >
                {s.label} {count > 0 && <span className={active ? 'opacity-70' : 'text-gray-400'}>({count})</span>}
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
                <PipelineRow file={f} onClick={() => navigate(`/files/${f.id}`)} />
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

        {/* Bottom padding for nav bar */}
        <div className="h-24" />
      </div>

      {/* ══════════════════════════════════════════════════════════════
          DESKTOP  (≥ md)  — Kanban columns
      ══════════════════════════════════════════════════════════════ */}
      <div className="hidden md:block">

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 bg-white rounded-xl px-3 h-9 shadow-sm border border-gray-100 flex-1 max-w-xs">
            <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <input
              className="flex-1 text-[13px] outline-none bg-transparent placeholder:text-gray-400"
              placeholder="Search pipeline..."
              value={search}
              onChange={e => { setSearch(e.target.value); }}
            />
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

        {/* 3-column Kanban */}
        {(() => {
          const STAGES = [
            { key: 'request',  label: 'Request',  headerBg: '#fef3c7', headerText: '#92400e', dot: '#f59e0b', accentBtn: '#d97706' },
            { key: 'sale',     label: 'Sale',     headerBg: '#dbeafe', headerText: '#1e3a8a', dot: '#3b82f6', accentBtn: '#2563eb' },
            { key: 'delivery', label: 'Delivery', headerBg: '#ede9fe', headerText: '#4c1d95', dot: '#8b5cf6', accentBtn: '#7c3aed' },
          ] as const;

          return (
            <div className="grid grid-cols-3 gap-4 items-start">
              {STAGES.map(stage => {
                const stageFiles = files.filter(f => f.status === stage.key && (
                  !search.trim() ||
                  f.file_no?.toLowerCase().includes(search.toLowerCase()) ||
                  f.customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
                  f.product?.name?.toLowerCase().includes(search.toLowerCase())
                ));
                return (
                  <div key={stage.key} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    {/* Column header */}
                    <div className="flex items-center justify-between px-4 py-3" style={{ background: stage.headerBg }}>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: stage.dot }} />
                        <span className="text-[12px] font-bold" style={{ color: stage.headerText }}>{stage.label}</span>
                      </div>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: stage.dot }}>
                        {stageFiles.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div className="divide-y divide-gray-50 max-h-[calc(100vh-220px)] overflow-y-auto scrollbar-thin">
                      {stageFiles.length === 0 ? (
                        <div className="py-10 text-center text-[12px] text-gray-400">No files</div>
                      ) : (
                        stageFiles.map(f => {
                          const custName = f.customer?.name ?? 'Unknown';
                          return (
                            <div
                              key={f.id}
                              className="px-4 py-3 hover:bg-gray-50/60 cursor-pointer transition-colors group"
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
                                  <div className="text-[13px] font-semibold text-gray-900 truncate">{custName}</div>
                                  <div className="text-[10px] font-mono text-gray-400">{f.file_no}</div>
                                  <div className="text-[11px] text-gray-500 truncate mt-0.5">{f.product?.name ?? '—'}</div>
                                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-400">
                                    <span className="font-semibold text-gray-700">{fN(f.tonnage_mt, 0)} MT</span>
                                    <span>·</span>
                                    <span>{fDate(f.file_date)}</span>
                                  </div>
                                </div>
                              </div>
                              {/* Action buttons */}
                              {writable && (
                                <div className="flex gap-1.5 mt-2.5" onClick={e => e.stopPropagation()}>
                                  {f.status === 'request' && (
                                    <>
                                      <button
                                        onClick={() => setSaleFile(findFile(f.id))}
                                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white shadow-sm hover:opacity-90"
                                        style={{ background: stage.accentBtn }}
                                      >
                                        <TrendingUp className="h-3 w-3" /> To Sale
                                      </button>
                                      <button
                                        onClick={() => handleDelete(f.id)}
                                        className="px-2 py-1 rounded-lg text-[11px] font-semibold text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                      >
                                        Delete
                                      </button>
                                    </>
                                  )}
                                  {f.status === 'sale' && (
                                    <>
                                      <button
                                        onClick={() => setDeliveryFile(findFile(f.id))}
                                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white shadow-sm hover:opacity-90"
                                        style={{ background: stage.accentBtn }}
                                      >
                                        <Truck className="h-3 w-3" /> {f.delivered_admt ? 'Delivery' : '+ Delivery'}
                                      </button>
                                      <button
                                        onClick={() => setInvoiceFile(findFile(f.id))}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200"
                                      >
                                        <FileText className="h-3 w-3" /> Invoice
                                      </button>
                                    </>
                                  )}
                                  {f.status === 'delivery' && (
                                    <button
                                      onClick={() => setInvoiceFile(findFile(f.id))}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200"
                                    >
                                      <FileText className="h-3 w-3" /> Invoice
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setPnlFileId(f.id)}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200"
                                  >
                                    <BarChart2 className="h-3 w-3" /> P&L
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
          );
        })()}
      </div>

      {/* Modals */}
      <NewFileModal open={newFileOpen} onOpenChange={setNewFileOpen} />
      <ToSaleModal open={!!saleFile} onOpenChange={() => setSaleFile(null)} file={saleFile} />
      <DeliveryModal open={!!deliveryFile} onOpenChange={() => setDeliveryFile(null)} file={deliveryFile} />
      <InvoiceModal open={!!invoiceFile} onOpenChange={() => setInvoiceFile(null)} file={invoiceFile} />
      <ProformaModal open={!!proformaFile} onOpenChange={() => setProformaFile(null)} file={proformaFile} />
      <PackingListModal open={!!packingFile} onOpenChange={() => setPackingFile(null)} file={packingFile} />
      <PnlModal open={!!pnlFileId} onOpenChange={(v) => { if (!v) setPnlFileId(null); }} fileId={pnlFileId} />
    </>
  );
}
