import { useQuery } from '@tanstack/react-query';
import { useExchangeRates } from './useExchangeRate';

interface HardwoodData {
  priceRMB: number;
  priceUSD: number;
  date: string;
}

async function fetchHardwoodPrice(): Promise<{ price: number; date: string }> {
  // In dev, call the Vercel function URL directly; in prod it's same-origin /api/hardwood-price
  const base = import.meta.env.DEV
    ? 'http://localhost:3000'   // vercel dev or vite proxy
    : '';
  const res = await fetch(`${base}/api/hardwood-price`);
  if (!res.ok) throw new Error(`Hardwood price API error ${res.status}`);
  return res.json() as Promise<{ price: number; date: string }>;
}

export function useHardwoodPrice(): {
  data: HardwoodData | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { data: rates } = useExchangeRates();

  const { data: raw, isLoading, isError } = useQuery({
    queryKey: ['hardwood-price'],
    queryFn: fetchHardwoodPrice,
    staleTime: 1000 * 60 * 60 * 6,   // 6 hours
    gcTime:    1000 * 60 * 60 * 24,   // 24 hours cache
    retry: 2,
    refetchOnWindowFocus: false,
  });

  if (!raw || !rates) return { data: null, isLoading, isError };

  // rates.CNY = how many CNY per 1 USD  →  USD = CNY_amount / CNY_rate
  const cnyRate = rates.rates['CNY'] ?? 7.25;
  const priceUSD = raw.price / cnyRate;

  return {
    data: { priceRMB: raw.price, priceUSD, date: raw.date },
    isLoading,
    isError,
  };
}
