import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

// ─── Sabitler ────────────────────────────────────────────────────────────────

const TR_MONTHS = [
  'Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
  'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık',
];
const TR_MONTHS_SHORT = [
  'Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara',
];
const TR_DAYS = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];

const POPUP_W = 280;
const POPUP_H = 370;
const MARGIN  = 8;

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
function formatShort(value: string) {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d} ${TR_MONTHS_SHORT[m - 1]} ${y}`;
}
function firstDayOfMonth(year: number, month: number) {
  const raw = new Date(year, month - 1, 1).getDay();
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
  const nvm = vm === 12 ? 1 : vm + 1;
  const nvy = vm === 12 ? vy + 1 : vy;
  let nd = 1;
  while (cells.length < 42)
    cells.push({ year: nvy, month: nvm, day: nd++, cur: false });
  return cells;
}

// ─── Pozisyon hesabı (position: absolute + scrollY/scrollX) ──────────────────

interface PopupPos { top: number; left: number }

function calcPos(btn: HTMLButtonElement): PopupPos {
  const r  = btn.getBoundingClientRect();
  const sw = window.innerWidth;
  const sh = window.innerHeight;
  const sy = window.scrollY;
  const sx = window.scrollX;

  // Dikey: aşağı sığmazsa yukarı
  let top: number;
  const spaceBelow = sh - r.bottom;
  const spaceAbove = r.top;
  if (spaceBelow >= POPUP_H || spaceBelow >= spaceAbove) {
    top = r.bottom + sy + MARGIN;
  } else {
    top = r.top + sy - POPUP_H - MARGIN;
  }
  top = Math.max(sy + MARGIN, Math.min(top, sy + sh - POPUP_H - MARGIN));

  // Yatay: sağa taşarsa sola kaydır
  let left = r.left + sx;
  if (left + POPUP_W > sx + sw - MARGIN) {
    left = sx + sw - POPUP_W - MARGIN;
  }
  left = Math.max(sx + MARGIN, left);

  return { top, left };
}

// ─── MonoDatePicker ───────────────────────────────────────────────────────────

export interface MonoDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** @deprecated artık gerekmiyor */
  dropUp?: boolean;
}

type View = 'day' | 'month' | 'year';

export function MonoDatePicker({ value, onChange, placeholder = 'Tarih seç' }: MonoDatePickerProps) {
  const today   = todayStr();
  const btnRef  = useRef<HTMLButtonElement>(null);
  const popRef  = useRef<HTMLDivElement>(null);

  const initView = () => {
    if (value) {
      const [y, m] = value.split('-').map(Number);
      if (y && m) return { vy: y, vm: m };
    }
    const t = new Date();
    return { vy: t.getFullYear(), vm: t.getMonth() + 1 };
  };

  const [open,    setOpen]    = useState(false);
  const [vy,      setVy]      = useState(() => initView().vy);
  const [vm,      setVm]      = useState(() => initView().vm);
  const [pending, setPending] = useState(value);
  const [pos,     setPos]     = useState<PopupPos>({ top: 0, left: 0 });
  const [view,    setView]    = useState<View>('day');

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i);

  const recalc = useCallback(() => {
    if (btnRef.current) setPos(calcPos(btnRef.current));
  }, []);

  useEffect(() => { setPending(value); }, [value]);

  useEffect(() => {
    if (!open) return;
    const iv = initView();
    setVy(iv.vy); setVm(iv.vm);
    setPending(value);
    setView('day');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', recalc, true);
    window.addEventListener('resize', recalc);
    return () => {
      window.removeEventListener('scroll', recalc, true);
      window.removeEventListener('resize', recalc);
    };
  }, [open, recalc]);


  function confirm() { onChange(pending); setOpen(false); }
  function cancel()  { setPending(value); setOpen(false); }

  function prevM() {
    if (vm === 1) { setVy(y => y - 1); setVm(12); }
    else setVm(m => m - 1);
  }
  function nextM() {
    if (vm === 12) { setVy(y => y + 1); setVm(1); }
    else setVm(m => m + 1);
  }

  const cells        = buildCells(vy, vm);
  const display      = formatDisplay(value);
  const displayShort = formatShort(value);

  const navBtn = 'w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors shrink-0';
  const selBtn = 'px-2 py-0.5 rounded-lg text-[13px] font-bold text-gray-900 hover:bg-gray-100 transition-colors';

  // ── Paneller ──────────────────────────────────────────────────────────────

  const dayPanel = (
    <>
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-50">
        <button type="button" onClick={prevM} className={navBtn}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setView('month')} className={selBtn}>
            {TR_MONTHS[vm - 1]}
          </button>
          <button type="button" onClick={() => setView('year')} className={selBtn}>
            {vy}
          </button>
        </div>
        <button type="button" onClick={nextM} className={navBtn}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 px-4 pt-2.5 pb-1">
        {TR_DAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-gray-400">{d}</div>
        ))}
      </div>

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
    </>
  );

  const monthPanel = (
    <>
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-50">
        <button type="button" onClick={() => setVy(y => y - 1)} className={navBtn}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setView('year')} className={selBtn}>{vy}</button>
        <button type="button" onClick={() => setVy(y => y + 1)} className={navBtn}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 p-4">
        {TR_MONTHS.map((name, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { setVm(i + 1); setView('day'); }}
            className={`h-9 rounded-xl text-[12px] font-semibold transition-colors
              ${vm === i + 1 ? 'bg-red-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            {name}
          </button>
        ))}
      </div>
    </>
  );

  const yearPanel = (
    <>
      <div className="px-4 py-2.5 border-b border-gray-50">
        <span className="text-[12px] font-bold text-gray-400 uppercase tracking-wider">Yıl Seç</span>
      </div>
      <div className="overflow-y-auto p-2 grid grid-cols-3 gap-1.5" style={{ maxHeight: 260 }}>
        {years.map(y => (
          <button
            key={y}
            type="button"
            onClick={() => { setVy(y); setView('day'); }}
            className={`h-9 rounded-xl text-[13px] font-semibold transition-colors
              ${vy === y ? 'bg-red-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            {y}
          </button>
        ))}
      </div>
    </>
  );

  // Popup: portal → document.body
  // Backdrop (z:9998) dışarı tıklamayı yakalar; popup (z:9999) üstte olduğu için
  // popup içi tıklamalar backdrop'a ulaşmaz → kapanmaz.
  const popup = open ? createPortal(
    <>
      {/* Şeffaf backdrop — sadece popup dışına tıklanınca kapatır */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onClick={() => setOpen(false)}
      />
      {/* Picker popup */}
      <div
        ref={popRef}
        style={{ position: 'absolute', top: pos.top, left: pos.left, width: POPUP_W, zIndex: 9999 }}
        className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
      >
        {view === 'day'   && dayPanel}
        {view === 'month' && monthPanel}
        {view === 'year'  && yearPanel}
      </div>
    </>,
    document.body,
  ) : null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          if (!open) setPos(calcPos(e.currentTarget));
          setOpen(v => !v);
        }}
        className="w-full bg-[#f2f4f7] rounded-xl h-[46px] px-3 text-[12px] font-medium text-left flex items-center justify-between border border-transparent focus:outline-none hover:bg-gray-200 transition-colors overflow-hidden"
      >
        <span className={`whitespace-nowrap overflow-hidden text-ellipsis ${displayShort ? 'text-gray-900' : 'text-gray-400'}`}>
          {displayShort || placeholder}
        </span>
        <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0 ml-1.5" />
      </button>
      {popup}
    </div>
  );
}
