import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

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
// Özel takvim popup'ı olan tarih girişi.
// value/onChange → YYYY-MM-DD. react-hook-form Controller ile kullan.

const TR_MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                   'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const TR_DAYS   = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];

function isoToDisplay(iso: string): string {
  if (!iso || iso.length < 10) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

function buildISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseISO(iso: string): { y: number; m: number; d: number } | null {
  if (!iso || iso.length < 10) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m: m - 1, d };
}

// Pazartesi = 0 başlangıçlı grid (TR takvim düzeni)
function getCalendarCells(year: number, month: number) {
  const firstDate = new Date(year, month, 1);
  // 0=Pzt…6=Paz (JS 0=Pzr)
  const firstDow = (firstDate.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();

  const cells: Array<{ day: number; type: 'prev' | 'curr' | 'next' }> = [];
  for (let i = firstDow - 1; i >= 0; i--)
    cells.push({ day: daysInPrev - i, type: 'prev' });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ day: d, type: 'curr' });
  const rem = 42 - cells.length;
  for (let d = 1; d <= rem; d++)
    cells.push({ day: d, type: 'next' });
  return cells;
}

interface CalendarPickerProps {
  value: string;
  onConfirm: (iso: string) => void;
  onClose: () => void;
}

function CalendarPicker({ value, onConfirm, onClose }: CalendarPickerProps) {
  const accent = 'var(--color-accent, #2563eb)';
  const today = new Date();
  const parsed = parseISO(value);

  const [viewY, setViewY] = useState(parsed?.y ?? today.getFullYear());
  const [viewM, setViewM] = useState(parsed?.m ?? today.getMonth());
  const [sel, setSel]     = useState<{ y: number; m: number; d: number } | null>(parsed);

  const cells = getCalendarCells(viewY, viewM);
  const years = Array.from({ length: 12 }, (_, i) => today.getFullYear() - 2 + i);

  function prevMonth() { if (viewM === 0) { setViewY(y => y - 1); setViewM(11); } else setViewM(m => m - 1); }
  function nextMonth() { if (viewM === 11) { setViewY(y => y + 1); setViewM(0); } else setViewM(m => m + 1); }

  function isSel(d: number) { return sel && sel.y === viewY && sel.m === viewM && sel.d === d; }
  function isToday(d: number) { return today.getFullYear() === viewY && today.getMonth() === viewM && today.getDate() === d; }

  function selDisplay() {
    if (!sel) return '—';
    return `${String(sel.d).padStart(2,'0')} ${TR_MONTHS[sel.m]} ${sel.y}`;
  }

  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 w-72 select-none">
      {/* Ay / Yıl başlığı */}
      <div className="flex items-center gap-1 mb-3">
        <button type="button" onClick={prevMonth}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 flex items-center gap-1 justify-center">
          <select
            value={viewM}
            onChange={e => setViewM(Number(e.target.value))}
            className="bg-gray-50 rounded-lg px-2 py-1 text-[12px] font-bold text-gray-800 border-0 focus:outline-none cursor-pointer appearance-none text-center"
          >
            {TR_MONTHS.map((mn, i) => <option key={i} value={i}>{mn}</option>)}
          </select>
          <select
            value={viewY}
            onChange={e => setViewY(Number(e.target.value))}
            className="bg-gray-50 rounded-lg px-2 py-1 text-[12px] font-bold text-gray-800 border-0 focus:outline-none cursor-pointer appearance-none text-center"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button type="button" onClick={nextMonth}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Gün başlıkları */}
      <div className="grid grid-cols-7 mb-1">
        {TR_DAYS.map(d => (
          <div key={d} className="text-center text-[9px] font-bold text-gray-400 py-1">{d}</div>
        ))}
      </div>

      {/* Günler grid */}
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const isCurr = cell.type === 'curr';
          const selected = isCurr && isSel(cell.day);
          const todayCell = isCurr && isToday(cell.day);
          return (
            <button
              key={i}
              type="button"
              disabled={!isCurr}
              onClick={() => isCurr && setSel({ y: viewY, m: viewM, d: cell.day })}
              className={cn(
                'h-8 w-full flex items-center justify-center text-[12px] rounded-full transition-all',
                !isCurr && 'text-gray-300 cursor-default',
                isCurr && !selected && 'text-gray-700 hover:bg-gray-100 cursor-pointer',
                todayCell && !selected && 'font-bold',
                selected && 'text-white font-bold',
              )}
              style={selected ? { background: accent } : todayCell ? { color: accent } : {}}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <span className="text-[11px] font-semibold text-gray-600">{selDisplay()}</span>
        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className="text-[12px] font-semibold text-gray-400 hover:text-gray-600 transition-colors">
            İptal
          </button>
          <button
            type="button"
            onClick={() => { if (sel) { onConfirm(buildISO(sel.y, sel.m, sel.d)); } else onClose(); }}
            className="text-[12px] font-bold transition-colors"
            style={{ color: accent }}
          >
            Onayla
          </button>
        </div>
      </div>
    </div>
  );
}

interface DateInputProps {
  value?: string;
  onChange?: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function DateInput({ value = '', onChange, onBlur, placeholder = 'GG/AA/YYYY', className, disabled }: DateInputProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click outside → kapat
  const handleOutside = useCallback((e: MouseEvent) => {
    if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
  }, []);
  useEffect(() => {
    if (open) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open, handleOutside]);

  function handleConfirm(iso: string) {
    if (onChange) onChange(iso);
    setOpen(false);
    if (onBlur) onBlur();
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* Input alanı */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(v => !v)}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 pr-3 text-[13px]',
          'focus:outline-none focus:ring-2 focus:ring-gray-200 transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-50',
          open && 'ring-2 ring-gray-200',
          className,
        )}
      >
        <span className={value ? 'text-gray-800' : 'text-gray-400'}>
          {value ? isoToDisplay(value) : placeholder}
        </span>
        <CalendarDays className="h-4 w-4 text-gray-400 shrink-0" />
      </button>

      {/* Popup takvim */}
      {open && (
        <div className="absolute z-[200] mt-1.5 left-0">
          <CalendarPicker
            value={value}
            onConfirm={handleConfirm}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

export { Label, Textarea, NativeSelect, Badge, badgeVariants, Separator, DateInput };
