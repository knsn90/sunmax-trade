import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

// ─── Card ───────────────────────────────────────────────────────────────────

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('bg-white rounded-xl border border-border shadow-sm overflow-hidden', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-4', className)} {...props}>
      {children}
    </div>
  );
}

// ─── Page Header ────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  if (!title && !children) return null;
  return (
    <div className="flex items-center justify-between gap-2 mb-4">
      {title ? (
        <h1 className="text-[20px] font-black text-gray-900">{title}</h1>
      ) : <div />}
      {children && (
        <div className="flex items-center gap-2 flex-shrink-0">{children}</div>
      )}
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center text-muted-foreground py-8 text-xs">
      {message}
    </div>
  );
}

// ─── Loading Spinner ────────────────────────────────────────────────────────

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-12', className)}>
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--color-accent, #dc2626)' }} />
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  color = 'brand',
  icon,
}: {
  label: string;
  value: string;
  color?: 'brand' | 'blue' | 'red' | 'amber' | 'gray';
  icon?: string;
}) {
  const colorMap = {
    brand: 'text-brand-500',
    blue: 'text-blue-600',
    red: 'text-red-500',
    amber: 'text-amber-600',
    gray: 'text-gray-600',
  };

  return (
    <div className="bg-white border border-border rounded-xl px-4 py-3 min-w-[150px]">
      <div className="text-[11px] text-muted-foreground mb-1">
        {icon && <span className="mr-1">{icon}</span>}
        {label}
      </div>
      <div className={cn('text-lg font-bold', colorMap[color])}>
        {value}
      </div>
    </div>
  );
}

// ─── Form Group ─────────────────────────────────────────────────────────────

export function FormRow({
  cols = 2,
  children,
  className,
}: {
  cols?: 2 | 3 | 4;
  children: React.ReactNode;
  className?: string;
}) {
  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4',
  };

  return (
    <div className={cn('grid gap-2.5 mb-2.5', gridCols[cols], className)}>
      {children}
    </div>
  );
}

// ─── Entity Avatar ──────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316',
  '#eab308','#22c55e','#14b8a6','#0ea5e9','#3b82f6',
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SIZE_CLS = {
  xs: 'w-5 h-5 text-[8px]',
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-10 h-10 text-[13px]',
  lg: 'w-12 h-12 text-[15px]',
};

export function EntityAvatar({
  name,
  logoUrl,
  size = 'md',
  shape = 'circle',
  className,
}: {
  name: string;
  logoUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  shape?: 'circle' | 'square';
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const rounded = shape === 'circle' ? 'rounded-full' : 'rounded-xl';
  const sizeCls = SIZE_CLS[size];

  if (logoUrl && !imgFailed) {
    return (
      <div className={cn(sizeCls, rounded, 'bg-white border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden', className)}>
        <img
          src={logoUrl}
          alt={name}
          className="w-full h-full object-contain p-0.5"
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(sizeCls, rounded, 'flex items-center justify-center shrink-0 text-white font-bold shadow-sm', className)}
      style={{ background: avatarColor(name) }}
    >
      {initials(name)}
    </div>
  );
}

export function FormGroup({
  label,
  error,
  children,
  className,
}: {
  label: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
      {error && (
        <span className="text-[10px] text-red-500">{error}</span>
      )}
    </div>
  );
}
