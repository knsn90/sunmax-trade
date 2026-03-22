import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import {
  BarChart3, FileText, Package, Receipt, LineChart, Users, Truck,
  Clock, Box, Settings, LayoutDashboard, Home,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const sections: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: <Home className="h-4 w-4" /> },
    ],
  },
  {
    label: 'TRADE',
    items: [
      { to: '/pipeline', label: 'Pipeline', icon: <BarChart3 className="h-4 w-4" /> },
      { to: '/files', label: 'All Files', icon: <FileText className="h-4 w-4" /> },
    ],
  },
  {
    label: 'DOCUMENTS',
    items: [
      { to: '/invoices', label: 'Invoices', icon: <Receipt className="h-4 w-4" /> },
      { to: '/proformas', label: 'Proformas', icon: <FileText className="h-4 w-4" /> },
      { to: '/packing-lists', label: 'Packing Lists', icon: <Package className="h-4 w-4" /> },
    ],
  },
  {
    label: 'FINANCE',
    items: [
      { to: '/accounting', label: 'Accounting', icon: <LayoutDashboard className="h-4 w-4" /> },
      { to: '/reports', label: 'Reports', icon: <LineChart className="h-4 w-4" /> },
    ],
  },
  {
    label: 'CONTACTS',
    items: [
      { to: '/customers', label: 'Customers', icon: <Users className="h-4 w-4" /> },
      { to: '/suppliers', label: 'Suppliers', icon: <Truck className="h-4 w-4" /> },
      { to: '/service-providers', label: 'Services', icon: <Clock className="h-4 w-4" /> },
      { to: '/products', label: 'Products', icon: <Box className="h-4 w-4" /> },
    ],
  },
  {
    label: 'GENERAL',
    items: [
      { to: '/settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
    ],
  },
];

export function Sidebar() {
  const { theme } = useTheme();
  const isDonezo = theme === 'donezo';

  return (
    <aside
      className={cn(
        'hidden md:flex w-[190px] flex-shrink-0 flex-col overflow-y-auto overflow-x-hidden scrollbar-thin',
        isDonezo
          ? 'bg-white border-r border-gray-100 shadow-sm'
          : 'border-r border-white/10',
      )}
      style={isDonezo ? {} : { background: 'linear-gradient(180deg, #1a1f6e 0%, #2d3494 60%, #3b5bdb 100%)' }}
    >
      {/* Logo */}
      <div className={cn(
        'h-[60px] flex items-center px-5 flex-shrink-0',
        isDonezo ? 'border-b border-gray-100' : 'border-b border-white/10',
      )}>
        <div className="flex items-center gap-2.5">
          <div className={cn(
            'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0',
            isDonezo
              ? 'bg-red-600 text-white'
              : 'bg-white/20 text-white',
          )}>
            <span className="font-black text-sm">S</span>
          </div>
          <div>
            <div className={cn('font-black text-sm tracking-tight', isDonezo ? 'text-gray-900' : 'text-white')}>
              SunPlus
            </div>
            <div className={cn('text-[9px] font-medium -mt-0.5', isDonezo ? 'text-gray-400' : 'text-white/50')}>
              Trade Management
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {sections.map((section, si) => (
          <div key={si} className={si > 0 ? 'pt-2' : ''}>
            {section.label && (
              <div className={cn(
                'text-[9px] font-bold tracking-widest px-3 py-1.5',
                isDonezo ? 'text-gray-400' : 'text-white/30',
              )}>
                {section.label}
              </div>
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl transition-all mb-0.5 relative',
                    isDonezo
                      ? isActive
                        ? 'bg-red-50 text-red-600 font-semibold'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                      : isActive
                        ? 'bg-white/20 text-white font-semibold shadow-sm'
                        : 'text-white/60 hover:text-white hover:bg-white/10',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isDonezo && isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-red-600 rounded-r-full" />
                    )}
                    <span className="flex-shrink-0">{item.icon}</span>
                    <span className="text-xs font-medium">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
