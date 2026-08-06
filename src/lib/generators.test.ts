import { describe, it, expect } from 'vitest';
import { nextAvailableDocNo } from './generators';

describe('nextAvailableDocNo', () => {
  it('hiç kayıt yoksa taban numarayı döner', () => {
    expect(nextAvailableDocNo([], 'SUN INV')).toBe('SUN INV');
  });

  it('sadece taban varsa -02 üretir', () => {
    expect(nextAvailableDocNo(['SUN INV'], 'SUN INV')).toBe('SUN INV-02');
  });

  it('en yüksek ekten türetir', () => {
    expect(nextAvailableDocNo(['SUN INV', 'SUN INV-02', 'SUN INV-03'], 'SUN INV'))
      .toBe('SUN INV-04');
  });

  it('ORTADAKİ kayıt silinse bile çakışma üretmez (count+1 değil, max+1)', () => {
    // base + base-03 var (base-02 silinmiş). count+1 → base-03 çakışırdı; max+1 → base-04.
    expect(nextAvailableDocNo(['SUN INV', 'SUN INV-03'], 'SUN INV')).toBe('SUN INV-04');
  });

  it('LIKE yanlış eşleşmelerini (farklı taban) yok sayar', () => {
    expect(nextAvailableDocNo(['SUN INV EXTRA', 'SUN INVOICE'], 'SUN INV')).toBe('SUN INV');
  });
});
