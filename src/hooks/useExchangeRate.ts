import { useQuery } from '@tanstack/react-query';

interface RatesResponse {
  base: string;
  rates: Record<string, number>;
  date: string;
}

/**
 * Fetches live exchange rates from Open Exchange Rates (free, no auth needed).
 * Falls back to frankfurter.app which is truly free and reliable.
 * Returns rates relative to USD.
 */
async function fetchRates(): Promise<RatesResponse> {
  // frankfurter.app — completely free, no API key, reliable
  const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,TRY,GBP,CHF');
  if (!res.ok) throw new Error('Exchange rate fetch failed');
  const json = await res.json();
  return {
    base: 'USD',
    rates: { USD: 1, ...json.rates },
    date: json.date,
  };
}

export function useExchangeRates() {
  return useQuery({
    queryKey: ['exchange-rates'],
    queryFn: fetchRates,
    staleTime: 1000 * 60 * 60,      // 1 hour — rates don't change that fast
    gcTime: 1000 * 60 * 60 * 24,    // keep in cache 24h
    retry: 2,
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
