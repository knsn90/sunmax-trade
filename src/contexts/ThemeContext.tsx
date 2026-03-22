import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type AppTheme = 'donezo' | 'donezo';

interface ThemeContextType {
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'donezo',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    return (localStorage.getItem('sunplus-theme') as AppTheme) ?? 'donezo';
  });

  const setTheme = (t: AppTheme) => {
    localStorage.setItem('sunplus-theme', t);
    setThemeState(t);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Set on mount
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
