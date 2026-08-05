import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';

/**
 * Yeni bir sürüm yayınlandığında (yeni Service Worker) kullanıcı "Güncelle"ye
 * basmadan OTOMATİK olarak güncel sürüme geçer. `prompt` modu needRefresh'i
 * güvenilir tetikler; biz tek-seferlik guard ile updateServiceWorker(true)
 * çağırıp skipWaiting + tek reload yaparız. Reload sonrası yeni SW aktif olduğu
 * için needRefresh tekrar tetiklenmez → döngü olmaz.
 */
export function UpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const applied = useRef(false);

  useEffect(() => {
    if (needRefresh && !applied.current) {
      applied.current = true;
      updateServiceWorker(true); // yeni SW'yi devreye al + sayfayı bir kez yenile
    }
  }, [needRefresh, updateServiceWorker]);

  if (!needRefresh) return null;

  // Reload gerçekleşene kadar kısa bilgilendirme
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-xl text-[13px] font-medium">
      <RefreshCw className="h-4 w-4 shrink-0 text-gray-400 animate-spin" />
      <span>Yeni sürüme güncelleniyor…</span>
    </div>
  );
}
