import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** ISO 8601: Monday = start of week. Returns Monday date for given week/year. */
function getWeekStart(week: number, year: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dow  = (jan4.getDay() + 6) % 7; // 0 = Mon
  const w1mon = new Date(jan4.getTime() - dow * 86_400_000);
  return new Date(w1mon.getTime() + (week - 1) * 7 * 86_400_000);
}

/** Number of ISO weeks in a year (52 or 53). */
function weeksInYear(year: number): number {
  const dec28 = new Date(year, 11, 28);
  const dow   = (dec28.getDay() + 6) % 7;
  const w1start = getWeekStart(1, year);
  return Math.round((dec28.getTime() - w1start.getTime() + dow * 86_400_000) / (7 * 86_400_000));
}

function fD(d: Date) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Current ISO week + year. */
function currentISOWeek(): { week: number; year: number } {
  const now  = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const dow  = (jan4.getDay() + 6) % 7;
  const w1mon = new Date(jan4.getTime() - dow * 86_400_000);
  const week  = Math.floor((now.getTime() - w1mon.getTime()) / (7 * 86_400_000)) + 1;
  return { week, year: now.getFullYear() };
}

/** Build display string: "Week 22 (May 26 to Jun 1)" or "Weeks 22,23 (May 26 to Jun 7)" */
function buildLabel(weeks: number[], year: number): string {
  if (!weeks.length) return '';
  const sorted = [...weeks].sort((a, b) => a - b);
  const nums   = sorted.join(',');
  const label  = sorted.length === 1 ? `Week ${nums}` : `Weeks ${nums}`;
  const start  = getWeekStart(sorted[0], year);
  const endMon = getWeekStart(sorted[sorted.length - 1], year);
  const end    = new Date(endMon.getTime() + 6 * 86_400_000);
  return `${label} (${fD(start)} to ${fD(end)})`;
}

/** Parse existing string back to week numbers (handles "22,23", "22-24", "Week 22", etc.) */
function parseWeeks(value: string): number[] {
  if (!value) return [];
  // Extract all digit groups
  const nums = (value.match(/\d+/g) ?? []).map(Number).filter(n => n >= 1 && n <= 53);
  // "22-24" or "Weeks 22-24" → range
  if (/\d+-\d+/.test(value) && nums.length === 2 && nums[0] < nums[1]) {
    const out: number[] = [];
    for (let w = nums[0]; w <= nums[1]; w++) out.push(w);
    return out;
  }
  return nums;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface WeekPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function WeekPicker({ value, onChange, placeholder = 'e.g. Weeks 26-27' }: WeekPickerProps) {
  const { week: nowWeek, year: nowYear } = currentISOWeek();
  const [open, setOpen]                  = useState(false);
  const [year, setYear]                  = useState(nowYear);
  const [selected, setSelected]          = useState<number[]>(() => parseWeeks(value));
  const rootRef  = useRef<HTMLDivElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);
  const totalWks = weeksInYear(year);

  // Sync from external value changes
  useEffect(() => { setSelected(parseWeeks(value)); }, [value]);

  // Scroll to current week on open
  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.querySelector(`[data-week="${nowWeek}"]`) as HTMLElement | null;
      el?.scrollIntoView({ block: 'center' });
    }
  }, [open, nowWeek]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function toggle(week: number) {
    const next = selected.includes(week)
      ? selected.filter(w => w !== week)
      : [...selected, week].sort((a, b) => a - b);
    setSelected(next);
    onChange(buildLabel(next, year));
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    setSelected([]);
    onChange('');
  }

  return (
    <div ref={rootRef} className="relative">
      {/* ── Trigger ── */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full h-9 px-3 text-left border border-gray-200 rounded-xl bg-white flex items-center justify-between hover:border-gray-300 transition-colors"
      >
        <span className={`text-[12px] truncate ${value ? 'text-gray-900' : 'text-gray-400'}`}>
          {value || placeholder}
        </span>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {value && (
            <span
              onClick={clear}
              className="text-gray-300 hover:text-gray-500 transition-colors p-0.5 rounded"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
        </div>
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div className="absolute z-50 mt-1 left-0 w-72 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">

          {/* Year nav */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
            <button
              type="button"
              onClick={() => { setYear(y => y - 1); setSelected([]); onChange(''); }}
              className="p-1 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5 text-gray-500" />
            </button>
            <span className="text-[12px] font-bold text-gray-700">{year}</span>
            <button
              type="button"
              onClick={() => { setYear(y => y + 1); setSelected([]); onChange(''); }}
              className="p-1 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
            </button>
          </div>

          {/* Week list */}
          <div ref={listRef} className="max-h-60 overflow-y-auto py-1 scrollbar-none">
            {Array.from({ length: totalWks }, (_, i) => i + 1).map(week => {
              const start     = getWeekStart(week, year);
              const end       = new Date(start.getTime() + 6 * 86_400_000);
              const isSelected = selected.includes(week);
              const isCurrent  = week === nowWeek && year === nowYear;

              return (
                <button
                  key={week}
                  data-week={week}
                  type="button"
                  onClick={() => toggle(week)}
                  className={`w-full flex items-center justify-between px-4 py-1.5 transition-colors ${
                    isSelected
                      ? 'bg-red-600 text-white'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  {/* Left: week badge */}
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-extrabold w-6 tabular-nums ${
                      isSelected ? 'text-white' : isCurrent ? 'text-red-600' : 'text-gray-400'
                    }`}>
                      {week}
                    </span>
                    {isCurrent && !isSelected && (
                      <span className="text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full leading-none">
                        şimdi
                      </span>
                    )}
                  </div>
                  {/* Right: date range */}
                  <span className={`text-[11px] ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                    {fD(start)} – {fD(end)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Selected summary */}
          {selected.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
              <p className="text-[10px] font-semibold text-gray-700 leading-snug">
                {buildLabel(selected, year)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
