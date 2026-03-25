import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
import { useTheme } from '@/contexts/ThemeContext';
import { HeaderProvider, useHeaderAction } from '@/contexts/HeaderContext';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':        'Dashboard',
  '/pipeline':         'Pipeline',
  '/files':            'All Files',
  '/documents':        'Documents',
  '/accounting':       'Accounting',
  '/reports':          'Reports',
  '/customers':        'Customers',
  '/suppliers':        'Suppliers',
  '/service-providers':'Service Providers',
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
  const bg = theme === 'donezo' ? '#f5f7fa' : '#eef2ff';

  return (
    <div className="flex overflow-hidden" style={{ height: '100dvh', background: bg }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar />
        <MobilePageHeader />
        <main
          className="flex-1 overflow-y-auto px-4 pb-4 md:p-6 md:bg-gray-50 scrollbar-thin"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 4rem + 8px)' }}
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
