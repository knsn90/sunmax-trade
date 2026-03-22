import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { LogOut, RefreshCw } from 'lucide-react';
import { fDate } from '@/lib/formatters';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { useExchangeRates } from '@/hooks/useExchangeRate';

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

function ExchangeRateBar() {
  const { data, isLoading, isError, refetch, isFetching } = useExchangeRates();

  if (isLoading) return (
    <span className="text-[10px] text-white/60 animate-pulse">Loading rates…</span>
  );
  if (isError || !data) return null;

  const eur = data.rates['EUR'];
  const tryRate = data.rates['TRY'];

  return (
    <div className="hidden md:flex items-center gap-2 bg-white/15 rounded-lg px-2.5 py-1 backdrop-blur-sm">
      <span className="text-[10px] text-white/70 font-medium">Rate</span>
      <span className="text-[10px] font-semibold text-white">
        EUR <span className="text-yellow-300">{eur ? (1/eur).toFixed(4) : '—'}</span>
      </span>
      <span className="text-white/30">|</span>
      <span className="text-[10px] font-semibold text-white">
        TRY <span className="text-green-300">{tryRate ? tryRate.toFixed(2) : '—'}</span>
      </span>
      <button
        onClick={() => refetch()}
        disabled={isFetching}
        className="text-white/50 hover:text-white disabled:opacity-40 transition-colors ml-0.5"
        title={`Updated: ${data.date}`}
      >
        <RefreshCw className={`h-2.5 w-2.5 ${isFetching ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}

export function Topbar() {
  const location = useLocation();
  const { profile, signOut } = useAuth();

  const basePath = '/' + location.pathname.split('/').filter(Boolean)[0];
  const title = PAGE_TITLES[basePath] ?? 'SunPlus';

  return (
    <header
      className="gradient-header px-4 sm:px-5 flex items-center justify-between gap-2 flex-shrink-0 shadow-lg"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)', paddingBottom: '10px' }}
    >
      {/* Left: Logo + Title */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
            <span className="text-white font-black text-xs">S</span>
          </div>
          <span className="text-white font-black text-sm tracking-tight">SunPlus</span>
          <span className="text-white/30 mx-1">|</span>
        </div>
        <h1 className="text-base font-bold text-white truncate min-w-0">{title}</h1>
      </div>

      {/* Right: Exchange rates + notifications + user */}
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <ExchangeRateBar />

        <div className="hidden md:flex items-center gap-2">
          <span className="text-[11px] text-white/70">
            {fDate(new Date().toISOString().slice(0, 10))}
          </span>
          {profile && (
            <span className="text-[11px] text-white/70">
              {profile.full_name}
              <span className="ml-1 text-white/40 text-2xs uppercase">({profile.role})</span>
            </span>
          )}
        </div>

        <NotificationBell />

        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="text-white/70 hover:text-white hover:bg-white/10"
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
}
