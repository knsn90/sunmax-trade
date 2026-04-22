import { useSettings } from './useSettings';
import { CURRENCY_CODES } from '@/types/enums';

export function useCurrencies(): string[] {
  const { data: settings } = useSettings();
  if (settings?.active_currencies?.length) return settings.active_currencies;
  return [...CURRENCY_CODES];
}
