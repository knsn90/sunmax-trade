import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { LogOut, RefreshCw } from 'lucide-react';
import { fDate } from '@/lib/formatters';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { useExchangeRates } from '@/hooks/useExchangeRate';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/pipeline': 'Pipeline',
  '/files': 'All Files',
  '/invoices': 'Invoices',
  '/packing-lists': 'Packing Lists',
  '/proformas': 'Proformas',
  '/accounting': 'Accounting',
  '/reports': 'Reports',
  '/customers': 'Customers',
  '/suppliers': 'Suppliers',
  '/service-providers': 'Service Providers',
  '/products': 'Products',
  '/settings': 'Settings',
};

function ExchangeRateBar({ isDonezo }: { isDonezo: boolean }) {
  const { data, isLoading, isError, refetch, isFetching } = useExchangeRates();

  if (isLoading) return <span className={cn('text-[10px] animate-pulse', isDonezo ? 'text-gray-400' : 'text-white/60')}>Loading…</span>;
  if (isError || !data) return null;

  const eur     = data.rates['EUR'];
  const tryRate = data.rates['TRY'];

  const sep = <span className={isDonezo ? 'text-gray-300' : 'text-white/20'}>|</span>;
  const lbl = (t: string) => <span className={cn('text-[10px] font-medium', isDonezo ? 'text-gray-400' : 'text-white/60')}>{t}</span>;
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
        title="Refresh rates"
      >
        <RefreshCw className={`h-2.5 w-2.5 ${isFetching ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}

export function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { theme } = useTheme();
  const isDonezo = theme === 'donezo';

  const basePath = '/' + location.pathname.split('/').filter(Boolean)[0];
  const title = PAGE_TITLES[basePath] ?? 'SunPlus';

  if (isDonezo) {
    return (
      <header
        className="bg-white border-b border-gray-100 px-5 flex items-center gap-3 flex-shrink-0 shadow-sm"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)', paddingBottom: '10px' }}
      >
        {/* Kur bilgisi — solda */}
        <ExchangeRateBar isDonezo={isDonezo} />

        {/* Sağa iten boşluk */}
        <div className="flex-1 hidden md:block" />

        {/* Tarih + Bildirim + Kullanıcı — en sağda */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="hidden md:block text-[11px] text-gray-400">
            {fDate(new Date().toISOString().slice(0, 10))}
          </span>

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

          <Button variant="ghost" size="sm" onClick={signOut} className="text-gray-400 hover:text-gray-600">
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
      {/* Logo + Sayfa başlığı — solda */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
            <span className="text-white font-black text-xs">S</span>
          </div>
          <span className="text-white font-black text-sm tracking-tight">SunPlus</span>
          <span className="text-white/30 mx-1">|</span>
        </div>
        <h1 className="hidden md:block text-base font-bold text-white truncate min-w-0">{title}</h1>
      </div>

      {/* Kur — ortada */}
      <div className="flex-1 flex justify-center">
        <ExchangeRateBar isDonezo={false} />
      </div>

      {/* Tarih + Bildirim + Kullanıcı — en sağda */}
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
        <NotificationBell />
        <Button variant="ghost" size="sm" onClick={signOut} className="text-white/70 hover:text-white hover:bg-white/10">
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
}
