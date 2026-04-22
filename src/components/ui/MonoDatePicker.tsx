import { useState } from 'react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MonoDatePickerProps {
  value: string;                       // "YYYY-MM-DD"
  onChange: (value: string) => void;
  placeholder?: string;
  dropUp?: boolean;                    // @deprecated — positioning handled automatically
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDate(value: string): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function toStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MonoDatePicker({
  value,
  onChange,
  placeholder = 'Tarih seç',
}: MonoDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseDate(value);

  const displayLabel = selected
    ? format(selected, 'd MMM yyyy', { locale: tr })
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-full items-center justify-between rounded-lg border border-border bg-white px-2.5 text-xs transition-colors hover:border-brand-500 focus:outline-none overflow-hidden"
        >
          <span
            className={`whitespace-nowrap overflow-hidden text-ellipsis ${
              displayLabel ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {displayLabel || placeholder}
          </span>
          <CalendarIcon className="h-3 w-3 text-muted-foreground shrink-0 ml-1.5" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="p-0 overflow-hidden" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (date) {
              onChange(toStr(date));
              setOpen(false);
            }
          }}
          captionLayout="dropdown"
          startMonth={new Date(new Date().getFullYear() - 5, 0)}
          endMonth={new Date(new Date().getFullYear() + 5, 11)}
          locale={tr}
          defaultMonth={selected ?? new Date()}
        />
      </PopoverContent>
    </Popover>
  );
}
