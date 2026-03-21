import type { CurrencyCode } from '@/types/enums';
import { CURRENCY_SYMBOLS } from '@/types/enums';

/**
 * Format a number with locale grouping.
 * fN(1234.567, 3) → "1,234.567"
 */
export function fN(value: number | null | undefined, decimals = 3): string {
  if (value == null) return '—';
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a number as currency.
 * fCurrency(1234.56, 'USD') → "$1,234.56"
 * fCurrency(-500, 'TRY') → "-₺500.00"
 */
export function fCurrency(
  value: number | null | undefined,
  currency: CurrencyCode = 'USD',
): string {
  if (value == null) return '—';
  const v = Number(value);
  if (isNaN(v)) return '—';
  const sym = CURRENCY_SYMBOLS[currency] ?? '$';
  const abs = Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${v < 0 ? '-' : ''}${sym}${abs}`;
}

/**
 * Format as USD specifically.
 */
export function fUSD(value: number | null | undefined): string {
  return fCurrency(value, 'USD');
}

/**
 * Format a date string for display.
 * fDate('2025-03-17') → "17 Mar 2025"
 */
export function fDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Get today's date as ISO string (YYYY-MM-DD).
 */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Convert amount to USD using exchange rate.
 */
export function toUSD(
  amount: number,
  currency: CurrencyCode,
  rate: number,
): number {
  if (currency === 'USD') return amount;
  return rate > 0 ? amount / rate : 0;
}
