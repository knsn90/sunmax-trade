import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useTradeFile, useChangeStatus, useNoteDelay, useDeleteTradeFile, useUpdateSaleDetails, tradeFileKeys } from '@/hooks/useTradeFiles';
import { tradeFileService } from '@/services/tradeFileService';
import { dropboxService } from '@/services/dropboxService';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { canWrite } from '@/lib/permissions';
import { fN, fDate, fCurrency, fUSD } from '@/lib/formatters';
import type { Invoice, PackingList, Proforma } from '@/types/database';
import type { TradeFileStatus } from '@/types/enums';
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
import { NativeSelect } from '@/components/ui/form-elements';
import { LoadingSpinner } from '@/components/ui/shared';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DocStatusBadge } from '@/components/ui/DocStatusBadge';
import { ApprovalActions } from '@/components/ui/ApprovalActions';
import { TransportPlanSection } from '@/components/transport/TransportPlanSection';
import { ObligationsSection } from '@/components/trade-files/ObligationsSection';
import { NotesSection } from '@/components/trade-files/NotesSection';
import { AttachmentsSection } from '@/components/trade-files/AttachmentsSection';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
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
        className={cn('flex items-center justify-between px-4 py-3 border-b border-gray-50', collapsible ? 'cursor-pointer select-none' : '')}
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

