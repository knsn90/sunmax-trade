import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import {
  BarChart3, FileText, Receipt, LineChart, Users,
  Box, Settings, LayoutDashboard, Home, Activity, Tag, Database,
  TrendingUp,
} from 'lucide-react';

interface NavItem {
  to: string;
  labelKey: string;
  icon: React.ReactNode;
}

export function Sidebar() {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { data: settings } = useSettings();
  const { t } = useTranslation('nav');
  const isDonezo = theme === 'donezo';
  const isAdmin = profile?.role === 'admin';

  const barBg = isDonezo ? '#dc2626' : '#2563eb';
  const logoUrl = settings?.logo_url;

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
        { to: '/fin-reports', labelKey: 'items.finReports',    icon: <TrendingUp className="h-4 w-4" /> },
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
        { to: '/reports',       labelKey: 'items.reports',      icon: <LineChart className="h-4 w-4" /> },
        { to: '/settings',      labelKey: 'items.settings',     icon: <Settings className="h-4 w-4" /> },
        { to: '/legacy-import', labelKey: 'items.legacyImport', icon: <Database className="h-4 w-4" /> },
      ],
    },
  ];

  return (
    <aside className="hidden md:flex w-[200px] flex-shrink-0 flex-col overflow-y-auto overflow-x-hidden scrollbar-thin bg-white border-r border-gray-100">
      {/* Logo */}
      <div className="flex items-center justify-center px-4 py-2.5 flex-shrink-0 border-b border-gray-100 min-h-[52px]">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={t('brand.name')}
            className="max-h-7 max-w-[148px] w-full object-contain"
          />
        ) : (
          <div className="flex items-center gap-2.5 w-full">
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: barBg }}
            >
              <span className="font-black text-xs text-white">S</span>
            </div>
            <div>
              <div className="font-black text-[13px] tracking-tight text-gray-900 leading-tight">{t('brand.name')}</div>
              <div className="text-[8px] font-medium text-gray-400 tracking-wide leading-tight mt-0.5">{t('brand.tagline')}</div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2.5 space-y-0.5">
        {sections.map((section, si) => (
          <div key={si} className={si > 0 ? 'pt-2.5' : ''}>
            {section.labelKey && (
              <div className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1.5 text-gray-400">
                {t(section.labelKey)}
              </div>
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-xl transition-all mb-0.5 text-[12px]',
                    isActive ? 'font-semibold' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50',
                  )
                }
                style={({ isActive }) => isActive ? { background: `${barBg}12`, color: barBg } : {}}
              >
                {({ isActive }) => (
                  <>
                    <span className="flex-shrink-0 h-3.5 w-3.5" style={isActive ? { color: barBg } : {}}>
                      {item.icon}
                    </span>
                    <span style={isActive ? { color: barBg } : {}}>
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
