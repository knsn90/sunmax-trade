import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
import { useTheme } from '@/contexts/ThemeContext';
import { HeaderProvider, useHeaderAction } from '@/contexts/HeaderContext';
import { useSettings } from '@/hooks/useSettings';

/** Points favicon + apple-touch-icon to the company logo URL */
function useDynamicAppIcon(logoUrl: string | undefined | null) {
  useEffect(() => {
    if (!logoUrl) return;

    // Update favicon (browser tab)
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.type = 'image/png';
    link.href = logoUrl;

    // Update apple-touch-icon (iOS "Add to Home Screen")
    let apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (!apple) { apple = document.createElement('link'); apple.rel = 'apple-touch-icon'; document.head.appendChild(apple); }
    apple.href = logoUrl;
  }, [logoUrl]);
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':        'Dashboard',
  '/pipeline':         'Pipeline',
  '/files':            'All Files',
  '/documents':        'Documents',
  '/accounting':       'Accounting',
  '/reports':          'Reports',
  '/contacts':         'Contacts',
  '/products':         'Products',
  '/settings':         'Settings',
  '/activity':         'Activity Log',
};

function MobilePageHeader() {
  const location = useLocation();
  const { action } = useHeaderAction();
  const segments = location.pathname.split('/').filter(Boolean);
  const basePath = '/' + segments[0];
  const title = PAGE_TITLES[basePath];

  // Hide on detail pages (e.g. /files/:id)
  if (!title || segments.length > 1) return null;

  return (
    <div className="md:hidden flex items-center justify-between px-4 py-3 bg-transparent">
      <h1 className="text-xl font-black text-gray-900 tracking-tight">{title}</h1>
      {action && <div>{action}</div>}
    </div>
  );
}

function LayoutInner() {
  const { theme } = useTheme();
  const { data: settings } = useSettings();
  useDynamicAppIcon(settings?.logo_url);
  const bg = theme === 'donezo' ? '#f5f7fa' : '#eef2ff';

  return (
    <div className="flex overflow-hidden" style={{ height: '100dvh', background: bg }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar />
        <MobilePageHeader />
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden px-4 [padding-bottom:calc(env(safe-area-inset-bottom)+4rem+8px)] md:p-6 md:bg-gray-50 scrollbar-thin"
        >
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}

export function AppLayout() {
  return (
    <HeaderProvider>
      <LayoutInner />
    </HeaderProvider>
  );
}
