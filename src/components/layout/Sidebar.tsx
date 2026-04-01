import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import {
  BarChart3, FileText, Receipt, LineChart, Users,
  Box, Settings, LayoutDashboard, Home, Activity, Tag, Database,
  BookOpen, TrendingUp, Building2,
} from 'lucide-react';

interface NavItem {
  to: string;
  labelKey: string;
  icon: React.ReactNode;
}

export function Sidebar() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { t } = useTranslation('nav');
  const isDonezo = theme === 'donezo';
  const isAdmin = profile?.role === 'admin';

  const barBg = isDonezo ? '#dc2626' : '#2563eb';

  const sections: { labelKey?: string; items: NavItem[] }[] = [
    {
      items: [
        { to: '/dashboard', labelKey: 'items.dashboard', icon: <Home className="h-4 w-4" /> },
      ],
    },
    {
      labelKey: 'sections.trade',
      items: [
        { to: '/pipeline',   labelKey: 'items.pipeline',   icon: <BarChart3 className="h-4 w-4" /> },
        { to: '/files',      labelKey: 'items.allFiles',   icon: <FileText className="h-4 w-4" /> },
        { to: '/price-list', labelKey: 'items.priceList',  icon: <Tag className="h-4 w-4" /> },
      ],
    },
    {
      labelKey: 'sections.documents',
      items: [
        { to: '/documents', labelKey: 'items.documents', icon: <Receipt className="h-4 w-4" /> },
      ],
    },
    {
      labelKey: 'sections.finance',
      items: [
        { to: '/accounting',  labelKey: 'items.accounting',    icon: <LayoutDashboard className="h-4 w-4" /> },
        { to: '/ledger',      labelKey: 'items.journalLedger', icon: <BookOpen className="h-4 w-4" /> },
        { to: '/fin-reports', labelKey: 'items.finReports',    icon: <TrendingUp className="h-4 w-4" /> },
        { to: '/bank-recon',  labelKey: 'items.bankRecon',     icon: <Building2 className="h-4 w-4" /> },
        { to: '/reports',     labelKey: 'items.reports',       icon: <LineChart className="h-4 w-4" /> },
      ],
    },
    {
      labelKey: 'sections.contacts',
      items: [
        { to: '/contacts', labelKey: 'items.contacts', icon: <Users className="h-4 w-4" /> },
        { to: '/products', labelKey: 'items.products', icon: <Box className="h-4 w-4" /> },
      ],
    },
    {
      labelKey: 'sections.general',
      items: [
        ...(isAdmin ? [
          { to: '/activity', labelKey: 'items.activityLog', icon: <Activity className="h-4 w-4" /> },
        ] : []),
        { to: '/settings', labelKey: 'items.settings', icon: <Settings className="h-4 w-4" /> },
        { to: '/legacy-import', labelKey: 'items.legacyImport', icon: <Database className="h-4 w-4" /> },
      ],
    },
  ];

  return (
    <aside className="hidden md:flex w-[200px] flex-shrink-0 flex-col overflow-y-auto overflow-x-hidden scrollbar-thin bg-white border-r border-gray-100">
      {/* Logo */}
      <div className="h-[60px] flex items-center px-4 flex-shrink-0 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: barBg }}
          >
            <span className="font-black text-sm text-white">S</span>
          </div>
          <div>
            <div className="font-black text-sm tracking-tight text-gray-900">{t('brand.name')}</div>
            <div className="text-[9px] font-medium -mt-0.5 text-gray-400">{t('brand.tagline')}</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {sections.map((section, si) => (
          <div key={si} className={si > 0 ? 'pt-3' : ''}>
            {section.labelKey && (
              <div className="text-[9px] font-bold tracking-widest px-3 py-1.5 text-gray-400">
                {t(section.labelKey)}
              </div>
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 w-full px-3 py-2 rounded-xl transition-all mb-0.5',
                    isActive
                      ? 'bg-red-50 font-semibold'
                      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className="flex-shrink-0"
                      style={isActive ? { color: barBg } : {}}
                    >
                      {item.icon}
                    </span>
                    <span
                      className="text-xs font-medium"
                      style={isActive ? { color: barBg } : {}}
                    >
                      {t(item.labelKey)}
                    </span>
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
