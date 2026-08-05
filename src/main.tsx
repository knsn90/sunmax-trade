import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './styles/globals.css';
import './i18n'; // initialize i18next before rendering

// Yeni bir deploy sonrası açık kalan eski sayfalar, artık sunucuda olmayan eski
// chunk hash'lerini lazy-load etmeye çalışınca "Failed to fetch dynamically
// imported module" hatası verir. Vite bu durumda 'vite:preloadError' yayınlar —
// sayfayı bir kez yenileyerek güncel index.html + chunk'ları yükle (döngü koruması ile).
window.addEventListener('vite:preloadError', () => {
  const KEY = 'vite-preload-reload-ts';
  const last = Number(sessionStorage.getItem(KEY) || 0);
  if (Date.now() - last < 10_000) return; // 10 sn içinde yenilediyse tekrar yenileme (döngü engeli)
  sessionStorage.setItem(KEY, String(Date.now()));
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-white"><div className="w-8 h-8 rounded-full border-4 border-gray-200 border-t-blue-600 animate-spin" /></div>}>
      <App />
    </Suspense>
  </React.StrictMode>,
);
