import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tradeFileService } from '@/services/tradeFileService';
import { invoiceService } from '@/services/invoiceService';
import { packingListService } from '@/services/packingListService';
import { proformaService } from '@/services/proformaService';
import { transactionService } from '@/services/transactionService';
import { transferService } from '@/services/transferService';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { fDate } from '@/lib/formatters';
import {
  Trash2, RotateCcw, X, FileText, Receipt, Package, FileSearch,
  CreditCard, ArrowLeftRight, AlertTriangle,
} from 'lucide-react';

// ── Tür tanımları ────────────────────────────────────────────────────────────
type TrashCategory = 'files' | 'invoices' | 'packing_lists' | 'proformas' | 'transactions' | 'transfers';

interface TrashItem {
  id: string;
  label: string;
  sublabel: string;
  deletedAt: string;
  category: TrashCategory;
}

// ── Kategori meta ────────────────────────────────────────────────────────────
const CAT_META: Record<TrashCategory, { label: string; icon: React.ReactNode; color: string }> = {
  files:         { label: 'Ticaret Dosyaları', icon: <FileText className="h-4 w-4" />,    color: 'bg-blue-50 text-blue-600' },
  invoices:      { label: 'Faturalar',          icon: <Receipt className="h-4 w-4" />,     color: 'bg-green-50 text-green-600' },
  packing_lists: { label: 'Paket Listeleri',    icon: <Package className="h-4 w-4" />,     color: 'bg-orange-50 text-orange-600' },
  proformas:     { label: 'Proforma',           icon: <FileSearch className="h-4 w-4" />,  color: 'bg-violet-50 text-violet-600' },
  transactions:  { label: 'İşlemler',           icon: <CreditCard className="h-4 w-4" />,  color: 'bg-amber-50 text-amber-600' },
  transfers:     { label: 'Transferler',        icon: <ArrowLeftRight className="h-4 w-4" />, color: 'bg-gray-100 text-gray-600' },
};

