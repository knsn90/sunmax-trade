import { useQuery } from '@tanstack/react-query';

interface RatesResponse {
  base: string;
  rates: Record<string, number>;
  date: string;
}

/**
 * Fetches live exchange rates.
 * Primary: open.er-api.com (free, CORS-enabled, no auth)
 * Fallback: frankfurter.app
 * Returns rates relative to USD.
 */
async function fetchRates(): Promise<RatesResponse> {
  // Primary: open.er-api.com — free tier, CORS enabled
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const json = await res.json();
      if (json.result === 'success' && json.rates) {
        return { base: 'USD', rates: { USD: 1, ...json.rates }, date: json.time_last_update_utc?.slice(0, 10) ?? '' };
      }
    }
  } catch {
    // fall through to backup
  }

  // Fallback: frankfurter.app
  const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,TRY,GBP,CHF,CNY');
  if (!res.ok) throw new Error('Exchange rate fetch failed');
  const json = await res.json();
  return { base: 'USD', rates: { USD: 1, ...json.rates }, date: json.date };
}

export function useExchangeRates() {
  return useQuery({
    queryKey: ['exchange-rates'],
    queryFn: fetchRates,
    staleTime: 1000 * 60 * 60,      // 1 hour
    gcTime: 1000 * 60 * 60 * 24,    // 24h cache
    retry: 0,                        // don't retry on CORS failure — just show stale/empty
    refetchOnWindowFocus: false,
  });
}

/**
 * Convenience hook: returns just the rate for a specific currency pair.
 * rateFor('TRY') → how many TRY per 1 USD
 */
export function useRateFor(currency: 'EUR' | 'TRY' | 'USD' | string) {
  const { data, isLoading, isError } = useExchangeRates();
  const rate = data?.rates?.[currency] ?? null;
  return { rate, isLoading, isError, date: data?.date };
}
