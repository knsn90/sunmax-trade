// ─── Theme Presets ────────────────────────────────────────────────────────────
// Each preset contains the 500-shade swatch color and full 50–900 palette
// as HSL channel strings ("H S% L%") used to populate CSS custom properties.

export type ThemePreset = 'indigo' | 'blue' | 'violet' | 'emerald' | 'rose' | 'amber';

export const THEME_PRESETS: Record<
  ThemePreset,
  { name: string; color500: string; shades: Record<string, string> }
> = {
  indigo: {
    name: 'Indigo',
    color500: '#4f6ef7',
    shades: {
      '50': '231 100% 96%', '100': '231 100% 93%', '200': '231 97% 89%',
      '300': '231 95% 82%', '400': '234 90% 74%', '500': '231 89% 65%',
      '600': '231 89% 59%', '700': '231 65% 49%', '800': '227 70% 39%', '900': '227 61% 29%',
    },
  },
  blue: {
    name: 'Blue',
    color500: '#3b82f6',
    shades: {
      '50': '214 100% 97%', '100': '214 95% 93%', '200': '213 97% 87%',
      '300': '212 96% 78%', '400': '213 94% 68%', '500': '217 91% 60%',
      '600': '221 83% 53%', '700': '224 76% 48%', '800': '226 71% 40%', '900': '224 64% 33%',
    },
  },
  violet: {
    name: 'Violet',
    color500: '#8b5cf6',
    shades: {
      '50': '250 100% 98%', '100': '251 91% 95%', '200': '251 95% 92%',
      '300': '252 95% 85%', '400': '255 92% 76%', '500': '258 90% 66%',
      '600': '262 84% 58%', '700': '263 70% 50%', '800': '263 69% 42%', '900': '264 67% 35%',
    },
  },
  emerald: {
    name: 'Emerald',
    color500: '#10b981',
    shades: {
      '50': '152 81% 96%', '100': '149 80% 90%', '200': '152 76% 80%',
      '300': '156 72% 67%', '400': '158 64% 52%', '500': '160 84% 39%',
      '600': '161 94% 30%', '700': '163 94% 24%', '800': '163 88% 20%', '900': '164 86% 16%',
    },
  },
  rose: {
    name: 'Rose',
    color500: '#f43f5e',
    shades: {
      '50': '356 100% 97%', '100': '356 100% 94%', '200': '353 96% 90%',
      '300': '353 96% 82%', '400': '351 95% 71%', '500': '350 89% 60%',
      '600': '347 77% 50%', '700': '345 83% 41%', '800': '343 80% 35%', '900': '342 74% 30%',
    },
  },
  amber: {
    name: 'Amber',
    color500: '#f59e0b',
    shades: {
      '50': '48 100% 96%', '100': '48 96% 89%', '200': '48 97% 77%',
      '300': '46 97% 65%', '400': '43 96% 56%', '500': '38 92% 50%',
      '600': '32 95% 44%', '700': '26 90% 37%', '800': '23 83% 31%', '900': '22 78% 26%',
    },
  },
};

const STORAGE_KEY = 'sunmax_theme_preset';

export function applyTheme(preset: ThemePreset): void {
  const root = document.documentElement;
  const { shades } = THEME_PRESETS[preset];
  Object.entries(shades).forEach(([k, v]) => {
    root.style.setProperty(`--brand-${k}`, v);
  });
  localStorage.setItem(STORAGE_KEY, preset);
}

export function getStoredTheme(): ThemePreset {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored in THEME_PRESETS) return stored as ThemePreset;
  return 'indigo';
}
