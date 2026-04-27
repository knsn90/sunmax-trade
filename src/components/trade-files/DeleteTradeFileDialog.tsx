import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTheme } from '@/contexts/ThemeContext';
import type { TradeFile } from '@/types/database';
import { AlertTriangle, Trash2, Archive } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  file: TradeFile;
  txnCount?: number;
  onConfirm: (keepDocuments: boolean) => void;
  isDeleting?: boolean;
}

export function DeleteTradeFileDialog({ open, onClose, file, txnCount = 0, onConfirm, isDeleting }: Props) {
  const { accent } = useTheme();

  const proformaCount  = file.proformas?.length  ?? 0;
  const invoiceCount   = file.invoices?.length   ?? 0;
  const packingCount   = file.packing_lists?.length ?? 0;
  const hasDocuments   = proformaCount > 0 || invoiceCount > 0 || packingCount > 0 || txnCount > 0;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !isDeleting) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 pr-8">
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4.5 w-4.5 text-red-500" />
            </div>
            <div>
              <DialogTitle className="text-[15px]">Dosyayı Sil</DialogTitle>
              <p className="text-[11px] text-gray-400 font-mono mt-0.5">{file.file_no}</p>
            </div>
          </div>
        </DialogHeader>

        {hasDocuments ? (
          <>
            {/* Bağlı belgeler özeti */}
            <div className="mt-2 px-4 py-3 bg-amber-50 rounded-xl border border-amber-100">
              <p className="text-[12px] font-semibold text-amber-800 mb-2">
                Bu dosyaya bağlı belgeler mevcut:
              </p>
              <div className="flex flex-wrap gap-2">
                {proformaCount > 0 && (
                  <span className="px-2 py-1 bg-white rounded-lg text-[11px] font-semibold text-amber-700 border border-amber-200">
                    {proformaCount} Proforma
                  </span>
                )}
                {invoiceCount > 0 && (
                  <span className="px-2 py-1 bg-white rounded-lg text-[11px] font-semibold text-amber-700 border border-amber-200">
                    {invoiceCount} Fatura
                  </span>
                )}
                {packingCount > 0 && (
                  <span className="px-2 py-1 bg-white rounded-lg text-[11px] font-semibold text-amber-700 border border-amber-200">
                    {packingCount} Paketleme Listesi
                  </span>
                )}
                {txnCount > 0 && (
                  <span className="px-2 py-1 bg-white rounded-lg text-[11px] font-semibold text-amber-700 border border-amber-200">
                    {txnCount} Mali İşlem
                  </span>
                )}
              </div>
            </div>

            {/* Seçenekler */}
            <div className="mt-3 space-y-2">
              {/* Hepsini Sil */}
              <button
                onClick={() => onConfirm(false)}
                disabled={isDeleting}
                className="w-full flex items-start gap-3 px-4 py-3.5 rounded-xl border-2 border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300 transition-colors text-left disabled:opacity-50 group"
              >
                <div className="w-8 h-8 rounded-lg bg-red-100 group-hover:bg-red-200 flex items-center justify-center shrink-0 transition-colors mt-0.5">
                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-red-700">Hepsini Sil</p>
                  <p className="text-[11px] text-red-500 mt-0.5">
                    Dosya ve tüm bağlı belgeler kalıcı olarak silinir.
                  </p>
                </div>
              </button>

              {/* Belgeleri Koru */}
              <button
                onClick={() => onConfirm(true)}
                disabled={isDeleting}
                className="w-full flex items-start gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors text-left disabled:opacity-50 group"
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center shrink-0 transition-colors mt-0.5">
                  <Archive className="h-3.5 w-3.5 text-gray-600" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-gray-800">Belgeleri Koru</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Belgeler silinmez, listelerde "Eşlenmedi" olarak işaretlenir.
                  </p>
                </div>
              </button>
            </div>
          </>
        ) : (
          /* Bağlı belge yok — basit onay */
          <div className="mt-2">
            <p className="text-[13px] text-gray-600">
              Bu dosya kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </p>
            <button
              onClick={() => onConfirm(false)}
              disabled={isDeleting}
              className="mt-4 w-full h-10 rounded-xl text-white text-[13px] font-bold disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ background: '#dc2626' }}
            >
              {isDeleting ? 'Siliniyor…' : 'Evet, Sil'}
            </button>
          </div>
        )}

        {/* İptal */}
        <div className="mt-1 flex justify-end">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 h-9 rounded-xl text-[12px] font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            İptal
          </button>
        </div>

        {isDeleting && (
          <div className="flex items-center justify-center gap-2 py-1">
            <div className="w-4 h-4 border-2 border-gray-200 border-t-red-500 rounded-full animate-spin" />
            <span className="text-[11px] text-gray-400">Siliniyor…</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
