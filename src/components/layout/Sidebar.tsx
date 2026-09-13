import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { useTenant } from '@/contexts/TenantContext';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  KanbanIcon, Files01Icon, Invoice01Icon, ChartLineData01Icon, UserGroupIcon,
  PackageIcon, Settings01Icon, DashboardSquare01Icon, Home01Icon, Activity01Icon,
  Tag01Icon, TradeUpIcon, Building06Icon, Delete02Icon,
} from '@hugeicons/core-free-icons';

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
        { to: '/dashboard', labelKey: 'items.dashboard', icon: <HugeiconsIcon icon={Home01Icon} size={16} /> },
      ],
    },
    {
      labelKey: 'sections.trade',
      items: [
        { to: '/pipeline',   labelKey: 'items.pipeline',   icon: <HugeiconsIcon icon={KanbanIcon} size={16} /> },
        { to: '/files',      labelKey: 'items.allFiles',   icon: <HugeiconsIcon icon={Files01Icon} size={16} /> },
        { to: '/price-list', labelKey: 'items.priceList',  icon: <HugeiconsIcon icon={Tag01Icon} size={16} /> },
      ],
    },
    {
      labelKey: 'sections.documents',
      items: [
        { to: '/documents', labelKey: 'items.documents', icon: <HugeiconsIcon icon={Invoice01Icon} size={16} /> },
      ],
    },
    {
      labelKey: 'sections.finance',
      items: [
        { to: '/accounting',  labelKey: 'items.accounting',    icon: <HugeiconsIcon icon={DashboardSquare01Icon} size={16} /> },
        { to: '/fin-reports', labelKey: 'items.finReports',    icon: <HugeiconsIcon icon={TradeUpIcon} size={16} /> },
      ],
    },
    {
      labelKey: 'sections.contacts',
      items: [
        { to: '/contacts', labelKey: 'items.contacts', icon: <HugeiconsIcon icon={UserGroupIcon} size={16} /> },
        { to: '/products', labelKey: 'items.products', icon: <HugeiconsIcon icon={PackageIcon} size={16} /> },
      ],
    },
    {
      labelKey: 'sections.general',
      items: [
        ...(isAdmin ? [
          { to: '/activity', labelKey: 'items.activityLog', icon: <HugeiconsIcon icon={Activity01Icon} size={16} /> },
        ] : []),
        { to: '/reports',  labelKey: 'items.reports',  icon: <HugeiconsIcon icon={ChartLineData01Icon} size={16} /> },
        { to: '/settings', labelKey: 'items.settings', icon: <HugeiconsIcon icon={Settings01Icon} size={16} /> },
        { to: '/trash',    labelKey: 'items.trash',    icon: <HugeiconsIcon icon={Delete02Icon} size={16} /> },
      ],
    },
  ];

  // Süper admin bölümü — sadece is_super_admin için göster
  const superAdminSection = isSuperAdmin ? (
    <div className="pt-3 mt-1">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] px-3.5 py-1.5 text-[#6B4EE6]">
        Süper Admin
      </div>
      <NavLink
        to="/admin/tenants"
        className={({ isActive }) =>
          cn(
            'relative flex items-center gap-2.5 w-full px-3 h-9 rounded-xl transition-colors mb-0.5 text-[13px]',
            isActive ? 'font-semibold bg-[#6B4EE6]/10 text-[#6B4EE6]' : 'text-[#8A8A8E] hover:text-[#0A0A0A] hover:bg-[#F4F2EE]',
          )
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#6B4EE6]" />
            )}
            <HugeiconsIcon icon={Building06Icon} size={16} className="flex-shrink-0" />
            <span>Firma Yönetimi</span>
            {allTenants.length > 0 && (
              <span className="ml-auto text-[10px] font-bold bg-[#6B4EE6] text-white rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                {allTenants.length}
              </span>
            )}
          </>
        )}
      </NavLink>
    </div>
  ) : null;

  return (
    <aside
      className="hidden md:flex w-[224px] flex-shrink-0 flex-col overflow-y-auto overflow-x-hidden scrollbar-thin bg-white border-r border-[#ECECEC]"
      style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
    >
      {/* Logo */}
      <div className="flex items-center justify-center px-4 py-3.5 flex-shrink-0 border-b border-[#ECECEC] min-h-[60px]">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={currentTenant?.name ?? ''}
            className="max-h-7 max-w-[160px] w-full object-contain"
          />
        ) : currentTenant ? (
          /* Tenant yüklendi ama logo yok — firma adı ve baş harfi göster */
          <div className="flex items-center gap-2.5 w-full">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shrink-0"
              style={{ background: barBg }}
            >
              <span className="font-bold text-[14px] text-white">
                {currentTenant.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <div className="font-bold text-[14px] tracking-[-0.01em] text-[#0A0A0A] leading-tight truncate">
                {currentTenant.name}
              </div>
            </div>
          </div>
        ) : (
          /* Henüz yüklenmedi — skeleton */
          <div className="flex items-center gap-2.5 w-full">
            <div className="w-8 h-8 rounded-xl bg-[#EFEDE8] animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 bg-[#EFEDE8] rounded animate-pulse w-3/4" />
              <div className="h-2 bg-[#F4F2EE] rounded animate-pulse w-1/2" />
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3.5 px-3 space-y-0.5">
        {sections.map((section, si) => (
          <div key={si} className={si > 0 ? 'pt-3' : ''}>
            {section.labelKey && (
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] px-3.5 py-1.5 text-[#A8A8AD]">
                {t(section.labelKey)}
              </div>
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'relative flex items-center gap-2.5 w-full px-3 h-9 rounded-xl transition-colors mb-0.5 text-[13px]',
                    isActive ? 'font-semibold' : 'text-[#8A8A8E] hover:text-[#0A0A0A] hover:bg-[#F4F2EE]',
                  )
                }
                style={({ isActive }) => isActive ? { background: `${barBg}14`, color: barBg } : {}}
              >
                {({ isActive }) => (
                  <>
                    {/* Seçili göstergesi — kenar rail */}
                    {isActive && (
                      <span
                        className="absolute -left-2 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                        style={{ background: barBg }}
                      />
                    )}
                    <span
                      className="flex-shrink-0 h-4 w-4"
                      style={{ color: isActive ? barBg : '#A8A8AD' }}
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
