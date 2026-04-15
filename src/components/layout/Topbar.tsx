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

  if (isLoading) return <span className={cn('text-[10px] animate-pulse', isDonezo ? 'text-gray-400' : 'text-white/60')}>Loading…</span>;
  if (isError || !data) return null;

  const eur     = data.rates['EUR'];
  const tryRate = data.rates['TRY'];

  const sep = <span className={isDonezo ? 'text-gray-300' : 'text-white/20'}>|</span>;
  const lbl = (text: string) => <span className={cn('text-[10px] font-medium', isDonezo ? 'text-gray-400' : 'text-white/60')}>{text}</span>;
  const val = (children: React.ReactNode) => (
    <span className={cn('text-[10px] font-semibold', isDonezo ? 'text-gray-800' : 'text-white')}>{children}</span>
  );

  return (
    <div className={cn(
      'hidden md:flex items-center gap-2 rounded-lg px-2.5 py-1.5',
      isDonezo ? 'bg-gray-100' : 'bg-white/15 backdrop-blur-sm',
    )}>
      {lbl('EUR')}
      {val(<span className={isDonezo ? 'text-blue-600' : 'text-yellow-300'}>{eur ? (1 / eur).toFixed(4) : '—'}</span>)}
      {sep}
      {lbl('TRY')}
      {val(<span className={isDonezo ? 'text-emerald-600' : 'text-green-300'}>{tryRate ? tryRate.toFixed(2) : '—'}</span>)}
      <button
        onClick={() => refetch()}
        disabled={isFetching}
        className={cn('disabled:opacity-40 transition-colors ml-0.5', isDonezo ? 'text-gray-400 hover:text-gray-600' : 'text-white/50 hover:text-white')}
        title={t('topbar.refreshRates')}
      >
        <RefreshCw className={`h-2.5 w-2.5 ${isFetching ? 'animate-spin' : ''}`} />
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
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!profile?.is_super_admin) return null;

  const label = currentTenant?.name ?? 'Tüm Firmalar';

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 h-8 px-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
      >
        <ShieldCheck className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <span className="text-[11px] font-semibold max-w-[140px] truncate">{label}</span>
        <ChevronDown className={cn('h-3 w-3 text-amber-400 transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 left-0 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50 min-w-[220px] max-w-[280px]">
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-gray-50 bg-gray-50/70">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Firma Geçişi</p>
          </div>

          {/* Tüm firmalar seçeneği */}
          <button
            onClick={() => { resetToSuperAdmin(); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
          >
            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <LayoutGrid className="h-3.5 w-3.5 text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-gray-800 truncate">Tüm Firmalar</p>
              <p className="text-[10px] text-gray-400">Süper admin görünümü</p>
            </div>
            {!currentTenant && <Check className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
          </button>

          {/* Firma listesi */}
          {allTenants.length > 0 && (
            <div className="border-t border-gray-50">
              {allTenants.map(t => (
                <button
                  key={t.id}
                  onClick={() => { switchTenant(t.id); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                >
                  {t.logo_url ? (
                    <img src={t.logo_url} alt={t.name} className="w-7 h-7 rounded-lg object-contain bg-gray-50 border border-gray-100" />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white text-[10px] font-black"
                      style={{ background: t.primary_color || '#dc2626' }}
                    >
                      {t.name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-gray-800 truncate">{t.name}</p>
                    {t.email && <p className="text-[10px] text-gray-400 truncate">{t.email}</p>}
                  </div>
                  {currentTenant?.id === t.id && <Check className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {/* Firma yönetimi linki */}
          <div className="border-t border-gray-100 px-3 py-2">
            <button
              onClick={() => { navigate('/admin/tenants'); setOpen(false); }}
              className="w-full flex items-center gap-2 text-[11px] font-semibold text-amber-600 hover:text-amber-700 transition-colors"
            >
              <Building2 className="h-3.5 w-3.5" />
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
        className="bg-white border-b border-gray-100 px-5 flex items-center gap-3 flex-shrink-0 shadow-sm"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)', paddingBottom: '10px' }}
      >
        {/* Mobile logo */}
        <div className="md:hidden flex items-center gap-2 flex-1">
          {logoUrl ? (
            <img src={logoUrl} alt="logo" className="h-7 max-w-[120px] object-contain" />
          ) : (
            <>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: accent }}>
                <span className="font-black text-xs text-white">S</span>
              </div>
              <span className="font-black text-sm tracking-tight text-gray-900">{t('brand.name')}</span>
            </>
          )}
        </div>

        <TenantSwitcher />
        <ExchangeRateBar isDonezo={isDonezo} />
        <div className="flex-1 hidden md:block" />

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="hidden md:block text-[11px] text-gray-400">
            {fDate(new Date().toISOString().slice(0, 10))}
          </span>

          <Calculator />
          <NotificationBell />

          {profile && (
            <button
              onClick={() => navigate('/profile')}
              className="hidden md:flex items-center gap-2 pl-3 border-l border-gray-100 hover:opacity-75 transition-opacity cursor-pointer"
            >
              <div className="w-7 h-7 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                {profile.avatar_url
                  ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  : <span className="text-[10px] font-bold text-red-600">{profile.full_name?.charAt(0)?.toUpperCase() ?? 'U'}</span>
                }
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold text-gray-800 leading-none">{profile.full_name}</span>
                <span className="text-[10px] text-gray-400 leading-none mt-0.5 uppercase">{profile.role}</span>
              </div>
            </button>
          )}

          <Button variant="ghost" size="sm" onClick={handleSignOut} title={t('topbar.logout')} className="text-gray-400 hover:text-gray-600">
            <LogOut className="h-3.5 w-3.5" />
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
