/**
 * ThemeContext
 *
 * Tenant'ın primary_color değeri varsa onu kullanır.
 * Yoksa varsayılan tema rengi (#dc2626) devreye girer.
 * useTheme() hook'u tüm bileşenlerde accent rengini sağlar.
 */

import {
  createContext, useContext, useState, useEffect,
  type ReactNode,
} from 'react';
import { useTenant } from './TenantContext';

export type AppTheme = 'donezo';

interface ThemeContextType {
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
  /** Aktif accent rengi — tenant'ın primary_color veya varsayılan */
  accent: string;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'donezo',
  setTheme: () => {},
  accent: '#dc2626',
});

const DEFAULT_ACCENT = '#dc2626';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme] = useState<AppTheme>('donezo');
  const { currentTenant } = useTenant();

  const accent = currentTenant?.primary_color ?? DEFAULT_ACCENT;

  const setTheme = (_t: AppTheme) => {
    // Tema tek olduğundan (donezo) şimdilik no-op
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // CSS değişkeni olarak da yayınla (index.css veya styled-components için)
    document.documentElement.style.setProperty('--color-accent', accent);
  }, [theme, accent]);

  // favicon güncelle (tenant favicon varsa)
  useEffect(() => {
    if (!currentTenant?.favicon_url) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = currentTenant.favicon_url;
    // apple touch icon
    let apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (!apple) {
      apple = document.createElement('link');
      apple.rel = 'apple-touch-icon';
      document.head.appendChild(apple);
    }
    apple.href = currentTenant.favicon_url;
  }, [currentTenant?.favicon_url]);

  // Sayfa başlığını firma adıyla güncelle
  useEffect(() => {
    if (currentTenant?.name) {
      document.title = currentTenant.name;
    }
  }, [currentTenant?.name]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, accent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
