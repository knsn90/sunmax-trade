import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useTradeFile, useChangeStatus, useNoteDelay, useDeleteTradeFileWithChoice, useUpdateSaleDetails, tradeFileKeys } from '@/hooks/useTradeFiles';
import { DeleteTradeFileDialog } from '@/components/trade-files/DeleteTradeFileDialog';
import { tradeFileService } from '@/services/tradeFileService';
import { invoiceService } from '@/services/invoiceService';
import { packingListService } from '@/services/packingListService';
import { proformaService } from '@/services/proformaService';
import { dropboxService } from '@/services/dropboxService';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { canWrite } from '@/lib/permissions';
import { fN, fDate, fCurrency, fUSD } from '@/lib/formatters';
import type { Invoice, PackingList, Proforma, Transaction } from '@/types/database';
import type { TradeFileStatus, CurrencyCode } from '@/types/enums';
import { ToSaleModal } from '@/components/trade-files/ToSaleModal';
import { DeliveryModal } from '@/components/trade-files/DeliveryModal';
import { NewFileModal } from '@/components/trade-files/NewFileModal';
import { BatchModal } from '@/components/trade-files/BatchModal';
import { InvoiceModal } from '@/components/documents/InvoiceModal';
import { ProformaModal } from '@/components/documents/ProformaModal';
import { PackingListModal } from '@/components/documents/PackingListModal';
import { PurchaseInvoiceModal } from '@/components/accounting/PurchaseInvoiceModal';
import { ServiceInvoiceModal } from '@/components/accounting/ServiceInvoiceModal';
import { useDeleteInvoice, useDeletePackingList } from '@/hooks/useDocuments';
import { useDeleteProforma } from '@/hooks/useProformas';
import { useSettings, useBankAccounts } from '@/hooks/useSettings';
import { useTransactions } from '@/hooks/useTransactions';
import { printInvoice, printPackingList, printProforma, generateProformaHtml, generateInvoiceHtml, generatePackingListHtml } from '@/lib/printDocument';
import { buildConsolidatedPackingList, buildConsolidatedInvoice } from '@/lib/consolidatedDocs';
import { OrderInfoRow } from '@/components/trade-files/OrderInfoRow';
import { NativeSelect } from '@/components/ui/form-elements';
import { LoadingSpinner, EntityAvatar } from '@/components/ui/shared';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DocStatusBadge } from '@/components/ui/DocStatusBadge';
import { ApprovalActions } from '@/components/ui/ApprovalActions';
import { TransportPlanSection } from '@/components/transport/TransportPlanSection';
import { NotesSection } from '@/components/trade-files/NotesSection';
import { AttachmentsSection } from '@/components/trade-files/AttachmentsSection';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { MonoDatePicker } from '@/components/ui/MonoDatePicker';
import {
  ArrowLeft, FileText, Package, Receipt, Pencil, Printer,
  Trash2, TrendingUp, Truck, ChevronDown, ChevronUp, Plus,
  MoreVertical, X, RotateCcw, Bell, AlertTriangle, ExternalLink,
  CheckCircle, Layers,
} from 'lucide-react';

// ── Action sheet item ─────────────────────────────────────────────────────────
function ActionItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl active:bg-gray-50 text-left"
    >
      <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
        {icon}
      </div>
      <span className="text-[13px] font-medium text-gray-800">{label}</span>
    </button>
  );
}

