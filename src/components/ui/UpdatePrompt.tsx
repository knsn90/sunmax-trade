import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';

export function UpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-xl text-[13px] font-medium">
      <RefreshCw className="h-4 w-4 shrink-0 text-gray-400" />
      <span>Yeni sürüm mevcut</span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="ml-1 px-3 py-1 rounded-lg bg-white text-gray-900 text-[12px] font-bold hover:bg-gray-100 transition-colors shrink-0"
      >
        Güncelle
      </button>
    </div>
  );
}
