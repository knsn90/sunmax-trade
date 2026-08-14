import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { LogOut, RefreshCw, Building2, ChevronDown, Check, LayoutGrid, ShieldCheck } from 'lucide-react';
import { fDate } from '@/lib/formatters';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { useExchangeRates } from '@/hooks/useExchangeRate';
import { useTheme } from '@/contexts/ThemeContext';
import { useTenant } from '@/contexts/TenantContext';
import { cn } from '@/lib/utils';
import { useSettings } from '@/hooks/useSettings';
import { Calculator } from '@/components/ui/Calculator';
import { useState, useRef, useEffect } from 'react';

const PATH_TITLE_KEYS: Record<string, string> = {
  '/dashboard': 'topbar.pageTitles.dashboard',
  '/pipeline':  'topbar.pageTitles.pipeline',
  '/files':     'topbar.pageTitles.files',
  '/documents': 'topbar.pageTitles.documents',
  '/accounting':'topbar.pageTitles.accounting',
  '/fin-reports':'topbar.pageTitles.finReports',
  '/reports':   'topbar.pageTitles.reports',
  '/contacts':  'topbar.pageTitles.contacts',
  '/products':  'topbar.pageTitles.products',
  '/settings':  'topbar.pageTitles.settings',
  '/profile':   'topbar.pageTitles.profile',
  '/price-list':'topbar.pageTitles.priceList',
  '/activity':  'topbar.pageTitles.activity',
};