// ── Partiler Kartı ────────────────────────────────────────────────────────────
const TRANSPORT_LABEL: Record<string, string> = {
  sea: 'Gemi', road: 'TIR', rail: 'Vagon', air: 'Uçak', mixed: 'Karma',
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
  const deleteFile = useDeleteTradeFile();
  const batches = file.batches ?? [];

  function handleDeleteBatch(e: React.MouseEvent, batchId: string, batchNo: string) {
    e.stopPropagation();
    if (!window.confirm(`P${batchNo} partisini silmek istediğinizden emin misiniz?\nBu işlem geri alınamaz.`)) return;
    deleteFile.mutate(batchId);
  }
  if (batches.length === 0 && !writable) return null;

  const usedTon   = batches.reduce((s, b) => s + (b.tonnage_mt ?? 0), 0);
  const totalTon  = file.tonnage_mt ?? 0;
  const pct       = totalTon > 0 ? Math.min(100, Math.round((usedTon / totalTon) * 100)) : 0;
  const remaining = Math.max(0, totalTon - usedTon);

  const STATUS_DOT: Record<string, string> = {
    request: 'bg-amber-400', sale: 'bg-blue-400',
    delivery: 'bg-violet-400', completed: 'bg-green-400', cancelled: 'bg-gray-300',
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div
        className={cn('px-6 py-4 border-b border-gray-50 flex items-center justify-between', onToggle ? 'cursor-pointer select-none' : '')}
        onClick={onToggle}
      >
        <div className="flex items-center gap-2.5">
          <Layers className="h-4 w-4 text-gray-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Partiler</span>
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
            <div className="px-6 py-3 border-b border-gray-50 bg-gray-50/40">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-gray-500">
                  Yüklenen: <strong className="text-gray-900">{usedTon.toLocaleString('tr-TR')} MT</strong>
                </span>
                <span className="text-[11px] font-semibold text-gray-500">
                  Kalan: <strong className={remaining > 0 ? 'text-amber-600' : 'text-green-600'}>
                    {remaining.toLocaleString('tr-TR')} MT
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
                          {b.tonnage_mt ? `${b.tonnage_mt.toLocaleString('tr-TR')} MT` : '—'}
                          {b.transport_mode ? ` · ${TRANSPORT_LABEL[b.transport_mode] ?? b.transport_mode}` : ''}
                          {b.eta ? ` · ETA ${b.eta}` : ''}
                        </p>
                      </div>
                      <span className={cn('w-2 h-2 rounded-full shrink-0', STATUS_DOT[b.status] ?? 'bg-gray-300')} />
                    </button>
                    {/* Sil butonu — sadece writable modda, hover'da görünür */}
                    {writable && (
                      <button
                        onClick={(e) => handleDeleteBatch(e, b.id, String(b.batch_no))}
                        disabled={deleteFile.isPending}
                        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
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
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function TradeFileDetailPage() {
  const { t } = useTranslation('tradeFiles');
  const { t: tc } = useTranslation('common');

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const writable = canWrite(profile?.role);
  const { data: file, isLoading } = useTradeFile(id);
  // Batch dosyalar için ana dosyayı fetch et (satış detaylarını senkronize edebilmek için)
  const { data: parentFile } = useTradeFile(file?.parent_file_id ?? undefined);
  const updateSaleDetails = useUpdateSaleDetails();
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
  const [purchaseInvOpen, setPurchaseInvOpen] = useState(false);
  const [svcInvOpen, setSvcInvOpen] = useState(false);
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
  const [dropboxLoading, setDropboxLoading] = useState(false);
  const [dropboxUploadingId, setDropboxUploadingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [editingFileNo, setEditingFileNo] = useState(false);
  const [fileNoInput, setFileNoInput] = useState('');

  async function handleSaveFileNo() {
    if (!fileNoInput.trim() || !file) return;
    try {
      await tradeFileService.updateFileNo(file.id, fileNoInput.trim());
      queryClient.invalidateQueries({ queryKey: ['tradeFile', file.id] });
      queryClient.invalidateQueries({ queryKey: ['tradeFiles'] });
      setEditingFileNo(false);
      toast.success('Dosya numarası güncellendi');
    } catch {
      toast.error('Güncelleme başarısız');
    }
  }

  const handleOpenDropbox = useCallback(async () => {
    if (!file) return;
    const customerName = file.customer?.name ?? 'Unknown';
    const fileNo = file.file_no;
    setDropboxLoading(true);
    try {
      // Her zaman createTradeFolder çağır — klasör silinmişse yeniden oluşturur,
      // zaten varsa Dropbox API sessizce mevcut klasörü döndürür.
      const res = await dropboxService.createTradeFolder(customerName, fileNo);
      const folderPath = res.folderPath as string;
      const folderUrl = res.folderUrl as string;
      // DB'deki URL değiştiyse güncelle
      if (folderUrl !== file.dropbox_folder_url) {
        await dropboxService.saveFolderToDb(file.id, folderPath, folderUrl);
        queryClient.invalidateQueries({ queryKey: tradeFileKeys.detail(file.id) });
      }
      window.open(folderUrl, '_blank');
    } catch (e) {
      const { toast } = await import('sonner');
      toast.error('Dropbox klasörü açılamadı: ' + (e as Error).message);
    } finally {
      setDropboxLoading(false);
    }
  }, [file]);

  const handleUploadToDropbox = useCallback(async (docId: string, docName: string, html: string) => {
    if (!file) return;
    setDropboxUploadingId(docId);
    try {
      const { toast } = await import('sonner');
      const upRes = await dropboxService.uploadDocument(
        file.customer?.name ?? 'Unknown',
        file.file_no,
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

  // Auto-create Dropbox folder when file loads without one
  useEffect(() => {
    if (!file || file.dropbox_folder_url) return;
    const customerName = file.customer?.name;
    if (!customerName) return;

    dropboxService.createTradeFolder(customerName, file.file_no)
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

  const isSaleOrDel = file.status === 'sale' || file.status === 'delivery';
  const meta = STATUS_META[file.status] ?? STATUS_META.request;
  const expenses = fileTxns.filter(t => ['purchase_inv', 'svc_inv'].includes(t.transaction_type));
  // Satış detayı var mı? selling_price 0 olabilir, bu yüzden != null kontrolü
  const hasSaleDetails = !!(file.supplier_id || file.selling_price != null || file.incoterms || file.payment_terms || file.port_of_discharge);

  // ── Parti / kısmi sevkiyat hesaplamaları ────────────────────────────────────
  const isBatch    = !!file.parent_file_id;                          // bu dosya bir alt parti mi?
  const isPartial  = !isBatch && (file.batches?.length ?? 0) > 0;   // ana dosyada parti var mı?
  // Kalan tonaj: tüm parti tonajları ana dosyadan düşülür
  const usedTonnage   = (file.batches ?? []).reduce((s, b) => s + (b.tonnage_mt ?? 0), 0);
  const remainingTonnage = Math.max(0, file.tonnage_mt - usedTonnage);
  // Tamamlandı butonu: tüm partiler completed VE tüm tonaj dağıtılmış olmalı
  const allBatchesDone = isPartial
    && remainingTonnage === 0
    && (file.batches ?? []).every(b => b.status === 'completed');
  // Batch file_no = "ANA/P1" → ana dosya no = "ANA"
  const parentFileNo = isBatch ? file.file_no.split('/').slice(0, -1).join('/') : null;
  // Teslim edilen: partili dosyada tamamlanan partilerin tonnage toplamı, değilse delivered_admt
  const deliveredTonnage = isPartial
    ? (file.batches ?? []).filter(b => b.status === 'completed').reduce((s, b) => s + (b.tonnage_mt ?? 0), 0)
    : (file.delivered_admt ?? null);

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

  function handlePartialCTA() {
    if (allBatchesDone) {
      if (window.confirm('Tüm partiler tamamlandı. Ana dosya tamamlandı olarak işaretlensin mi?')) {
        changeStatus.mutate({ id: file!.id, status: 'completed' });
      }
    } else {
      const remaining = (file!.batches ?? []).filter(b => b.status !== 'completed').length;
      toast.warning(`${remaining} parti henüz tamamlanmadı — önce tüm teslimat partilerini tamamlayın`);
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
        { key: 'completed', label: 'Tamamlandı' },
      ];
  const isCancelled = file.status === 'cancelled';
  const currentStageIdx = isCancelled ? -1 : STAGES.findIndex(s => s.key === file.status);


  const statusStepper = (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3">
      {isCancelled ? (
        <div className="flex items-center gap-2 text-red-500">
          <X className="h-3.5 w-3.5" />
          <span className="text-[11px] font-bold uppercase tracking-wider">İptal Edildi</span>
        </div>
      ) : (
        <div className="flex items-center gap-0">
          {STAGES.map((stage, idx) => {
            const isDone   = currentStageIdx > idx;
            const isActive = currentStageIdx === idx;
            return (
              <div key={stage.key} className="flex items-center flex-1 last:flex-none">
                {/* circle + label */}
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300',
                      isDone   ? 'text-white'     : '',
                      isActive ? 'text-white ring-[3px] ring-offset-1' : '',
                      !isDone && !isActive ? 'bg-gray-100 text-gray-300' : '',
                    )}
                    style={{
                      background: isDone || isActive ? accent : undefined,
                      ...(isActive ? { '--tw-ring-color': accent + '40' } as React.CSSProperties : {}),
                    }}
                  >
                    {isDone ? (
                      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <span className="text-[9px] font-black">{idx + 1}</span>
                    )}
                  </div>
                  <span className={cn(
                    'text-[9px] font-bold uppercase tracking-wider whitespace-nowrap',
                    isDone   ? 'text-gray-300' : '',
                    isActive ? 'text-gray-700' : '',
                    !isDone && !isActive ? 'text-gray-300' : '',
                  )}>{stage.label}</span>
                </div>
                {/* connector */}
                {idx < STAGES.length - 1 && (
                  <div
                    className="flex-1 h-px mx-2 mb-4 rounded-full transition-all duration-500"
                    style={{ background: isDone ? accent + '50' : '#e5e7eb' }}
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
          <div className="text-[9px] text-gray-400 font-medium mb-0.5 uppercase tracking-wider">{t('detail.fileInfo.date')}</div>
          <div className="text-[13px] font-bold text-gray-900">{fDate(file.file_date)}</div>
        </div>
        <div className="px-4 py-3 border-b border-gray-50">
          <div className="text-[9px] text-gray-400 font-medium mb-0.5 uppercase tracking-wider">{t('detail.fileInfo.tonnage')}</div>
          <div className="text-[13px] font-bold text-gray-900">{fN(file.tonnage_mt, 3)} MT</div>
        </div>
        <div className="px-4 py-3 border-b border-gray-50">
          <div className="text-[9px] text-gray-400 font-medium mb-0.5 uppercase tracking-wider">{t('detail.fileInfo.salePrice')}</div>
          <div className="text-[13px] font-bold text-gray-900">
            {file.selling_price ? fCurrency(file.selling_price) + '/MT' : '—'}
          </div>
        </div>
        <div className="px-4 py-3 border-b border-gray-50">
          <div className="text-[9px] text-gray-400 font-medium mb-0.5 uppercase tracking-wider">{t('detail.fileInfo.delivered')}</div>
          <div className="text-[13px] font-bold text-gray-900">
            {deliveredTonnage ? fN(deliveredTonnage, 0) + ' MT' : '—'}
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{t('detail.actions.title')}</span>
      </div>
      <div className="px-3 py-2">
        <ActionItem
          icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4zM18 2l-6 4 6 4-6 4 6 4 6-4-6-4 6-4zM6 16.5L12 21l6-4.5-6-4z"/></svg>}
          label={file.dropbox_folder_url ? 'Dropbox ●' : 'Dropbox'}
          onClick={() => { setActionsOpen(false); handleOpenDropbox(); }}
        />
        {isSaleOrDel && (
          <>
            <ActionItem icon={<Receipt className="h-4 w-4" />} label={t('detail.actions.commercialInvoice')}
              onClick={() => { setActionsOpen(false); setEditInvoice(null); setInvoiceOpen(true); }} />
            <ActionItem icon={<Package className="h-4 w-4" />} label={t('detail.actions.packingList')}
              onClick={() => { setActionsOpen(false); setEditPL(null); setPackingOpen(true); }} />
            <ActionItem icon={<FileText className="h-4 w-4" />} label={t('detail.actions.proformaInvoice')}
              onClick={() => { setActionsOpen(false); setEditPI(null); setProformaOpen(true); }} />
          </>
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
    <div className="-mx-4 md:mx-0 bg-gray-50 min-h-screen pb-8 md:h-full md:min-h-0 md:pb-0">

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
        <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm px-4 pt-4 pb-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-500 active:opacity-60">
              <ArrowLeft className="h-4 w-4" /> {tc('btn.back')}
            </button>
            <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-bold', meta.pill)}>
              {tc('status.' + file.status)}
            </span>
          </div>
          {/* Alt Parti badge — mobil */}
          {isBatch && (
            <button
              onClick={() => navigate(`/files/${file.parent_file_id}`)}
              className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-xl bg-violet-50 border border-violet-100 w-full active:bg-violet-100 transition-colors"
            >
              <Layers className="h-3 w-3 text-violet-500 shrink-0" />
              <span className="text-[10px] font-bold text-violet-500 uppercase tracking-wide">Alt Parti</span>
              <span className="text-[10px] font-mono text-violet-700 font-semibold ml-0.5">← {parentFileNo}</span>
            </button>
          )}
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-[14px] font-bold shrink-0 shadow-sm mt-0.5" style={{ background: avatarBg }}>
              {custInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-bold text-gray-900 leading-snug">{custName}</div>
              {parentCust && (
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 uppercase tracking-wide">Muhasebe</span>
                  <span className="text-[11px] font-semibold text-violet-700">{parentCust.name}</span>
                </div>
              )}
              <div className="text-[12px] text-gray-500 mt-0.5">{file.product?.name ?? '—'}</div>
              <div className="inline-flex mt-2 bg-gray-100 rounded-lg px-2 py-1">
                {editingFileNo ? (
                  <div className="flex items-center gap-1">
                    <input
                      className="text-[11px] font-mono border border-gray-200 rounded px-2 py-0.5 outline-none w-52 bg-white"
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
                    className="text-[10px] font-mono text-gray-500 tracking-wider hover:text-gray-700 flex items-center gap-1 group"
                  >
                    {file.file_no}
                    <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Status stepper */}
        <div className="mx-4 mt-3">{statusStepper}</div>

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
                onClick={() => { if (window.confirm('Bu dosya tamamlandı olarak işaretlensin mi?')) changeStatus.mutate({ id: file!.id, status: 'completed' }); }}
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
              <KV label={t('detail.saleDetails.salePrice')} value={file.selling_price ? `${fCurrency(file.selling_price)}/MT` : '—'} bold />
              <KV label={t('detail.saleDetails.purchase')} value={`${fCurrency(file.purchase_price)}/MT`} />
              <KV label={t('detail.saleDetails.supplier')} value={file.supplier?.name ?? '—'} />
              <KV label={t('detail.saleDetails.incoterms')} value={`${file.incoterms ?? ''} ${file.port_of_discharge ?? ''}`.trim() || '—'} />
              {file.eta && <KV label={t('detail.saleDetails.eta')} value={fDate(file.eta)} />}
              {file.revised_eta && (
                <KV label={t('detail.saleDetails.revisedEta')} value={
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="font-bold text-amber-600">{fDate(file.revised_eta)}</span>
                  </span>
                } />
              )}
              {file.delay_notes && <KV label={t('detail.saleDetails.delayReason')} value={file.delay_notes} />}
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

        {/* ── Obligations ──────────────────────────────────────────────── */}
        <ObligationsSection
          file={file}
          writable={writable}
          collapsed={!!collapsed.m_obligations}
          onToggle={() => toggleCard('m_obligations')}
        />

        {/* ── Delivery ─────────────────────────────────────────────────── */}
        {file.delivered_admt && (
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
              <KV label={t('detail.delivery.admt')} value={fN(file.delivered_admt, 3)} bold />
              <KV label={t('detail.delivery.grossKg')} value={fN(file.gross_weight_kg)} />
              <KV label={t('detail.delivery.packages')} value={file.packages ?? '—'} />
              <KV label={t('detail.delivery.arrival')} value={fDate(file.arrival_date)} />
              <KV label={t('detail.delivery.blNo')} value={file.bl_number || '—'} />
              <KV label={t('detail.delivery.septi')} value={file.septi_ref || '—'} />
            </div>
          </Section>
        )}

        {/* ── Documents ────────────────────────────────────────────────── */}
        {((file.proformas?.length ?? 0) > 0 ||
          (file.invoices?.length ?? 0) > 0 ||
          (file.packing_lists?.length ?? 0) > 0) && (
          <Section title={t('detail.documents.title')} icon={<FileText className="h-3.5 w-3.5" />}
            collapsible isCollapsed={!!collapsed.m_docs} onToggle={() => toggleCard('m_docs')}>
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
                amount={fCurrency(inv.total)}
                status={inv.doc_status ?? 'draft'}
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
                amount={fCurrency(inv.total)}
                status={inv.doc_status ?? 'draft'}
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
              <button onClick={() => setPurchaseInvOpen(true)}
                className="h-6 px-2.5 rounded-full text-[10px] font-semibold flex items-center gap-1 bg-gray-100 text-gray-500">
                <Plus className="h-3 w-3" /> {t('detail.expenses.addPurchase')}
              </button>
              <button onClick={() => setSvcInvOpen(true)}
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
              <div key={txn.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-gray-800 truncate">{txn.description || '—'}</div>
                  <div className="text-[10px] text-gray-400">{txn.transaction_date} · {tc(`txType.${txn.transaction_type}`)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-[12px] font-bold text-gray-800">{fUSD(txn.amount_usd ?? txn.amount)}</span>
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

        {/* ── Partiler (mobil) — sadece en az 1 parti varsa göster ───── */}
        {!file.parent_file_id && (file.batches?.length ?? 0) > 0 && (
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
        {['sale', 'delivery', 'completed'].includes(file.status) && (
          <Section title={t('detail.transport.title')} icon={<Truck className="h-3.5 w-3.5" />}
            collapsible isCollapsed={!!collapsed.m_transport} onToggle={() => toggleCard('m_transport')}>
            <TransportPlanSection file={file} writable={writable} />
          </Section>
        )}

        {/* ── Notes + Attachments (split) ──────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
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
                    <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
                {file.revised_eta && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    <AlertTriangle className="h-3 w-3" /> Gecikme
                  </span>
                )}
              </div>
              <h1 className="text-[24px] font-extrabold text-gray-900 leading-tight tracking-tight">{custName}</h1>
              {parentCust && (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 uppercase tracking-widest">Muhasebe</span>
                  <span className="text-[12px] font-semibold text-violet-700">{parentCust.name}</span>
                </div>
              )}
              <p className="text-[12px] text-gray-500 mt-0.5">{file.product?.name ?? '—'}</p>
            </div>

            {/* Quick info 2×2 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="grid grid-cols-2 divide-x divide-gray-50">
                <div className="px-5 py-4 border-b border-gray-50">
                  <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">{t('detail.fileInfo.date')}</div>
                  <div className="text-[15px] font-extrabold text-gray-900">{fDate(file.file_date)}</div>
                </div>
                <div className="px-5 py-4 border-b border-gray-50">
                  <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">{t('detail.fileInfo.tonnage')}</div>
                  <div className="text-[15px] font-extrabold text-gray-900">{fN(file.tonnage_mt, 3)} MT</div>
                </div>
                <div className="px-5 py-4">
                  <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">{t('detail.fileInfo.salePrice')}</div>
                  <div className="text-[15px] font-extrabold text-gray-900">
                    {file.selling_price ? fCurrency(file.selling_price) + '/MT' : '—'}
                  </div>
                </div>
                <div className="px-5 py-4">
                  <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">{t('detail.fileInfo.delivered')}</div>
                  <div className="text-[15px] font-extrabold text-gray-900">
                    {deliveredTonnage ? fN(deliveredTonnage, 0) + ' MT' : '—'}
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
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/60">
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
                {isSaleOrDel && writable && (
                  <>
                    <button onClick={() => { setEditInvoice(null); setInvoiceOpen(true); }} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group text-left">
                      <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-red-50 transition-colors">
                        <FileText className="h-3.5 w-3.5 text-gray-500 group-hover:text-red-600" style={{ color: undefined }} />
                      </div>
                      <span className="text-[13px] font-semibold text-gray-800">{t('detail.actions.commercialInvoice')}</span>
                    </button>
                    <button onClick={() => { setEditPL(null); setPackingOpen(true); }} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group text-left">
                      <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-red-50 transition-colors">
                        <Package className="h-3.5 w-3.5 text-gray-500 group-hover:text-red-600" style={{ color: undefined }} />
                      </div>
                      <span className="text-[13px] font-semibold text-gray-800">{t('detail.actions.packingList')}</span>
                    </button>
                    <button onClick={() => { setEditPI(null); setProformaOpen(true); }} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group text-left">
                      <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-red-50 transition-colors">
                        <FileText className="h-3.5 w-3.5 text-gray-500 group-hover:text-red-600" style={{ color: undefined }} />
                      </div>
                      <span className="text-[13px] font-semibold text-gray-800">{t('detail.actions.proformaInvoice')}</span>
                    </button>
                  </>
                )}
              </div>
            </div>

          </div>{/* end LEFT */}

          {/* ── RIGHT panel — scrollable ────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto scrollbar-thin space-y-5 pb-4">

            {/* Status stepper */}
            {statusStepper}

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
                    onClick={() => { if (window.confirm('Bu dosya tamamlandı olarak işaretlensin mi?')) changeStatus.mutate({ id: file!.id, status: 'completed' }); }}
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

            {/* ── Sale Details — always first ────────────────────────────── */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div
                className="px-6 py-4 flex items-center justify-between border-b border-gray-50 cursor-pointer select-none"
                onClick={() => toggleCard('saleDetails')}
              >
                <div className="flex items-center gap-2.5">
                  <TrendingUp className="h-4 w-4 text-gray-400" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">{t('detail.saleDetails.title')}</span>
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
                    <div className="flex justify-between items-center py-2 border-b border-dashed border-gray-100">
                      <span className="text-[12px] text-gray-500">{t('detail.saleDetails.salePrice')}</span>
                      <span className="text-[13px] font-bold text-gray-900">{file.selling_price ? `${fCurrency(file.selling_price)}/MT` : '—'}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-dashed border-gray-100">
                      <span className="text-[12px] text-gray-500">{t('detail.saleDetails.purchase')}</span>
                      <span className="text-[13px] font-bold text-gray-900">{fCurrency(file.purchase_price)}/MT</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-dashed border-gray-100">
                      <span className="text-[12px] text-gray-500">{t('detail.saleDetails.supplier')}</span>
                      <span className="text-[13px] font-bold text-gray-900">{file.supplier?.name ?? '—'}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-dashed border-gray-100">
                      <span className="text-[12px] text-gray-500">{t('detail.saleDetails.incoterms')}</span>
                      <span className="text-[13px] font-bold text-gray-900">{`${file.incoterms ?? ''} ${file.port_of_discharge ?? ''}`.trim() || '—'}</span>
                    </div>
                    {file.eta && (
                      <div className="flex justify-between items-center py-2 border-b border-dashed border-gray-100">
                        <span className="text-[12px] text-gray-500">{t('detail.saleDetails.eta')}</span>
                        <span className="text-[13px] font-bold text-gray-900">{fDate(file.eta)}</span>
                      </div>
                    )}
                    {file.revised_eta && (
                      <div className="flex justify-between items-center py-2 border-b border-dashed border-gray-100">
                        <span className="text-[12px] text-gray-500">{t('detail.saleDetails.revisedEta')}</span>
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="text-[13px] font-bold text-amber-600">{fDate(file.revised_eta)}</span>
                        </span>
                      </div>
                    )}
                    {file.delay_notes && (
                      <div className="flex justify-between items-center py-2 border-b border-dashed border-gray-100">
                        <span className="text-[12px] text-gray-500">{t('detail.saleDetails.delayReason')}</span>
                        <span className="text-[13px] font-bold text-gray-900 text-right max-w-[60%]">{file.delay_notes}</span>
                      </div>
                    )}
                    {file.vessel_name && (
                      <div className="flex justify-between items-center py-2 border-b border-dashed border-gray-100 last:border-0">
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

            {/* ── Partiler — sadece en az 1 parti varsa göster ───────────── */}
            {!file.parent_file_id && (file.batches?.length ?? 0) > 0 && (
              <PartilerCard
                file={file}
                writable={writable}
                accent={accent}
                onNewBatch={() => setBatchOpen(true)}
                collapsed={!!collapsed.partiler}
                onToggle={() => toggleCard('partiler')}
              />
            )}

            {/* Obligations */}
            <ObligationsSection
              file={file}
              writable={writable}
              collapsed={!!collapsed.obligations}
              onToggle={() => toggleCard('obligations')}
            />

            {/* Delivery */}
            {file.delivered_admt && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between border-b border-gray-50 cursor-pointer select-none" onClick={() => toggleCard('delivery')}>
                  <div className="flex items-center gap-2.5">
                    <Truck className="h-4 w-4 text-gray-400" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">{t('detail.delivery.title')}</span>
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
                    <KV label={t('detail.delivery.admt')} value={fN(file.delivered_admt, 3)} bold />
                    <KV label={t('detail.delivery.grossKg')} value={fN(file.gross_weight_kg)} />
                    <KV label={t('detail.delivery.packages')} value={file.packages ?? '—'} />
                    <KV label={t('detail.delivery.arrival')} value={fDate(file.arrival_date)} />
                    <KV label={t('detail.delivery.blNo')} value={file.bl_number || '—'} />
                    <KV label={t('detail.delivery.septi')} value={file.septi_ref || '—'} />
                  </div>
                )}
              </div>
            )}

            {/* Documents */}
            {((file.proformas?.length ?? 0) > 0 || (file.invoices?.length ?? 0) > 0 || (file.packing_lists?.length ?? 0) > 0) && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between border-b border-gray-50 cursor-pointer select-none" onClick={() => toggleCard('documents')}>
                  <div className="flex items-center gap-2.5">
                    <FileText className="h-4 w-4 text-gray-400" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">{t('detail.documents.title')}</span>
                  </div>
                  {collapsed.documents ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" /> : <ChevronUp className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                </div>
                {!collapsed.documents && <div className="px-4 py-2">
                  {file.proformas?.map((pi) => (
                    <DocRow key={pi.id} no={pi.proforma_no} date={fDate(pi.proforma_date)} amount={fCurrency(pi.total)} status={pi.doc_status ?? 'draft'}>
                      <ApprovalActions table="proformas" id={pi.id} currentStatus={pi.doc_status ?? 'draft'} />
                      {writable && (pi.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { setEditPI(pi); setProformaOpen(true); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Pencil className="h-3 w-3" /> {tc('btn.edit')}</button>)}
                      {settings && (<button onClick={() => printProforma(pi, settings, defaultBank, file, (pi.doc_status ?? 'draft') !== 'approved')} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Printer className="h-3 w-3" /> {tc('btn.print')}</button>)}
                      {settings && (<button disabled={dropboxUploadingId === pi.id} onClick={() => handleUploadToDropbox(pi.id, `${pi.proforma_no}`, generateProformaHtml(pi, settings, defaultBank, file, (pi.doc_status ?? 'draft') !== 'approved'))} className="h-7 px-3 rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-600 flex items-center gap-1 disabled:opacity-50"><svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4zM18 2l-6 4 6 4-6 4 6 4 6-4-6-4 6-4zM6 16.5L12 21l6-4.5-6-4z"/></svg> Dropbox</button>)}
                      {writable && (pi.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { if (window.confirm(tc('confirm.delete_title'))) deletePI.mutate(pi.id); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500 flex items-center gap-1"><Trash2 className="h-3 w-3" /></button>)}
                    </DocRow>
                  ))}
                  {file.invoices?.filter(i => i.invoice_type === 'sale').map((inv) => (
                    <DocRow key={inv.id} no={inv.invoice_no} date={fDate(inv.invoice_date)} amount={fCurrency(inv.total)} status={inv.doc_status ?? 'draft'}>
                      <ApprovalActions table="invoices" id={inv.id} currentStatus={inv.doc_status ?? 'draft'} />
                      {writable && (inv.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { setEditSaleInvoice(inv); setSaleInvoiceOpen(true); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Pencil className="h-3 w-3" /> {tc('btn.edit')}</button>)}
                      {settings && (<button onClick={() => printInvoice(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved')} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Printer className="h-3 w-3" /> {tc('btn.print')}</button>)}
                      {settings && (<button disabled={dropboxUploadingId === inv.id} onClick={() => handleUploadToDropbox(inv.id, `${inv.invoice_no}`, generateInvoiceHtml(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved'))} className="h-7 px-3 rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-600 flex items-center gap-1 disabled:opacity-50"><svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4zM18 2l-6 4 6 4-6 4 6 4 6-4-6-4 6-4zM6 16.5L12 21l6-4.5-6-4z"/></svg> Dropbox</button>)}
                    </DocRow>
                  ))}
                  {file.invoices?.filter(i => i.invoice_type === 'commercial').map((inv) => (
                    <DocRow key={inv.id} no={inv.invoice_no} date={fDate(inv.invoice_date)} amount={fCurrency(inv.total)} status={inv.doc_status ?? 'draft'}>
                      <ApprovalActions table="invoices" id={inv.id} currentStatus={inv.doc_status ?? 'draft'} />
                      {writable && (inv.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { setEditInvoice(inv); setInvoiceOpen(true); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Pencil className="h-3 w-3" /> {tc('btn.edit')}</button>)}
                      {settings && (<button onClick={() => printInvoice(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved')} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 flex items-center gap-1"><Printer className="h-3 w-3" /> {tc('btn.print')}</button>)}
                      {settings && (<button disabled={dropboxUploadingId === inv.id} onClick={() => handleUploadToDropbox(inv.id, `${inv.invoice_no}`, generateInvoiceHtml(inv, settings, defaultBank, (inv.doc_status ?? 'draft') !== 'approved'))} className="h-7 px-3 rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-600 flex items-center gap-1 disabled:opacity-50"><svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4zM18 2l-6 4 6 4-6 4 6 4 6-4-6-4 6-4zM6 16.5L12 21l6-4.5-6-4z"/></svg> Dropbox</button>)}
                      {writable && (inv.doc_status ?? 'draft') !== 'approved' && (<button onClick={() => { if (window.confirm(tc('confirm.delete_title'))) deleteInv.mutate(inv.id); }} className="h-7 px-3 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500 flex items-center gap-1"><Trash2 className="h-3 w-3" /></button>)}
                    </DocRow>
                  ))}
                  {file.packing_lists?.map((pl) => (
                    <DocRow key={pl.id} no={pl.packing_list_no} date={t('detail.documents.vehicles', { count: pl.packing_list_items?.length ?? 0, admt: fN(pl.total_admt, 3) })} status={pl.doc_status ?? 'draft'}>
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
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 flex items-center justify-between border-b border-gray-50 cursor-pointer select-none" onClick={() => toggleCard('expenses')}>
                <div className="flex items-center gap-2.5">
                  <Receipt className="h-4 w-4 text-gray-400" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">{t('detail.expenses.title')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {writable && (
                    <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setPurchaseInvOpen(true)} className="h-6 px-2.5 rounded-full text-[10px] font-semibold flex items-center gap-1 bg-gray-100 text-gray-500"><Plus className="h-3 w-3" /> {t('detail.expenses.addPurchase')}</button>
                      <button onClick={() => setSvcInvOpen(true)} className="h-6 px-2.5 rounded-full text-[10px] font-semibold flex items-center gap-1 bg-gray-100 text-gray-500"><Plus className="h-3 w-3" /> {t('detail.expenses.addService')}</button>
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
                    <div key={txn.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                      <div className="min-w-0">
                        <div className="text-[12px] font-medium text-gray-800 truncate">{txn.description || '—'}</div>
                        <div className="text-[10px] text-gray-400">{txn.transaction_date} · {tc(`txType.${txn.transaction_type}`)}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        <span className="text-[13px] font-bold text-gray-800">{fUSD(txn.amount_usd ?? txn.amount)}</span>
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
            {['sale', 'delivery', 'completed'].includes(file.status) && (
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
            <input
              type="date"
              value={delayEta}
              onChange={e => setDelayEta(e.target.value)}
              className="w-full mt-1 mb-3 px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] outline-none focus:border-blue-400"
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
          nextBatchNo={(file.batches?.length ?? 0) + 1}
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
      <InvoiceModal open={invoiceOpen} onOpenChange={setInvoiceOpen} file={file} invoice={editInvoice} />
      <InvoiceModal open={saleInvoiceOpen} onOpenChange={setSaleInvoiceOpen} file={file} invoice={editSaleInvoice} invoiceType="sale" />
      <ProformaModal open={proformaOpen} onOpenChange={setProformaOpen} file={file} proforma={editPI} />
      <PackingListModal open={packingOpen} onOpenChange={setPackingOpen} file={file} packingList={editPL} />
      <PurchaseInvoiceModal
        open={purchaseInvOpen}
        onOpenChange={setPurchaseInvOpen}
        defaultTradeFileId={file.id}
      />
      <ServiceInvoiceModal
        open={svcInvOpen}
        onOpenChange={setSvcInvOpen}
        defaultTradeFileId={file.id}
      />
    </div>
  );
}
