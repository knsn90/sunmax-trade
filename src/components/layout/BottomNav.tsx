import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Home, BarChart3, FileText, LayoutDashboard, MoreHorizontal,
  Receipt, Package, LineChart, Users, Truck, Clock, Box, Settings, X,
} from 'lucide-react';

const mainTabs = [
  { to: '/dashboard', label: 'Dashboard', icon: Home },
  { to: '/pipeline',  label: 'Pipeline',  icon: BarChart3 },
  { to: '/files',     label: 'Files',     icon: FileText },
  { to: '/accounting',label: 'Accounting',icon: LayoutDashboard },
];

const moreItems = [
  { to: '/invoices',         label: 'Invoices',      icon: Receipt },
  { to: '/proformas',        label: 'Proformas',     icon: FileText },
  { to: '/packing-lists',    label: 'Packing Lists', icon: Package },
  { to: '/reports',          label: 'Reports',       icon: LineChart },
  { to: '/customers',        label: 'Customers',     icon: Users },
  { to: '/suppliers',        label: 'Suppliers',     icon: Truck },
  { to: '/service-providers',label: 'Services',      icon: Clock },
  { to: '/products',         label: 'Products',      icon: Box },
  { to: '/settings',         label: 'Settings',      icon: Settings },
];

export function BottomNav() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close drawer whenever route changes
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const isMoreActive = moreItems.some(item =>
    location.pathname === item.to || location.pathname.startsWith(item.to + '/')
  );

  return (
    <>
      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* More Drawer — slides up above the bottom bar */}
      <div
        className={cn(
          'fixed left-0 right-0 z-50 bg-white border-t border-border shadow-xl md:hidden transition-transform duration-300',
          drawerOpen ? 'translate-y-0' : 'translate-y-full',
          'bottom-16 rounded-t-2xl',
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">More</span>
          <button onClick={() => setDrawerOpen(false)} className="text-gray-400 p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1 p-3 pb-4">
          {moreItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to ||
              location.pathname.startsWith(item.to + '/');
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors',
                  isActive ? 'bg-brand-50 text-brand-500' : 'text-gray-500 active:bg-gray-100',
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium leading-none text-center">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border md:hidden"
        style={{ height: '64px' }}
      >
        <div className="flex h-full">
          {mainTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    'flex-1 flex flex-col items-center justify-center gap-1 transition-colors',
                    isActive ? 'text-brand-500' : 'text-gray-400',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={cn('h-5 w-5', isActive && 'stroke-[2.5]')} />
                    <span className="text-[10px] font-medium">{tab.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-1 transition-colors',
              isMoreActive || drawerOpen ? 'text-brand-500' : 'text-gray-400',
            )}
          >
            <MoreHorizontal className={cn('h-5 w-5', (isMoreActive || drawerOpen) && 'stroke-[2.5]')} />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
