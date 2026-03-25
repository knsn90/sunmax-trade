import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTradeFile, useChangeStatus, useNoteDelay } from '@/hooks/useTradeFiles';
import { useAuth } from '@/hooks/useAuth';
import { canWrite } from '@/lib/permissions';
import { fN, fDate, fCurrency, fUSD } from '@/lib/formatters';
import { TRADE_FILE_STATUS_LABELS, TRANSACTION_TYPE_LABELS } from '@/types/enums';
import type { Invoice, PackingList, Proforma } from '@/types/database';
import type { TradeFileStatus } from '@/types/enums';
import { ToSaleModal } from '@/components/trade-files/ToSaleModal';
import { DeliveryModal } from '@/components/trade-files/DeliveryModal';
import { NewFileModal } from '@/components/trade-files/NewFileModal';
import { InvoiceModal } from '@/components/documents/InvoiceModal';
import { ProformaModal } from '@/components/documents/ProformaModal';
import { PackingListModal } from '@/components/documents/PackingListModal';
import { TransactionModal } from '@/components/accounting/TransactionModal';
import { useDeleteInvoice, useDeletePackingList } from '@/hooks/useDocuments';
import { useDeleteProforma } from '@/hooks/useProformas';
import { useSettings, useBankAccounts } from '@/hooks/useSettings';
import { useTransactions } from '@/hooks/useTransactions';
import { printInvoice, printPackingList, printProforma } from '@/lib/printDocument';
import { NativeSelect } from '@/components/ui/form-elements';
import { LoadingSpinner } from '@/components/ui/shared';
import { DocStatusBadge } from '@/components/ui/DocStatusBadge';
import { ApprovalActions } from '@/components/ui/ApprovalActions';
import { TransportPlanSection } from '@/components/transport/TransportPlanSection';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, FileText, Package, Receipt, Pencil, Printer,
  Trash2, TrendingUp, Truck, ChevronDown, ChevronUp, Plus,
  MoreVertical, X, RotateCcw, Bell, AlertTriangle, ExternalLink,
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
function Section({
  title, icon, right, children, accent = false,
}: {
  title: string; icon?: React.ReactNode; right?: React.ReactNode;
  children: React.ReactNode; accent?: boolean;
}) {
  return (
    <div className={cn(
      'rounded-2xl bg-white shadow-sm overflow-hidden mb-3',
      accent ? 'ring-1 ring-brand-200' : '',
    )}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <div className="flex items-center gap-2">
          {icon && <span className="text-gray-400">{icon}</span>}
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{title}</span>
        </div>
        {right}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

// ── Key/Value row ─────────────────────────────────────────────────────────────
function KV({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-[11px] text-gray-400 shrink-0 mr-3">{label}</span>
      <span className={cn('text-[12px] text-right', bold ? 'font-bold text-gray-900' : 'text-gray-700')}>
        {value}
      </span>
    </div>
  );
}

// ── Document row ──────────────────────────────────────────────────────────────
function DocRow({
  no, date, amount, status, children,
}: {
  no: string; date?: string; amount?: string; status: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-50 last:border-0">
      <div
        className="flex items-center gap-3 py-3 cursor-pointer active:bg-gray-50"
        onClick={() => setOpen(o => !o)}
      >
        <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
          <FileText className="h-3.5 w-3.5 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[12px] text-gray-900 truncate">{no}</div>
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

// ── Page ──────────────────────────────────────────────────────────────────────
export function TradeFileDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const writable = canWrite(profile?.role);
  const { data: file, isLoading } = useTradeFile(id);
  const { data: settings } = useSettings();
  const { data: bankAccounts } = useBankAccounts();
  const changeStatus = useChangeStatus();
  const deleteInv = useDeleteInvoice();
  const deletePL = useDeletePackingList();
  const deletePI = useDeleteProforma();
  const defaultBank = bankAccounts?.find(b => b.is_default) ?? bankAccounts?.[0] ?? null;
  const { data: fileTxns = [] } = useTransactions({ tradeFileId: id });
  const { theme } = useTheme();
  const isDonezo = theme === 'donezo';
  const accent = isDonezo ? '#dc2626' : '#2563eb';

  const [saleOpen, setSaleOpen] = useState(false);
  const [editSaleOpen, setEditSaleOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [editFileOpen, setEditFileOpen] = useState(false);
  const [txnModal, setTxnModal] = useState<{ open: boolean; type: 'purchase_inv' | 'svc_inv' }>({ open: false, type: 'purchase_inv' });
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
  const [delayOpen, setDelayOpen] = useState(false);
  const [delayEta, setDelayEta] = useState('');
  const [delayNotes, setDelayNotes] = useState('');
  const noteDelay = useNoteDelay();

  if (isLoading) return <LoadingSpinner />;
  if (!file) return <div className="text-center py-12 text-gray-400 text-sm">Dosya bulunamadı</div>;

  const isSaleOrDel = file.status === 'sale' || file.status === 'delivery';
  const meta = STATUS_META[file.status] ?? STATUS_META.request;
  const expenses = fileTxns.filter(t => ['purchase_inv', 'svc_inv'].includes(t.transaction_type));

  function handleStatusChange(newStatus: string) {
    if (!newStatus || newStatus === file!.status) return;
    if (window.confirm(`Statüyü "${TRADE_FILE_STATUS_LABELS[newStatus as TradeFileStatus]}" olarak değiştir?`))
      changeStatus.mutate({ id: file!.id, status: newStatus as TradeFileStatus });
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

  const custName = file.customer?.name ?? 'Unknown';
  const custInitials = custName.split(/\s+/).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
  const avatarColors = ['#dc2626','#2563eb','#7c3aed','#059669','#d97706'];
  let hv = 0; for (let i = 0; i < custName.length; i++) hv = custName.charCodeAt(i) + ((hv << 5) - hv);
  const avatarBg = avatarColors[Math.abs(hv) % avatarColors.length];

  // ── Combined file info card (replaces statsGrid + File Info section) ────────
  const fileInfoCard = (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* 2-col grid: key stats */}
      <div className="grid grid-cols-2 divide-x divide-gray-50">
        <div className="px-4 py-3 border-b border-gray-50">
          <div className="text-[9px] text-gray-400 font-medium mb-0.5 uppercase tracking-wider">Date</div>
          <div className="text-[13px] font-bold text-gray-900">{fDate(file.file_date)}</div>
        </div>
        <div className="px-4 py-3 border-b border-gray-50">
          <div className="text-[9px] text-gray-400 font-medium mb-0.5 uppercase tracking-wider">Tonnage</div>
          <div className="text-[13px] font-bold text-gray-900">{fN(file.tonnage_mt, 3)} MT</div>
        </div>
        <div className="px-4 py-3 border-b border-gray-50">
          <div className="text-[9px] text-gray-400 font-medium mb-0.5 uppercase tracking-wider">Sale Price</div>
          <div className="text-[13px] font-bold text-gray-900">
            {file.selling_price ? fCurrency(file.selling_price) + '/MT' : '—'}
          </div>
        </div>
        <div className="px-4 py-3 border-b border-gray-50">
          <div className="text-[9px] text-gray-400 font-medium mb-0.5 uppercase tracking-wider">Delivered</div>
          <div className="text-[13px] font-bold text-gray-900">
            {file.delivered_admt ? fN(file.delivered_admt, 0) + ' ADMT' : '—'}
          </div>
        </div>
      </div>
      {/* KV rows: remaining file info */}
      <div className="divide-y divide-gray-50">
        {file.customer_ref && (
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-[11px] text-gray-400">Ref</span>
            <span className="text-[11px] font-medium text-gray-700">{file.customer_ref}</span>
          </div>
        )}
        {file.notes && (
          <div className="flex items-start justify-between gap-4 px-4 py-2.5">
            <span className="text-[11px] text-gray-400 shrink-0">Notes</span>
            <span className="text-[11px] text-gray-700 text-right">{file.notes}</span>
          </div>
        )}
      </div>
    </div>
  );

  const actionsPanel = (isMobile: boolean) => (
    <div className={cn('bg-white rounded-2xl shadow-sm overflow-hidden', isMobile ? '' : '')}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Actions</span>
      </div>
      <div className="px-3 py-2">
        <ActionItem icon={<Pencil className="h-4 w-4" />} label="Edit File"
          onClick={() => { setActionsOpen(false); setEditFileOpen(true); }} />
        {isSaleOrDel && (
          <>
            <ActionItem icon={<Receipt className="h-4 w-4" />} label="Sale Invoice"
              onClick={() => { setActionsOpen(false); const e = file.invoices?.find(i => i.invoice_type === 'sale') ?? null; setEditSaleInvoice(e); setSaleInvoiceOpen(true); }} />
            <ActionItem icon={<Receipt className="h-4 w-4" />} label="Commercial Invoice"
              onClick={() => { setActionsOpen(false); setEditInvoice(null); setInvoiceOpen(true); }} />
            <ActionItem icon={<Package className="h-4 w-4" />} label="Packing List"
              onClick={() => { setActionsOpen(false); setEditPL(null); setPackingOpen(true); }} />
            <ActionItem icon={<FileText className="h-4 w-4" />} label="Proforma Invoice"
              onClick={() => { setActionsOpen(false); setEditPI(null); setProformaOpen(true); }} />
          </>
        )}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
            <RotateCcw className="h-4 w-4" />
          </div>
          <span className="flex-1 text-[13px] font-medium text-gray-800">Change Status</span>
          <NativeSelect
            className="text-[12px] font-semibold text-gray-600 bg-gray-100 rounded-lg px-2 py-1 border-0 outline-none"
            value={file.status}
            onChange={(e) => { handleStatusChange(e.target.value); setActionsOpen(false); }}
          >
            <option value="request">Request</option>
            <option value="sale">Sale</option>
            <option value="delivery">Delivery</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </NativeSelect>
        </div>
      </div>
    </div>
  );

  return (
    <div className="-mx-4 -mt-4 md:mx-0 md:mt-0 bg-gray-50 min-h-screen pb-8">

      {/* ══════════════════════════════════════════════════════════════
          MOBILE  (< md)
      ══════════════════════════════════════════════════════════════ */}
      <div className="md:hidden pb-28">
        {/* Header card */}
        <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm px-4 pt-4 pb-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-500 active:opacity-60">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-bold', meta.pill)}>
              {TRADE_FILE_STATUS_LABELS[file.status]}
            </span>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-[14px] font-bold shrink-0 shadow-sm mt-0.5" style={{ background: avatarBg }}>
              {custInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-bold text-gray-900 leading-snug">{custName}</div>
              <div className="text-[12px] text-gray-500 mt-0.5">{file.product?.name ?? '—'}</div>
              <div className="inline-flex mt-2 bg-gray-100 rounded-lg px-2 py-1">
                <span className="text-[10px] font-mono text-gray-500 tracking-wider">{file.file_no}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Combined file info card */}
        <div className="mx-4 mt-3 mb-3">{fileInfoCard}</div>

        {/* Action buttons */}
        {writable && (
          <div className="flex gap-2 px-4 pb-4">
            {file.status === 'request' ? (
              <button onClick={() => setSaleOpen(true)} className="flex-1 h-10 rounded-full text-white text-[13px] font-semibold flex items-center justify-center gap-2 shadow-sm active:opacity-80" style={{ background: accent }}>
                <TrendingUp className="h-3.5 w-3.5" /> Convert to Sale
              </button>
            ) : file.status === 'sale' ? (
              <button onClick={openDeliveryWithPacking} className="flex-1 h-10 rounded-full text-white text-[13px] font-semibold flex items-center justify-center gap-2 shadow-sm active:opacity-80" style={{ background: accent }}>
                <Truck className="h-3.5 w-3.5" /> {file.delivered_admt ? 'Edit Delivery' : '+ Delivery'}
              </button>
            ) : (
              <button onClick={() => setActionsOpen(true)} className="flex-1 h-10 rounded-full bg-white border border-gray-200 text-[13px] font-semibold text-gray-700 flex items-center justify-center gap-2 shadow-sm active:opacity-70">
                <MoreVertical className="h-4 w-4" /> Actions
              </button>
            )}
            {(file.status === 'request' || file.status === 'sale') && (
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
                <span className="text-[13px] font-bold text-gray-900">Actions</span>
                <button onClick={() => setActionsOpen(false)} className="text-gray-400 p-1"><X className="h-4 w-4" /></button>
              </div>
              <div className="px-3 py-2">{actionsPanel(true)}</div>
              <div className="h-6" />
            </div>
          </>
        )}

        {/* Mobile sections */}
        <div className="px-3">

        {/* ── Sale Details ─────────────────────────────────────────────── */}
        {file.selling_price ? (
          <Section
            title="Sale Details"
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            accent
            right={writable ? (
              <div className="flex items-center gap-2">
                {file.eta && !['completed','cancelled'].includes(file.status) && (
                  <button onClick={() => { setDelayEta(file.revised_eta ?? ''); setDelayNotes(file.delay_notes ?? ''); setDelayOpen(true); }} className="text-[11px] font-semibold text-amber-500 flex items-center gap-1">
                    <Bell className="h-3 w-3" /> Delay
                  </button>
                )}
                <button onClick={() => setEditSaleOpen(true)} className="text-[11px] font-semibold text-gray-400 flex items-center gap-1">
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              </div>
            ) : undefined}
          >
            <KV label="Sale Price" value={`${fCurrency(file.selling_price)}/MT`} bold />
            <KV label="Purchase" value={`${fCurrency(file.purchase_price)}/MT`} />
            <KV label="Supplier" value={file.supplier?.name ?? '—'} />
            <KV label="Incoterms" value={`${file.incoterms ?? ''} ${file.port_of_discharge ?? ''}`.trim() || '—'} />
            {file.eta && <KV label="ETA" value={fDate(file.eta)} />}
            {file.revised_eta && (
              <KV label="Revised ETA" value={
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="font-bold text-amber-600">{fDate(file.revised_eta)}</span>
                </span>
              } />
            )}
            {file.delay_notes && <KV label="Delay Reason" value={file.delay_notes} />}
            {file.vessel_name && (
              <KV label="Vessel" value={
                <a
                  href={`https://www.marinetraffic.com/en/ais/index/search/all?keyword=${encodeURIComponent(file.vessel_name)}`}
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
            {file.register_no && <KV label="Register" value={file.register_no} />}
          </Section>
        ) : (
          <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 mb-3 text-[12px] text-amber-700 font-medium">
            Henüz satış detayı girilmemiş
          </div>
        )}

        {/* ── Delivery ─────────────────────────────────────────────────── */}
        {file.delivered_admt && (
          <Section
            title="Delivery"
            icon={<Truck className="h-3.5 w-3.5" />}
            right={writable ? (
              <button onClick={() => setDeliveryOpen(true)} className="text-[11px] font-semibold text-gray-400 flex items-center gap-1">
                <Pencil className="h-3 w-3" /> Edit
              </button>
            ) : undefined}
          >
            <div className="grid grid-cols-2 gap-x-4">
              <KV label="ADMT" value={fN(file.delivered_admt, 3)} bold />
              <KV label="Gross (KG)" value={fN(file.gross_weight_kg)} />
              <KV label="Packages" value={file.packages ?? '—'} />
              <KV label="Arrival" value={fDate(file.arrival_date)} />
              <KV label="B/L No" value={file.bl_number || '—'} />
              <KV label="SEPTI" value={file.septi_ref || '—'} />
            </div>
          </Section>
        )}

        {/* ── Documents ────────────────────────────────────────────────── */}
        {((file.proformas?.length ?? 0) > 0 ||
          (file.invoices?.length ?? 0) > 0 ||
          (file.packing_lists?.length ?? 0) > 0) && (
          <Section title="Documents" icon={<FileText className="h-3.5 w-3.5" />}>
            {/* Proformas */}
            {file.proformas?.map((pi) => (
              <DocRow
                key={pi.id}
                no={pi.proforma_no}
                date={fDate(pi.proforma_date)}
                amount={fCurrency(pi.total)}
                status={pi.doc_status ?? 'draft'}
              >
                <ApprovalActions table="proformas" id={pi.id} currentStatus={pi.doc_status ?? 'draft'} />
                {writable && (pi.doc_status ?? 'draft') !== 'approved' && (
                  <button onClick={() => { setEditPI(pi); setProformaOpen(true); }}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                )}
                {settings && (
                  <button onClick={() => printProforma(pi, settings, defaultBank, file, (pi.doc_status ?? 'draft') !== 'approved')}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                    <Printer className="h-3 w-3" /> Print
                  </button>
                )}
                {writable && (pi.doc_status ?? 'draft') !== 'approved' && (
                  <button onClick={() => { if (window.confirm('Sil?')) deletePI.mutate(pi.id); }}
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
                amount={fCurrency(inv.total)}
                status={inv.doc_status ?? 'draft'}
              >
                <ApprovalActions table="invoices" id={inv.id} currentStatus={inv.doc_status ?? 'draft'} />
                {writable && (inv.doc_status ?? 'draft') !== 'approved' && (
                  <button onClick={() => { setEditSaleInvoice(inv); setSaleInvoiceOpen(true); }}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                )}
                {settings && (
                  <button onClick={() => printInvoice(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved')}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                    <Printer className="h-3 w-3" /> Print
                  </button>
                )}
              </DocRow>
            ))}

            {/* Com-Invoices */}
            {file.invoices?.filter(i => i.invoice_type === 'commercial').map((inv) => (
              <DocRow
                key={inv.id}
                no={inv.invoice_no}
                date={fDate(inv.invoice_date)}
                amount={fCurrency(inv.total)}
                status={inv.doc_status ?? 'draft'}
              >
                <ApprovalActions table="invoices" id={inv.id} currentStatus={inv.doc_status ?? 'draft'} />
                {writable && (inv.doc_status ?? 'draft') !== 'approved' && (
                  <button onClick={() => { setEditInvoice(inv); setInvoiceOpen(true); }}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                )}
                {settings && (
                  <button onClick={() => printInvoice(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved')}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                    <Printer className="h-3 w-3" /> Print
                  </button>
                )}
                {writable && (inv.doc_status ?? 'draft') !== 'approved' && (
                  <button onClick={() => { if (window.confirm('Sil?')) deleteInv.mutate(inv.id); }}
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
                date={`${pl.packing_list_items?.length ?? 0} vehicles · ${fN(pl.total_admt, 3)} ADMT`}
                status={pl.doc_status ?? 'draft'}
              >
                <ApprovalActions table="packing_lists" id={pl.id} currentStatus={pl.doc_status ?? 'draft'} />
                {writable && (pl.doc_status ?? 'draft') !== 'approved' && (
                  <button onClick={() => { setEditPL(pl); setPackingOpen(true); }}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                )}
                {settings && (
                  <button onClick={() => printPackingList(pl, settings, (pl.doc_status ?? 'draft') !== 'approved')}
                    className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                    <Printer className="h-3 w-3" /> Print
                  </button>
                )}
                {writable && (pl.doc_status ?? 'draft') !== 'approved' && (
                  <button onClick={() => { if (window.confirm('Sil?')) deletePL.mutate(pl.id); }}
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
          title="Expenses"
          icon={<Receipt className="h-3.5 w-3.5" />}
          right={writable ? (
            <div className="flex gap-1.5">
              <button onClick={() => setTxnModal({ open: true, type: 'purchase_inv' })}
                className="h-6 px-2.5 rounded-full text-[10px] font-semibold flex items-center gap-1 bg-gray-100 text-gray-500">
                <Plus className="h-3 w-3" /> Purchase
              </button>
              <button onClick={() => setTxnModal({ open: true, type: 'svc_inv' })}
                className="h-6 px-2.5 rounded-full text-[10px] font-semibold flex items-center gap-1 bg-gray-100 text-gray-500">
                <Plus className="h-3 w-3" /> Service
              </button>
            </div>
          ) : undefined}
        >
          {expenses.length === 0 ? (
            <div className="text-[12px] text-gray-400 py-2 text-center">Henüz gider kaydı yok</div>
          ) : (
            expenses.map(t => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-gray-800 truncate">{t.description || '—'}</div>
                  <div className="text-[10px] text-gray-400">{t.transaction_date} · {TRANSACTION_TYPE_LABELS[t.transaction_type]}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-[12px] font-bold text-gray-800">{fUSD(t.amount_usd ?? t.amount)}</span>
                  <span className={cn(
                    'text-[9px] px-2 py-0.5 rounded-full font-bold',
                    t.payment_status === 'paid' ? 'bg-green-100 text-green-700'
                    : t.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
                  )}>{t.payment_status}</span>
                </div>
              </div>
            ))
          )}
        </Section>

        {/* ── Transport Plan ───────────────────────────────────────────── */}
        {['sale', 'delivery', 'completed'].includes(file.status) && (
          <Section title="Taşıma Planı" icon={<Truck className="h-3.5 w-3.5" />}>
            <TransportPlanSection file={file} writable={writable} />
          </Section>
        )}
        </div>{/* end px-3 */}
      </div>{/* end md:hidden */}

      {/* ══════════════════════════════════════════════════════════════
          DESKTOP  (≥ md)  — 2-column layout
      ══════════════════════════════════════════════════════════════ */}
      <div className="hidden md:grid md:grid-cols-[360px_1fr] md:gap-5 md:items-start">

        {/* ── LEFT column (sticky summary panel) ─────────────────────── */}
        <div className="space-y-3 sticky top-0 max-h-screen overflow-y-auto pb-6 scrollbar-thin">
          {/* Back + status */}
          <div className="flex items-center justify-between pt-1">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-500 hover:text-gray-800 transition-colors">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-bold', meta.pill)}>
              {TRADE_FILE_STATUS_LABELS[file.status]}
            </span>
          </div>

          {/* Header card */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-[18px] font-bold shrink-0 shadow-sm" style={{ background: avatarBg }}>
                {custInitials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[17px] font-bold text-gray-900 leading-snug">{custName}</div>
                <div className="text-[13px] text-gray-500 mt-0.5">{file.product?.name ?? '—'}</div>
                <div className="inline-flex mt-2 bg-gray-100 rounded-lg px-2.5 py-1.5">
                  <span className="text-[11px] font-mono text-gray-600 tracking-wider">{file.file_no}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Combined file info card */}
          {fileInfoCard}

          {/* Primary action */}
          {writable && file.status === 'request' && (
            <button onClick={() => setSaleOpen(true)} className="w-full h-10 rounded-xl text-white text-[13px] font-semibold flex items-center justify-center gap-2 shadow-sm hover:opacity-90 transition-opacity" style={{ background: accent }}>
              <TrendingUp className="h-3.5 w-3.5" /> Convert to Sale
            </button>
          )}
          {writable && file.status === 'sale' && (
            <button onClick={openDeliveryWithPacking} className="w-full h-10 rounded-xl text-white text-[13px] font-semibold flex items-center justify-center gap-2 shadow-sm hover:opacity-90 transition-opacity" style={{ background: accent }}>
              <Truck className="h-3.5 w-3.5" /> {file.delivered_admt ? 'Edit Delivery' : '+ Delivery'}
            </button>
          )}

          {/* Actions panel */}
          {writable && actionsPanel(false)}
        </div>

        {/* ── RIGHT column (detail sections) ─────────────────────────── */}
        <div className="space-y-3 py-1 pb-6">
          {/* Sale Details */}
          {file.selling_price ? (
            <Section title="Sale Details" icon={<TrendingUp className="h-3.5 w-3.5" />} accent
              right={writable ? (
                <div className="flex items-center gap-2">
                  {file.eta && !['completed','cancelled'].includes(file.status) && (
                    <button onClick={() => { setDelayEta(file.revised_eta ?? ''); setDelayNotes(file.delay_notes ?? ''); setDelayOpen(true); }} className="text-[11px] font-semibold text-amber-500 flex items-center gap-1">
                      <Bell className="h-3 w-3" /> Delay
                    </button>
                  )}
                  <button onClick={() => setEditSaleOpen(true)} className="text-[11px] font-semibold text-gray-400 flex items-center gap-1"><Pencil className="h-3 w-3" /> Edit</button>
                </div>
              ) : undefined}>
              <KV label="Sale Price" value={`${fCurrency(file.selling_price)}/MT`} bold />
              <KV label="Purchase" value={`${fCurrency(file.purchase_price)}/MT`} />
              <KV label="Supplier" value={file.supplier?.name ?? '—'} />
              <KV label="Incoterms" value={`${file.incoterms ?? ''} ${file.port_of_discharge ?? ''}`.trim() || '—'} />
              {file.eta && <KV label="ETA" value={fDate(file.eta)} />}
              {file.revised_eta && (
                <KV label="Revised ETA" value={
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="font-bold text-amber-600">{fDate(file.revised_eta)}</span>
                  </span>
                } />
              )}
              {file.delay_notes && <KV label="Delay Reason" value={file.delay_notes} />}
              {file.vessel_name && (
              <KV label="Vessel" value={
                <a
                  href={`https://www.marinetraffic.com/en/ais/index/search/all?keyword=${encodeURIComponent(file.vessel_name)}`}
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
              {file.register_no && <KV label="Register" value={file.register_no} />}
            </Section>
          ) : (
            <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 text-[12px] text-amber-700 font-medium">
              Henüz satış detayı girilmemiş
            </div>
          )}

          {/* Delivery */}
          {file.delivered_admt && (
            <Section title="Delivery" icon={<Truck className="h-3.5 w-3.5" />}
              right={writable ? (<button onClick={() => setDeliveryOpen(true)} className="text-[11px] font-semibold text-gray-400 flex items-center gap-1"><Pencil className="h-3 w-3" /> Edit</button>) : undefined}>
              <div className="grid grid-cols-2 gap-x-4">
                <KV label="ADMT" value={fN(file.delivered_admt, 3)} bold />
                <KV label="Gross (KG)" value={fN(file.gross_weight_kg)} />
                <KV label="Packages" value={file.packages ?? '—'} />
                <KV label="Arrival" value={fDate(file.arrival_date)} />
                <KV label="B/L No" value={file.bl_number || '—'} />
                <KV label="SEPTI" value={file.septi_ref || '—'} />
              </div>
            </Section>
          )}

          {/* Documents */}
          {((file.proformas?.length ?? 0) > 0 || (file.invoices?.length ?? 0) > 0 || (file.packing_lists?.length ?? 0) > 0) && (
            <Section title="Documents" icon={<FileText className="h-3.5 w-3.5" />}>
              {file.proformas?.map((pi) => (
                <DocRow key={pi.id} no={pi.proforma_no} date={fDate(pi.proforma_date)} amount={fCurrency(pi.total)} status={pi.doc_status ?? 'draft'}>
                  <ApprovalActions table="proformas" id={pi.id} currentStatus={pi.doc_status ?? 'draft'} />
                  {writable && (pi.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { setEditPI(pi); setProformaOpen(true); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Pencil className="h-3 w-3" /> Edit</button>)}
                  {settings && (<button onClick={() => printProforma(pi, settings, defaultBank, file, (pi.doc_status ?? 'draft') !== 'approved')} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Printer className="h-3 w-3" /> Print</button>)}
                  {writable && (pi.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { if (window.confirm('Sil?')) deletePI.mutate(pi.id); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500 flex items-center gap-1"><Trash2 className="h-3 w-3" /></button>)}
                </DocRow>
              ))}
              {file.invoices?.filter(i => i.invoice_type === 'sale').map((inv) => (
                <DocRow key={inv.id} no={inv.invoice_no} date={fDate(inv.invoice_date)} amount={fCurrency(inv.total)} status={inv.doc_status ?? 'draft'}>
                  <ApprovalActions table="invoices" id={inv.id} currentStatus={inv.doc_status ?? 'draft'} />
                  {writable && (inv.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { setEditSaleInvoice(inv); setSaleInvoiceOpen(true); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Pencil className="h-3 w-3" /> Edit</button>)}
                  {settings && (<button onClick={() => printInvoice(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved')} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Printer className="h-3 w-3" /> Print</button>)}
                </DocRow>
              ))}
              {file.invoices?.filter(i => i.invoice_type === 'commercial').map((inv) => (
                <DocRow key={inv.id} no={inv.invoice_no} date={fDate(inv.invoice_date)} amount={fCurrency(inv.total)} status={inv.doc_status ?? 'draft'}>
                  <ApprovalActions table="invoices" id={inv.id} currentStatus={inv.doc_status ?? 'draft'} />
                  {writable && (inv.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { setEditInvoice(inv); setInvoiceOpen(true); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Pencil className="h-3 w-3" /> Edit</button>)}
                  {settings && (<button onClick={() => printInvoice(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved')} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Printer className="h-3 w-3" /> Print</button>)}
                  {writable && (inv.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { if (window.confirm('Sil?')) deleteInv.mutate(inv.id); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500 flex items-center gap-1"><Trash2 className="h-3 w-3" /></button>)}
                </DocRow>
              ))}
              {file.packing_lists?.map((pl) => (
                <DocRow key={pl.id} no={pl.packing_list_no} date={`${pl.packing_list_items?.length ?? 0} vehicles · ${fN(pl.total_admt, 3)} ADMT`} status={pl.doc_status ?? 'draft'}>
                  <ApprovalActions table="packing_lists" id={pl.id} currentStatus={pl.doc_status ?? 'draft'} />
                  {writable && (pl.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { setEditPL(pl); setPackingOpen(true); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Pencil className="h-3 w-3" /> Edit</button>)}
                  {settings && (<button onClick={() => printPackingList(pl, settings, (pl.doc_status ?? 'draft') !== 'approved')} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Printer className="h-3 w-3" /> Print</button>)}
                  {writable && (pl.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { if (window.confirm('Sil?')) deletePL.mutate(pl.id); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500 flex items-center gap-1"><Trash2 className="h-3 w-3" /></button>)}
                </DocRow>
              ))}
            </Section>
          )}

          {/* Expenses */}
          <Section title="Expenses" icon={<Receipt className="h-3.5 w-3.5" />}
            right={writable ? (
              <div className="flex gap-1.5">
                <button onClick={() => setTxnModal({ open: true, type: 'purchase_inv' })} className="h-6 px-2.5 rounded-full text-[10px] font-semibold flex items-center gap-1 bg-gray-100 text-gray-500"><Plus className="h-3 w-3" /> Purchase</button>
                <button onClick={() => setTxnModal({ open: true, type: 'svc_inv' })} className="h-6 px-2.5 rounded-full text-[10px] font-semibold flex items-center gap-1 bg-gray-100 text-gray-500"><Plus className="h-3 w-3" /> Service</button>
              </div>
            ) : undefined}>
            {expenses.length === 0 ? (
              <div className="text-[12px] text-gray-400 py-2 text-center">Henüz gider kaydı yok</div>
            ) : (
              expenses.map(t => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-gray-800 truncate">{t.description || '—'}</div>
                    <div className="text-[10px] text-gray-400">{t.transaction_date} · {TRANSACTION_TYPE_LABELS[t.transaction_type]}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[12px] font-bold text-gray-800">{fUSD(t.amount_usd ?? t.amount)}</span>
                    <span className={cn('text-[9px] px-2 py-0.5 rounded-full font-bold',
                      t.payment_status === 'paid' ? 'bg-green-100 text-green-700'
                      : t.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                    )}>{t.payment_status}</span>
                  </div>
                </div>
              ))
            )}
          </Section>

          {/* Transport Plan */}
          {['sale', 'delivery', 'completed'].includes(file.status) && (
            <Section title="Taşıma Planı" icon={<Truck className="h-3.5 w-3.5" />}>
              <TransportPlanSection file={file} writable={writable} />
            </Section>
          )}
        </div>
      </div>{/* end desktop grid */}

      {/* ── Note Delay Modal ─────────────────────────────────────────── */}
      {delayOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setDelayOpen(false)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl p-5 max-w-sm mx-auto">
            <div className="text-[15px] font-bold text-gray-900 mb-1">Note Delay</div>
            {file.eta && (
              <div className="text-[12px] text-gray-400 mb-4">
                Original ETA: <span className="font-semibold text-gray-700">{fDate(file.eta)}</span>
              </div>
            )}
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">New ETA</label>
            <input
              type="date"
              value={delayEta}
              onChange={e => setDelayEta(e.target.value)}
              className="w-full mt-1 mb-3 px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] outline-none focus:border-blue-400"
            />
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Delay Reason</label>
            <textarea
              value={delayNotes}
              onChange={e => setDelayNotes(e.target.value)}
              className="w-full mt-1 mb-4 px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] resize-none outline-none focus:border-blue-400"
              rows={2}
              placeholder="e.g. Vessel delayed at port of loading"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setDelayOpen(false)}
                className="flex-1 h-10 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600"
              >
                Cancel
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
                Save Delay
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      <NewFileModal open={editFileOpen} onOpenChange={setEditFileOpen} editMode fileToEdit={file} />
      <ToSaleModal open={saleOpen} onOpenChange={setSaleOpen} file={file} />
      <ToSaleModal open={editSaleOpen} onOpenChange={setEditSaleOpen} file={file} editMode />
      <DeliveryModal open={deliveryOpen} onOpenChange={handleDeliveryClose} file={file} />
      <InvoiceModal open={invoiceOpen} onOpenChange={setInvoiceOpen} file={file} invoice={editInvoice} />
      <InvoiceModal open={saleInvoiceOpen} onOpenChange={setSaleInvoiceOpen} file={file} invoice={editSaleInvoice} invoiceType="sale" />
      <ProformaModal open={proformaOpen} onOpenChange={setProformaOpen} file={file} proforma={editPI} />
      <PackingListModal open={packingOpen} onOpenChange={setPackingOpen} file={file} packingList={editPL} />
      <TransactionModal
        open={txnModal.open}
        onOpenChange={(v) => setTxnModal(m => ({ ...m, open: v }))}
        defaultType={txnModal.type}
        defaultTradeFileId={file.id}
      />
    </div>
  );
}
