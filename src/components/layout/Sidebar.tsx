import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { useTenant } from '@/contexts/TenantContext';
import {
  BarChart3, FileText, Receipt, LineChart, Users,
  Box, Settings, LayoutDashboard, Home, Activity, Tag,
  TrendingUp, Building2, Trash2,
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
        { to: '/reports',  labelKey: 'items.reports',  icon: <LineChart className="h-4 w-4" /> },
        { to: '/settings', labelKey: 'items.settings', icon: <Settings className="h-4 w-4" /> },
        { to: '/trash',    labelKey: 'items.trash',    icon: <Trash2 className="h-4 w-4" /> },
      ],
    },
  ];

  // Süper admin bölümü — sadece is_super_admin için göster
  const superAdminSection = isSuperAdmin ? (
    <div className="pt-3 mt-1">
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] px-3 py-1.5 text-[#9B59B6]">
        Süper Admin
      </div>
      <NavLink
        to="/admin/tenants"
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg transition-colors mb-0.5 text-[13px]',
            isActive ? 'font-medium bg-[#9B59B6]/10 text-[#9B59B6]' : 'text-[#6F6F6F] hover:text-[#1A1A1A] hover:bg-[#F9F9F9]',
          )
        }
      >
        <Building2 className="flex-shrink-0 h-4 w-4" />
        <span>Firma Yönetimi</span>
        {allTenants.length > 0 && (
          <span className="ml-auto text-[10px] font-semibold bg-[#9B59B6]/12 text-[#9B59B6] rounded-full px-1.5 py-0.5">
            {allTenants.length}
          </span>
        )}
      </NavLink>
    </div>
  ) : null;

  return (
    <aside
      className="hidden md:flex w-[220px] flex-shrink-0 flex-col overflow-y-auto overflow-x-hidden scrollbar-thin bg-white border-r border-[#E5E5E5]"
      style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
    >
      {/* Logo */}
      <div className="flex items-center justify-center px-4 py-3 flex-shrink-0 border-b border-[#E5E5E5] min-h-[56px]">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={currentTenant?.name ?? ''}
            className="max-h-7 max-w-[156px] w-full object-contain"
          />
        ) : currentTenant ? (
          /* Tenant yüklendi ama logo yok — firma adı ve baş harfi göster */
          <div className="flex items-center gap-2.5 w-full">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 shrink-0"
              style={{ background: barBg }}
            >
              <span className="font-bold text-[13px] text-white">
                {currentTenant.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-[13px] tracking-[-0.01em] text-[#1A1A1A] leading-tight truncate">
                {currentTenant.name}
              </div>
            </div>
          </div>
        ) : (
          /* Henüz yüklenmedi — skeleton */
          <div className="flex items-center gap-2.5 w-full">
            <div className="w-7 h-7 rounded-lg bg-[#F2F2F2] animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 bg-[#F2F2F2] rounded animate-pulse w-3/4" />
              <div className="h-2 bg-[#F9F9F9] rounded animate-pulse w-1/2" />
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-3 space-y-0.5">
        {sections.map((section, si) => (
          <div key={si} className={si > 0 ? 'pt-3' : ''}>
            {section.labelKey && (
              <div className="text-[10px] font-medium uppercase tracking-[0.08em] px-3 py-1.5 text-[#9CA3AF]">
                {t(section.labelKey)}
              </div>
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg transition-colors mb-0.5 text-[13px]',
                    isActive ? 'font-medium' : 'text-[#6F6F6F] hover:text-[#1A1A1A] hover:bg-[#F9F9F9]',
                  )
                }
                style={({ isActive }) => isActive ? { background: `${barBg}14`, color: barBg } : {}}
              >
                {({ isActive }) => (
                  <>
                    <span
                      className="flex-shrink-0 h-4 w-4"
                      style={{ color: isActive ? barBg : '#9CA3AF' }}
                    >
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
