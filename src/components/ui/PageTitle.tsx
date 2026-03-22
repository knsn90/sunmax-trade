import { useTheme } from '@/contexts/ThemeContext';
import { ReactNode } from 'react';

interface PageTitleProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageTitle({ title, subtitle, actions }: PageTitleProps) {
  const { theme } = useTheme();
  if (theme !== 'donezo') return null; // Paciolo uses topbar title

  return (
    <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
      <div>
        <h1 className="text-2xl font-black text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
