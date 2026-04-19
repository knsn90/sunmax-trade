import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Türkçe sabitleri ─────────────────────────────────────────────────────────

const TR_MONTHS = [
  'Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
  'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık',
];
const TR_MONTHS_SHORT = [
  'Oca','Şub','Mar','Nis','May','Haz',
  'Tem','Ağu','Eyl','Eki','Kas','Ara',
];
const TR_DAYS = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toStr(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function todayStr() {
  const t = new Date();
  return toStr(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

function formatDisplay(value: string) {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d} ${TR_MONTHS[m - 1]} ${y}`;
}

/** Returns 0=Mon … 6=Sun for the first day of month. */
function firstDayOfMonth(year: number, month: number) {
  const raw = new Date(year, month - 1, 1).getDay(); // 0=Sun
  return raw === 0 ? 6 : raw - 1;
}
function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

interface Cell { year: number; month: number; day: number; cur: boolean }

function buildCells(vy: number, vm: number): Cell[] {
  const cells: Cell[] = [];
  const fd   = firstDayOfMonth(vy, vm);
  const dim  = daysInMonth(vy, vm);
  const pvm  = vm === 1 ? 12 : vm - 1;
  const pvy  = vm === 1 ? vy - 1 : vy;
  const pdim = daysInMonth(pvy, pvm);

  for (let i = fd - 1; i >= 0; i--)
    cells.push({ year: pvy, month: pvm, day: pdim - i, cur: false });
  for (let d = 1; d <= dim; d++)
    cells.push({ year: vy, month: vm, day: d, cur: true });
  const nvm = vm === 12 ? 1  : vm + 1;
  const nvy = vm === 12 ? vy + 1 : vy;
  let nd = 1;
  while (cells.length < 42)
    cells.push({ year: nvy, month: nvm, day: nd++, cur: false });
  return cells;
}

// ─── MonoDatePicker ───────────────────────────────────────────────────────────

export interface MonoDatePickerProps {
  /** ISO date string: "YYYY-MM-DD" */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Override dropdown direction (default auto) */
  dropUp?: boolean;
}

type PickerMode = 'day' | 'month' | 'year';

export function MonoDatePicker({
  value,
  onChange,
  placeholder = 'Tarih seç',
  dropUp,
}: MonoDatePickerProps) {
  const today = todayStr();
  const ref   = useRef<HTMLDivElement>(null);

  const initView = () => {
    if (value) {
      const [y, m] = value.split('-').map(Number);
      if (y && m) return { vy: y, vm: m };
    }
    const t = new Date();
    return { vy: t.getFullYear(), vm: t.getMonth() + 1 };
  };

  const [open,    setOpen]    = useState(false);
  const [mode,    setMode]    = useState<PickerMode>('day');
  const [vy,      setVy]      = useState(() => initView().vy);
  const [vm,      setVm]      = useState(() => initView().vm);
  const [pending, setPending] = useState(value);

  // year range for year picker: centred on current view year
  const yearRangeStart = Math.floor(vy / 12) * 12;
  const years = Array.from({ length: 12 }, (_, i) => yearRangeStart + i);

  // Sync pending when value prop changes externally
  useEffect(() => { setPending(value); }, [value]);

  // On open: sync view & pending to current value
  useEffect(() => {
    if (!open) return;
    const { vy: y, vm: m } = initView();
    setVy(y); setVm(m);
    setPending(value);
    setMode('day');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function prevMonth() {
    if (vm === 1) { setVy(y => y - 1); setVm(12); }
    else setVm(m => m - 1);
  }
  function nextMonth() {
    if (vm === 12) { setVy(y => y + 1); setVm(1); }
    else setVm(m => m + 1);
  }

  function confirm() { onChange(pending); setOpen(false); }
  function cancel()  { setPending(value); setOpen(false); }

  const cells   = buildCells(vy, vm);
  const display = formatDisplay(value);

  return (
    <div ref={ref} className="relative">

      {/* ── Trigger ── */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-left flex items-center justify-between border-0 shadow-none focus:outline-none hover:bg-gray-200 transition-colors"
      >
        <span className={display ? 'text-gray-900' : 'text-gray-400'}>
          {display || placeholder}
        </span>
        <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0 ml-2" />
      </button>

      {/* ── Calendar ── */}
      {open && (
        <div
          className={`absolute z-50 ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'} left-0 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden`}
          style={{ width: 280 }}
        >
          {/* ── Header nav ── */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <button
              type="button"
              onClick={() => {
                if (mode === 'day') prevMonth();
                else if (mode === 'month') setVy(y => y - 1);
                else setVy(y => y - 12);
              }}
              className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1">
              {/* Month button — opens month picker */}
              {mode === 'day' && (
                <button
                  type="button"
                  onClick={() => setMode('month')}
                  className="text-[14px] font-bold text-gray-900 px-2 py-0.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  {TR_MONTHS[vm - 1]}
                </button>
              )}
              {/* Year button — opens year picker */}
              {(mode === 'day' || mode === 'month') && (
                <button
                  type="button"
                  onClick={() => setMode('year')}
                  className="text-[14px] font-bold text-gray-900 px-2 py-0.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  {vy}
                </button>
              )}
              {mode === 'year' && (
                <span className="text-[14px] font-bold text-gray-900 px-2">
                  {yearRangeStart} – {yearRangeStart + 11}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                if (mode === 'day') nextMonth();
                else if (mode === 'month') setVy(y => y + 1);
                else setVy(y => y + 12);
              }}
              className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* ── Month picker ── */}
          {mode === 'month' && (
            <div className="grid grid-cols-3 gap-1.5 p-4">
              {TR_MONTHS_SHORT.map((name, i) => {
                const isSelected = (i + 1) === vm;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => { setVm(i + 1); setMode('day'); }}
                    className={cn(
                      'h-10 rounded-xl text-[12px] font-semibold transition-colors',
                      isSelected
                        ? 'bg-red-600 text-white'
                        : 'text-gray-700 hover:bg-gray-100',
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Year picker ── */}
          {mode === 'year' && (
            <div className="grid grid-cols-3 gap-1.5 p-4">
              {years.map(y => {
                const isSelected = y === vy;
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => { setVy(y); setMode('month'); }}
                    className={cn(
                      'h-10 rounded-xl text-[12px] font-semibold transition-colors',
                      isSelected
                        ? 'bg-red-600 text-white'
                        : 'text-gray-700 hover:bg-gray-100',
                    )}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Day picker ── */}
          {mode === 'day' && (
            <>
              {/* Day headers */}
              <div className="grid grid-cols-7 px-4 pt-3 pb-1">
                {TR_DAYS.map(d => (
                  <div key={d} className="text-center text-[10px] font-bold text-gray-400">{d}</div>
                ))}
              </div>

              {/* Day cells — 6 rows × 7 */}
              <div className="grid grid-cols-7 px-3 pb-2 gap-y-0.5">
                {cells.map((cell, i) => {
                  const str        = toStr(cell.year, cell.month, cell.day);
                  const isToday    = str === today;
                  const isSelected = str === pending;

                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setPending(str);
                        if (!cell.cur) { setVy(cell.year); setVm(cell.month); }
                      }}
                      className={`h-9 w-full rounded-full text-[13px] font-medium transition-colors flex items-center justify-center
                        ${isSelected
                          ? 'bg-red-600 text-white font-bold'
                          : isToday
                          ? 'text-red-600 font-bold hover:bg-red-50'
                          : !cell.cur
                          ? 'text-gray-300 hover:bg-gray-50'
                          : 'text-gray-800 hover:bg-gray-100'
                        }`}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-[12px] font-semibold text-gray-600">
              {formatDisplay(pending) || '—'}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={cancel}
                className="px-3 h-7 rounded-lg text-[12px] font-semibold text-gray-500 hover:bg-gray-100 transition-colors">
                İptal
              </button>
              <button type="button" onClick={confirm}
                className="px-3 h-7 rounded-lg text-[12px] font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors">
                Onayla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
