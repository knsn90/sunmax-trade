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
 * KPI kartı — sakin, tek yüzey dili: beyaz yüzey, lacivert değer, küçük renkli ikon.
 * `color` yalnızca küçük vurgu içindir (ikon zemini + nokta); kartın tamamını boyamaz, böylece
 * "problem var" algısı yaratmaz. Kırmızı sadece gerçekten kötü bir trend (düşüş) için kullanılır.
 * Uygulama genelindeki tüm özet/KPI kartları bu bileşeni kullanır.
 */
export function KpiCard({ label, value, valueTitle, sub, trend, icon, color, onClick, size = 'md' }: {
  label: string;
  value: string;
  /** Tam değer (kompakt gösterimde hover tooltip) */
  valueTitle?: string;
  sub?: string;
  trend?: 'up' | 'down';
  icon?: React.ReactNode;
  color: string;
  onClick?: () => void;
  size?: 'md' | 'lg';
}) {
  const isLg = size === 'lg';
  const valueCls = isLg ? 'text-[26px] md:text-[30px]' : 'text-[19px] md:text-[21px]';
  const padCls   = isLg ? 'p-5' : 'p-4';
  const minHCls  = isLg ? 'min-h-[118px]' : 'min-h-[96px]';
  const iconBox  = isLg ? 'w-9 h-9' : 'w-8 h-8';

  return (
    <div
      onClick={onClick}
      className={`group rounded-[22px] bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_28px_rgba(0,0,0,0.04)] ${padCls} ${minHCls} flex flex-col justify-between gap-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_14px_32px_rgba(0,0,0,0.07)]${onClick ? ' cursor-pointer active:scale-[0.99]' : ''}`}
      style={{ fontFamily: FONT }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-medium text-[#6e6e73] leading-tight">{label}</span>
        {icon && (
          <div
            className={`${iconBox} rounded-xl flex items-center justify-center shrink-0 [&>svg]:h-[18px] [&>svg]:w-[18px]`}
            style={{ background: `${color}14`, color }}
          >
            {icon}
          </div>
        )}
      </div>

      <div>
        <div title={valueTitle} className={`${valueCls} font-extrabold text-[#1e3a8a] leading-none tabular-nums tracking-[-0.01em] whitespace-nowrap`}>{value}</div>
        {sub && (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 mt-2">
            {trend === 'up' ? (
              <svg className="h-3 w-3 shrink-0 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
            ) : trend === 'down' ? (
              <svg className="h-3 w-3 shrink-0 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>
            ) : (
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
            )}
            <span className="truncate">{sub}</span>
          </div>
        )}
      </div>
    </div>
  );
}
