import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { useTenant } from '@/contexts/TenantContext';
import {
  BarChart3, FileText, Receipt, LineChart, Users,
  Box, Settings, LayoutDashboard, Home, Activity, Tag, Database,
  TrendingUp, Building2,
} from 'lucide-react';

interface NavItem {
  to: string;
  labelKey: string;
  icon: React.ReactNode;
}

export function Sidebar() {
  const { profile } = useAuth();
  const { data: settings } = useSettings();
  const { t } = useTranslation('nav');
  const { allTenants } = useTenant();
  const isAdmin = profile?.role === 'admin';
  const isSuperAdmin = profile?.is_super_admin === true;

  // Tenant'ın primary_color'ını kullan — ThemeContext'ten dinamik gelir
  const { accent: barBg } = useTheme();
  const { currentTenant } = useTenant();
  // Tenant logo daha hızlı yüklenir (1 network call), settings logo fallback olarak kullan
  const logoUrl = currentTenant?.logo_url || settings?.logo_url;

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

  // Süper admin bölümü — sadece is_super_admin için göster
  const superAdminSection = isSuperAdmin ? (
    <div className="pt-2.5">
      <div className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1.5 text-amber-500">
        Süper Admin
      </div>
      <NavLink
        to="/admin/tenants"
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-xl transition-all mb-0.5 text-[12px]',
            isActive ? 'font-semibold bg-amber-50 text-amber-700' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50',
          )
        }
      >
        {({ isActive }) => (
          <>
            <Building2
              className="flex-shrink-0 h-3.5 w-3.5"
              style={isActive ? { color: '#b45309' } : {}}
            />
            <span style={isActive ? { color: '#b45309' } : {}}>
              Firma Yönetimi
            </span>
            {allTenants.length > 0 && (
              <span className="ml-auto text-[9px] font-bold bg-amber-100 text-amber-600 rounded-full px-1.5 py-0.5">
                {allTenants.length}
              </span>
            )}
          </>
        )}
      </NavLink>
    </div>
  ) : null;

  return (
    <aside className="hidden md:flex w-[200px] flex-shrink-0 flex-col overflow-y-auto overflow-x-hidden scrollbar-thin bg-white border-r border-gray-100">
      {/* Logo */}
      <div className="flex items-center justify-center px-4 py-2.5 flex-shrink-0 border-b border-gray-100 min-h-[52px]">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={currentTenant?.name ?? ''}
            className="max-h-7 max-w-[148px] w-full object-contain"
          />
        ) : currentTenant ? (
          /* Tenant yüklendi ama logo yok — firma adı ve baş harfi göster */
          <div className="flex items-center gap-2.5 w-full">
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 shrink-0"
              style={{ background: barBg }}
            >
              <span className="font-black text-xs text-white">
                {currentTenant.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <div className="font-black text-[12px] tracking-tight text-gray-900 leading-tight truncate">
                {currentTenant.name}
              </div>
            </div>
          </div>
        ) : (
          /* Henüz yüklenmedi — skeleton */
          <div className="flex items-center gap-2.5 w-full">
            <div className="w-7 h-7 rounded-xl bg-gray-100 animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 bg-gray-100 rounded animate-pulse w-3/4" />
              <div className="h-2 bg-gray-50 rounded animate-pulse w-1/2" />
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
        {superAdminSection}
      </nav>
    </aside>
  );
}
