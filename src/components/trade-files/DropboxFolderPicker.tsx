/**
 * Dropbox klasör seçici — dosyaya YENİ klasör açmak yerine Dropbox'ta mevcut herhangi bir klasörü bağlar.
 * Dropbox'ta gezin (breadcrumb + alt klasör listesi), istediğin klasörde "Bu klasörü bağla"ya bas.
 * Alternatif: müşteri / dosya no'dan yeni klasör oluştur.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { dropboxService } from '@/services/dropboxService';
import { tradeFileKeys } from '@/hooks/useTradeFiles';
import { PRIMARY_ACTION } from '@/lib/colors';
import { cn } from '@/lib/utils';
import { HugeiconsIcon } from '@hugeicons/react';
import { Folder01Icon, ArrowRight01Icon, ArrowLeft01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';

/** Sunplus Trade kök klasörü — gezinme buradan başlar (üstüne çıkılabilir) */
const START_PATH = '/Family Room/01-SELÜLOZ/Sunplus Trade';

export function DropboxFolderPicker({ open, onOpenChange, tradeFileId, currentPath, onCreateNew, creating }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tradeFileId: string;
  /** Şu an bağlı klasör (varsa gezinme oradan başlar) */
  currentPath?: string | null;
  /** "Yeni klasör oluştur" — mevcut davranış (müşteri / dosya no) */
  onCreateNew: () => void | Promise<void>;
  creating?: boolean;
}) {
  const qc = useQueryClient();
  const [path, setPath] = useState<string | null>(null);   // null → açılışta başlangıç yolu
  const [filter, setFilter] = useState('');
  const [linking, setLinking] = useState(false);

  // Açılışta: bağlı klasörün üstünden, yoksa Sunplus Trade kökünden başla
  const startPath = currentPath ? currentPath.replace(/\/[^/]+$/, '') || START_PATH : START_PATH;
  const here = path ?? startPath;

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['dropbox-browse', here],
    queryFn: () => dropboxService.browseFolders(here),
    enabled: open,
    staleTime: 1000 * 60,
    retry: false,
  });

  const segments = here.split('/').filter(Boolean);
  const shown = (data?.folders ?? []).filter(f => f.name.toLowerCase().includes(filter.trim().toLowerCase()));

  function goTo(p: string) { setPath(p); setFilter(''); }

  async function linkHere() {
    setLinking(true);
    try {
      const { folderPath, folderUrl } = await dropboxService.linkFolder(here);
      await dropboxService.saveFolderToDb(tradeFileId, folderPath, folderUrl);
      await Promise.all([
        qc.invalidateQueries({ queryKey: tradeFileKeys.all }),
        qc.invalidateQueries({ queryKey: ['dropbox-folder-files'] }),
      ]);
      toast.success(`Klasör bağlandı: ${folderPath.split('/').pop()}`);
      onOpenChange(false);
      setPath(null);
    } catch (e) {
      toast.error('Klasör bağlanamadı: ' + (e as Error).message);
    } finally {
      setLinking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) { setPath(null); setFilter(''); } }}>
      <DialogContent className="w-full max-w-lg p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100">
          <DialogTitle className="text-[15px]">Dropbox klasörü bağla</DialogTitle>
          <DialogDescription className="text-[12px]">
            Dropbox'ta bir klasöre gidip bu dosyaya bağla. Belgeler ve ekler bu klasöre yüklenir.
          </DialogDescription>
        </DialogHeader>

        {/* Breadcrumb */}
        <div className="px-5 py-2 flex items-center gap-1 flex-wrap text-[11px] border-b border-gray-50 bg-gray-50/60">
          <button type="button" onClick={() => goTo('')} className="font-semibold text-gray-500 hover:text-gray-900">Dropbox</button>
          {segments.map((seg, i) => {
            const p = '/' + segments.slice(0, i + 1).join('/');
            const last = i === segments.length - 1;
            return (
              <span key={p} className="flex items-center gap-1 min-w-0">
                <HugeiconsIcon icon={ArrowRight01Icon} size={10} className="text-gray-300 shrink-0" />
                <button
                  type="button"
                  onClick={() => goTo(p)}
                  className={cn('truncate max-w-[140px] hover:text-gray-900', last ? 'font-bold text-gray-900' : 'font-semibold text-gray-500')}
                >
                  {seg}
                </button>
              </span>
            );
          })}
        </div>

        {/* Arama */}
        <div className="px-5 pt-3">
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 h-9">
            <HugeiconsIcon icon={Search01Icon} size={14} className="text-gray-400 shrink-0" />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Bu klasörde ara…"
              className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* Klasör listesi */}
        <div className="px-3 py-2 h-[300px] overflow-y-auto scrollbar-thin">
          {segments.length > 0 && (
            <button
              type="button"
              onClick={() => goTo(segments.length > 1 ? '/' + segments.slice(0, -1).join('/') : '')}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-semibold text-gray-500 hover:bg-gray-50"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={14} /> Üst klasör
            </button>
          )}
          {isLoading ? (
            <p className="px-3 py-6 text-center text-[12px] text-gray-400">Klasörler yükleniyor…</p>
          ) : error ? (
            <p className="px-3 py-6 text-center text-[12px] text-red-600">{(error as Error).message}</p>
          ) : shown.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-gray-400">
              {filter ? 'Eşleşen klasör yok' : 'Bu klasörde alt klasör yok — buraya bağlayabilirsin'}
            </p>
          ) : (
            shown.map(f => (
              <button
                key={f.path}
                type="button"
                onClick={() => goTo(f.path)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-gray-50 group"
              >
                <HugeiconsIcon icon={Folder01Icon} size={16} className="text-gray-400 shrink-0" />
                <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-gray-800">{f.name}</span>
                <HugeiconsIcon icon={ArrowRight01Icon} size={12} className="text-gray-300 group-hover:text-gray-500 shrink-0" />
              </button>
            ))
          )}
          {isFetching && !isLoading && <p className="px-3 py-1 text-[10px] text-gray-300">Güncelleniyor…</p>}
        </div>

        {/* Alt aksiyonlar */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onCreateNew()}
            disabled={creating || linking}
            className="text-[12px] font-semibold text-gray-500 hover:text-gray-800 disabled:opacity-50"
          >
            {creating ? 'Oluşturuluyor…' : 'Yeni klasör oluştur'}
          </button>
          <div className="flex items-center gap-3 min-w-0">
            <span className="hidden sm:block text-[11px] text-gray-400 truncate max-w-[180px]" title={here}>
              {segments.length ? segments[segments.length - 1] : 'Kök'}
            </span>
            <button
              type="button"
              onClick={linkHere}
              disabled={linking || segments.length === 0}
              className="h-9 px-4 rounded-lg text-white text-[13px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity shrink-0"
              style={{ background: PRIMARY_ACTION }}
            >
              {linking ? 'Bağlanıyor…' : 'Bu klasörü bağla'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
