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
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
      <h1 className="text-xl font-bold truncate min-w-0">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2 flex-shrink-0">{children}</div>}
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
      <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
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

export function FormGroup({
  label,
  error,
  children,
  className,
}: {
  label: string;
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
