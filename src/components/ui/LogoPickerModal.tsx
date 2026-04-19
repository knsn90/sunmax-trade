import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { searchLogoCandidates, type LogoCandidate } from '@/lib/logoFetch';
import { Loader2, Search, ImageOff } from 'lucide-react';

interface LogoPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  companyName: string;
  website?: string | null;
}

export function LogoPickerModal({
  open,
  onClose,
  onSelect,
  companyName,
  website,
}: LogoPickerModalProps) {
  const [candidates, setCandidates] = useState<LogoCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const prevOpenRef = useRef(false);

  // Arama — sadece modal ilk açıldığında
  useEffect(() => {
    if (open && !prevOpenRef.current && companyName.trim()) {
      setLoading(true);
      setCandidates([]);
      setLoaded(new Set());
      setFailed(new Set());
      searchLogoCandidates(companyName, website)
        .then(setCandidates)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    prevOpenRef.current = open;
  }, [open]); // eslint-disable-line

  function markLoaded(url: string) {
    setLoaded(prev => { const s = new Set(prev); s.add(url); return s; });
  }
  function markFailed(url: string) {
    setFailed(prev => { const s = new Set(prev); s.add(url); return s; });
  }

  const visible = candidates.filter(c => loaded.has(c.url) && !failed.has(c.url));
  const allSettled = loading === false && candidates.length > 0 &&
    candidates.every(c => loaded.has(c.url) || failed.has(c.url));

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Search className="h-4 w-4 text-gray-400" />
            Logo Seç
            <span className="text-[12px] font-normal text-gray-400 truncate max-w-[180px]">
              — {companyName}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Gizli img'ler — yüklenip yüklenmediğini test eder */}
        <div className="hidden" aria-hidden>
          {candidates.map(c => (
            <img
              key={c.url}
              src={c.url}
              alt=""
              onLoad={() => markLoaded(c.url)}
              onError={() => markFailed(c.url)}
            />
          ))}
        </div>

        {/* Yükleniyor */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
            <p className="text-[13px] text-gray-500">Görseller aranıyor…</p>
          </div>
        )}

        {/* Görseller yüklenirken (candidates var ama hepsi settle olmadı) */}
        {!loading && candidates.length > 0 && !allSettled && visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            <p className="text-[12px] text-gray-400">Görseller kontrol ediliyor…</p>
          </div>
        )}

        {/* Grid */}
        {visible.length > 0 && (
          <div className="grid grid-cols-4 gap-2.5 max-h-72 overflow-y-auto py-1 pr-0.5">
            {visible.map(c => (
              <button
                key={c.url}
                type="button"
                title={c.label}
                onClick={() => { onSelect(c.url); onClose(); }}
                className="group relative aspect-square bg-gray-50 rounded-xl border-2 border-transparent
                           hover:border-blue-400 hover:shadow-md active:scale-95 transition-all
                           overflow-hidden p-2 flex items-center justify-center"
              >
                <img
                  src={c.url}
                  alt={c.label}
                  className="max-w-full max-h-full object-contain"
                />
                <div className="absolute inset-0 rounded-xl bg-blue-500/0 group-hover:bg-blue-500/8 transition-colors" />
              </button>
            ))}
          </div>
        )}

        {/* Hiç görsel yüklenemedi */}
        {!loading && allSettled && visible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
            <ImageOff className="h-8 w-8 opacity-40" />
            <p className="text-[13px] font-medium text-gray-500">Uygun görsel bulunamadı</p>
            <p className="text-[11px]">Farklı bir isimle tekrar deneyebilirsiniz</p>
          </div>
        )}

        {/* Hiç aday yok (arama sonucu boş) */}
        {!loading && candidates.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
            <ImageOff className="h-8 w-8 opacity-40" />
            <p className="text-[13px] font-medium text-gray-500">Sonuç bulunamadı</p>
          </div>
        )}

        {/* Alt bilgi */}
        {visible.length > 0 && (
          <p className="text-[10px] text-gray-400 text-center pt-1">
            {visible.length} görsel bulundu • istediğinize tıklayarak seçin
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
