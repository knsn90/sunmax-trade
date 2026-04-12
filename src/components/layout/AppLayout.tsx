import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { PageTransition } from '@/components/ui/animations';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
import { useTheme } from '@/contexts/ThemeContext';
import { HeaderProvider, useHeaderAction } from '@/contexts/HeaderContext';
import { useSettings } from '@/hooks/useSettings';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/hooks/useAuth';
import { IMPERSONATION_KEY } from '@/pages/ViewAsPage';
import { Eye, X } from 'lucide-react';

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
    <div className="md:hidden flex items-center justify-between px-5 py-4 bg-transparent">
      <h1
        className="text-[22px] font-extrabold text-gray-900 tracking-tight"
        style={{ fontFamily: 'Manrope, sans-serif' }}
      >{title}</h1>
      {action && <div>{action}</div>}
    </div>
  );
}

/** Süper admin impersonation banner */
function ImpersonationBanner() {
  const { profile } = useAuth();
  const { currentTenant, resetToSuperAdmin } = useTenant();

  if (!profile?.is_super_admin) return null;

  const flag = sessionStorage.getItem(IMPERSONATION_KEY);
  if (!flag) return null;

  function exitImpersonation() {
    sessionStorage.removeItem(IMPERSONATION_KEY);
    resetToSuperAdmin();
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 shrink-0">
      <Eye className="h-3.5 w-3.5 text-amber-600 shrink-0" />
      <span className="text-[12px] font-semibold text-amber-800 flex-1">
        Görüntüleme modu: <span className="font-extrabold">{currentTenant?.name}</span>
      </span>
      <button
        onClick={exitImpersonation}
        className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg transition-colors"
      >
        <X className="h-3 w-3" /> Çıkış
      </button>
    </div>
  );
}

function LayoutInner() {
  const { theme } = useTheme();
  const { data: settings } = useSettings();
  const location = useLocation();
  useDynamicAppIcon(settings?.logo_url);
  const bg = theme === 'donezo' ? '#f7f9fc' : '#eef2ff';

  return (
    <div className="flex overflow-hidden" style={{ height: '100dvh', background: bg }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar />
        <ImpersonationBanner />
        <MobilePageHeader />
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden px-4 [padding-bottom:calc(env(safe-area-inset-bottom)+4rem+8px)] md:p-6 md:bg-gray-50 scrollbar-thin"
        >
          <PageTransition pageKey={location.pathname.split('/')[1] ?? 'home'}>
            <Outlet />
          </PageTransition>
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
