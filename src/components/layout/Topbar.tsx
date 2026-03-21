import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { LogOut, RefreshCw } from 'lucide-react';
import { fDate } from '@/lib/formatters';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { useExchangeRates } from '@/hooks/useExchangeRate';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': '📊 Dashboard',
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
    <span className="text-[10px] text-muted-foreground animate-pulse">Loading rates…</span>
  );
  if (isError || !data) return null;

  const eur = data.rates['EUR'];
  const tryRate = data.rates['TRY'];

  return (
    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
      <span className="text-[10px] text-slate-400 font-medium">Rate</span>
      <span className="text-[10px] font-semibold text-slate-700">
        EUR <span className="text-blue-600">{eur ? (1/eur).toFixed(4) : '—'}</span>
      </span>
      <span className="text-slate-200">|</span>
      <span className="text-[10px] font-semibold text-slate-700">
        TRY <span className="text-green-600">{tryRate ? tryRate.toFixed(2) : '—'}</span>
      </span>
      <button
        onClick={() => refetch()}
        disabled={isFetching}
        className="text-slate-400 hover:text-slate-600 disabled:opacity-40 transition-colors ml-0.5"
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
    <header className="bg-white border-b border-border px-5 py-2.5 flex items-center justify-between flex-shrink-0">
      <h1 className="text-base font-bold">{title}</h1>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-3">
          <ExchangeRateBar />
          <span className="text-[11px] text-muted-foreground">
            {fDate(new Date().toISOString().slice(0, 10))}
          </span>
          {profile && (
            <span className="text-[11px] text-muted-foreground">
              {profile.full_name}
              <span className="ml-1 text-2xs uppercase opacity-60">({profile.role})</span>
            </span>
          )}
        </div>

        <NotificationBell />

        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
}
