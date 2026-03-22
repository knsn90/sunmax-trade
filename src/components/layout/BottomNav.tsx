import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Home, BarChart3, FileText, LayoutDashboard, MoreHorizontal,
  Receipt, Package, LineChart, Users, Truck, Clock, Box, Settings, X,
} from 'lucide-react';

const mainTabs = [
  { to: '/dashboard', label: 'Dashboard', icon: Home },
  { to: '/pipeline',  label: 'Pipeline',  icon: BarChart3 },
  null, // center FAB placeholder
  { to: '/files',     label: 'Files',     icon: FileText },
  { to: '/accounting',label: 'Accounting',icon: LayoutDashboard },
];

const moreItems = [
  { to: '/invoices',          label: 'Invoices',      icon: Receipt },
  { to: '/proformas',         label: 'Proformas',     icon: FileText },
  { to: '/packing-lists',     label: 'Packing Lists', icon: Package },
  { to: '/reports',           label: 'Reports',       icon: LineChart },
  { to: '/customers',         label: 'Customers',     icon: Users },
  { to: '/suppliers',         label: 'Suppliers',     icon: Truck },
  { to: '/service-providers', label: 'Services',      icon: Clock },
  { to: '/products',          label: 'Products',      icon: Box },
  { to: '/settings',          label: 'Settings',      icon: Settings },
];

export function BottomNav() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDonezo = theme === 'donezo';

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const isMoreActive = moreItems.some(item =>
    location.pathname === item.to || location.pathname.startsWith(item.to + '/')
  );

  const activeColor = isDonezo ? 'text-red-600' : 'text-blue-600';
  const activeBg = isDonezo ? 'bg-red-50' : 'bg-blue-50';
  const fabGradient = isDonezo
    ? 'linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)'
    : 'linear-gradient(135deg, #3b5bdb 0%, #4f6ef7 100%)';
  const fabShadow = isDonezo ? 'shadow-red-300/50' : 'shadow-blue-300/50';
  const drawerActiveClass = isDonezo
    ? 'bg-red-600 text-white shadow-md shadow-red-200'
    : 'bg-blue-600 text-white shadow-md shadow-blue-200';

  return (
    <>
      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* More Drawer */}
      <div
        className={cn(
          'fixed left-0 right-0 z-50 bg-white border-t border-gray-100 shadow-2xl md:hidden transition-transform duration-300 rounded-t-3xl',
          drawerOpen ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
      >
        {/* Handle bar */}
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
          {moreItems.map((item) => {
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

      {/* Bottom Tab Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -4px 20px rgba(0,0,0,0.08)' }}
      >
        <div className="flex h-16 items-center">
          {mainTabs.map((tab) => {
            // Center FAB
            if (tab === null) {
              return (
                <div key="fab" className="flex-1 flex justify-center items-center">
                  <button
                    onClick={() => navigate('/files')}
                    className={cn('w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-transform', fabShadow)}
                    style={{ background: fabGradient }}
                  >
                    <FileText className="h-5 w-5 text-white" />
                  </button>
                </div>
              );
            }

            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    'flex-1 flex flex-col items-center justify-center gap-1 transition-colors py-1',
                    isActive ? activeColor : 'text-gray-400',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <div className={cn(
                      'p-1.5 rounded-xl transition-all',
                      isActive ? activeBg : '',
                    )}>
                      <Icon className={cn('h-5 w-5', isActive && 'stroke-[2.5]')} />
                    </div>
                    <span className="text-[9px] font-semibold">{tab.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-1 transition-colors py-1',
              isMoreActive || drawerOpen ? activeColor : 'text-gray-400',
            )}
          >
            <div className={cn(
              'p-1.5 rounded-xl transition-all',
              (isMoreActive || drawerOpen) ? activeBg : '',
            )}>
              <MoreHorizontal className={cn('h-5 w-5', (isMoreActive || drawerOpen) && 'stroke-[2.5]')} />
            </div>
            <span className="text-[9px] font-semibold">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
