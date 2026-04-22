import { useState, useRef, useEffect, useCallback } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// ─── Sabitler ────────────────────────────────────────────────────────────────

const TR_MONTHS     = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const TR_MONTHS_SH  = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
const TR_DAYS       = ['Pt','Sa','Ça','Pe','Cu','Ct','Pz'];

const CY        = new Date().getFullYear();
const MONTH_ITEMS = TR_MONTHS.map((label, i) => ({ value: i + 1, label }));
const YEAR_ITEMS  = Array.from({ length: 11 }, (_, i) => ({ value: CY - 5 + i, label: String(CY - 5 + i) }));

// ─── Tarih yardımcıları ───────────────────────────────────────────────────────

function toStr(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function todayStr() {
  const t = new Date();
  return toStr(t.getFullYear(), t.getMonth() + 1, t.getDate());
}
function formatDisplay(v: string) {
  if (!v) return '';
  const [y, m, d] = v.split('-').map(Number);
  return y && m && d ? `${d} ${TR_MONTHS[m - 1]} ${y}` : '';
}
function formatShort(v: string) {
  if (!v) return '';
  const [y, m, d] = v.split('-').map(Number);
  return y && m && d ? `${d} ${TR_MONTHS_SH[m - 1]} ${y}` : '';
}
function firstDayOfMonth(y: number, m: number) {
  const raw = new Date(y, m - 1, 1).getDay();
  return raw === 0 ? 6 : raw - 1;
}
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }

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
  const nvm = vm === 12 ? 1 : vm + 1;
  const nvy = vm === 12 ? vy + 1 : vy;
  let nd = 1;
  while (cells.length < 42)
    cells.push({ year: nvy, month: nvm, day: nd++, cur: false });
  return cells;
}

// ─── DrumPicker ───────────────────────────────────────────────────────────────

const ITEM_H  = 30;
const VISIBLE = 3;

interface DrumItem { value: number; label: string }

