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
      { to: '/dashboard', label: 'Dashboard', icon: <Home className="h-4 w-4" /> },
    ],
  },
  {
    items: [
      { to: '/pipeline', label: 'Pipeline', icon: <BarChart3 className="h-4 w-4" /> },
      { to: '/files', label: 'All Files', icon: <FileText className="h-4 w-4" /> },
    ],
  },
  {
    items: [
      { to: '/invoices', label: 'Invoices', icon: <Receipt className="h-4 w-4" /> },
      { to: '/proformas', label: 'Proformas', icon: <FileText className="h-4 w-4" /> },
      { to: '/packing-lists', label: 'Packing Lists', icon: <Package className="h-4 w-4" /> },
    ],
  },
  {
    items: [
      { to: '/accounting', label: 'Accounting', icon: <LayoutDashboard className="h-4 w-4" /> },
      { to: '/reports', label: 'Reports', icon: <LineChart className="h-4 w-4" /> },
    ],
  },
  {
    items: [
      { to: '/customers', label: 'Customers', icon: <Users className="h-4 w-4" /> },
      { to: '/suppliers', label: 'Suppliers', icon: <Truck className="h-4 w-4" /> },
      { to: '/service-providers', label: 'Services', icon: <Clock className="h-4 w-4" /> },
      { to: '/products', label: 'Products', icon: <Box className="h-4 w-4" /> },
    ],
  },
  {
    items: [
      { to: '/settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
    ],
  },
];

export function Sidebar() {
  return (
    <aside className="hidden md:flex w-[180px] flex-shrink-0 flex-col overflow-y-auto overflow-x-hidden scrollbar-thin"
      style={{ background: 'linear-gradient(180deg, #1a1f6e 0%, #2d3494 60%, #3b5bdb 100%)' }}
    >
      {/* Logo */}
      <div className="h-[56px] flex items-center px-5 flex-shrink-0 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-black text-xs">S</span>
          </div>
          <span className="text-white font-black text-sm tracking-tight">SunPlus</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2">
        {sections.map((section, si) => (
          <div key={si} className={si > 0 ? 'mt-1 pt-1 border-t border-white/10' : ''}>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl transition-all mb-0.5',
                    isActive
                      ? 'bg-white/20 text-white font-semibold shadow-sm'
                      : 'text-white/60 hover:text-white hover:bg-white/10',
                  )
                }
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <span className="text-xs font-medium">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