// ── Status colours ────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { bg: string; text: string; dot: string; pill: string }> = {
  request:   { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400',   pill: 'bg-amber-100 text-amber-700' },
  sale:      { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-400',    pill: 'bg-blue-100 text-blue-700' },
  delivery:  { bg: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-400',  pill: 'bg-violet-100 text-violet-700' },
  completed: { bg: 'bg-green-50',   text: 'text-green-700',   dot: 'bg-green-400',   pill: 'bg-green-100 text-green-700' },
  cancelled: { bg: 'bg-gray-50',    text: 'text-gray-500',    dot: 'bg-gray-300',    pill: 'bg-gray-100 text-gray-500' },
};

// ── Section card ──────────────────────────────────────────────────────────────
/** Belgeler kartı başlığındaki "+ Belge Ekle" menüsü — o an oluşturulabilecek belgeleri listeler. */
function AddDocMenu({ items }: { items: { label: string; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="h-7 px-3 rounded-full bg-gray-100 hover:bg-gray-200 text-[11px] font-semibold text-gray-600 flex items-center gap-1 transition-colors"
      >
        <Plus className="h-3 w-3" /> Belge Ekle
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[170px]">
            {items.map(it => (
              <button
                key={it.label}
                type="button"
                onClick={() => { setOpen(false); it.onClick(); }}
                className="w-full text-left px-3 py-2 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Section({
  title, icon, right, children, accent = false,
  collapsible = false, isCollapsed = false, onToggle,
}: {
  title: string; icon?: React.ReactNode; right?: React.ReactNode;
  children: React.ReactNode; accent?: boolean;
  collapsible?: boolean; isCollapsed?: boolean; onToggle?: () => void;
}) {
  return (
    <div className={cn(
      'rounded-2xl bg-white shadow-sm overflow-hidden mb-3',
      accent ? 'ring-1 ring-brand-200' : '',
    )}>
      <div
        className={cn('flex items-center justify-between px-4 py-3 border-b border-[#F4F2EE]', collapsible ? 'cursor-pointer select-none' : '')}
        onClick={collapsible ? onToggle : undefined}
      >
        <div className="flex items-center gap-2">
          {icon && <span className="text-gray-400">{icon}</span>}
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {right && <div onClick={e => e.stopPropagation()}>{right}</div>}
          {collapsible && (isCollapsed
            ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            : <ChevronUp className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          )}
        </div>
      </div>
      {!isCollapsed && <div className="px-4 py-3">{children}</div>}
    </div>
  );
}

// ── Key/Value row ─────────────────────────────────────────────────────────────
function KV({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-[#F4F2EE] last:border-0">
      <span className="text-[11px] text-gray-400 shrink-0 mr-3">{label}</span>
      <span className={cn('text-[12px] text-right', bold ? 'font-bold text-gray-900' : 'text-gray-700')}>
        {value}
      </span>
    </div>
  );
}

// ── Document row ──────────────────────────────────────────────────────────────
function DocRow({
  no, date, amount, status, children, onRenameNo,
}: {
  no: string; date?: string; amount?: string; status: string;
  children?: React.ReactNode;
  onRenameNo?: (newNo: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(no);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!onRenameNo || !draft.trim() || draft.trim() === no) { setEditing(false); return; }
    setSaving(true);
    try { await onRenameNo(draft.trim()); setEditing(false); }
    finally { setSaving(false); }
  }

  return (
    <div className="border-b border-[#F4F2EE] last:border-0 group">
      <div
        className="flex items-center gap-3 py-3 cursor-pointer active:bg-gray-50"
        onClick={() => { if (!editing) setOpen(o => !o); }}
      >
        <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
          <FileText className="h-3.5 w-3.5 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <input
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setDraft(no); setEditing(false); } }}
                className="flex-1 text-[12px] font-semibold bg-gray-100 rounded-lg px-2 py-0.5 outline-none border border-gray-300 focus:border-gray-400"
              />
              <button onClick={handleSave} disabled={saving} className="text-[10px] text-green-600 font-bold px-1.5 py-0.5 rounded hover:bg-green-50">✓</button>
              <button onClick={() => { setDraft(no); setEditing(false); }} className="text-[10px] text-gray-400 px-1.5 py-0.5 rounded hover:bg-gray-100">✕</button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[12px] text-gray-900 truncate">{no}</span>
              {onRenameNo && (
                <button
                  onClick={e => { e.stopPropagation(); setDraft(no); setEditing(true); setOpen(true); }}
                  className="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 text-gray-300 hover:text-gray-600 transition-opacity"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <DocStatusBadge status={status as any} />
            {date && <span className="text-[10px] text-gray-400">{date}</span>}
            {amount && <span className="text-[11px] font-bold text-brand-600">{amount}</span>}
          </div>
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
      </div>
      {open && children && (
        <div className="pb-3 flex flex-wrap gap-1.5 pl-11">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Partiler Kartı ────────────────────────────────────────────────────────────
const TRANSPORT_LABEL: Record<string, string> = {
  // Gerçek DB değerleri: truck | railway | sea (eski anahtarlar geriye dönük)
  truck: 'Kara (TIR)', railway: 'Demiryolu', sea: 'Gemi',
  road: 'TIR', rail: 'Vagon', air: 'Uçak', mixed: 'Karma',
};

function PartilerCard({
  file, writable, accent, onNewBatch, collapsed = false, onToggle,
}: {
  file: import('@/types/database').TradeFile;
  writable: boolean;
  accent: string;
  onNewBatch: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const navigate = useNavigate();
  const deleteFile = useDeleteTradeFileWithChoice();
  const batches = file.batches ?? [];
  const tUnit = file.product?.unit ?? 'MT'; // Ürün birimi: MT veya ADMT
  const [pendingDeleteBatch, setPendingDeleteBatch] = useState<typeof batches[number] | null>(null);

  function handleDeleteBatch(e: React.MouseEvent, batch: typeof batches[number]) {
    e.stopPropagation();
    setPendingDeleteBatch(batch);
  }
  if (batches.length === 0 && !writable) return null;

  const usedTon   = batches.filter(b => b.status !== 'cancelled').reduce((s, b) => s + batchDeliveredAdmt(b), 0);
  const totalTon  = file.tonnage_mt ?? 0;
  const pct       = totalTon > 0 ? Math.min(100, Math.round((usedTon / totalTon) * 100)) : 0;
  const remaining = Math.max(0, totalTon - usedTon);

  const STATUS_DOT: Record<string, string> = {
    request: 'bg-amber-400', sale: 'bg-blue-400',
    delivery: 'bg-violet-400', completed: 'bg-green-400', cancelled: 'bg-gray-300',
  };

  return (
    <>
    <div className="bg-white rounded-[20px] border border-[#ECECEC] shadow-[0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Header */}
      <div
        className={cn('px-6 py-4 border-b border-[#F4F2EE] flex items-center justify-between', onToggle ? 'cursor-pointer select-none' : '')}
        onClick={onToggle}
      >
        <div className="flex items-center gap-2.5">
          <Layers className="h-4 w-4 text-gray-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#8A8A8E]">Partiler</span>
          {batches.length > 0 && (
            <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              {batches.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {writable && (
            <button
              onClick={e => { e.stopPropagation(); onNewBatch(); }}
              disabled={remaining <= 0 && totalTon > 0}
              className="flex items-center gap-1.5 px-3 h-7 rounded-xl text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
              style={{ background: accent }}
            >
              <Plus className="h-3 w-3" /> Yeni Parti
            </button>
          )}
          {onToggle && (collapsed
            ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            : <ChevronUp className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Progress bar */}
          {totalTon > 0 && (
            <div className="px-6 py-3 border-b border-[#F4F2EE] bg-gray-50/40">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-gray-500">
                  Yüklenen: <strong className="text-gray-900">{usedTon.toLocaleString('tr-TR')} {tUnit}</strong>
                </span>
                <span className="text-[11px] font-semibold text-gray-500">
                  Kalan: <strong className={remaining > 0 ? 'text-amber-600' : 'text-green-600'}>
                    {remaining.toLocaleString('tr-TR')} {tUnit}
                  </strong>
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: pct === 100 ? '#16a34a' : accent }}
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1 text-right">{pct}% tamamlandı</p>
            </div>
          )}

          {/* Batch listesi */}
          {batches.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-gray-400">
              <Layers className="h-7 w-7 mb-1.5 opacity-20" />
              <p className="text-[12px] font-medium text-gray-400">Henüz parti yok</p>
              <p className="text-[11px] text-gray-300 mt-0.5">Yeni Parti butonu ile ekleyin</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {batches
                .slice()
                .sort((a, b) => (a.batch_no ?? 0) - (b.batch_no ?? 0))
                .map(b => (
                  <div
                    key={b.id}
                    className="group flex items-center gap-3 px-6 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    {/* Tıklanabilir alan */}
                    <button
                      onClick={() => navigate(`/files/${b.id}`)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white text-[11px] font-bold"
                        style={{ background: accent + 'dd' }}
                      >
                        P{b.batch_no}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-800">{b.file_no}</p>
                        <p className="text-[11px] text-gray-400">
                          {batchDeliveredAdmt(b) ? `${batchDeliveredAdmt(b).toLocaleString('tr-TR')} ${tUnit}` : '—'}
                          {b.transport_mode ? ` · ${TRANSPORT_LABEL[b.transport_mode] ?? b.transport_mode}` : ''}
                          {b.eta ? ` · ETA ${b.eta}` : ''}
                        </p>
                      </div>
                      <span className={cn('w-2 h-2 rounded-full shrink-0', STATUS_DOT[b.status] ?? 'bg-gray-300')} />
                    </button>
                    {/* Sil butonu — sadece writable modda, hover'da görünür */}
                    {writable && (
                      <button
                        onClick={(e) => handleDeleteBatch(e, b)}
                        disabled={deleteFile.isPending}
                        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                        title="Partiyi sil"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>

    {pendingDeleteBatch && (
      <DeleteTradeFileDialog
        open={!!pendingDeleteBatch}
        onClose={() => setPendingDeleteBatch(null)}
        file={pendingDeleteBatch as unknown as import('@/types/database').TradeFile}
        onConfirm={async (keepDocuments) => {
          await deleteFile.mutateAsync({ id: pendingDeleteBatch.id, keepDocuments });
          setPendingDeleteBatch(null);
        }}
        isDeleting={deleteFile.isPending}
      />
    )}
  </>
  );
}

/** Dosya no'yu URL-dostu okunakli slug'a çevirir: "GLZ-11 26-07 DOMTAR/P1" → "glz-11-26-07-domtar-p1" */
function slugifyFileNo(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // aksanları at
    .replace(/[^a-z0-9]+/g, '-')                       // harf/rakam dışı → tire
    .replace(/^-+|-+$/g, '')                            // baş/son tireleri kırp
    .slice(0, 60);
}

/** Gider tutarı: kendi para biriminde göster; USD değilse altında USD karşılığını küçük yaz. */
function TxnAmount({ txn, className }: { txn: Transaction; className?: string }) {
  const ccy = (txn.currency ?? 'USD') as CurrencyCode;
  if (ccy === 'USD' || !txn.currency) {
    return <span className={className}>{fUSD(txn.amount_usd ?? txn.amount)}</span>;
  }
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className={className}>{fCurrency(txn.amount, ccy)}</span>
      {txn.amount_usd != null && (
        <span className="text-[10px] font-medium text-gray-400">≈ {fUSD(txn.amount_usd)}</span>
      )}
    </span>
  );
}

/**
 * Finansal özet — dosyaya bağlı faturalanan satış, maliyet, brüt kâr ve ödeme durumu.
 * Hepsi USD ve fatura bazlı (transactions.amount_usd): para birimleri karışmaz,
 * Mali Raporlar'daki fatura-bazlı kâr mantığıyla tutarlıdır.
 */
function FinancialSummary({ saleTxns, costTxns, expectedSale }: {
  saleTxns: Transaction[];
  costTxns: Transaction[];
  /** Henüz satış faturası yokken bilgi olarak gösterilen beklenen satış (satış para biriminde) */
  expectedSale: string | null;
}) {
  const sum = (arr: Transaction[], k: 'amount_usd' | 'paid_amount_usd') =>
    arr.reduce((s, t) => s + (Number(t[k]) || 0), 0);

  const revenue   = sum(saleTxns, 'amount_usd');
  const collected = sum(saleTxns, 'paid_amount_usd');
  const cost      = sum(costTxns, 'amount_usd');
  const paid      = sum(costTxns, 'paid_amount_usd');

  const hasSale = saleTxns.length > 0 && revenue > 0;
  const hasCost = costTxns.length > 0 && cost > 0;
  const profit  = revenue - cost;
  const margin  = hasSale ? (profit / revenue) * 100 : 0;
  const profitColor = profit > 0 ? 'text-green-700' : profit < 0 ? 'text-red-600' : 'text-gray-900';

  const Tile = ({ label, value, sub, valueClass }: { label: string; value: string; sub?: React.ReactNode; valueClass?: string }) => (
    <div className="px-5 py-4">
      <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">{label}</div>
      <div className={cn('text-[18px] font-extrabold leading-tight', valueClass ?? 'text-gray-900')}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-1 leading-snug">{sub}</div>}
    </div>
  );

  return (
    <div className="bg-white rounded-[20px] border border-[#ECECEC] shadow-[0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="px-6 py-3.5 border-b border-[#F4F2EE] flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-widest text-[#8A8A8E]">Finansal Özet</span>
        <span className="text-[10px] text-gray-400">USD · faturalanan</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#F4F2EE]">
        <Tile
          label="Satış"
          value={hasSale ? fUSD(revenue) : '—'}
          sub={hasSale
            ? <>Tahsil: <span className="text-green-700 font-semibold">{fUSD(collected)}</span> · Kalan: <span className={cn('font-semibold', revenue - collected > 0.005 ? 'text-amber-700' : 'text-gray-500')}>{fUSD(Math.max(0, revenue - collected))}</span></>
            : <>Satış faturası yok{expectedSale ? <> · Beklenen: {expectedSale}</> : null}</>}
        />
        <Tile
          label="Maliyet"
          value={hasCost ? fUSD(cost) : '—'}
          sub={hasCost
            ? <>Ödenen: <span className="text-green-700 font-semibold">{fUSD(paid)}</span> · Kalan: <span className={cn('font-semibold', cost - paid > 0.005 ? 'text-amber-700' : 'text-gray-500')}>{fUSD(Math.max(0, cost - paid))}</span></>
            : 'Alış/hizmet faturası yok'}
        />
        <Tile
          label="Brüt Kâr"
          value={hasSale && hasCost ? fUSD(profit) : '—'}
          valueClass={hasSale && hasCost ? profitColor : undefined}
          sub={hasSale && hasCost
            ? `%${margin.toFixed(1)} marj`
            : 'Satış ve maliyet faturası girilince hesaplanır'}
        />
      </div>
    </div>
  );
}

/** Partinin gerçek teslim ADMT'si: delivered_admt girildiyse onu, yoksa planlanan tonnage_mt.
 *  (P1 planı 201.000 olsa da gerçek teslim 201.942 ise 201.942 kullanılır.) */
function batchDeliveredAdmt(b: { delivered_admt?: number | null; tonnage_mt?: number | null }): number {
  return b.delivered_admt && b.delivered_admt > 0 ? b.delivered_admt : (b.tonnage_mt ?? 0);
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function TradeFileDetailPage() {
  const { t } = useTranslation('tradeFiles');
  const { t: tc } = useTranslation('common');

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const writable = canWrite(profile?.role);
  // URL okunakli slug taşıyabilir: "glz-11-26-07-domtar-p1--<uuid>" → gerçek id son parça
  const fileId = id?.split('--').pop() || id;
  const { data: file, isLoading } = useTradeFile(fileId);
  // Batch dosyalar için ana dosyayı fetch et (satış detaylarını senkronize edebilmek için)
  const { data: parentFile } = useTradeFile(file?.parent_file_id ?? undefined);

  // Adres çubuğunu okunakli yap: /files/<uuid> → /files/<dosya-no-slug>--<uuid>
  useEffect(() => {
    if (!file?.file_no || !file.id) return;
    const pretty = `${slugifyFileNo(file.file_no)}--${file.id}`;
    if (id !== pretty) navigate(`/files/${pretty}`, { replace: true });
  }, [file?.id, file?.file_no, id, navigate]);
  const updateSaleDetails = useUpdateSaleDetails();
  const { data: settings } = useSettings();
  const { data: bankAccounts } = useBankAccounts();
  const changeStatus = useChangeStatus();
  const deleteInv = useDeleteInvoice();
  const deletePL = useDeletePackingList();
  const deletePI = useDeleteProforma();
  const defaultBank = bankAccounts?.find(b => b.is_default) ?? bankAccounts?.[0] ?? null;
  // İlk render'da sadece bu dosyanın ID'si ile işlemleri hemen başlat (waterfall önleme)
  // Parti ID'leri gelince query key değişir → React Query otomatik genişletir
  const batchIds = (file?.batches ?? []).map(b => b.id).filter((x): x is string => !!x);
  // Gerçek UUID (fileId) — route param `id` slug taşıyabilir ("glz-...--<uuid>"),
  // trade_file_id sorgusunda kullanılırsa hiçbir işlem eşleşmez.
  const allFileIds = batchIds.length > 0 ? [fileId!, ...batchIds] : [fileId!];
  const { data: fileTxns = [] } = useTransactions({ tradeFileIds: allFileIds });
  const { accent } = useTheme();

  const [saleOpen, setSaleOpen] = useState(false);
  const [editSaleOpen, setEditSaleOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [editFileOpen, setEditFileOpen] = useState(false);
  const [batchDocsOpen, setBatchDocsOpen] = useState(false);
  const [batchDocsType, setBatchDocsType] = useState<'invoice' | 'packing_list'>('invoice');
  const [purchaseInvOpen, setPurchaseInvOpen] = useState(false);
  const [svcInvOpen, setSvcInvOpen] = useState(false);
  const [batchSelectorOpen, setBatchSelectorOpen] = useState<'purchase' | 'svc' | null>(null);
  const [revertConfirm, setRevertConfirm] = useState(false);
  const [selectedBatchFileId, setSelectedBatchFileId] = useState<string | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [proformaOpen, setProformaOpen] = useState(false);
  const [packingOpen, setPackingOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [editSaleInvoice, setEditSaleInvoice] = useState<Invoice | null>(null);
  const [saleInvoiceOpen, setSaleInvoiceOpen] = useState(false);
  const [editPL, setEditPL] = useState<PackingList | null>(null);
  const [editPI, setEditPI] = useState<Proforma | null>(null);
  const [autoPackingAfterDelivery, setAutoPackingAfterDelivery] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [delayOpen, setDelayOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleCard = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  const [delayEta, setDelayEta] = useState('');
  const [delayNotes, setDelayNotes] = useState('');
  const noteDelay = useNoteDelay();
  const [completionBlockerOpen, setCompletionBlockerOpen] = useState(false);
  const [dropboxLoading, setDropboxLoading] = useState(false);
  const [dropboxUploadingId, setDropboxUploadingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [editingFileNo, setEditingFileNo] = useState(false);
  const [fileNoInput, setFileNoInput] = useState('');
  const tUnit = file?.product?.unit ?? 'MT'; // Ürün birimi: MT veya ADMT

  async function handleSaveFileNo() {
    if (!fileNoInput.trim() || !file) return;
    try {
      await tradeFileService.updateFileNo(file.id, fileNoInput.trim());
      queryClient.invalidateQueries({ queryKey: tradeFileKeys.detail(file.id) });
      queryClient.invalidateQueries({ queryKey: tradeFileKeys.all });
      setEditingFileNo(false);
      toast.success('Dosya numarası güncellendi');
    } catch {
      toast.error('Güncelleme başarısız');
    }
  }

  // ── Belge numarası yeniden adlandırma ──────────────────────────────────────
  function makeInvoiceRename(id: string) {
    return async (newNo: string) => {
      await invoiceService.updateNo(id, newNo);
      queryClient.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success('Fatura numarası güncellendi');
    };
  }
  function makePLRename(id: string) {
    return async (newNo: string) => {
      await packingListService.updateNo(id, newNo);
      queryClient.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success('Ambalaj listesi numarası güncellendi');
    };
  }
  function makeProformaRename(id: string) {
    return async (newNo: string) => {
      await proformaService.updateNo(id, newNo);
      queryClient.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success('Proforma numarası güncellendi');
    };
  }

  const handleOpenDropbox = useCallback(async () => {
    if (!file) return;
    setDropboxLoading(true);
    try {
      // Klasör URL'i DB'de kayıtlıysa direkt aç — Dropbox API çağrısı yapma
      if (file.dropbox_folder_url) {
        window.open(file.dropbox_folder_url, '_blank');
        return;
      }
      // Klasör henüz yok → oluştur ve kaydet
      const customerName = file.customer?.name ?? 'Unknown';
      const res = await dropboxService.createTradeFolder(customerName, file.file_no);
      const folderPath = res.folderPath as string;
      const folderUrl  = res.folderUrl  as string;
      await dropboxService.saveFolderToDb(file.id, folderPath, folderUrl);
      queryClient.invalidateQueries({ queryKey: tradeFileKeys.detail(file.id) });
      window.open(folderUrl, '_blank');
    } catch (e) {
      const { toast } = await import('sonner');
      toast.error('Dropbox klasörü açılamadı: ' + (e as Error).message);
    } finally {
      setDropboxLoading(false);
    }
  }, [file, queryClient]);

  const handleUploadToDropbox = useCallback(async (docId: string, docName: string, html: string) => {
    if (!file) return;
    setDropboxUploadingId(docId);
    try {
      const { toast } = await import('sonner');
      const upRes = await dropboxService.uploadDocument(
        file.customer?.name ?? 'Unknown',
        dropboxFileNo,
        docName,
        html,
      );
      const viewLink = upRes.viewLink as string | undefined;
      const folderPath = upRes.folderPath as string | undefined;
      const folderUrl = upRes.folderUrl as string | undefined;
      // Klasör henüz DB'ye kaydedilmemişse kaydet
      if (!file.dropbox_folder_url && folderPath && folderUrl) {
        await dropboxService.saveFolderToDb(file.id, folderPath, folderUrl);
      }
      toast.success('Dropbox\'a yüklendi', {
        action: { label: 'Aç', onClick: () => window.open(viewLink, '_blank') },
      });
    } catch (e) {
      const { toast } = await import('sonner');
      toast.error('Dropbox yükleme hatası: ' + (e as Error).message);
    } finally {
      setDropboxUploadingId(null);
    }
  }, [file]);

  // Auto-create Dropbox folder when file loads without one.
  // Sadece yazma yetkisi olan kullanıcı ve iptal edilmemiş dosya için — salt-okunur bir
  // kullanıcı sayfayı açarak Dropbox'ta klasör / DB'de kayıt oluşturmamalı.
  useEffect(() => {
    if (!file || file.dropbox_folder_url || !writable || file.status === 'cancelled') return;
    const customerName = file.customer?.name;
    if (!customerName) return;

    dropboxService.createTradeFolder(customerName, file.file_no.replace(/\//g, '-'))
      .then(async (res) => {
        const folderPath = res.folderPath as string;
        const folderUrl = res.folderUrl as string;
        await dropboxService.saveFolderToDb(file.id, folderPath, folderUrl);
        queryClient.invalidateQueries({ queryKey: tradeFileKeys.detail(file.id) });
        queryClient.invalidateQueries({ queryKey: tradeFileKeys.lists() });
      })
      .catch(() => {
        // Dropbox bağlı değilse veya hata olursa sessizce geç
      });
  }, [file?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for Dropbox upload requests from print preview popups
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      if (event.data?.type !== 'DROPBOX_UPLOAD_PDF') return;
      const { pageHtml, customerName, fileNo, documentName } = event.data as {
        pageHtml: string; customerName: string; fileNo: string; documentName: string;
      };
      const src = event.source as Window | null;
      try {
        const { toast } = await import('sonner');
        toast.loading('Dropbox\'a yükleniyor…', { id: 'dbx-upload' });
        await dropboxService.uploadDocument(customerName, fileNo, documentName, pageHtml);
        toast.success('Dropbox\'a yüklendi', { id: 'dbx-upload' });
        src?.postMessage({ type: 'DROPBOX_UPLOAD_DONE' }, '*');
      } catch (err) {
        const { toast } = await import('sonner');
        toast.error('Dropbox hatası: ' + (err as Error).message, { id: 'dbx-upload' });
        src?.postMessage({ type: 'DROPBOX_UPLOAD_ERROR', error: (err as Error).message }, '*');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (isLoading) return <LoadingSpinner />;
  if (!file) return <div className="text-center py-12 text-gray-400 text-sm">{t('detail.fileNotFound')}</div>;

  // Belge oluşturma kapıları:
  //  - Ticari Fatura / Packing List: satıştan itibaren, TAMAMLANDI dahil (eksik belge uyarısı
  //    çıkınca dosyayı geri almadan eklenebilsin).
  //  - Proforma: satış öncesi de normal bir belge (talep aşamasından itibaren), iptal hariç.
  const canCreateDocs = file.status === 'sale' || file.status === 'delivery' || file.status === 'completed';
  const meta = STATUS_META[file.status] ?? STATUS_META.request;
  const expenses = fileTxns.filter(t => ['purchase_inv', 'svc_inv'].includes(t.transaction_type));
  // Satış detayı var mı? selling_price 0 olabilir, bu yüzden != null kontrolü
  const hasSaleDetails = !!(file.supplier_id || file.selling_price != null || file.incoterms || file.payment_terms || file.port_of_discharge);

  // ── Parti / kısmi sevkiyat hesaplamaları ────────────────────────────────────
  const isBatch    = !!file.parent_file_id;                          // bu dosya bir alt parti mi?
  const isPartial  = !isBatch && (file.batches?.length ?? 0) > 0;   // ana dosyada parti var mı?
  const canCreateProforma = file.status !== 'cancelled' && !isPartial && !isBatch;
  // Partiler kartı: parti varsa her zaman; parti yokken sadece satış aşamasında ve yazma yetkisiyle
  // ('Yeni Parti' kısmi sevkiyat girişi — daha önce sadece Teslimat formundaki gizli seçenekti).
  const showPartilerCard = !isBatch && ((file.batches?.length ?? 0) > 0 || (writable && file.status === 'sale'));
  const hasDocs = (file.proformas?.length ?? 0) > 0 || (file.invoices?.length ?? 0) > 0 || (file.packing_lists?.length ?? 0) > 0;
  // "+ Belge Ekle" menüsü: yazma yetkisi varsa, o an oluşturulabilir belgeler
  const docMenuItems: { label: string; onClick: () => void }[] = writable ? [
    ...(canCreateProforma ? [{ label: t('detail.actions.proformaInvoice'), onClick: () => { setEditPI(null); setProformaOpen(true); } }] : []),
    ...(canCreateDocs && !isPartial ? [
      { label: t('detail.actions.commercialInvoice'), onClick: () => { setEditInvoice(null); setInvoiceOpen(true); } },
      { label: t('detail.actions.packingList'), onClick: () => { setEditPL(null); setPackingOpen(true); } },
    ] : []),
  ] : [];
  // Dropbox klasör adı olarak file_no'yu kullan (edge function "/" → nested folder yapıyor)
  const dropboxFileNo = file.file_no;
  // Kalan tonaj: tüm parti tonajları ana dosyadan düşülür
  // Tamamlandı butonu: tüm partiler completed olmalı (kalan tonaj fark etmez — gerçek teslimatta sapma olabilir)
  // İptal edilen partiler sayılmaz — aksi halde tek bir iptal parti ana dosyanın
  // tamamlanmasını sonsuza dek engeller.
  const activeBatches = (file.batches ?? []).filter(b => b.status !== 'cancelled');
  const allBatchesDone = isPartial
    && activeBatches.length > 0
    && activeBatches.every(b => b.status === 'completed');
  // Batch file_no = "ANA/P1" → ana dosya no = "ANA"
  const parentFileNo = isBatch ? file.file_no.split('/').slice(0, -1).join('/') : null;
  // Teslim edilen: partili dosyada iptal edilmemiş TÜM partilerin tonnage toplamı
  // (her parti bir sevkiyat) — Yüklenen ile aynı; değilse dosyanın delivered_admt'i
  const deliveredTonnage = isPartial
    ? (file.batches ?? [])
        .filter(b => b.status !== 'cancelled')
        .reduce((s, b) => s + batchDeliveredAdmt(b), 0)
    : (file.delivered_admt ?? null);

  // Teslimat bloğunda gösterilecek ADMT: partili dosyada TÜM partilerin toplam
  // tonajı (gerçek teslim edilen), değilse dosyanın delivered_admt / tonaj değeri
  // İptal edilen partiler dışlanır — deliveredTonnage ("Teslim Edilen") ile aynı kural,
  // aksi halde iki kartta farklı ADMT görünür.
  const batchesTonnage = (file.batches ?? [])
    .filter(b => b.status !== 'cancelled')
    .reduce((s, b) => s + batchDeliveredAdmt(b), 0);
  const deliveryAdmt = isPartial && batchesTonnage > 0
    ? batchesTonnage
    : (file.delivered_admt ?? file.tonnage_mt ?? 0);

  // Çoklu tedarikçi → tonaj ağırlıklı ortalama alış fiyatı; tekli → file.purchase_price
  const supplierLines = file.suppliers ?? [];
  const weightedPurchase = (() => {
    if (supplierLines.length <= 1) return file.purchase_price ?? 0;
    const totalQty = supplierLines.reduce((s, x) => s + (x.quantity_mt ?? 0), 0);
    if (totalQty <= 0) return file.purchase_price ?? 0;
    // Karışık kurlu tedarikçilerde fx_rate ile temel para birimine çevir (ToSaleModal ile tutarlı)
    const base = file.purchase_currency ?? file.currency ?? 'USD';
    const sum = supplierLines.reduce((s, x) => {
      const fx = x.currency === base ? 1 : (x.fx_rate ?? 0);
      return s + (x.quantity_mt ?? 0) * (x.purchase_price ?? 0) * fx;
    }, 0);
    return sum / totalQty;
  })();

  // Fiyat gösterimlerinde doğru para birimi — satış → sale_currency, alış → purchase_currency
  const saleCcy     = (file.sale_currency ?? file.currency ?? 'USD') as CurrencyCode;
  const purchaseCcy = (file.purchase_currency ?? file.currency ?? 'USD') as CurrencyCode;

  // Satış detaylarında kayıtlı ama daha önce gösterilmeyen alanlar
  const freightCcy = (file.freight_currency ?? file.sale_currency ?? file.currency ?? 'USD') as CurrencyCode;
  const extraSaleRows: { label: string; value: string }[] = [
    ...(file.transport_mode ? [{ label: 'Taşıma', value: TRANSPORT_LABEL[file.transport_mode] ?? file.transport_mode }] : []),
    ...((file.freight_cost ?? 0) > 0 ? [{ label: 'Navlun', value: fCurrency(file.freight_cost, freightCcy) }] : []),
    ...((file.advance_rate ?? 0) > 0 ? [{ label: 'Avans', value: `%${file.advance_rate}` }] : []),
  ];

  // Finansal özet (satış → teslimat → tamamlandı). Fatura bazlı, USD.
  const showFinancials = ['sale', 'delivery', 'completed'].includes(file.status);
  const financialSummary = showFinancials ? (
    <FinancialSummary
      saleTxns={fileTxns.filter(t => t.transaction_type === 'sale_inv')}
      costTxns={fileTxns.filter(t => ['purchase_inv', 'svc_inv'].includes(t.transaction_type))}
      expectedSale={file.selling_price && deliveryAdmt > 0 ? fCurrency(file.selling_price * deliveryAdmt, saleCcy) : null}
    />
  ) : null;

  async function handleSyncFromParent() {
    if (!parentFile || !file) { toast.error('Ana dosya yüklenemedi'); return; }
    try {
      await updateSaleDetails.mutateAsync({
        id: file.id,
        data: {
          supplier_id:           parentFile.supplier_id ?? '',
          selling_price:         parentFile.selling_price ?? 0,
          purchase_price:        parentFile.purchase_price ?? 0,
          freight_cost:          parentFile.freight_cost ?? 0,
          freight_currency:      (parentFile.freight_currency ?? parentFile.sale_currency ?? parentFile.currency ?? 'USD') as 'USD' | 'EUR' | 'TRY' | 'AED' | 'GBP',
          port_of_loading:       parentFile.port_of_loading ?? '',
          port_of_discharge:     parentFile.port_of_discharge ?? '',
          incoterms:             parentFile.incoterms ?? '',
          purchase_currency:     (parentFile.purchase_currency ?? parentFile.currency ?? 'USD') as 'USD' | 'EUR' | 'TRY',
          sale_currency:         (parentFile.sale_currency ?? parentFile.currency ?? 'USD') as 'USD' | 'EUR' | 'TRY',
          payment_terms:         parentFile.payment_terms ?? '',
          advance_rate:          parentFile.advance_rate ?? 0,
          purchase_advance_rate: parentFile.purchase_advance_rate ?? 0,
          transport_mode:        (parentFile.transport_mode ?? 'truck') as 'truck' | 'railway' | 'sea',
          eta:                   parentFile.eta ?? '',
          vessel_name:           parentFile.vessel_name ?? '',
          proforma_ref:          parentFile.proforma_ref ?? '',
          register_no:           parentFile.register_no ?? '',
        },
      });
      toast.success('Satış detayları ana dosyadan kopyalandı');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // ── Tamamlandı belge kontrolleri ─────────────────────────────────────────────
  const completionChecks = (() => {
    if (!file) return null;
    const qty = file.delivered_admt ?? file.tonnage_mt ?? 0;
    const expectedPurchase = (file.purchase_price ?? 0) * qty;
    const expectedSale     = (file.selling_price  ?? 0) * qty;

    const purchaseInvs = fileTxns.filter(t => t.transaction_type === 'purchase_inv');
    const saleInvs     = fileTxns.filter(t => t.transaction_type === 'sale_inv');

    const purchaseTotal = purchaseInvs.reduce((s, t) => s + (t.amount_usd ?? t.amount ?? 0), 0);
    const saleTotal     = saleInvs.reduce((s, t) => s + (t.amount_usd ?? t.amount ?? 0), 0);

    // Faturalar USD (amount_usd) tutuluyor; beklenen tutar ise dosyanın kendi para biriminde
    // (fiyat × miktar). EUR/TRY dosyada ikisini doğrudan karşılaştırmak yanlış sonuç verir →
    // beklenen tutarı, o para biriminde kesilmiş faturanın dondurulmuş kuruyla USD'ye çevir.
    // (exchange_rate: 1 USD = kaç currency.) Eşleşen fatura yoksa eski davranış (çevirmeden).
    const expectedInUsd = (expected: number, ccy: string, txns: typeof fileTxns) => {
      if (ccy === 'USD' || expected === 0) return expected;
      const rate = txns.find(t => t.currency === ccy && Number(t.exchange_rate) > 0)?.exchange_rate;
      return rate ? expected / Number(rate) : expected;
    };
    const expectedPurchaseUsd = expectedInUsd(expectedPurchase, purchaseCcy, purchaseInvs);
    const expectedSaleUsd     = expectedInUsd(expectedSale, saleCcy, saleInvs);

    // Alt partilerde satın alma/satış faturası ve proforma zorunlu değil
    const purchaseCovered = isBatch ? true :
      purchaseInvs.length > 0 && (expectedPurchaseUsd === 0 || purchaseTotal >= expectedPurchaseUsd * 0.85);
    const saleCovered     = isBatch ? true :
      saleInvs.length > 0     && (expectedSaleUsd     === 0 || saleTotal     >= expectedSaleUsd     * 0.85);

    const hasProforma     = (isBatch || isPartial) ? true : (file.proformas?.length ?? 0) > 0;

    // Ana dosya (isPartial) için: kendi belgesi varsa OK,
    // yoksa herhangi bir alt partide varsa da OK
    const ownPackingList  = (file.packing_lists?.length ?? 0) > 0;
    const ownCommInvoice  = (file.invoices?.filter(i => i.invoice_type === 'commercial').length ?? 0) > 0;
    const batchPackingList = isPartial
      ? (file.batches ?? []).some(b => (b.packing_lists?.length ?? 0) > 0)
      : false;
    const batchCommInvoice = isPartial
      ? (file.batches ?? []).some(b => (b.invoices ?? []).some(i => i.invoice_type === 'commercial'))
      : false;

    const hasPackingList  = ownPackingList  || batchPackingList;
    const hasCommInvoice  = ownCommInvoice  || batchCommInvoice;

    return { purchaseCovered, saleCovered, hasProforma, hasPackingList, hasCommInvoice };
  })();

  // Banner: "Tamamlandı" ama belgeler eksik → uyarı + geri al butonu
  const completedWithMissingDocs =
    file.status === 'completed' &&
    completionChecks &&
    !Object.values(completionChecks).every(Boolean);

  type CheckKey = 'purchaseCovered' | 'saleCovered' | 'hasProforma' | 'hasPackingList' | 'hasCommInvoice';
  const CHECKS_LABELS: { key: CheckKey; label: string }[] = [
    { key: 'purchaseCovered', label: 'Satın Alma Faturası' },
    { key: 'saleCovered',     label: 'Satış Faturası' },

    { key: 'hasProforma',     label: 'Proforma Fatura' },
    { key: 'hasPackingList',  label: 'Ambalaj Listesi' },
    { key: 'hasCommInvoice',  label: 'Ticari Fatura' },
  ] as const;

  // ── "Sıradaki adım" şeridi ─────────────────────────────────────────────────
  // Durum + belge kontrollerinden tek satırlık yönlendirme. Tamamlandı'da zaten uyarı bandı var.
  const nextStep = (() => {
    if (file.status === 'cancelled' || file.status === 'completed') return null;
    if (file.status === 'request') {
      return { text: 'Sıradaki: satış bilgilerini girip dosyayı satışa çevir', chips: [] as string[], ok: false };
    }
    const missing = completionChecks ? CHECKS_LABELS.filter(c => !completionChecks[c.key]).map(c => c.label) : [];
    if (file.status === 'sale') {
      if (isPartial) {
        if (activeBatches.length === 0) {
          return { text: 'Sıradaki: ilk teslimat partisini ekle', chips: [] as string[], ok: false };
        }
        const pending = activeBatches
          .filter(b => b.status !== 'completed')
          .sort((a, b) => (a.batch_no ?? 0) - (b.batch_no ?? 0))
          .map(b => `P${b.batch_no}`);
        if (pending.length > 0) {
          return { text: `Sıradaki: ${pending.length} parti teslim bekliyor`, chips: pending, ok: false, noClick: true };
        }
        // tüm partiler tamam → aşağıdaki eksik belge mantığına düş
      } else {
        return { text: 'Sıradaki: teslimat bilgisini gir (ADMT, B/L, SEPTİ)', chips: [] as string[], ok: false };
      }
    }
    return missing.length > 0
      ? { text: 'Tamamlamak için eksik:', chips: missing, ok: false }
      : { text: file.status === 'sale' ? 'Partiler tamam — "Tamamlandı" ile kapatabilirsin' : 'Her şey hazır — "Teslimatı Tamamla" ile kapatabilirsin', chips: [] as string[], ok: true };
  })();

  const nextStepStrip = nextStep ? (
    <div className={cn(
      'flex flex-wrap items-center gap-2 rounded-xl border px-3.5 py-2 text-[12px]',
      nextStep.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-[#ECECEC] bg-white text-gray-600',
    )}>
      <span className="font-semibold">{nextStep.text}</span>
      {nextStep.chips.map(c => (
        <button
          key={c}
          type="button"
          disabled={'noClick' in nextStep}
          onClick={() => setCompletionBlockerOpen(true)}
          className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-semibold border border-amber-100 enabled:hover:bg-amber-100 transition-colors"
        >
          {c}
        </button>
      ))}
    </div>
  ) : null;

  const docWarningBanner = completedWithMissingDocs && completionChecks ? (
    <div className="bg-white rounded-[20px] border border-[#ECECEC] shadow-[0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-[#F4F2EE] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Eksik Belgeler Tespit Edildi</span>
        </div>
        {writable && (
          revertConfirm ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-gray-500">Emin misin?</span>
              <button
                onClick={async () => {
                  setRevertConfirm(false);
                  try {
                    await changeStatus.mutateAsync({ id: file!.id, status: 'delivery' });
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    console.error('[revert-to-delivery]', e);
                    toast.error(msg || 'Durum güncellenemedi');
                  }
                }}
                disabled={changeStatus.isPending}
                className="px-3 py-1.5 rounded-xl text-[11px] font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {changeStatus.isPending ? '…' : 'Evet, Geri Al'}
              </button>
              <button
                onClick={() => setRevertConfirm(false)}
                className="px-3 py-1.5 rounded-xl text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                İptal
              </button>
            </div>
          ) : (
            <button
              onClick={() => setRevertConfirm(true)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Teslimat'a Geri Al
            </button>
          )
        )}
      </div>
      {/* Badge list */}
      <div className="px-5 py-3 flex flex-wrap gap-2">
        {CHECKS_LABELS.map(({ key, label }) => (
          <span
            key={key}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold',
              completionChecks[key]
                ? 'bg-gray-100 text-gray-400'
                : 'bg-red-50 text-red-500',
            )}
          >
            {completionChecks[key] ? '✓' : '✗'} {label}
          </span>
        ))}
      </div>
    </div>
  ) : null;

  function checkAndComplete() {
    if (!completionChecks) return;
    const { purchaseCovered, saleCovered, hasProforma, hasPackingList, hasCommInvoice } = completionChecks;
    const allOk = purchaseCovered && saleCovered && hasProforma && hasPackingList && hasCommInvoice;
    if (allOk) {
      changeStatus.mutate({ id: file!.id, status: 'completed' });
    } else {
      setCompletionBlockerOpen(true);
    }
  }

  function handlePartialCTA() {
    if (allBatchesDone) {
      checkAndComplete();
    } else {
      const pending = activeBatches
        .filter(b => b.status !== 'completed')
        .sort((a, b) => (a.batch_no ?? 0) - (b.batch_no ?? 0));
      if (activeBatches.length === 0) {
        toast.warning('Henüz parti eklenmedi — en az bir teslimat partisi ekleyin');
      } else {
        const names = pending.map(b => `P${b.batch_no}`).join(', ');
        toast.warning(`${pending.length} parti henüz tamamlanmadı: ${names}`, {
          action: { label: `P${pending[0].batch_no}'e git`, onClick: () => navigate(`/files/${pending[0].id}`) },
          duration: 8000,
        });
      }
    }
  }


  // ── Status stepper ─────────────────────────────────────────────────────────
  // Batch dosyalar için 3 adımlı stepper (request adımı yok); ana dosyalar için 4 adımlı standart
  const STAGES = isBatch
    ? [
        { key: 'sale',      label: 'Belgeler' },
        { key: 'delivery',  label: 'Teslimat' },
        { key: 'completed', label: 'Tamamlandı' },
      ]
    : [
        { key: 'request',   label: 'Talep' },
        { key: 'sale',      label: 'Satış' },
        { key: 'delivery',  label: 'Teslimat' },
        { key: 'documents', label: 'Belgeler' },
        { key: 'completed', label: 'Tamamlandı' },
      ];
  const isCancelled = file.status === 'cancelled';
  const currentStageIdx = isCancelled ? -1 : STAGES.findIndex(s => s.key === file.status);


  const statusStepper = (
    <div className="bg-white rounded-[20px] border border-[#ECECEC] shadow-[0_8px_24px_rgba(0,0,0,0.04)] px-4 py-3">
      {isCancelled ? (
        <div className="flex items-center gap-2 text-red-500">
          <X className="h-3.5 w-3.5" />
          <span className="text-[11px] font-bold uppercase tracking-wider">İptal Edildi</span>
        </div>
      ) : (
        <div className="flex items-center gap-0">
          {STAGES.map((stage, idx) => {
            const isDone   = currentStageIdx > idx;
            // Tamamlandı statüsünde son adım (completed) da tik almalı
            const isActive = currentStageIdx === idx && file.status !== 'completed';
            const isCompleted = currentStageIdx === idx && file.status === 'completed';

            // ── Belgeler pseudo-step özel mantık ─────────────────────────────
            const isDocStage = stage.key === 'documents';
            const allDocsDone = completionChecks
              ? Object.values(completionChecks).every(Boolean)
              : false;
            const docReady   = isDocStage && !isDone && !isCompleted && file.status === 'delivery' && allDocsDone;
            const docWarning = isDocStage && !allDocsDone && (
              (!isDone && !isCompleted && ['delivery', 'sale'].includes(file.status)) ||
              (file.status === 'completed')
            );
            // Tik gösterilecek mi?
            const showCheck = isDone || isCompleted || docReady;
            // Kenarlık+beyaz stil mi? (isDone veya isCompleted ama docWarning değil)
            const showOutline = showCheck && !docReady && !docWarning;

            return (
              <div key={stage.key} className="flex items-center flex-1 last:flex-none">
                {/* circle + label */}
                <div
                  className={cn('flex flex-col items-center gap-1.5 shrink-0', isDocStage && !isDone && !isCompleted ? 'cursor-pointer' : '')}
                  onClick={isDocStage && !isDone && !isCompleted ? () => setCompletionBlockerOpen(true) : undefined}
                  title={isDocStage && !isDone && !isCompleted ? 'Belge durumunu görmek için tıkla' : undefined}
                >
                  <div
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300',
                      showOutline  ? 'bg-white border-2' : '',
                      isActive     ? 'text-white ring-[3px] ring-offset-1' : '',
                      docReady     ? 'text-white' : '',
                      docWarning   ? 'text-white' : '',
                      showCheck && !showOutline && !docWarning ? 'text-white' : '',
                      !showCheck && !isActive && !docReady && !docWarning ? 'bg-gray-100 text-gray-300' : '',
                    )}
                    style={{
                      // Outline stil: beyaz arka plan, kırmızı kenarlık, kırmızı tik
                      ...(showOutline ? { borderColor: accent, color: accent } : {}),
                      // Aktif: dolu kırmızı
                      ...(isActive ? { background: accent, '--tw-ring-color': accent + '40' } as React.CSSProperties : {}),
                      // docReady: dolu yeşil
                      ...(docReady ? { background: '#16a34a' } : {}),
                      // docWarning: dolu amber
                      ...(docWarning ? { background: '#d97706' } : {}),
                    }}
                  >
                    {showCheck && !docWarning ? (
                      // Kırmızı tik (outline için) veya beyaz tik (diğerleri için)
                      <svg
                        className="h-3 w-3"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        style={showOutline ? { color: accent } : { color: '#fff' }}
                      >
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : docWarning ? (
                      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <span className="text-[9px] font-black">{idx + 1}</span>
                    )}
                  </div>
                  <span className={cn(
                    'text-[9px] font-bold uppercase tracking-wider whitespace-nowrap',
                    showOutline                            ? 'text-gray-400' : '',
                    isActive                               ? 'text-gray-700' : '',
                    docReady                               ? 'text-green-600' : '',
                    docWarning                             ? 'text-amber-600' : '',
                    !showCheck && !isActive && !docReady && !docWarning ? 'text-gray-300' : '',
                  )}>{stage.label}</span>
                </div>
                {/* connector */}
                {idx < STAGES.length - 1 && (
                  <div
                    className="flex-1 h-px mx-2 mb-4 rounded-full transition-all duration-500"
                    style={{ background: (isDone || isCompleted) ? accent + '50' : '#e5e7eb' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  function handleStatusChange(newStatus: string) {
    if (!newStatus || newStatus === file!.status) return;
    if (newStatus === 'cancelled') {
      setCancelReasonText('');
      setCancelModalOpen(true);
      return;
    }
    if (newStatus === 'completed') {
      checkAndComplete();
      return;
    }
    // İleri geçişler ilgili formdan geçsin — menüden doğrudan status yazmak satış bilgisi /
    // teslimat ADMT'si girilmeden dosyayı ilerletiyor (boş delivered_admt → ADMT kilidi bozulur).
    if (file!.status === 'request' && (newStatus === 'sale' || newStatus === 'delivery')) {
      if (newStatus === 'delivery') toast.info('Önce satışa çevirmen gerekiyor — satış bilgilerini girin.');
      setSaleOpen(true);
      return;
    }
    if (file!.status === 'sale' && newStatus === 'delivery') {
      openDeliveryWithPacking();
      return;
    }
    if (window.confirm(t('detail.statusConfirm', { label: tc('status.' + newStatus) })))
      changeStatus.mutate({ id: file!.id, status: newStatus as TradeFileStatus });
  }

  function confirmCancellation() {
    changeStatus.mutate({ id: file!.id, status: 'cancelled', cancelReason: cancelReasonText.trim() });
    setCancelModalOpen(false);
  }

  function handleDeliveryClose() {
    setDeliveryOpen(false);
    if (autoPackingAfterDelivery) {
      setAutoPackingAfterDelivery(false);
      setTimeout(() => setPackingOpen(true), 300);
    }
  }

  function openDeliveryWithPacking() {
    setAutoPackingAfterDelivery(true);
    setDeliveryOpen(true);
  }

  const custName = file.customer?.name ?? t('unknown');
  // Alt firma mı? Varsa muhasebe firması (parent) türet
  const parentCust = (file.customer as any)?.parent as { id: string; name: string } | null ?? null;

  // ── Combined file info card (replaces statsGrid + File Info section) ────────
  const fileInfoCard = (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* 2-col grid: key stats */}
      <div className="grid grid-cols-2 divide-x divide-gray-50">
        <div className="px-4 py-3 border-b border-[#F4F2EE]">
          <div className="text-[9px] text-gray-400 font-medium mb-0.5 uppercase tracking-wider">{t('detail.fileInfo.date')}</div>
          <div className="text-[13px] font-bold text-gray-900">{fDate(file.file_date)}</div>
        </div>
        <div className="px-4 py-3 border-b border-[#F4F2EE]">
          <div className="text-[9px] text-gray-400 font-medium mb-0.5 uppercase tracking-wider">{t('detail.fileInfo.tonnage')}</div>
          <div className="text-[13px] font-bold text-gray-900">{fN(file.tonnage_mt, 3)} {tUnit}</div>
        </div>
        <div className="px-4 py-3 border-b border-[#F4F2EE]">
          <div className="text-[9px] text-gray-400 font-medium mb-0.5 uppercase tracking-wider">{t('detail.fileInfo.salePrice')}</div>
          <div className="text-[13px] font-bold text-gray-900">
            {file.selling_price ? fCurrency(file.selling_price, saleCcy) + '/' + tUnit : '—'}
          </div>
        </div>
        <div className="px-4 py-3 border-b border-[#F4F2EE]">
          <div className="text-[9px] text-gray-400 font-medium mb-0.5 uppercase tracking-wider">{t('detail.fileInfo.delivered')}</div>
          <div className="text-[13px] font-bold text-gray-900">
            {deliveredTonnage ? fN(deliveredTonnage, 3) + ' ' + tUnit : '—'}
          </div>
        </div>
      </div>
      {/* KV rows: remaining file info */}
      <div className="divide-y divide-gray-50">
        {file.customer_ref && (
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-[11px] text-gray-400">{t('detail.fileInfo.ref')}</span>
            <span className="text-[11px] font-medium text-gray-700">{file.customer_ref}</span>
          </div>
        )}
        {file.notes && (
          <div className="flex items-start justify-between gap-4 px-4 py-2.5">
            <span className="text-[11px] text-gray-400 shrink-0">{t('detail.fileInfo.notes')}</span>
            <span className="text-[11px] text-gray-700 text-right">{file.notes}</span>
          </div>
        )}
        {file.status === 'cancelled' && (
          <div className="flex items-start justify-between gap-4 px-4 py-2.5 bg-red-50">
            <span className="text-[11px] text-red-500 font-medium shrink-0">{t('detail.fileInfo.cancelReason')}</span>
            <span className="text-[11px] text-red-700 text-right">{file.cancel_reason || '—'}</span>
          </div>
        )}
      </div>
    </div>
  );

  const actionsPanel = (isMobile: boolean) => (
    <div className={cn('bg-white rounded-2xl shadow-sm overflow-hidden', isMobile ? '' : '')}>
      {/* Mobil bottom sheet kendi başlığını çiziyor — burada tekrar etme */}
      {!isMobile && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#F4F2EE]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{t('detail.actions.title')}</span>
        </div>
      )}
      <div className="px-3 py-2">
        <ActionItem
          icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4zM18 2l-6 4 6 4-6 4 6 4 6-4-6-4 6-4zM6 16.5L12 21l6-4.5-6-4z"/></svg>}
          label={file.dropbox_folder_url ? 'Dropbox ●' : 'Dropbox'}
          onClick={() => { setActionsOpen(false); handleOpenDropbox(); }}
        />
        {writable && (
          <ActionItem icon={<Pencil className="h-4 w-4" />} label={t('detail.actions.editFile')}
            onClick={() => { setActionsOpen(false); setEditFileOpen(true); }} />
        )}
        {canCreateDocs && (
          <>
            <ActionItem icon={<Receipt className="h-4 w-4" />} label={t('detail.actions.commercialInvoice')}
              onClick={() => { setActionsOpen(false); setEditInvoice(null); setInvoiceOpen(true); }} />
            <ActionItem icon={<Package className="h-4 w-4" />} label={t('detail.actions.packingList')}
              onClick={() => { setActionsOpen(false); setEditPL(null); setPackingOpen(true); }} />
          </>
        )}
        {canCreateProforma && (
          <ActionItem icon={<FileText className="h-4 w-4" />} label={t('detail.actions.proformaInvoice')}
            onClick={() => { setActionsOpen(false); setEditPI(null); setProformaOpen(true); }} />
        )}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
            <RotateCcw className="h-4 w-4" />
          </div>
          <span className="flex-1 text-[13px] font-medium text-gray-800">{t('detail.actions.changeStatus')}</span>
          <NativeSelect
            className="text-[12px] font-semibold text-gray-600 bg-gray-100 rounded-lg px-2 py-1 border-0 outline-none"
            value={file.status}
            onChange={(e) => { handleStatusChange(e.target.value); setActionsOpen(false); }}
          >
            <option value="request">{tc('status.request')}</option>
            <option value="sale">{tc('status.sale')}</option>
            <option value="delivery">{tc('status.delivery')}</option>
            <option value="completed">{tc('status.completed')}</option>
            <option value="cancelled">{tc('status.cancelled')}</option>
          </NativeSelect>
        </div>
      </div>
    </div>
  );

  return (
    <div className="-mx-4 md:mx-0 bg-[#f7f9fc] md:bg-transparent min-h-screen pb-8 md:h-full md:min-h-0 md:pb-0">

      {/* ── Completion Blocker Modal ─────────────────────────────────────── */}
      <Dialog open={completionBlockerOpen} onOpenChange={setCompletionBlockerOpen}>
        <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
          <DialogTitle className="sr-only">Belge Kontrolü</DialogTitle>
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Belge Kontrolü</span>
            </div>
            <p className="text-[13px] font-semibold text-gray-800">Dosya tamamlanamıyor</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Aşağıdaki belgeler tamamlanmadan dosya kapatılamaz.</p>
          </div>
          {/* Checklist */}
          <div className="divide-y divide-dashed divide-gray-100">
            {completionChecks && ([
              {
                ok: completionChecks.purchaseCovered,
                label: 'Satın Alma Faturası',
                sub: 'Muhasebe → Satın Alma Faturası',
                onAdd: () => { setCompletionBlockerOpen(false); navigate('/accounting', { state: { newInvoice: 'purchase', returnTo: `/files/${file!.id}` } }); },
              },
              {
                ok: completionChecks.saleCovered,
                label: 'Satış Faturası',
                sub: 'Muhasebe → Satış Faturası',
                onAdd: () => { setCompletionBlockerOpen(false); navigate('/accounting', { state: { newInvoice: 'sale', returnTo: `/files/${file!.id}` } }); },
              },
              {
                ok: completionChecks.hasProforma,
                label: 'Proforma Fatura',
                sub: 'Belgeler → Proforma',
                onAdd: () => { setCompletionBlockerOpen(false); setEditPI(null); setProformaOpen(true); },
              },
              {
                ok: completionChecks.hasPackingList,
                label: 'Ambalaj Listesi',
                sub: 'Belgeler → Ambalaj Listesi',
                onAdd: () => { setCompletionBlockerOpen(false); setEditPL(null); setPackingOpen(true); },
              },
              {
                ok: completionChecks.hasCommInvoice,
                label: 'Ticari Fatura',
                sub: 'Belgeler → Ticari Fatura',
                onAdd: () => { setCompletionBlockerOpen(false); setEditInvoice(null); setInvoiceOpen(true); },
              },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between px-6 py-3">
                <div>
                  <div className={cn('text-[12px] font-semibold', item.ok ? 'text-gray-700' : 'text-gray-900')}>{item.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{item.sub}</div>
                </div>
                {item.ok
                  ? <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✓ Tamam</span>
                  : (
                    <button
                      onClick={item.onAdd}
                      className="flex items-center gap-1 text-[11px] font-semibold text-white px-2.5 py-1 rounded-full transition-opacity hover:opacity-90"
                      style={{ background: accent }}
                    >
                      + Ekle
                    </button>
                  )
                }
              </div>
            )))}
          </div>
          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
            <button
              onClick={() => setCompletionBlockerOpen(false)}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Kapat
            </button>
            {completionChecks && Object.values(completionChecks).every(Boolean) && (
              <button
                onClick={() => { setCompletionBlockerOpen(false); changeStatus.mutate({ id: file!.id, status: 'completed' }); }}
                className="px-4 py-2 rounded-xl text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: accent }}
              >
                Tamamla
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Reason Modal */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('detail.cancelModal.title')}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-500">{t('detail.cancelModal.body')}</p>
            <textarea
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-200"
              rows={4}
              placeholder={t('detail.cancelModal.placeholder')}
              value={cancelReasonText}
              onChange={e => setCancelReasonText(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <button
              className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200"
              onClick={() => setCancelModalOpen(false)}
            >{tc('btn.cancel')}</button>
            <button
              className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              onClick={confirmCancellation}
              disabled={changeStatus.isPending}
            >{t('detail.cancelModal.confirmBtn')}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════
          MOBILE  (< md)
      ══════════════════════════════════════════════════════════════ */}
      <div className="md:hidden pb-28">
        {/* Header card */}
        <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Üst çubuk: geri + durum */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#F4F2EE]">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-400 active:opacity-60">
              <ArrowLeft className="h-3.5 w-3.5" /> Geri
            </button>
            <div className="flex items-center gap-2">
              {/* Dosya no */}
              {editingFileNo ? (
                <div className="flex items-center gap-1">
                  <input
                    className="text-[10px] font-mono border border-gray-200 rounded px-2 py-0.5 outline-none w-40 bg-white"
                    value={fileNoInput}
                    onChange={e => setFileNoInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveFileNo(); if (e.key === 'Escape') setEditingFileNo(false); }}
                    autoFocus
                  />
                  <button onClick={handleSaveFileNo} className="text-[10px] text-green-600 font-semibold">✓</button>
                  <button onClick={() => setEditingFileNo(false)} className="text-[10px] text-gray-400">✕</button>
                </div>
              ) : (
                <button
                  onClick={() => { setFileNoInput(file.file_no); setEditingFileNo(true); }}
                  className="text-[10px] font-mono text-gray-400 tracking-wider flex items-center gap-1 group"
                >
                  {file.file_no}
                  <Pencil className="h-2.5 w-2.5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-60 transition-opacity" />
                </button>
              )}
              {/* Durum pill */}
              <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-bold', meta.pill)}>
                {tc('status.' + file.status)}
              </span>
            </div>
          </div>

          {/* Alt Parti breadcrumb */}
          {isBatch && (
            <button
              onClick={() => navigate(`/files/${file.parent_file_id}`)}
              className="w-full flex items-center gap-2 px-4 py-2 border-b border-[#F4F2EE] active:bg-gray-50 transition-colors"
            >
              <Layers className="h-3 w-3 text-gray-400 shrink-0" />
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Alt Parti</span>
              <span className="text-[10px] font-mono text-gray-500 ml-auto">{parentFileNo} →</span>
            </button>
          )}

          {/* Müşteri bilgisi */}
          <div className="flex items-center gap-3 px-4 py-4">
            <EntityAvatar name={custName} logoUrl={file.customer?.logo_url} size="md" shape="square" />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-gray-900 leading-snug truncate">{custName}</div>
              {parentCust && (
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 uppercase tracking-wider">Muhasebe</span>
                  <span className="text-[11px] text-gray-500 truncate">{parentCust.name}</span>
                </div>
              )}
              <div className="text-[11px] text-gray-400 mt-0.5">{file.product?.name ?? '—'}</div>
            </div>
          </div>
        </div>

        {/* Status stepper */}
        <div className="mx-4 mt-3">{statusStepper}</div>
        {nextStepStrip && <div className="mx-4 mt-2">{nextStepStrip}</div>}
        {docWarningBanner && <div className="mx-4 mt-2">{docWarningBanner}</div>}

        {/* Combined file info card */}
        <div className="mx-4 mt-3 mb-3">{fileInfoCard}</div>

        {/* Action buttons */}
        {writable && (
          <div className="flex gap-2 px-4 pb-4">
            {file.status === 'request' ? (
              <button onClick={() => setSaleOpen(true)} className="flex-1 h-10 rounded-full text-white text-[13px] font-semibold flex items-center justify-center gap-2 shadow-sm active:opacity-80" style={{ background: accent }}>
                <TrendingUp className="h-3.5 w-3.5" /> Satışa Çevir
              </button>
            ) : file.status === 'sale' ? (
              isBatch ? (
                // Alt parti dosyası → Teslimat Bilgisi Gir (DeliveryModal'ı açar)
                <button onClick={openDeliveryWithPacking} className="flex-1 h-10 rounded-full text-white text-[13px] font-semibold flex items-center justify-center gap-2 shadow-sm active:opacity-80" style={{ background: accent }}>
                  <Truck className="h-3.5 w-3.5" /> Teslimat Bilgisi Gir
                </button>
              ) : isPartial ? (
                // Ana dosya + partiler var
                <button onClick={handlePartialCTA} className="flex-1 h-10 rounded-full text-white text-[13px] font-semibold flex items-center justify-center gap-2 shadow-sm active:opacity-80" style={{ background: allBatchesDone ? accent : '#6b7280' }}>
                  <CheckCircle className="h-3.5 w-3.5" /> {allBatchesDone ? 'Tamamlandı' : 'Teslimat Partilerini Tamamla'}
                </button>
              ) : (
                // Tek teslimat → standart akış
                <button onClick={openDeliveryWithPacking} className="flex-1 h-10 rounded-full text-white text-[13px] font-semibold flex items-center justify-center gap-2 shadow-sm active:opacity-80" style={{ background: accent }}>
                  <Truck className="h-3.5 w-3.5" /> Teslimat Bilgisi Gir
                </button>
              )
            ) : file.status === 'delivery' ? (
              <button
                onClick={checkAndComplete}
                className="flex-1 h-10 rounded-full text-white text-[13px] font-semibold flex items-center justify-center gap-2 shadow-sm active:opacity-80"
                style={{ background: accent }}
              >
                <CheckCircle className="h-3.5 w-3.5" /> Teslimatı Tamamla
              </button>
            ) : (
              <button onClick={() => setActionsOpen(true)} className="flex-1 h-10 rounded-full bg-white border border-gray-200 text-[13px] font-semibold text-gray-700 flex items-center justify-center gap-2 shadow-sm active:opacity-70">
                <MoreVertical className="h-4 w-4" /> {t('detail.btn.actions')}
              </button>
            )}
            {(file.status === 'request' || file.status === 'sale' || file.status === 'delivery') && (
              <button onClick={() => setActionsOpen(true)} className="h-10 w-10 rounded-full bg-white border border-gray-200 text-gray-600 flex items-center justify-center shadow-sm active:opacity-70">
                <MoreVertical className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Mobile bottom sheet */}
        {actionsOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setActionsOpen(false)} />
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl pb-safe">
              <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-200 rounded-full" /></div>
              <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                <span className="text-[13px] font-bold text-gray-900">{t('detail.btn.actions')}</span>
                <button onClick={() => setActionsOpen(false)} className="text-gray-400 p-1"><X className="h-4 w-4" /></button>
              </div>
              <div className="px-3 py-2">{actionsPanel(true)}</div>
              <div className="h-6" />
            </div>
          </>
        )}

        {/* Mobile sections */}
        <div className="px-3">

        {financialSummary && <div className="mb-3">{financialSummary}</div>}

        {/* ── Sale Details ─────────────────────────────────────────────── */}
        <Section
          title={t('detail.saleDetails.title')}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          accent
          collapsible
          isCollapsed={!!collapsed.m_saleDetails}
          onToggle={() => toggleCard('m_saleDetails')}
          right={writable && file.selling_price ? (
            <div className="flex items-center gap-2">
              {file.eta && !['completed','cancelled'].includes(file.status) && (
                <button onClick={() => { setDelayEta(file.revised_eta ?? ''); setDelayNotes(file.delay_notes ?? ''); setDelayOpen(true); }} className="text-[11px] font-semibold text-amber-500 flex items-center gap-1">
                  <Bell className="h-3 w-3" /> {t('detail.btn.delay')}
                </button>
              )}
              <button onClick={() => setEditSaleOpen(true)} className="text-[11px] font-semibold text-gray-400 flex items-center gap-1">
                <Pencil className="h-3 w-3" /> {tc('btn.edit')}
              </button>
            </div>
          ) : undefined}
        >
          {hasSaleDetails ? (
            <>
              <KV label={t('detail.saleDetails.salePrice')} value={file.selling_price ? `${fCurrency(file.selling_price, saleCcy)}/${tUnit}` : '—'} bold />
              <KV label={t('detail.saleDetails.purchase')} value={`${fCurrency(weightedPurchase, purchaseCcy)}/${tUnit}`} />
              <KV
                label={t('detail.saleDetails.supplier')}
                value={
                  (file.suppliers?.length ?? 0) > 1
                    ? `${file.suppliers!.length} tedarikçi`
                    : (file.supplier?.name ?? '—')
                }
              />
              <OrderInfoRow file={file} field="incoterms" writable={writable} />
              <OrderInfoRow file={file} field="port_of_loading" writable={writable} />
              <OrderInfoRow file={file} field="port_of_discharge" writable={writable} />
              <OrderInfoRow file={file} field="payment_terms" writable={writable} />
              <OrderInfoRow file={file} field="proforma_ref" writable={writable} />
              <OrderInfoRow file={file} field="customer_ref" writable={writable} />
              {extraSaleRows.map(r => <KV key={r.label} label={r.label} value={r.value} />)}
              <OrderInfoRow file={file} field="eta" writable={writable} />
              {file.revised_eta && (
                <KV label={t('detail.saleDetails.revisedEta')} value={
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="font-bold text-amber-600">{fDate(file.revised_eta)}</span>
                  </span>
                } />
              )}
              {file.delay_notes && <KV label={t('detail.saleDetails.delayReason')} value={file.delay_notes} />}
              {!file.vessel_name && <OrderInfoRow file={file} field="vessel_name" writable={writable} />}
              {file.vessel_name && (
                <KV label={t('detail.saleDetails.vessel')} value={
                  <a
                    href={`https://magicport.ai/vessels?search=${encodeURIComponent(file.vessel_name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:underline font-medium"
                    onClick={e => e.stopPropagation()}
                  >
                    {file.vessel_name}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                } />
              )}
              {file.register_no && <KV label={t('detail.saleDetails.register')} value={file.register_no} />}
            </>
          ) : (
            <div className="py-2 text-center">
              {isBatch && parentFile ? (
                <button
                  onClick={handleSyncFromParent}
                  disabled={updateSaleDetails.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold text-violet-600 bg-violet-50 border border-violet-100 hover:bg-violet-100 transition-colors disabled:opacity-50"
                >
                  <Layers className="h-3 w-3" />
                  {updateSaleDetails.isPending ? 'Kopyalanıyor…' : 'Ana Dosyadan Kopyala'}
                </button>
              ) : (
                <p className="text-[12px] text-amber-700 font-medium">{t('detail.saleDetails.noSaleDetails')}</p>
              )}
            </div>
          )}
        </Section>

        {/* ── Delivery ─────────────────────────────────────────────────── */}
        {(file.delivered_admt || (isPartial && batchesTonnage > 0) || ['sale', 'delivery', 'completed'].includes(file.status)) && (
          <Section
            title={t('detail.delivery.title')}
            icon={<Truck className="h-3.5 w-3.5" />}
            collapsible
            isCollapsed={!!collapsed.m_delivery}
            onToggle={() => toggleCard('m_delivery')}
            right={writable ? (
              <button onClick={() => setDeliveryOpen(true)} className="text-[11px] font-semibold text-gray-400 flex items-center gap-1">
                <Pencil className="h-3 w-3" /> {tc('btn.edit')}
              </button>
            ) : undefined}
          >
            <div className="grid grid-cols-2 gap-x-4">
              <KV label={t('detail.delivery.admt')} value={fN(deliveryAdmt, 3)} bold />
              <OrderInfoRow file={file} field="gross_weight_kg" writable={writable} />
              <OrderInfoRow file={file} field="packages" writable={writable} />
              <OrderInfoRow file={file} field="arrival_date" writable={writable} />
              <OrderInfoRow file={file} field="bl_number" writable={writable} />
              <OrderInfoRow file={file} field="septi_ref" writable={writable} />
<OrderInfoRow file={file} field="insurance_tr" writable={writable} />
<OrderInfoRow file={file} field="insurance_ir" writable={writable} />
            </div>
          </Section>
        )}

        {/* ── Documents ────────────────────────────────────────────────── */}
        {(hasDocs || docMenuItems.length > 0) && (
          <Section title={t('detail.documents.title')} icon={<FileText className="h-3.5 w-3.5" />}
            right={<AddDocMenu items={docMenuItems} />}
            collapsible isCollapsed={!!collapsed.m_docs} onToggle={() => toggleCard('m_docs')}>
            {!hasDocs && <p className="text-[12px] text-gray-400 py-2">Henüz belge yok</p>}
            {/* Proformas — sadece normal dosyalarda */}
            {!isPartial && !isBatch && file.proformas?.map((pi) => (
              <DocRow
                key={pi.id}
                no={pi.proforma_no}
                date={fDate(pi.proforma_date)}
                amount={fCurrency(pi.total, (pi.currency ?? "USD") as CurrencyCode)}
                status={pi.doc_status ?? 'draft'}
                onRenameNo={writable ? makeProformaRename(pi.id) : undefined}
              >
                <ApprovalActions table="proformas" id={pi.id} currentStatus={pi.doc_status ?? 'draft'} />
                {writable && (pi.doc_status ?? 'draft') !== 'approved' && (
                  <button onClick={() => { setEditPI(pi); setProformaOpen(true); }}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                    <Pencil className="h-3 w-3" /> {tc('btn.edit')}
                  </button>
                )}
                {settings && (
                  <button onClick={() => printProforma(pi, settings, defaultBank, file, (pi.doc_status ?? 'draft') !== 'approved')}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                    <Printer className="h-3 w-3" /> {tc('btn.print')}
                  </button>
                )}
                {settings && (<button disabled={dropboxUploadingId === pi.id} onClick={() => handleUploadToDropbox(pi.id, `${pi.proforma_no}`, generateProformaHtml(pi, settings, defaultBank, file, (pi.doc_status ?? 'draft') !== 'approved'))} className="h-7 px-3 rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-600 flex items-center gap-1 disabled:opacity-50"><svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4zM18 2l-6 4 6 4-6 4 6 4 6-4-6-4 6-4zM6 16.5L12 21l6-4.5-6-4z"/></svg> Dropbox</button>)}
                {writable && (pi.doc_status ?? 'draft') !== 'approved' && (
                  <button onClick={() => { if (window.confirm(tc('confirm.delete_title'))) deletePI.mutate(pi.id); }}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500 flex items-center gap-1">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </DocRow>
            ))}

            {/* Sale Invoices */}
            {file.invoices?.filter(i => i.invoice_type === 'sale').map((inv) => (
              <DocRow
                key={inv.id}
                no={inv.invoice_no}
                date={fDate(inv.invoice_date)}
                amount={fCurrency(inv.total, (inv.currency ?? "USD") as CurrencyCode)}
                status={inv.doc_status ?? 'draft'}
                onRenameNo={writable ? makeInvoiceRename(inv.id) : undefined}
              >
                <ApprovalActions table="invoices" id={inv.id} currentStatus={inv.doc_status ?? 'draft'} />
                {writable && (inv.doc_status ?? 'draft') !== 'approved' && (
                  <button onClick={() => { setEditSaleInvoice(inv); setSaleInvoiceOpen(true); }}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                    <Pencil className="h-3 w-3" /> {tc('btn.edit')}
                  </button>
                )}
                {settings && (
                  <button onClick={() => printInvoice(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved')}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                    <Printer className="h-3 w-3" /> {tc('btn.print')}
                  </button>
                )}
                {settings && (<button disabled={dropboxUploadingId === inv.id} onClick={() => handleUploadToDropbox(inv.id, `${inv.invoice_no}`, generateInvoiceHtml(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved'))} className="h-7 px-3 rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-600 flex items-center gap-1 disabled:opacity-50"><svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4zM18 2l-6 4 6 4-6 4 6 4 6-4-6-4 6-4zM6 16.5L12 21l6-4.5-6-4z"/></svg> Dropbox</button>)}
              </DocRow>
            ))}

            {/* Com-Invoices */}
            {file.invoices?.filter(i => i.invoice_type === 'commercial').map((inv) => (
              <DocRow
                key={inv.id}
                no={inv.invoice_no}
                date={fDate(inv.invoice_date)}
                amount={fCurrency(inv.total, (inv.currency ?? "USD") as CurrencyCode)}
                status={inv.doc_status ?? 'draft'}
                onRenameNo={writable ? makeInvoiceRename(inv.id) : undefined}
              >
                <ApprovalActions table="invoices" id={inv.id} currentStatus={inv.doc_status ?? 'draft'} />
                {writable && (inv.doc_status ?? 'draft') !== 'approved' && (
                  <button onClick={() => { setEditInvoice(inv); setInvoiceOpen(true); }}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                    <Pencil className="h-3 w-3" /> {tc('btn.edit')}
                  </button>
                )}
                {settings && (
                  <button onClick={() => printInvoice(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved')}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                    <Printer className="h-3 w-3" /> {tc('btn.print')}
                  </button>
                )}
                {settings && (<button disabled={dropboxUploadingId === inv.id} onClick={() => handleUploadToDropbox(inv.id, `${inv.invoice_no}`, generateInvoiceHtml(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved'))} className="h-7 px-3 rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-600 flex items-center gap-1 disabled:opacity-50"><svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4zM18 2l-6 4 6 4-6 4 6 4 6-4-6-4 6-4zM6 16.5L12 21l6-4.5-6-4z"/></svg> Dropbox</button>)}
                {writable && (inv.doc_status ?? 'draft') !== 'approved' && (
                  <button onClick={() => { if (window.confirm(tc('confirm.delete_title'))) deleteInv.mutate(inv.id); }}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500 flex items-center gap-1">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </DocRow>
            ))}

            {/* Packing Lists */}
            {file.packing_lists?.map((pl) => (
              <DocRow
                key={pl.id}
                no={pl.packing_list_no}
                date={t('detail.documents.vehicles', { count: pl.packing_list_items?.length ?? 0, admt: fN(pl.total_admt, 3) })}
                status={pl.doc_status ?? 'draft'}
                onRenameNo={writable ? makePLRename(pl.id) : undefined}
              >
                <ApprovalActions table="packing_lists" id={pl.id} currentStatus={pl.doc_status ?? 'draft'} />
                {writable && (pl.doc_status ?? 'draft') !== 'approved' && (
                  <button onClick={() => { setEditPL(pl); setPackingOpen(true); }}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                    <Pencil className="h-3 w-3" /> {tc('btn.edit')}
                  </button>
                )}
                {settings && (
                  <button onClick={() => printPackingList(pl, settings, (pl.doc_status ?? 'draft') !== 'approved')}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                    <Printer className="h-3 w-3" /> {tc('btn.print')}
                  </button>
                )}
                {settings && (<button disabled={dropboxUploadingId === pl.id} onClick={() => handleUploadToDropbox(pl.id, `${pl.packing_list_no}`, generatePackingListHtml(pl, settings, (pl.doc_status ?? 'draft') !== 'approved'))} className="h-7 px-3 rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-600 flex items-center gap-1 disabled:opacity-50"><svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4zM18 2l-6 4 6 4-6 4 6 4 6-4-6-4 6-4zM6 16.5L12 21l6-4.5-6-4z"/></svg> Dropbox</button>)}
                {writable && (pl.doc_status ?? 'draft') !== 'approved' && (
                  <button onClick={() => { if (window.confirm(tc('confirm.delete_title'))) deletePL.mutate(pl.id); }}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500 flex items-center gap-1">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </DocRow>
            ))}
          </Section>
        )}

        {/* ── Expenses ─────────────────────────────────────────────────── */}
        <Section
          title={t('detail.expenses.title')}
          icon={<Receipt className="h-3.5 w-3.5" />}
          collapsible
          isCollapsed={!!collapsed.m_expenses}
          onToggle={() => toggleCard('m_expenses')}
          right={writable ? (
            <div className="flex gap-1.5">
              <button onClick={() => {
                if (isPartial) { setSelectedBatchFileId(null); setBatchSelectorOpen('purchase'); }
                else setPurchaseInvOpen(true);
              }}
                className="h-6 px-2.5 rounded-full text-[10px] font-semibold flex items-center gap-1 bg-gray-100 text-gray-500">
                <Plus className="h-3 w-3" /> {t('detail.expenses.addPurchase')}
              </button>
              <button onClick={() => {
                if (isPartial) { setSelectedBatchFileId(null); setBatchSelectorOpen('svc'); }
                else setSvcInvOpen(true);
              }}
                className="h-6 px-2.5 rounded-full text-[10px] font-semibold flex items-center gap-1 bg-gray-100 text-gray-500">
                <Plus className="h-3 w-3" /> {t('detail.expenses.addService')}
              </button>
            </div>
          ) : undefined}
        >
          {expenses.length === 0 ? (
            <div className="text-[12px] text-gray-400 py-2 text-center">{t('detail.expenses.noRecords')}</div>
          ) : (
            expenses.map(txn => (
              <div key={txn.id} className="flex items-center justify-between py-2 border-b border-[#F4F2EE] last:border-0">
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-gray-800 truncate">{txn.description || '—'}</div>
                  <div className="text-[10px] text-gray-400">{txn.transaction_date} · {tc(`txType.${txn.transaction_type}`)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <TxnAmount txn={txn} className="text-[12px] font-bold text-gray-800" />
                  <span className={cn(
                    'text-[9px] px-2 py-0.5 rounded-full font-bold',
                    txn.payment_status === 'paid' ? 'bg-green-100 text-green-700'
                    : txn.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
                  )}>{tc(`payStatus.${txn.payment_status}`)}</span>
                </div>
              </div>
            ))
          )}
        </Section>

        {/* ── Partiler (mobil) — parti varsa; parti yokken satış aşamasında 'Yeni Parti' girişi ── */}
        {showPartilerCard && (
          <PartilerCard
            file={file}
            writable={writable}
            accent={accent}
            onNewBatch={() => setBatchOpen(true)}
            collapsed={!!collapsed.m_partiler}
            onToggle={() => toggleCard('m_partiler')}
          />
        )}

        {/* ── Transport Plan ───────────────────────────────────────────── */}
        {!isPartial && ['sale', 'delivery', 'completed'].includes(file.status) && (
          <Section title={t('detail.transport.title')} icon={<Truck className="h-3.5 w-3.5" />}
            collapsible isCollapsed={!!collapsed.m_transport} onToggle={() => toggleCard('m_transport')}>
            <TransportPlanSection file={file} writable={writable} />
          </Section>
        )}

        {/* ── Notes + Attachments (split) ──────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3">
          <NotesSection tradeFileId={file.id} />
          <AttachmentsSection
            tradeFileId={file.id}
            customerName={file.customer?.name ?? ''}
            fileNo={file.file_no}
            dropboxFolderUrl={file.dropbox_folder_url}
          />
        </div>{/* end notes+attachments grid */}

        </div>{/* end px-3 */}
      </div>{/* end md:hidden */}

      {/* ══════════════════════════════════════════════════════════════
          DESKTOP  (≥ md)  — Two-panel fixed layout
      ══════════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex h-full gap-6">

          {/* ── LEFT panel — truly fixed ────────────────────────────────── */}
          <div className="w-[320px] shrink-0 overflow-y-auto scrollbar-thin space-y-4">

            {/* Title block */}
            <div className="pb-1">
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[12px] font-semibold text-gray-400 hover:text-gray-700 transition-colors mr-1">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <span className={cn('px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest', meta.pill)}>
                  {tc('status.' + file.status)}
                </span>
                {isBatch && (
                  <button
                    onClick={() => navigate(`/files/${file.parent_file_id}`)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 border border-violet-100 hover:bg-violet-100 transition-colors"
                    title="Ana dosyaya git"
                  >
                    <Layers className="h-2.5 w-2.5 text-violet-500" />
                    <span className="text-[9px] font-bold text-violet-500 uppercase tracking-wide">Alt Parti</span>
                    <span className="text-[9px] font-mono text-violet-700 font-semibold">← {parentFileNo}</span>
                  </button>
                )}
                {editingFileNo ? (
                  <div className="flex items-center gap-1">
                    <input
                      className="text-[11px] font-mono border border-gray-200 rounded px-2 py-0.5 outline-none w-52"
                      value={fileNoInput}
                      onChange={e => setFileNoInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveFileNo(); if (e.key === 'Escape') setEditingFileNo(false); }}
                      autoFocus
                    />
                    <button onClick={handleSaveFileNo} className="text-[10px] text-green-600 font-semibold px-1">✓</button>
                    <button onClick={() => setEditingFileNo(false)} className="text-[10px] text-gray-400 px-1">✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setFileNoInput(file.file_no); setEditingFileNo(true); }}
                    className="text-[11px] font-mono text-gray-400 hover:text-gray-600 flex items-center gap-1 group"
                  >
                    {file.file_no}
                    <Pencil className="h-2.5 w-2.5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
                {file.revised_eta && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    <AlertTriangle className="h-3 w-3" /> Gecikme
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <EntityAvatar name={custName} logoUrl={file.customer?.logo_url} size="lg" shape="square" />
                <h1 className="text-[24px] font-extrabold text-gray-900 leading-tight tracking-tight">{custName}</h1>
              </div>
              {parentCust && (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 uppercase tracking-widest">Muhasebe</span>
                  <span className="text-[12px] font-semibold text-violet-700">{parentCust.name}</span>
                </div>
              )}
              <p className="text-[12px] text-gray-500 mt-0.5">{file.product?.name ?? '—'}</p>
            </div>

            {/* Quick info 2×2 */}
            <div className="bg-white rounded-[20px] border border-[#ECECEC] shadow-[0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="grid grid-cols-2 divide-x divide-gray-50">
                <div className="px-5 py-4 border-b border-[#F4F2EE]">
                  <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">{t('detail.fileInfo.date')}</div>
                  <div className="text-[15px] font-extrabold text-gray-900">{fDate(file.file_date)}</div>
                </div>
                <div className="px-5 py-4 border-b border-[#F4F2EE]">
                  <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">{t('detail.fileInfo.tonnage')}</div>
                  <div className="text-[15px] font-extrabold text-gray-900">{fN(file.tonnage_mt, 3)} {tUnit}</div>
                </div>
                <div className="px-5 py-4">
                  <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">{t('detail.fileInfo.salePrice')}</div>
                  <div className="text-[15px] font-extrabold text-gray-900">
                    {file.selling_price ? fCurrency(file.selling_price, saleCcy) + '/' + tUnit : '—'}
                  </div>
                </div>
                <div className="px-5 py-4">
                  <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">{t('detail.fileInfo.delivered')}</div>
                  <div className="text-[15px] font-extrabold text-gray-900">
                    {deliveredTonnage ? fN(deliveredTonnage, 3) + ' ' + tUnit : '—'}
                  </div>
                </div>
              </div>
              {(file.customer_ref || file.notes || file.status === 'cancelled') && (
                <div className="divide-y divide-gray-50 border-t border-gray-50">
                  {file.customer_ref && (
                    <div className="flex justify-between px-5 py-2.5">
                      <span className="text-[11px] text-gray-400">{t('detail.fileInfo.ref')}</span>
                      <span className="text-[11px] font-medium text-gray-700">{file.customer_ref}</span>
                    </div>
                  )}
                  {file.notes && (
                    <div className="flex justify-between gap-4 px-5 py-2.5">
                      <span className="text-[11px] text-gray-400 shrink-0">{t('detail.fileInfo.notes')}</span>
                      <span className="text-[11px] text-gray-700 text-right">{file.notes}</span>
                    </div>
                  )}
                  {file.status === 'cancelled' && (
                    <div className="flex justify-between gap-4 px-5 py-2.5 bg-red-50">
                      <span className="text-[11px] text-red-500 font-medium shrink-0">{t('detail.fileInfo.cancelReason')}</span>
                      <span className="text-[11px] text-red-700 text-right">{file.cancel_reason || '—'}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Operations list */}
            <div className="bg-white rounded-[20px] border border-[#ECECEC] shadow-[0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#F4F2EE] bg-gray-50/60">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t('detail.actions.title')}</span>
              </div>
              <div className="divide-y divide-gray-50">
                <button onClick={handleOpenDropbox} disabled={dropboxLoading} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group text-left disabled:opacity-60">
                  <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-blue-50 transition-colors">
                    {dropboxLoading
                      ? <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                      : <svg className="h-3.5 w-3.5 text-gray-500 group-hover:text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4zM18 2l-6 4 6 4-6 4 6 4 6-4-6-4 6-4zM6 16.5L12 21l6-4.5-6-4z"/></svg>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-semibold text-gray-800">Dropbox</span>
                    {file.dropbox_folder_url
                      ? <p className="text-[10px] text-green-600 font-medium">● Klasör mevcut</p>
                      : <p className="text-[10px] text-gray-400">Klasör oluştur / aç</p>}
                  </div>
                </button>
                {canCreateDocs && (
                  <>
                    {/* Ticari Fatura: partial dosyada batch listesi, değilse yeni oluştur */}
                    <button
                      onClick={() => isPartial
                        ? (setBatchDocsType('invoice'), setBatchDocsOpen(true))
                        : (writable && (setEditInvoice(null), setInvoiceOpen(true)))
                      }
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group text-left"
                    >
                      <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-red-50 transition-colors">
                        <FileText className="h-3.5 w-3.5 text-gray-500 group-hover:text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-semibold text-gray-800">{t('detail.actions.commercialInvoice')}</span>
                        {isPartial && <p className="text-[10px] text-gray-400">Alt partilerden görüntüle</p>}
                      </div>
                    </button>
                    {/* Ambalaj Listesi */}
                    <button
                      onClick={() => isPartial
                        ? (setBatchDocsType('packing_list'), setBatchDocsOpen(true))
                        : (writable && (setEditPL(null), setPackingOpen(true)))
                      }
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group text-left"
                    >
                      <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-red-50 transition-colors">
                        <Package className="h-3.5 w-3.5 text-gray-500 group-hover:text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-semibold text-gray-800">{t('detail.actions.packingList')}</span>
                        {isPartial && <p className="text-[10px] text-gray-400">Alt partilerden görüntüle</p>}
                      </div>
                    </button>
                  </>
                )}
                {/* Proforma — normal dosyalarda, talep aşamasından itibaren (iptal hariç) */}
                {writable && canCreateProforma && (
                  <button onClick={() => { setEditPI(null); setProformaOpen(true); }} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group text-left">
                    <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-red-50 transition-colors">
                      <FileText className="h-3.5 w-3.5 text-gray-500 group-hover:text-red-600" />
                    </div>
                    <span className="text-[13px] font-semibold text-gray-800">{t('detail.actions.proformaInvoice')}</span>
                  </button>
                )}
              </div>
            </div>

          </div>{/* end LEFT */}

          {/* ── RIGHT panel — scrollable ────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto scrollbar-thin space-y-5 pb-4">

            {/* Status stepper */}
            {statusStepper}
            {nextStepStrip}
            {docWarningBanner}

            {/* Action buttons row */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {writable && file.status === 'request' && (
                  <button onClick={() => setSaleOpen(true)}
                    className="h-9 px-4 rounded-xl text-white text-[13px] font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity shadow-sm"
                    style={{ background: accent }}>
                    <TrendingUp className="h-3.5 w-3.5" /> Satışa Çevir
                  </button>
                )}
                {writable && file.status === 'sale' && (
                  isBatch ? (
                    // Alt parti → Teslimat Bilgisi Gir (DeliveryModal'ı açar)
                    <button onClick={openDeliveryWithPacking}
                      className="h-9 px-4 rounded-xl text-white text-[13px] font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity shadow-sm"
                      style={{ background: accent }}>
                      <Truck className="h-3.5 w-3.5" /> Teslimat Bilgisi Gir
                    </button>
                  ) : isPartial ? (
                    // Ana dosya + kısmi sevkiyat
                    <button onClick={handlePartialCTA}
                      className="h-9 px-4 rounded-xl text-white text-[13px] font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity shadow-sm"
                      style={{ background: allBatchesDone ? accent : '#6b7280' }}>
                      <CheckCircle className="h-3.5 w-3.5" />
                      {allBatchesDone ? 'Tamamlandı' : 'Teslimat Partilerini Tamamla'}
                    </button>
                  ) : (
                    // Tek teslimat → standart akış
                    <button onClick={openDeliveryWithPacking}
                      className="h-9 px-4 rounded-xl text-white text-[13px] font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity shadow-sm"
                      style={{ background: accent }}>
                      <Truck className="h-3.5 w-3.5" /> Teslimat Bilgisi Gir
                    </button>
                  )
                )}
                {writable && file.status === 'delivery' && (
                  <button
                    onClick={checkAndComplete}
                    className="h-9 px-4 rounded-xl text-white text-[13px] font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity shadow-sm"
                    style={{ background: accent }}>
                    <CheckCircle className="h-3.5 w-3.5" /> Teslimatı Tamamla
                  </button>
                )}
                {writable && (
                  <button onClick={() => setEditFileOpen(true)}
                    className="h-9 px-3 rounded-xl text-[13px] font-semibold text-gray-500 hover:text-gray-700 hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 transition-all flex items-center gap-1.5">
                    <Pencil className="h-3.5 w-3.5" /> {t('detail.actions.editFile')}
                  </button>
                )}
              </div>
              {writable && (
                <div className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer">
                  <RotateCcw className="h-3 w-3 text-gray-400 shrink-0" />
                  <NativeSelect
                    className="text-[12px] font-semibold text-gray-600 bg-transparent border-0 outline-none cursor-pointer"
                    value={file.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                  >
                    <option value="request">{tc('status.request')}</option>
                    <option value="sale">{tc('status.sale')}</option>
                    <option value="delivery">{tc('status.delivery')}</option>
                    <option value="completed">{tc('status.completed')}</option>
                    <option value="cancelled">{tc('status.cancelled')}</option>
                  </NativeSelect>
                </div>
              )}
            </div>

            {financialSummary}

            {/* ── Sale Details — always first ────────────────────────────── */}
            <div className="bg-white rounded-[20px] border border-[#ECECEC] shadow-[0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden">
              <div
                className="px-6 py-4 flex items-center justify-between border-b border-[#F4F2EE] cursor-pointer select-none"
                onClick={() => toggleCard('saleDetails')}
              >
                <div className="flex items-center gap-2.5">
                  <TrendingUp className="h-4 w-4 text-gray-400" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#8A8A8E]">{t('detail.saleDetails.title')}</span>
                </div>
                <div className="flex items-center gap-3">
                  {writable && file.selling_price && file.eta && !['completed','cancelled'].includes(file.status) && (
                    <button onClick={e => { e.stopPropagation(); setDelayEta(file.revised_eta ?? ''); setDelayNotes(file.delay_notes ?? ''); setDelayOpen(true); }} className="text-[11px] font-semibold text-amber-500 flex items-center gap-1">
                      <Bell className="h-3 w-3" /> {t('detail.btn.delay')}
                    </button>
                  )}
                  {writable && file.selling_price && (
                    <button onClick={e => { e.stopPropagation(); setEditSaleOpen(true); }} className="text-[11px] font-semibold text-gray-400 flex items-center gap-1 hover:text-gray-600 transition-colors">
                      <Pencil className="h-3 w-3" /> {tc('btn.edit')}
                    </button>
                  )}
                  {collapsed.saleDetails ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronUp className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                </div>
              </div>
              {!collapsed.saleDetails && (
                hasSaleDetails ? (
                  <div className="px-6 py-2">
                    <div className="flex justify-between items-center py-2 border-b border-dashed border-[#ECECEC]">
                      <span className="text-[12px] text-gray-500">{t('detail.saleDetails.salePrice')}</span>
                      <span className="text-[13px] font-bold text-gray-900">{file.selling_price ? `${fCurrency(file.selling_price, saleCcy)}/${tUnit}` : '—'}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-dashed border-[#ECECEC]">
                      <span className="text-[12px] text-gray-500">{t('detail.saleDetails.purchase')}</span>
                      <span className="text-[13px] font-bold text-gray-900">{fCurrency(weightedPurchase, purchaseCcy)}/{tUnit}</span>
                    </div>
                    {(file.suppliers?.length ?? 0) > 1 ? (
                      <div className="py-2 border-b border-dashed border-[#ECECEC]">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-[12px] text-gray-500">{t('detail.saleDetails.supplier')}</span>
                          <span className="text-[10px] font-semibold text-gray-400">{file.suppliers!.length} tedarikçi</span>
                        </div>
                        <div className="space-y-1">
                          {[...file.suppliers!].sort((a, b) => a.position - b.position).map((s) => (
                            <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-md px-2 py-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                  {s.position}
                                </div>
                                {s.supplier && (
                                  <EntityAvatar name={s.supplier.name} logoUrl={s.supplier.logo_url} size="xs" shape="square" />
                                )}
                                <span className="text-[12px] font-semibold text-gray-900 truncate">
                                  {s.supplier?.name ?? '—'}
                                </span>
                              </div>
                              <div className="text-right shrink-0 ml-2">
                                <div className="text-[11px] font-mono font-bold text-gray-900">
                                  {s.quantity_mt} {tUnit} · {fCurrency(s.purchase_price)}/{s.currency}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center py-2 border-b border-dashed border-[#ECECEC]">
                        <span className="text-[12px] text-gray-500">{t('detail.saleDetails.supplier')}</span>
                        {file.supplier ? (
                          <div className="flex items-center gap-2">
                            <EntityAvatar name={file.supplier.name} logoUrl={file.supplier.logo_url} size="xs" shape="square" />
                            <span className="text-[13px] font-bold text-gray-900">{file.supplier.name}</span>
                          </div>
                        ) : <span className="text-[13px] font-bold text-gray-900">—</span>}
                      </div>
                    )}
                    <OrderInfoRow file={file} field="incoterms" writable={writable} />
                    <OrderInfoRow file={file} field="port_of_loading" writable={writable} />
                    <OrderInfoRow file={file} field="port_of_discharge" writable={writable} />
                    <OrderInfoRow file={file} field="payment_terms" writable={writable} />
                    <OrderInfoRow file={file} field="proforma_ref" writable={writable} />
                    <OrderInfoRow file={file} field="customer_ref" writable={writable} />
                    {extraSaleRows.map(r => (
                      <div key={r.label} className="flex justify-between items-center py-2 border-b border-dashed border-[#ECECEC]">
                        <span className="text-[12px] text-gray-500">{r.label}</span>
                        <span className="text-[13px] font-bold text-gray-900">{r.value}</span>
                      </div>
                    ))}
                    <OrderInfoRow file={file} field="eta" writable={writable} />
                    {file.revised_eta && (
                      <div className="flex justify-between items-center py-2 border-b border-dashed border-[#ECECEC]">
                        <span className="text-[12px] text-gray-500">{t('detail.saleDetails.revisedEta')}</span>
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="text-[13px] font-bold text-amber-600">{fDate(file.revised_eta)}</span>
                        </span>
                      </div>
                    )}
                    {file.delay_notes && (
                      <div className="flex justify-between items-center py-2 border-b border-dashed border-[#ECECEC]">
                        <span className="text-[12px] text-gray-500">{t('detail.saleDetails.delayReason')}</span>
                        <span className="text-[13px] font-bold text-gray-900 text-right max-w-[60%]">{file.delay_notes}</span>
                      </div>
                    )}
                    {!file.vessel_name && <OrderInfoRow file={file} field="vessel_name" writable={writable} />}
                    {file.vessel_name && (
                      <div className="flex justify-between items-center py-2 border-b border-dashed border-[#ECECEC] last:border-0">
                        <span className="text-[12px] text-gray-500">{t('detail.saleDetails.vessel')}</span>
                        <a href={`https://magicport.ai/vessels?search=${encodeURIComponent(file.vessel_name)}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[13px] font-bold hover:underline" style={{ color: accent }}
                          onClick={e => e.stopPropagation()}>
                          {file.vessel_name} <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </div>
                    )}
                    {file.register_no && (
                      <div className="flex justify-between items-center py-2">
                        <span className="text-[12px] text-gray-500">{t('detail.saleDetails.register')}</span>
                        <span className="text-[13px] font-bold text-gray-900">{file.register_no}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-6 py-4 flex items-center justify-center">
                    {isBatch && parentFile ? (
                      <button
                        onClick={handleSyncFromParent}
                        disabled={updateSaleDetails.isPending}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold text-violet-600 bg-violet-50 border border-violet-100 hover:bg-violet-100 transition-colors disabled:opacity-50"
                      >
                        <Layers className="h-3 w-3" />
                        {updateSaleDetails.isPending ? 'Kopyalanıyor…' : 'Ana Dosyadan Kopyala'}
                      </button>
                    ) : (
                      <span className="text-[12px] text-amber-700 font-medium">{t('detail.saleDetails.noSaleDetails')}</span>
                    )}
                  </div>
                )
              )}
            </div>

            {/* ── Partiler — parti varsa; parti yokken satış aşamasında 'Yeni Parti' girişi ── */}
            {showPartilerCard && (
              <PartilerCard
                file={file}
                writable={writable}
                accent={accent}
                onNewBatch={() => setBatchOpen(true)}
                collapsed={!!collapsed.partiler}
                onToggle={() => toggleCard('partiler')}
              />
            )}

            {/* Delivery */}
            {(file.delivered_admt || (isPartial && batchesTonnage > 0) || ['sale', 'delivery', 'completed'].includes(file.status)) && (
              <div className="bg-white rounded-[20px] border border-[#ECECEC] shadow-[0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between border-b border-[#F4F2EE] cursor-pointer select-none" onClick={() => toggleCard('delivery')}>
                  <div className="flex items-center gap-2.5">
                    <Truck className="h-4 w-4 text-gray-400" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[#8A8A8E]">{t('detail.delivery.title')}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {writable && (
                      <button onClick={e => { e.stopPropagation(); setDeliveryOpen(true); }} className="text-[11px] font-semibold text-gray-400 flex items-center gap-1 hover:text-gray-600 transition-colors">
                        <Pencil className="h-3 w-3" /> {tc('btn.edit')}
                      </button>
                    )}
                    {collapsed.delivery ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronUp className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                  </div>
                </div>
                {!collapsed.delivery && (
                  <div className="px-6 py-3 grid grid-cols-2 gap-x-6">
                    <KV label={t('detail.delivery.admt')} value={fN(deliveryAdmt, 3)} bold />
                    <OrderInfoRow file={file} field="gross_weight_kg" writable={writable} />
                    <OrderInfoRow file={file} field="packages" writable={writable} />
                    <OrderInfoRow file={file} field="arrival_date" writable={writable} />
                    <OrderInfoRow file={file} field="bl_number" writable={writable} />
                    <OrderInfoRow file={file} field="septi_ref" writable={writable} />
<OrderInfoRow file={file} field="insurance_tr" writable={writable} />
<OrderInfoRow file={file} field="insurance_ir" writable={writable} />
                  </div>
                )}
              </div>
            )}

            {/* Documents */}
            {(hasDocs || docMenuItems.length > 0) && (
              <div className="bg-white rounded-[20px] border border-[#ECECEC] shadow-[0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between border-b border-[#F4F2EE] cursor-pointer select-none" onClick={() => toggleCard('documents')}>
                  <div className="flex items-center gap-2.5">
                    <FileText className="h-4 w-4 text-gray-400" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[#8A8A8E]">{t('detail.documents.title')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AddDocMenu items={docMenuItems} />
                    {collapsed.documents ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronUp className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                  </div>
                </div>
                {!collapsed.documents && <div className="px-4 py-2">
                  {!hasDocs && <p className="text-[12px] text-gray-400 py-2 px-2">Henüz belge yok</p>}
                  {!isPartial && !isBatch && file.proformas?.map((pi) => (
                    <DocRow key={pi.id} no={pi.proforma_no} date={fDate(pi.proforma_date)} amount={fCurrency(pi.total, (pi.currency ?? "USD") as CurrencyCode)} status={pi.doc_status ?? 'draft'} onRenameNo={writable ? makeProformaRename(pi.id) : undefined}>
                      <ApprovalActions table="proformas" id={pi.id} currentStatus={pi.doc_status ?? 'draft'} />
                      {writable && (pi.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { setEditPI(pi); setProformaOpen(true); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Pencil className="h-3 w-3" /> {tc('btn.edit')}</button>)}
                      {settings && (<button onClick={() => printProforma(pi, settings, defaultBank, file, (pi.doc_status ?? 'draft') !== 'approved')} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Printer className="h-3 w-3" /> {tc('btn.print')}</button>)}
                      {settings && (<button disabled={dropboxUploadingId === pi.id} onClick={() => handleUploadToDropbox(pi.id, `${pi.proforma_no}`, generateProformaHtml(pi, settings, defaultBank, file, (pi.doc_status ?? 'draft') !== 'approved'))} className="h-7 px-3 rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-600 flex items-center gap-1 disabled:opacity-50"><svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4zM18 2l-6 4 6 4-6 4 6 4 6-4-6-4 6-4zM6 16.5L12 21l6-4.5-6-4z"/></svg> Dropbox</button>)}
                      {writable && (pi.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { if (window.confirm(tc('confirm.delete_title'))) deletePI.mutate(pi.id); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500 flex items-center gap-1"><Trash2 className="h-3 w-3" /></button>)}
                    </DocRow>
                  ))}
                  {file.invoices?.filter(i => i.invoice_type === 'sale').map((inv) => (
                    <DocRow key={inv.id} no={inv.invoice_no} date={fDate(inv.invoice_date)} amount={fCurrency(inv.total, (inv.currency ?? "USD") as CurrencyCode)} status={inv.doc_status ?? 'draft'} onRenameNo={writable ? makeInvoiceRename(inv.id) : undefined}>
                      <ApprovalActions table="invoices" id={inv.id} currentStatus={inv.doc_status ?? 'draft'} />
                      {writable && (inv.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { setEditSaleInvoice(inv); setSaleInvoiceOpen(true); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Pencil className="h-3 w-3" /> {tc('btn.edit')}</button>)}
                      {settings && (<button onClick={() => printInvoice(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved')} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Printer className="h-3 w-3" /> {tc('btn.print')}</button>)}
                      {settings && (<button disabled={dropboxUploadingId === inv.id} onClick={() => handleUploadToDropbox(inv.id, `${inv.invoice_no}`, generateInvoiceHtml(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved'))} className="h-7 px-3 rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-600 flex items-center gap-1 disabled:opacity-50"><svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4zM18 2l-6 4 6 4-6 4 6 4 6-4-6-4 6-4zM6 16.5L12 21l6-4.5-6-4z"/></svg> Dropbox</button>)}
                    </DocRow>
                  ))}
                  {file.invoices?.filter(i => i.invoice_type === 'commercial').map((inv) => (
                    <DocRow key={inv.id} no={inv.invoice_no} date={fDate(inv.invoice_date)} amount={fCurrency(inv.total, (inv.currency ?? "USD") as CurrencyCode)} status={inv.doc_status ?? 'draft'} onRenameNo={writable ? makeInvoiceRename(inv.id) : undefined}>
                      <ApprovalActions table="invoices" id={inv.id} currentStatus={inv.doc_status ?? 'draft'} />
                      {writable && (inv.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { setEditInvoice(inv); setInvoiceOpen(true); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Pencil className="h-3 w-3" /> {tc('btn.edit')}</button>)}
                      {settings && (<button onClick={() => printInvoice(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved')} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Printer className="h-3 w-3" /> {tc('btn.print')}</button>)}
                      {settings && (<button disabled={dropboxUploadingId === inv.id} onClick={() => handleUploadToDropbox(inv.id, `${inv.invoice_no}`, generateInvoiceHtml(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved'))} className="h-7 px-3 rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-600 flex items-center gap-1 disabled:opacity-50"><svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4zM18 2l-6 4 6 4-6 4 6 4 6-4-6-4 6-4zM6 16.5L12 21l6-4.5-6-4z"/></svg> Dropbox</button>)}
                      {writable && (inv.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { if (window.confirm(tc('confirm.delete_title'))) deleteInv.mutate(inv.id); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500 flex items-center gap-1"><Trash2 className="h-3 w-3" /></button>)}
                    </DocRow>
                  ))}
                  {file.packing_lists?.map((pl) => (
                    <DocRow key={pl.id} no={pl.packing_list_no} date={t('detail.documents.vehicles', { count: pl.packing_list_items?.length ?? 0, admt: fN(pl.total_admt, 3) })} status={pl.doc_status ?? 'draft'} onRenameNo={writable ? makePLRename(pl.id) : undefined}>
                      <ApprovalActions table="packing_lists" id={pl.id} currentStatus={pl.doc_status ?? 'draft'} />
                      {writable && (pl.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { setEditPL(pl); setPackingOpen(true); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Pencil className="h-3 w-3" /> {tc('btn.edit')}</button>)}
                      {settings && (<button onClick={() => printPackingList(pl, settings, (pl.doc_status ?? 'draft') !== 'approved')} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Printer className="h-3 w-3" /> {tc('btn.print')}</button>)}
                      {settings && (<button disabled={dropboxUploadingId === pl.id} onClick={() => handleUploadToDropbox(pl.id, `${pl.packing_list_no}`, generatePackingListHtml(pl, settings, (pl.doc_status ?? 'draft') !== 'approved'))} className="h-7 px-3 rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-600 flex items-center gap-1 disabled:opacity-50"><svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4zM18 2l-6 4 6 4-6 4 6 4 6-4-6-4 6-4zM6 16.5L12 21l6-4.5-6-4z"/></svg> Dropbox</button>)}
                      {writable && (pl.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { if (window.confirm(tc('confirm.delete_title'))) deletePL.mutate(pl.id); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500 flex items-center gap-1"><Trash2 className="h-3 w-3" /></button>)}
                    </DocRow>
                  ))}
                </div>}
              </div>
            )}

            {/* Expenses */}
            <div className="bg-white rounded-[20px] border border-[#ECECEC] shadow-[0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-6 py-4 flex items-center justify-between border-b border-[#F4F2EE] cursor-pointer select-none" onClick={() => toggleCard('expenses')}>
                <div className="flex items-center gap-2.5">
                  <Receipt className="h-4 w-4 text-gray-400" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#8A8A8E]">{t('detail.expenses.title')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {writable && (
                    <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                      <button onClick={() => {
                          if (isPartial) { setSelectedBatchFileId(null); setBatchSelectorOpen('purchase'); }
                          else setPurchaseInvOpen(true);
                        }} className="h-6 px-2.5 rounded-full text-[10px] font-semibold flex items-center gap-1 bg-gray-100 text-gray-500"><Plus className="h-3 w-3" /> {t('detail.expenses.addPurchase')}</button>
                      <button onClick={() => {
                          if (isPartial) { setSelectedBatchFileId(null); setBatchSelectorOpen('svc'); }
                          else setSvcInvOpen(true);
                        }} className="h-6 px-2.5 rounded-full text-[10px] font-semibold flex items-center gap-1 bg-gray-100 text-gray-500"><Plus className="h-3 w-3" /> {t('detail.expenses.addService')}</button>
                    </div>
                  )}
                  {collapsed.expenses ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronUp className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                </div>
              </div>
              {!collapsed.expenses && <div className="px-6 py-2">
                {expenses.length === 0 ? (
                  <div className="text-[12px] text-gray-400 py-4 text-center">{t('detail.expenses.noRecords')}</div>
                ) : (
                  expenses.map(txn => (
                    <div key={txn.id} className="flex items-center justify-between py-2.5 border-b border-[#F4F2EE] last:border-0">
                      <div className="min-w-0">
                        <div className="text-[12px] font-medium text-gray-800 truncate">{txn.description || '—'}</div>
                        <div className="text-[10px] text-gray-400">{txn.transaction_date} · {tc(`txType.${txn.transaction_type}`)}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        <TxnAmount txn={txn} className="text-[13px] font-bold text-gray-800" />
                        <span className={cn('text-[9px] px-2 py-0.5 rounded-full font-bold',
                          txn.payment_status === 'paid' ? 'bg-green-100 text-green-700'
                          : txn.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                        )}>{tc(`payStatus.${txn.payment_status}`)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>}
            </div>

            {/* Transport Plan */}
            {!isPartial && ['sale', 'delivery', 'completed'].includes(file.status) && (
              <div>
                {/* Thin divider-style toggle — no extra card since TransportPlanSection renders its own cards */}
                <button
                  className="w-full flex items-center justify-between px-2 py-2 mb-2 rounded-xl hover:bg-gray-100/60 transition-colors group"
                  onClick={() => toggleCard('transport')}
                >
                  <div className="flex items-center gap-2">
                    <Truck className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-400 transition-colors" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-300 group-hover:text-gray-400 transition-colors">{t('detail.transport.title')}</span>
                  </div>
                  {collapsed.transport
                    ? <ChevronDown className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-400" />
                    : <ChevronUp className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-400" />
                  }
                </button>
                {!collapsed.transport && <TransportPlanSection file={file} writable={writable} />}
              </div>
            )}

            {/* Notes + Attachments (split) */}
            <div className="grid grid-cols-2 gap-4">
              <NotesSection tradeFileId={file.id} />
              <AttachmentsSection
                tradeFileId={file.id}
                customerName={file.customer?.name ?? ''}
                fileNo={file.file_no}
                dropboxFolderUrl={file.dropbox_folder_url}
              />
            </div>

          </div>{/* end RIGHT */}
      </div>{/* end desktop two-panel */}

      {/* ── Note Delay Modal ─────────────────────────────────────────── */}
      {delayOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setDelayOpen(false)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl p-5 max-w-sm mx-auto">
            <div className="text-[15px] font-bold text-gray-900 mb-1">{t('detail.delay.title')}</div>
            {file.eta && (
              <div className="text-[12px] text-gray-400 mb-4">
                {t('detail.delay.originalEta', { date: fDate(file.eta) })}
              </div>
            )}
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('detail.delay.newEtaLabel')}</label>
            <MonoDatePicker
              value={delayEta}
              onChange={v => setDelayEta(v)}
              className="w-full mt-1 mb-3 h-10 bg-white border border-gray-200 rounded-xl px-3 text-[13px] text-gray-900 focus:outline-none flex items-center justify-between overflow-hidden hover:bg-gray-50 transition-colors"
            />
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('detail.delay.reasonLabel')}</label>
            <textarea
              value={delayNotes}
              onChange={e => setDelayNotes(e.target.value)}
              className="w-full mt-1 mb-4 px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] resize-none outline-none focus:border-blue-400"
              rows={2}
              placeholder={t('detail.delay.placeholder')}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setDelayOpen(false)}
                className="flex-1 h-10 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600"
              >
                {tc('btn.cancel')}
              </button>
              <button
                onClick={() => {
                  if (!delayEta) return;
                  noteDelay.mutate({ id: file.id, revised_eta: delayEta, delay_notes: delayNotes || undefined });
                  setDelayOpen(false);
                }}
                disabled={!delayEta || noteDelay.isPending}
                className="flex-1 h-10 rounded-xl text-white text-[13px] font-semibold disabled:opacity-50"
                style={{ background: accent }}
              >
                {t('detail.delay.saveBtn')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {batchOpen && (
        <BatchModal
          parent={file}
          nextBatchNo={(file.batches ?? []).reduce((mx, b) => Math.max(mx, b.batch_no ?? 0), 0) + 1}
          open={batchOpen}
          onClose={() => setBatchOpen(false)}
        />
      )}
      <NewFileModal open={editFileOpen} onOpenChange={setEditFileOpen} editMode fileToEdit={file} />
      <ToSaleModal open={saleOpen} onOpenChange={setSaleOpen} file={file} />
      <ToSaleModal open={editSaleOpen} onOpenChange={setEditSaleOpen} file={file} editMode />
      <DeliveryModal
        open={deliveryOpen}
        onOpenChange={handleDeliveryClose}
        file={file}
        onPartialShipment={() => { setDeliveryOpen(false); setBatchOpen(true); }}
      />
      {/* ── Alt Parti Belge Listesi Modal ───────────────────────────────────── */}
      <Dialog open={batchDocsOpen} onOpenChange={setBatchDocsOpen}>
        <DialogContent size="lg">
          <DialogTitle className="sr-only">Alt Parti Belgeleri</DialogTitle>
          <div className="sticky top-0 bg-white z-10 pb-3 border-b border-[#F4F2EE]">
            <p className="text-[14px] font-bold text-gray-900">
              {batchDocsType === 'invoice' ? 'Ticari Fatura' : 'Ambalaj Listesi'} — Alt Partiler
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">{file.customer?.name} · {file.file_no}</p>
          </div>

          <div className="mt-3 space-y-3">
            {(file.batches ?? []).length === 0 && (
              <p className="text-[12px] text-gray-400 text-center py-8">Alt parti bulunamadı</p>
            )}
            {(file.batches ?? []).map((batch) => {
              const docs = batchDocsType === 'invoice'
                ? (batch.invoices ?? []).filter(i => i.invoice_type === 'commercial')
                : (batch.packing_lists ?? []);
              return (
                <div key={batch.id} className="bg-gray-50 rounded-xl overflow-hidden">
                  {/* Batch başlık */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-gray-500 bg-gray-200 px-2 py-0.5 rounded-md">{batch.file_no}</span>
                      <span className="text-[10px] text-gray-400">{batch.tonnage_mt ? `${batch.tonnage_mt} ${tUnit}` : ''}</span>
                    </div>
                    <button
                      onClick={() => navigate(`/files/${batch.id}`)}
                      className="text-[10px] font-semibold text-gray-400 hover:text-gray-600 flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" /> Dosyaya git
                    </button>
                  </div>
                  {/* Belgeler */}
                  {docs.length === 0 ? (
                    <div className="px-4 py-3 text-[11px] text-gray-400 italic">Belge yok</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {batchDocsType === 'invoice'
                        ? (batch.invoices ?? []).filter(i => i.invoice_type === 'commercial').map(inv => (
                          <div key={inv.id} className="flex items-center justify-between px-4 py-3">
                            <div>
                              <p className="text-[12px] font-semibold text-gray-800">{inv.invoice_no}</p>
                              <p className="text-[10px] text-gray-400">{inv.invoice_date ? fDate(inv.invoice_date) : '—'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {inv.total != null && (
                                <span className="text-[12px] font-bold text-gray-900">
                                  {fCurrency(inv.total, (inv.currency ?? 'USD') as 'USD' | 'EUR' | 'TRY' | 'AED')}
                                </span>
                              )}
                              <span className={cn(
                                'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                                inv.doc_status === 'approved'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-amber-100 text-amber-700',
                              )}>
                                {inv.doc_status === 'approved' ? 'Onaylı' : 'Taslak'}
                              </span>
                            </div>
                          </div>
                        ))
                        : (batch.packing_lists ?? []).map(pl => (
                          <div key={pl.id} className="flex items-center justify-between px-4 py-3">
                            <div>
                              <p className="text-[12px] font-semibold text-gray-800">{pl.packing_list_no}</p>
                              {pl.total_admt != null && (
                                <p className="text-[10px] text-gray-400">{fN(pl.total_admt, 3)} {tUnit}</p>
                              )}
                            </div>
                            <span className={cn(
                              'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                              pl.doc_status === 'approved'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-700',
                            )}>
                              {pl.doc_status === 'approved' ? 'Onaylı' : 'Taslak'}
                            </span>
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Toplu belge: tüm partilerin toplamı (kaydedilmez, yazdır/PDF) */}
          {(() => {
            if ((file.batches ?? []).length === 0) return null;
            const isInv = batchDocsType === 'invoice';
            const res = isInv ? buildConsolidatedInvoice(file) : buildConsolidatedPackingList(file);
            if (!res) return null;
            if ('error' in res && res.error) {
              return <p className="mt-3 text-[11px] text-red-600 bg-red-50 rounded-lg px-3 py-2">{res.error}</p>;
            }
            const ok = res as { doc: PackingList | Invoice; count: number; allApproved: boolean };
            const pl = !isInv ? (ok.doc as PackingList) : null;
            const inv = isInv ? (ok.doc as Invoice) : null;
            return (
              <div className="mt-3 rounded-xl border border-[#ECECEC] bg-gray-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Toplam · {ok.count} parti belgesi</p>
                  <p className="text-[13px] font-extrabold text-gray-900 mt-0.5">
                    {isInv
                      ? <>{fN(inv!.quantity_admt, 3)} {tUnit} · {fCurrency(inv!.total, (inv!.currency ?? 'USD') as CurrencyCode)}</>
                      : <>{fN(pl!.total_admt, 3)} {tUnit} · {pl!.packing_list_items?.length ?? 0} araç · {fN(pl!.total_gross_kg, 0)} kg</>}
                  </p>
                  {!ok.allApproved && <p className="text-[10px] text-amber-600 mt-0.5">Onaysız parti belgesi var — taslak olarak basılır</p>}
                </div>
                {settings && (
                  <button
                    onClick={() => isInv
                      ? printInvoice(inv!, settings, defaultBank, !ok.allApproved)
                      : printPackingList(pl!, settings, !ok.allApproved)}
                    className="h-8 px-4 rounded-lg text-white text-[12px] font-semibold flex items-center gap-1.5 shadow-sm hover:opacity-90"
                    style={{ background: accent }}
                  >
                    <Printer className="h-3.5 w-3.5" /> Toplu {isInv ? 'Fatura' : 'Ambalaj Listesi'} · Yazdır / PDF
                  </button>
                )}
              </div>
            );
          })()}

          <div className="flex justify-end pt-3 border-t border-gray-100 mt-2">
            <button
              onClick={() => setBatchDocsOpen(false)}
              className="px-4 h-8 rounded-lg text-[12px] font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
            >
              Kapat
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Parti Seçici: Fatura hangi alt parti için? ──────────────────────── */}
      <Dialog open={!!batchSelectorOpen} onOpenChange={(o) => { if (!o) setBatchSelectorOpen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-[14px] font-bold text-gray-900">
              {batchSelectorOpen === 'purchase' ? 'Satın Alma Faturası' : 'Hizmet Faturası'} — Parti Seç
            </DialogTitle>
            <p className="text-[11px] text-gray-400 mt-0.5">Fatura hangi alt parti için düzenlenecek?</p>
          </DialogHeader>

          <div className="mt-3 space-y-1.5">
            {(file.batches ?? []).map(batch => (
              <button
                key={batch.id}
                onClick={() => {
                  const type = batchSelectorOpen;
                  setSelectedBatchFileId(batch.id);
                  setBatchSelectorOpen(null);
                  if (type === 'purchase') setTimeout(() => setPurchaseInvOpen(true), 50);
                  else setTimeout(() => setSvcInvOpen(true), 50);
                }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-gray-50 border border-gray-100 transition-colors text-left group"
              >
                <div>
                  <p className="text-[13px] font-semibold text-gray-800">{batch.file_no}</p>
                  <p className="text-[10px] text-gray-400">{batch.tonnage_mt ? `${batch.tonnage_mt} ${tUnit}` : ''} · {batch.status}</p>
                </div>
                <span className="text-[10px] font-mono text-gray-300 group-hover:text-gray-500">Seç →</span>
              </button>
            ))}
          </div>

          <div className="flex justify-end pt-3 border-t border-gray-100 mt-2">
            <button
              onClick={() => setBatchSelectorOpen(null)}
              className="px-4 h-8 rounded-lg text-[12px] font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
            >
              İptal
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <InvoiceModal open={invoiceOpen} onOpenChange={setInvoiceOpen} file={file} invoice={editInvoice} />
      <InvoiceModal open={saleInvoiceOpen} onOpenChange={setSaleInvoiceOpen} file={file} invoice={editSaleInvoice} invoiceType="sale" />
      <ProformaModal open={proformaOpen} onOpenChange={setProformaOpen} file={file} proforma={editPI} />
      <PackingListModal open={packingOpen} onOpenChange={setPackingOpen} file={file} packingList={editPL} />
      <PurchaseInvoiceModal
        open={purchaseInvOpen}
        onOpenChange={(open) => { setPurchaseInvOpen(open); if (!open) setSelectedBatchFileId(null); }}
        defaultTradeFileId={selectedBatchFileId ?? file.id}
      />
      <ServiceInvoiceModal
        open={svcInvOpen}
        onOpenChange={(open) => { setSvcInvOpen(open); if (!open) setSelectedBatchFileId(null); }}
        defaultTradeFileId={selectedBatchFileId ?? file.id}
      />
    </div>
  );
}
