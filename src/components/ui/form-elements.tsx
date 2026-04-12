import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { CalendarDays } from 'lucide-react';

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
        expense: 'bg-orange-100 text-orange-800',
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

// ─── DateInput ──────────────────────────────────────────────────────────────
// DD/MM/YYYY maskeli tarih girişi. value/onChange → YYYY-MM-DD (ISO 8601).
// react-hook-form Controller ile kullan.

function isoToDisplay(iso: string): string {
  if (!iso || iso.length < 10) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

function displayToISO(display: string): string {
  const raw = display.replace(/\D/g, '');
  if (raw.length < 8) return '';
  const d = raw.slice(0, 2);
  const m = raw.slice(2, 4);
  const y = raw.slice(4, 8);
  if (parseInt(d) < 1 || parseInt(d) > 31) return '';
  if (parseInt(m) < 1 || parseInt(m) > 12) return '';
  return `${y}-${m}-${d}`;
}

interface DateInputProps {
  value?: string;          // YYYY-MM-DD
  onChange?: (v: string) => void;  // YYYY-MM-DD
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function DateInput({ value = '', onChange, onBlur, placeholder = 'GG/AA/YYYY', className, disabled }: DateInputProps) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const nativeRef = useRef<HTMLInputElement>(null);

  // Dışarıdan value değişince display'i güncelle
  useEffect(() => {
    const display = isoToDisplay(value);
    // Yalnızca ISO değer gerçekten farklıysa güncelle (döngüyü önler)
    if (displayToISO(text) !== value) {
      setText(display);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleText(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 8);
    let formatted = raw.slice(0, 2);
    if (raw.length > 2) formatted += '/' + raw.slice(2, 4);
    if (raw.length > 4) formatted += '/' + raw.slice(4, 8);
    setText(formatted);
    const iso = displayToISO(formatted);
    if (iso && onChange) onChange(iso);
    else if (!iso && raw.length === 0 && onChange) onChange('');
  }

  function handleNative(e: React.ChangeEvent<HTMLInputElement>) {
    const iso = e.target.value;
    setText(isoToDisplay(iso));
    if (onChange) onChange(iso);
  }

  function openPicker() {
    if (disabled) return;
    try { (nativeRef.current as HTMLInputElement & { showPicker?: () => void })?.showPicker?.(); } catch { /* ignore */ }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={text}
        onChange={handleText}
        onBlur={onBlur}
        placeholder={placeholder}
        maxLength={10}
        disabled={disabled}
        className={cn(
          'flex h-9 w-full rounded-xl border border-gray-200 bg-white px-3 pr-9 text-[13px] text-gray-800',
          'placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      />
      {/* Gizli native date input — sadece takvim açmak için */}
      <input
        ref={nativeRef}
        type="date"
        value={value}
        onChange={handleNative}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        tabIndex={-1}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors disabled:pointer-events-none"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
    </div>
  );
}

export { Label, Textarea, NativeSelect, Badge, badgeVariants, Separator, DateInput };