// ── Silme onay modalı ────────────────────────────────────────────────────────
function ConfirmModal({
  item, onConfirm, onCancel, loading,
}: {
  item: TrashItem;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <h3 className="text-[15px] font-bold text-gray-900">Kalıcı Olarak Sil</h3>
          <p className="text-[12px] text-gray-500">
            <strong className="text-gray-800">{item.label}</strong> kaydı kalıcı olarak silinecek.
            Bu işlem geri alınamaz.
          </p>
        </div>
        <div className="flex gap-2 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 h-10 rounded-xl text-[13px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            İptal
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 h-10 rounded-xl text-[13px] font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Siliniyor…' : 'Evet, Sil'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ana sayfa ────────────────────────────────────────────────────────────────
export function TrashPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TrashCategory | 'all'>('all');
  const [confirmItem, setConfirmItem] = useState<TrashItem | null>(null);

  // ── Sorgular ──────────────────────────────────────────────────────────────
  const { data: deletedFiles        = [] } = useQuery({ queryKey: ['trash', 'files'],         queryFn: () => tradeFileService.listDeleted()   });
  const { data: deletedInvoices     = [] } = useQuery({ queryKey: ['trash', 'invoices'],      queryFn: () => invoiceService.listDeleted()     });
  const { data: deletedPLs          = [] } = useQuery({ queryKey: ['trash', 'packing_lists'], queryFn: () => packingListService.listDeleted() });
  const { data: deletedProformas    = [] } = useQuery({ queryKey: ['trash', 'proformas'],     queryFn: () => proformaService.listDeleted()    });
  const { data: deletedTransactions = [] } = useQuery({ queryKey: ['trash', 'transactions'],  queryFn: () => transactionService.listDeleted() });
  const { data: deletedTransfers    = [] } = useQuery({ queryKey: ['trash', 'transfers'],     queryFn: () => transferService.listDeleted()    });

  // ── Tüm öğeleri birleştir ─────────────────────────────────────────────────
  const allItems: TrashItem[] = [
    ...deletedFiles.map(f => ({
      id: f.id,
      label: f.file_no,
      sublabel: f.customer?.name ?? '',
      deletedAt: (f as unknown as { deleted_at: string }).deleted_at,
      category: 'files' as TrashCategory,
    })),
    ...deletedInvoices.map(i => ({
      id: i.id,
      label: i.invoice_no,
      sublabel: i.customer?.name ?? '',
      deletedAt: (i as unknown as { deleted_at: string }).deleted_at,
      category: 'invoices' as TrashCategory,
    })),
    ...deletedPLs.map(p => ({
      id: p.id,
      label: p.packing_list_no,
      sublabel: (p.trade_file as unknown as { file_no?: string } | null)?.file_no ?? '',
      deletedAt: (p as unknown as { deleted_at: string }).deleted_at,
      category: 'packing_lists' as TrashCategory,
    })),
    ...deletedProformas.map(p => ({
      id: p.id,
      label: p.proforma_no,
      sublabel: (p as unknown as { customer?: { name?: string } }).customer?.name ?? '',
      deletedAt: (p as unknown as { deleted_at: string }).deleted_at,
      category: 'proformas' as TrashCategory,
    })),
    ...deletedTransactions.map(t => ({
      id: t.id,
      label: t.description || t.transaction_type,
      sublabel: fDate(t.transaction_date),
      deletedAt: (t as unknown as { deleted_at: string }).deleted_at,
      category: 'transactions' as TrashCategory,
    })),
    ...deletedTransfers.map(t => ({
      id: t.id,
      label: t.description || 'Transfer',
      sublabel: fDate(t.transfer_date),
      deletedAt: (t as unknown as { deleted_at: string }).deleted_at,
      category: 'transfers' as TrashCategory,
    })),
  ].sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

  const visibleItems = activeTab === 'all' ? allItems : allItems.filter(i => i.category === activeTab);

  // ── Mutasyonlar ───────────────────────────────────────────────────────────
  const RESTORE_MAP: Record<TrashCategory, (id: string) => Promise<void>> = {
    files:         id => tradeFileService.restore(id),
    invoices:      id => invoiceService.restore(id),
    packing_lists: id => packingListService.restore(id),
    proformas:     id => proformaService.restore(id),
    transactions:  id => transactionService.restore(id),
    transfers:     id => transferService.restore(id),
  };

  const HARD_DELETE_MAP: Record<TrashCategory, (id: string) => Promise<void>> = {
    files:         id => tradeFileService.hardDelete(id),
    invoices:      id => invoiceService.hardDelete(id),
    packing_lists: id => packingListService.hardDelete(id),
    proformas:     id => proformaService.hardDelete(id),
    transactions:  id => transactionService.hardDelete(id),
    transfers:     id => transferService.hardDelete(id),
  };

  const INVALIDATE_MAP: Record<TrashCategory, string[][]> = {
    files:         [['tradeFiles'], ['trash', 'files']],
    invoices:      [['invoices'], ['trash', 'invoices']],
    packing_lists: [['packingLists'], ['trash', 'packing_lists']],
    proformas:     [['proformas'], ['trash', 'proformas']],
    transactions:  [['transactions'], ['trash', 'transactions']],
    transfers:     [['transfers'], ['trash', 'transfers']],
  };

  const restoreMutation = useMutation({
    mutationFn: ({ id, category }: { id: string; category: TrashCategory }) =>
      RESTORE_MAP[category](id),
    onSuccess: (_, { category }) => {
      INVALIDATE_MAP[category].forEach(k => qc.invalidateQueries({ queryKey: k }));
      toast.success('Kayıt geri yüklendi');
    },
    onError: () => toast.error('Geri yükleme başarısız'),
  });

  const hardDeleteMutation = useMutation({
    mutationFn: ({ id, category }: { id: string; category: TrashCategory }) =>
      HARD_DELETE_MAP[category](id),
    onSuccess: (_, { category }) => {
      INVALIDATE_MAP[category].forEach(k => qc.invalidateQueries({ queryKey: k }));
      toast.success('Kayıt kalıcı olarak silindi');
      setConfirmItem(null);
    },
    onError: () => toast.error('Silme başarısız'),
  });

  // ── Tab sayıları ─────────────────────────────────────────────────────────
  const countMap: Record<TrashCategory, number> = {
    files:         deletedFiles.length,
    invoices:      deletedInvoices.length,
    packing_lists: deletedPLs.length,
    proformas:     deletedProformas.length,
    transactions:  deletedTransactions.length,
    transfers:     deletedTransfers.length,
  };
  const totalCount = allItems.length;

  const tabs = [
    { key: 'all' as const, label: 'Tümü', count: totalCount },
    ...Object.entries(CAT_META).map(([k, v]) => ({
      key: k as TrashCategory,
      label: v.label,
      count: countMap[k as TrashCategory],
    })).filter(t => t.count > 0),
  ];

  return (
    <>
      {/* Mobile */}
      <div className="md:hidden flex flex-col min-h-screen -mx-4 bg-gray-50">
        <div className="bg-white px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <Trash2 className="h-5 w-5 text-gray-400" />
            <h1 className="text-[17px] font-bold text-gray-900">Çöp Kutusu</h1>
            {totalCount > 0 && (
              <span className="ml-auto text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {totalCount}
              </span>
            )}
          </div>
          {/* Tab scroll */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto scrollbar-none">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  'shrink-0 px-3 h-7 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap',
                  activeTab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500',
                )}
              >
                {t.label} {t.count > 0 && `(${t.count})`}
              </button>
            ))}
          </div>
        </div>

        {/* Liste */}
        <div className="flex-1 px-3 py-3 space-y-2">
          {visibleItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Trash2 className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm font-medium text-gray-500">Çöp kutusu boş</p>
            </div>
          ) : (
            visibleItems.map(item => {
              const meta = CAT_META[item.category];
              return (
                <div key={`${item.category}-${item.id}`} className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm">
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', meta.color)}>
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-gray-900 truncate">{item.label}</div>
                    <div className="text-[11px] text-gray-400">{item.sublabel}</div>
                    <div className="text-[10px] text-gray-300 mt-0.5">{fDate(item.deletedAt)} silindi</div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => restoreMutation.mutate({ id: item.id, category: item.category })}
                      disabled={restoreMutation.isPending}
                      className="w-8 h-8 rounded-xl bg-green-50 hover:bg-green-100 flex items-center justify-center transition-colors"
                      title="Geri yükle"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-green-600" />
                    </button>
                    <button
                      onClick={() => setConfirmItem(item)}
                      className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors"
                      title="Kalıcı sil"
                    >
                      <X className="h-3.5 w-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-gray-400" />
            <h1 className="text-[17px] font-bold text-gray-900">Çöp Kutusu</h1>
          </div>
          {totalCount > 0 && (
            <span className="text-[11px] font-bold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
              {totalCount} kayıt
            </span>
          )}
          <p className="text-[12px] text-gray-400 ml-2">
            Silinen kayıtları geri yükleyebilir veya kalıcı olarak silebilirsiniz.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl mb-4 w-fit">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'px-3 h-8 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap',
                activeTab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {t.label} {t.count > 0 && <span className="ml-1 opacity-60">({t.count})</span>}
            </button>
          ))}
        </div>

        {/* Tablo */}
        {visibleItems.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm flex flex-col items-center justify-center py-20 text-gray-400">
            <Trash2 className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-[14px] font-medium text-gray-500">Çöp kutusu boş</p>
            <p className="text-[12px] text-gray-400 mt-1">Silinen kayıtlar burada görünür</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-8"></th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Tür</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Kayıt</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">İlgili</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Silinme Tarihi</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item, i) => {
                  const meta = CAT_META[item.category];
                  return (
                    <tr
                      key={`${item.category}-${item.id}`}
                      className={cn(
                        'border-b border-gray-50 hover:bg-gray-50/60 transition-colors',
                        i % 2 === 1 && 'bg-gray-50/40',
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', meta.color)}>
                          {meta.icon}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', meta.color)}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[13px] font-semibold text-gray-900">{item.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[12px] text-gray-400">{item.sublabel}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[12px] text-gray-400">{fDate(item.deletedAt)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => restoreMutation.mutate({ id: item.id, category: item.category })}
                            disabled={restoreMutation.isPending}
                            className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-[11px] font-semibold text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Geri Yükle
                          </button>
                          <button
                            onClick={() => setConfirmItem(item)}
                            className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-[11px] font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors"
                          >
                            <X className="h-3 w-3" />
                            Kalıcı Sil
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Onay modalı */}
      {confirmItem && (
        <ConfirmModal
          item={confirmItem}
          onConfirm={() => hardDeleteMutation.mutate({ id: confirmItem.id, category: confirmItem.category })}
          onCancel={() => setConfirmItem(null)}
          loading={hardDeleteMutation.isPending}
        />
      )}
    </>
  );
}
