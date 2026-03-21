import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  BarChart3, FileText, Package, Receipt, LineChart, Users, Truck,
  Clock, Box, Settings, LayoutDashboard, Home,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const sections: { items: NavItem[] }[] = [
  {
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: <Home className="h-5 w-5" /> },
    ],
  },
  {
    items: [
      { to: '/pipeline', label: 'Pipeline', icon: <BarChart3 className="h-5 w-5" /> },
      { to: '/files', label: 'All Files', icon: <FileText className="h-5 w-5" /> },
    ],
  },
  {
    items: [
      { to: '/invoices', label: 'Invoices', icon: <Receipt className="h-5 w-5" /> },
      { to: '/proformas', label: 'Proformas', icon: <FileText className="h-5 w-5" /> },
      { to: '/packing-lists', label: 'Packing Lists', icon: <Package className="h-5 w-5" /> },
    ],
  },
  {
    items: [
      { to: '/accounting', label: 'Accounting', icon: <LayoutDashboard className="h-5 w-5" /> },
      { to: '/reports', label: 'Reports', icon: <LineChart className="h-5 w-5" /> },
    ],
  },
  {
    items: [
      { to: '/customers', label: 'Customers', icon: <Users className="h-5 w-5" /> },
      { to: '/suppliers', label: 'Suppliers', icon: <Truck className="h-5 w-5" /> },
      { to: '/service-providers', label: 'Service Providers', icon: <Clock className="h-5 w-5" /> },
      { to: '/products', label: 'Products', icon: <Box className="h-5 w-5" /> },
    ],
  },
  {
    items: [
      { to: '/settings', label: 'Settings', icon: <Settings className="h-5 w-5" /> },
    ],
  },
];

export function Sidebar() {
  return (
    <aside className="hidden md:flex w-[180px] flex-shrink-0 bg-white border-r border-border flex-col overflow-y-auto overflow-x-hidden scrollbar-thin">
      {/* Logo / header */}
      <div className="h-[64px] flex items-center px-5 border-b border-border flex-shrink-0">
        <span className="text-base font-extrabold text-brand-500 tracking-tight">SunPlus</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3">
        {sections.map((section, si) => (
          <div key={si} className={si > 0 ? 'mt-1 pt-1 border-t border-gray-100' : ''}>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 w-full px-4 py-2.5 transition-colors relative',
                    'hover:text-brand-500 hover:bg-brand-50',
                    isActive ? 'text-brand-500 bg-brand-50' : 'text-gray-500',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-brand-500 rounded-r-full" />
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