function DrumPicker({
  items,
  value,
  onChange,
}: {
  items: DrumItem[];
  value: number;
  onChange: (v: number) => void;
}) {
  const listRef   = useRef<HTMLDivElement>(null);
  const timer     = useRef<ReturnType<typeof setTimeout>>();
  const settling  = useRef(false);
  const pad       = ITEM_H * Math.floor(VISIBLE / 2); // 2 × ITEM_H

  const scrollToIdx = useCallback((idx: number, smooth = true) => {
    listRef.current?.scrollTo({
      top: idx * ITEM_H,
      behavior: smooth ? 'smooth' : 'instant',
    });
  }, []);

  // İlk render: seçili öğeye konumlan
  useEffect(() => {
    const idx = items.findIndex(i => i.value === value);
    if (idx >= 0) scrollToIdx(idx, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dış kaynaklı value değişimi (ör. farklı ay günü tıklandı)
  useEffect(() => {
    if (settling.current) return;
    const idx = items.findIndex(i => i.value === value);
    if (idx >= 0) scrollToIdx(idx, true);
  }, [value, items, scrollToIdx]);

  const onScroll = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!listRef.current) return;
      const idx     = Math.round(listRef.current.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(idx, items.length - 1));
      settling.current = true;
      scrollToIdx(clamped);
      if (items[clamped]) onChange(items[clamped].value);
      setTimeout(() => { settling.current = false; }, 350);
    }, 80);
  };

  return (
    <div className="relative flex-1 overflow-hidden" style={{ height: ITEM_H * VISIBLE }}>

      {/* Seçim kutusu */}
      <div
        className="absolute inset-x-3 rounded-xl bg-gray-100 pointer-events-none z-10"
        style={{ top: pad, height: ITEM_H }}
      />

      {/* Kaydırılabilir liste */}
      <div
        ref={listRef}
        onScroll={onScroll}
        className="h-full [&::-webkit-scrollbar]:hidden"
        style={{ overflowY: 'scroll', scrollSnapType: 'y mandatory', scrollbarWidth: 'none' }}
      >
        <div style={{ height: pad }} />

        {items.map((item) => {
          const isSel = item.value === value;
          return (
            <div
              key={item.value}
              style={{ scrollSnapAlign: 'center', height: ITEM_H }}
              className={`relative z-20 flex items-center justify-center cursor-pointer select-none transition-all duration-100 ${
                isSel
                  ? 'text-gray-900 text-[14px] font-bold'
                  : 'text-gray-400 text-[12px] font-normal'
              }`}
              onPointerDown={() => {
                const idx = items.findIndex(i => i.value === item.value);
                scrollToIdx(idx);
                onChange(item.value);
              }}
            >
              {item.label}
            </div>
          );
        })}

        <div style={{ height: pad }} />
      </div>

      {/* Üst soluk */}
      <div
        className="absolute top-0 inset-x-0 pointer-events-none z-20"
        style={{ height: pad, background: 'linear-gradient(to bottom, white 15%, transparent)' }}
      />
      {/* Alt soluk */}
      <div
        className="absolute bottom-0 inset-x-0 pointer-events-none z-20"
        style={{ height: pad, background: 'linear-gradient(to top, white 15%, transparent)' }}
      />
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface MonoDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  dropUp?: boolean; // @deprecated
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MonoDatePicker({
  value,
  onChange,
  placeholder = 'Tarih seç',
}: MonoDatePickerProps) {
  const [open, setOpen] = useState(false);
  const today = todayStr();

  const initVm = () => {
    if (value) {
      const [y, m] = value.split('-').map(Number);
      if (y && m) return { vy: y, vm: m };
    }
    const t = new Date();
    return { vy: t.getFullYear(), vm: t.getMonth() + 1 };
  };

  const [vy,      setVy]      = useState(() => initVm().vy);
  const [vm,      setVm]      = useState(() => initVm().vm);
  const [pending, setPending] = useState(value);

  // Popover açıldığında state'i sıfırla
  useEffect(() => {
    if (!open) return;
    const iv = initVm();
    setVy(iv.vy);
    setVm(iv.vm);
    setPending(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Dış value değişimini yansıt
  useEffect(() => { setPending(value); }, [value]);

  function confirm() { onChange(pending); setOpen(false); }
  function cancel()  { setPending(value); setOpen(false); }

  const cells        = buildCells(vy, vm);
  const displayShort = formatShort(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full h-[46px] bg-[#f2f4f7] rounded-xl px-4 text-[13px] font-medium border border-transparent focus:outline-none hover:bg-gray-200 transition-colors flex items-center justify-between overflow-hidden"
        >
          <span className={`whitespace-nowrap overflow-hidden text-ellipsis ${displayShort ? 'text-gray-900' : 'text-gray-400'}`}>
            {displayShort || placeholder}
          </span>
          <CalendarIcon className="h-3.5 w-3.5 text-gray-400 shrink-0 ml-1.5" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="p-0 overflow-hidden w-[280px]" align="start">

        {/* ── Drum pickers ──────────────────────────────────────── */}
        <div className="flex border-b border-gray-100">
          <DrumPicker items={MONTH_ITEMS} value={vm} onChange={setVm} />
          <div className="w-px bg-gray-100 shrink-0" />
          <DrumPicker items={YEAR_ITEMS} value={vy} onChange={setVy} />
        </div>

        {/* ── Gün başlıkları ────────────────────────────────────── */}
        <div className="grid grid-cols-7 px-3 pt-3 pb-1">
          {TR_DAYS.map(d => (
            <div key={d} className="text-center text-[10px] font-bold text-gray-400">{d}</div>
          ))}
        </div>

        {/* ── Gün ızgarası ──────────────────────────────────────── */}
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
                className={[
                  'h-8 w-full rounded-full text-[12px] font-medium transition-colors flex items-center justify-center',
                  isSelected ? 'bg-red-600 text-white font-bold'
                    : isToday ? 'text-red-600 font-bold hover:bg-red-50'
                    : !cell.cur ? 'text-gray-300 hover:bg-gray-50'
                    : 'text-gray-800 hover:bg-gray-100',
                ].join(' ')}
              >
                {cell.day}
              </button>
            );
          })}
        </div>

        {/* ── Footer ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <span className="text-[12px] font-semibold text-gray-600">
            {formatDisplay(pending) || '—'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancel}
              className="px-3 h-7 rounded-lg text-[12px] font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
            >
              İptal
            </button>
            <button
              type="button"
              onClick={confirm}
              className="px-3 h-7 rounded-lg text-[12px] font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
            >
              Onayla
            </button>
          </div>
        </div>

      </PopoverContent>
    </Popover>
  );
}
