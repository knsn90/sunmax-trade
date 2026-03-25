import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Home, BarChart3, FileText, LayoutDashboard, MoreHorizontal,
  Receipt, LineChart, Users, Box, Settings, X, Activity,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const mainTabs = [
  { to: '/dashboard',  label: 'Dashboard',  icon: Home },
  { to: '/pipeline',   label: 'Pipeline',   icon: BarChart3 },
  { to: '/files',      label: 'Files',      icon: FileText },
  { to: '/accounting', label: 'Accounting', icon: LayoutDashboard },
  null, // More placeholder
];

const moreItems = [
  { to: '/documents', label: 'Documents', icon: Receipt },
  { to: '/reports',   label: 'Reports',   icon: LineChart },
  { to: '/contacts',  label: 'Contacts',  icon: Users },
  { to: '/products',  label: 'Products',  icon: Box },
  { to: '/settings',  label: 'Settings',  icon: Settings },
];

const adminItems = [
  { to: '/activity', label: 'Logs', icon: Activity },
];

export function BottomNav() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const { theme } = useTheme();
  const { profile } = useAuth();

  const isDonezo = theme === 'donezo';
  const isAdmin  = profile?.role === 'admin';
  const drawerItems = isAdmin ? [...moreItems, ...adminItems] : moreItems;

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const isMoreActive = drawerItems.some(item =>
    location.pathname === item.to || location.pathname.startsWith(item.to + '/')
  );

  // Theme colours
  const barBg      = isDonezo ? '#dc2626' : '#2563eb';
  const drawerActiveClass = isDonezo
    ? 'bg-red-600 text-white shadow-md shadow-red-200'
    : 'bg-blue-600 text-white shadow-md shadow-blue-200';

  return (
    <>
      {/* Drawer backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* More Drawer */}
      {drawerOpen && (
        <div
          className="fixed left-0 right-0 z-50 bg-white border-t border-gray-100 shadow-2xl md:hidden rounded-t-3xl"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-gray-200 rounded-full" />
          </div>
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">More</span>
            <button onClick={() => setDrawerOpen(false)} className="text-gray-400 p-1 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 p-4 pb-5">
            {drawerItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to ||
                location.pathname.startsWith(item.to + '/');
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'flex flex-col items-center gap-2 p-3 rounded-2xl transition-all',
                    isActive
                      ? drawerActiveClass
                      : 'text-gray-500 bg-gray-50 hover:bg-gray-100 active:scale-95',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px] font-semibold leading-none text-center">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Floating Pill Nav Bar ──────────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden flex justify-center"
        style={{ paddingBottom: 'calc(10px + env(safe-area-inset-bottom))' }}
      >
        <div
          className="flex items-center gap-1 px-3 h-14 rounded-full shadow-xl"
          style={{ background: barBg, minWidth: 0, width: 'calc(100% - 32px)', maxWidth: 420 }}
        >
          {mainTabs.map((tab) => {
            // More button placeholder
            if (tab === null) {
              const active = isMoreActive || drawerOpen;
              return (
                <button
                  key="more"
                  onClick={() => setDrawerOpen(!drawerOpen)}
                  className={cn(
                    'flex-1 flex items-center justify-center h-9 rounded-full transition-all active:scale-95',
                    active ? 'bg-white' : '',
                  )}
                >
                  {active ? (
                    <span className="flex items-center gap-1.5 px-3" style={{ color: barBg }}>
                      <MoreHorizontal className="h-4 w-4 shrink-0" />
                      <span className="text-[11px] font-bold leading-none whitespace-nowrap">More</span>
                    </span>
                  ) : (
                    <MoreHorizontal className="h-5 w-5 text-white/80" />
                  )}
                </button>
              );
            }

            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    'flex-1 flex items-center justify-center h-9 rounded-full transition-all active:scale-95',
                    isActive ? 'bg-white' : '',
                  )
                }
              >
                {({ isActive }) =>
                  isActive ? (
                    <span className="flex items-center gap-1.5 px-3" style={{ color: barBg }}>
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="text-[11px] font-bold leading-none whitespace-nowrap">{tab.label}</span>
                    </span>
                  ) : (
                    <Icon className="h-5 w-5 text-white/80" />
                  )
                }
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
}