function ExchangeRateBar({ isDonezo }: { isDonezo: boolean }) {
  const { t } = useTranslation('nav');
  const { data, isLoading, isError, refetch, isFetching } = useExchangeRates();

  if (isLoading) return <span className={cn('text-[11px] animate-pulse', isDonezo ? 'text-[#8A8A8E]' : 'text-white/60')}>Loading…</span>;
  if (isError || !data) return null;

  const eur     = data.rates['EUR'];
  const tryRate = data.rates['TRY'];

  const sep = <span className={isDonezo ? 'text-[#D8D4CC]' : 'text-white/20'}>·</span>;
  const lbl = (text: string) => <span className={cn('text-[11px] font-medium', isDonezo ? 'text-[#8A8A8E]' : 'text-white/60')}>{text}</span>;
  const val = (children: React.ReactNode) => (
    <span className={cn('text-[11px] font-semibold tabular-nums', isDonezo ? 'text-[#0A0A0A]' : 'text-white')}>{children}</span>
  );

  return (
    <div className={cn(
      'hidden md:flex items-center gap-2 rounded-full px-3 py-1.5',
      isDonezo ? 'bg-[#F4F2EE]' : 'bg-white/15 backdrop-blur-sm',
    )}>
      {lbl('EUR')}
      {val(<span className={isDonezo ? 'text-blue-600' : 'text-yellow-300'}>{eur ? (1 / eur).toFixed(4) : '—'}</span>)}
      {sep}
      {lbl('TRY')}
      {val(<span className={isDonezo ? 'text-emerald-600' : 'text-green-300'}>{tryRate ? tryRate.toFixed(2) : '—'}</span>)}
      <button
        onClick={() => refetch()}
        disabled={isFetching}
        className={cn('disabled:opacity-40 transition-colors ml-0.5', isDonezo ? 'text-[#A8A8AD] hover:text-[#0A0A0A]' : 'text-white/50 hover:text-white')}
        title={t('topbar.refreshRates')}
      >
        <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}

/** Süper admin firma geçiş dropdown'u */
function TenantSwitcher() {
  const { currentTenant, allTenants, switchTenant, resetToSuperAdmin } = useTenant();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, []);

  if (!profile?.is_super_admin) return null;

  const label = currentTenant?.name ?? 'Tüm Firmalar';

  return (
    <div ref={ref} className="relative shrink-0" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 h-9 px-3.5 rounded-full bg-[#6B4EE6]/8 text-[#6B4EE6] hover:bg-[#6B4EE6]/14 transition-colors"
      >
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span className="text-[12px] font-semibold max-w-[110px] md:max-w-[160px] truncate">{label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 opacity-60 transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 bg-white rounded-[16px] shadow-[0_8px_24px_rgba(0,0,0,0.12)] border border-[#ECECEC] overflow-hidden z-50 min-w-[228px] max-w-[280px]">
          {/* Header */}
          <div className="px-3.5 py-2.5 border-b border-[#F4F2EE]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#A8A8AD]">Firma Geçişi</p>
          </div>

          {/* Tüm firmalar seçeneği */}
          <button
            onClick={() => { resetToSuperAdmin(); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-[#F4F2EE] transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-xl bg-[#6B4EE6]/10 flex items-center justify-center shrink-0">
              <LayoutGrid className="h-4 w-4 text-[#6B4EE6]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[#0A0A0A] truncate">Tüm Firmalar</p>
              <p className="text-[11px] text-[#8A8A8E]">Süper admin görünümü</p>
            </div>
            {!currentTenant && <Check className="h-4 w-4 text-[#6B4EE6] shrink-0" />}
          </button>

          {/* Firma listesi */}
          {allTenants.length > 0 && (
            <div className="border-t border-[#F4F2EE]">
              {allTenants.map(t => (
                <button
                  key={t.id}
                  onClick={() => { switchTenant(t.id); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-[#F4F2EE] transition-colors text-left"
                >
                  {t.logo_url ? (
                    <img src={t.logo_url} alt={t.name} className="w-8 h-8 rounded-xl object-contain bg-white border border-[#ECECEC]" />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white text-[11px] font-bold"
                      style={{ background: t.primary_color || '#6B4EE6' }}
                    >
                      {t.name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#0A0A0A] truncate">{t.name}</p>
                    {t.email && <p className="text-[11px] text-[#8A8A8E] truncate">{t.email}</p>}
                  </div>
                  {currentTenant?.id === t.id && <Check className="h-4 w-4 text-[#6B4EE6] shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {/* Firma yönetimi linki */}
          <div className="border-t border-[#ECECEC] px-3.5 py-2.5">
            <button
              onClick={() => { navigate('/admin/tenants'); setOpen(false); }}
              className="w-full flex items-center gap-2 text-[12px] font-semibold text-[#6B4EE6] hover:opacity-80 transition-opacity"
            >
              <Building2 className="h-4 w-4" />
              Firma Yönetimi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation('nav');
  const { profile, signOut } = useAuth();
  const { theme, accent } = useTheme();
  const isDonezo = theme === 'donezo';
  const { data: settings } = useSettings();
  const logoUrl = settings?.logo_url;
  const isSuperAdmin = !!profile?.is_super_admin;

  const basePath = '/' + location.pathname.split('/').filter(Boolean)[0];
  const titleKey = PATH_TITLE_KEYS[basePath];
  const title    = titleKey ? t(titleKey) : t('brand.name');

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  if (isDonezo) {
    return (
      <header
        className="bg-white border-b border-[#ECECEC] px-5 flex items-center gap-3 flex-shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 11px)', paddingBottom: '11px', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
      >
        {/* Mobile logo — süper admin'de gizle, yerini firma switcher alsın */}
        <div className={cn('md:hidden items-center gap-2 min-w-0', isSuperAdmin ? 'hidden' : 'flex flex-1')}>
          {logoUrl ? (
            <img src={logoUrl} alt="logo" className="h-7 max-w-[120px] object-contain" />
          ) : (
            <>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: accent }}>
                <span className="font-bold text-[13px] text-white">S</span>
              </div>
              <span className="font-bold text-[15px] tracking-[-0.01em] text-[#0A0A0A]">{t('brand.name')}</span>
            </>
          )}
        </div>

        <TenantSwitcher />
        <ExchangeRateBar isDonezo={isDonezo} />
        <div className={cn('flex-1', isSuperAdmin ? '' : 'hidden md:block')} />

        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span className="hidden md:block text-[12px] text-[#8A8A8E]">
            {fDate(new Date().toISOString().slice(0, 10))}
          </span>

          <Calculator />
          <NotificationBell />

          {profile && (
            <button
              onClick={() => navigate('/profile')}
              className="hidden md:flex items-center gap-2.5 pl-3 ml-0.5 border-l border-[#ECECEC] hover:opacity-75 transition-opacity cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: accent + '1A' }}>
                {profile.avatar_url
                  ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  : <span className="text-[12px] font-bold" style={{ color: accent }}>{profile.full_name?.charAt(0)?.toUpperCase() ?? 'U'}</span>
                }
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[12px] font-semibold text-[#0A0A0A] leading-none">{profile.full_name}</span>
                <span className="text-[10px] text-[#A8A8AD] leading-none mt-0.5 uppercase tracking-wide">{profile.role}</span>
              </div>
            </button>
          )}

          <Button variant="ghost" size="sm" onClick={handleSignOut} title={t('topbar.logout')} className="text-[#A8A8AD] hover:text-[#0A0A0A] rounded-full">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
    );
  }

  // Paciolo theme
  return (
    <header
      className="gradient-header px-4 sm:px-5 flex items-center gap-2 flex-shrink-0 shadow-lg"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)', paddingBottom: '10px' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
            <span className="text-white font-black text-xs">S</span>
          </div>
          <span className="text-white font-black text-sm tracking-tight">{t('brand.name')}</span>
          <span className="text-white/30 mx-1">|</span>
        </div>
        <h1 className="hidden md:block text-base font-bold text-white truncate min-w-0">{title}</h1>
      </div>

      <div className="flex-1 flex justify-center">
        <ExchangeRateBar isDonezo={false} />
      </div>

      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <div className="hidden md:flex items-center gap-2">
          <span className="text-[11px] text-white/70">{fDate(new Date().toISOString().slice(0, 10))}</span>
          {profile && (
            <button
              onClick={() => navigate('/profile')}
              className="text-[11px] text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              {profile.full_name}
              <span className="ml-1 text-white/40 text-2xs uppercase">({profile.role})</span>
            </button>
          )}
        </div>
        <Calculator />
        <NotificationBell />
        <Button variant="ghost" size="sm" onClick={handleSignOut} title={t('topbar.logout')} className="text-white/70 hover:text-white hover:bg-white/10">
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
}
