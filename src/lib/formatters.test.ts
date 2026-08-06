import { describe, it, expect } from 'vitest';
import { toUSD, fN, fCurrency, fDateDMY, today } from './formatters';

describe('toUSD', () => {
  it('USD tutarı olduğu gibi döner', () => {
    expect(toUSD(1000, 'USD', 34)).toBe(1000);
  });
  it('yerel para birimini rate ile böler (local per USD)', () => {
    // 100.000 TRY, 1 USD = 34 TRY → ~2941.18 USD
    expect(toUSD(100000, 'TRY', 34)).toBeCloseTo(2941.176, 2);
  });
  it('rate <= 0 ise 0 döner (sıfıra bölme koruması)', () => {
    expect(toUSD(100, 'EUR', 0)).toBe(0);
  });
});

describe('fN', () => {
  it('null/undefined → em dash', () => {
    expect(fN(null)).toBe('—');
    expect(fN(undefined)).toBe('—');
  });
  it('NaN → em dash (asla "NaN" yazmaz)', () => {
    expect(fN(NaN)).toBe('—');
  });
  it('sayıyı ondalıkla formatlar', () => {
    expect(fN(1234.5, 2)).toBe('1,234.50');
    expect(fN(1000, 0)).toBe('1,000');
  });
});

describe('fCurrency', () => {
  it('null → em dash', () => {
    expect(fCurrency(null, 'USD')).toBe('—');
  });
  it('negatif tutarı eksi işaretiyle gösterir', () => {
    expect(fCurrency(-500, 'USD')).toBe('-$500.00');
  });
});

describe('fDateDMY', () => {
  it('ISO tarihi dd.mm.yyyy formatına çevirir', () => {
    expect(fDateDMY('2025-03-17')).toBe('17.03.2025');
  });
  it('boş → em dash', () => {
    expect(fDateDMY('')).toBe('—');
  });
});

describe('today', () => {
  it('YYYY-MM-DD formatında yerel tarih döner', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
