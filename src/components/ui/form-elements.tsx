import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// ─── Label ──────────────────────────────────────────────────────────────────

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-2xs font-semibold uppercase tracking-wide text-muted-foreground',
      className,
    )}
    {...props}
  />
));
Label.displayName = 'Label';

// ─── Textarea ───────────────────────────────────────────────────────────────

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'flex min-h-[60px] w-full rounded-lg border border-border bg-white px-2.5 py-2 text-xs',
      'placeholder:text-muted-foreground',
      'focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

// ─── Native Select ──────────────────────────────────────────────────────────

const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    className={cn(
      'flex h-8 w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs',
      'focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    ref={ref}
    {...props}
  >
    {children}
  </select>
));
NativeSelect.displayName = 'NativeSelect';

// ─── Badge ──────────────────────────────────────────────────────────────────

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
  {
    variants: {
      variant: {
        default: 'bg-gray-100 text-gray-700',
        request: 'bg-amber-100 text-amber-800',
        sale: 'bg-blue-100 text-blue-800',
        delivery: 'bg-emerald-100 text-emerald-800',
        completed: 'bg-gray-100 text-gray-600',
        cancelled: 'bg-red-100 text-red-700',
        open: 'bg-gray-100 text-gray-500',
        partial: 'bg-amber-100 text-amber-800',
        paid: 'bg-emerald-100 text-emerald-800',
        svc_inv: 'bg-violet-100 text-violet-800',
        purchase_inv: 'bg-amber-100 text-amber-800',
        receipt: 'bg-emerald-100 text-emerald-800',
        payment: 'bg-red-100 text-red-800',
        sale_inv: 'bg-green-100 text-green-800',
        advance: 'bg-sky-100 text-sky-800',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// ─── Separator ──────────────────────────────────────────────────────────────

function Separator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('h-px w-full bg-border', className)} {...props} />;
}

export { Label, Textarea, NativeSelect, Badge, badgeVariants, Separator };
