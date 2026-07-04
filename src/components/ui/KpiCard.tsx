import { cloneElement, isValidElement } from 'react';

// Hex rengi beyazla karıştırarak açar (gradient üst tonu için)
export function lightenHex(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * amt);
  const g = Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * amt);
  const b = Math.round((n & 255) + (255 - (n & 255)) * amt);
  return `rgb(${r}, ${g}, ${b})`;
}

const FONT = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';

/**
 * Gradient KPI kartı — shimmer, ghost ikon filigranı, hover lift ve iç highlight.
 * Uygulama genelindeki tüm özet/KPI kartları bu bileşeni kullanır.
 */
export function KpiCard({ label, value, sub, trend, icon, color, onClick, size = 'md' }: {
  label: string;
  value: string;
  sub?: string;
  trend?: 'up' | 'down';
  icon?: React.ReactNode;
  color: string;
  onClick?: () => void;
  size?: 'md' | 'lg';
}) {
  const isLg = size === 'lg';
  const valueCls   = isLg ? 'text-[24px] md:text-[32px]' : 'text-[17px] md:text-[19px]';
  const padCls     = isLg ? 'p-5 pb-6' : 'p-4 pb-5';
  const minHCls    = isLg ? 'min-h-[132px]' : 'min-h-[104px]';
  const iconBoxCls = isLg ? 'w-12 h-12' : 'w-10 h-10';
  const wmCls      = isLg ? 'w-28 h-28 -right-3 -bottom-4' : 'w-24 h-24 -right-3 -bottom-4';

  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-[20px] ${padCls} ${minHCls} flex items-start gap-3 transition-all duration-200 will-change-transform hover:-translate-y-1 hover:brightness-105${onClick ? ' cursor-pointer active:scale-[0.99]' : ''}`}
      style={{
        fontFamily: FONT,
        background: `linear-gradient(135deg, ${lightenHex(color, 0.24)} 0%, ${color} 100%)`,
        boxShadow: `0 10px 26px -10px ${color}80, inset 0 1px 0 0 rgba(255,255,255,0.30)`,
      }}
    >
      {/* Animasyonlu ışık bandı (shimmer) */}
      <div className="kpi-shimmer pointer-events-none absolute inset-0 overflow-hidden" aria-hidden />

      {/* Ghost ikon filigranı */}
      {isValidElement(icon) && (
        <div className={`pointer-events-none absolute ${wmCls} text-white/[0.14] transition-transform duration-300 group-hover:scale-110`}>
          {cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'w-full h-full' })}
        </div>
      )}

      {icon && (
        <div className={`relative ${iconBoxCls} rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center shrink-0 text-white`}>
          {icon}
        </div>
      )}

      <div className="relative min-w-0 flex-1">
        <div className={`${valueCls} font-black text-white leading-none tabular-nums tracking-[-0.01em] drop-shadow-sm truncate`}>{value}</div>
        <div className="text-[11px] font-medium text-white/85 mt-1.5">{label}</div>
        {sub && (
          <div className="flex items-center gap-1 text-[10px] font-semibold text-white/70 mt-0.5">
            {trend === 'up'   && <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}
            {trend === 'down' && <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>}
            <span className="truncate">{sub}</span>
          </div>
        )}
      </div>
    </div>
  );
}
