import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar } from 'lucide-react';

// ─── Sabitler ────────────────────────────────────────────────────────────────

const TR_MONTHS = [
  'Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
  'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık',
];
const TR_DAYS = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];

const POPUP_W = 280;
const POPUP_H = 370; // estimated max height
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

// ─── Pozisyon hesabı — viewport'a sığdır ─────────────────────────────────────

interface PopupStyle { top: number; left: number }

function calcPos(btn: HTMLButtonElement): PopupStyle {
  const r  = btn.getBoundingClientRect();
  const sw = window.innerWidth;
  const sh = window.innerHeight;
  const sy = window.scrollY;
  const sx = window.scrollX;

  // Dikey: önce aşağı dene, sığmazsa yukarı
  let top: number;
  const spaceBelow = sh - r.bottom;
  const spaceAbove = r.top;
  if (spaceBelow >= POPUP_H || spaceBelow >= spaceAbove) {
    top = r.bottom + sy + MARGIN;
  } else {
    top = r.top + sy - POPUP_H - MARGIN;
  }
  // Viewport sınırına clamp
  top = Math.max(sy + MARGIN, Math.min(top, sy + sh - POPUP_H - MARGIN));

  // Yatay: trigger sol kenarından başla, sağa taşarsa sola kaydır
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
  /** @deprecated artık gerekmiyor — otomatik hesaplanıyor */
  dropUp?: boolean;
}

export function MonoDatePicker({
  value,
  onChange,
  placeholder = 'Tarih seç',
}: MonoDatePickerProps) {
  const today  = todayStr();
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

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
  const [style,   setStyle]   = useState<PopupStyle>({ top: 0, left: 0 });

  // Yıl aralığı: -10 … +10
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i);

  // Pozisyonu yeniden hesapla
  const recalc = useCallback(() => {
    if (btnRef.current) setStyle(calcPos(btnRef.current));
  }, []);

  useEffect(() => { setPending(value); }, [value]);

  useEffect(() => {
    if (!open) return;
    const iv = initView();
    setVy(iv.vy); setVm(iv.vm);
    setPending(value);
    recalc();
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

  // Dışarı tıklayınca kapat
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        btnRef.current && !btnRef.current.contains(t) &&
        popRef.current  && !popRef.current.contains(t)
      ) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function confirm() { onChange(pending); setOpen(false); }
  function cancel()  { setPending(value); setOpen(false); }

  const cells   = buildCells(vy, vm);
  const display = formatDisplay(value);

  // ── Seçim kutusu stili ─────────────────────────────────────────────────────
  const selCls = 'bg-gray-100 rounded-lg px-2 h-7 text-[13px] font-bold text-gray-900 border-0 outline-none cursor-pointer appearance-none text-center hover:bg-gray-200 transition-colors';

  const popup = open ? createPortal(
    <div
      ref={popRef}
      style={{ position: 'absolute', top: style.top, left: style.left, width: POPUP_W, zIndex: 9999 }}
      className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
    >
      {/* ── Header: ay + yıl dropdown ── */}
      <div className="flex items-center justify-center gap-2 px-4 py-3 border-b border-gray-50">
        {/* Ay seçici */}
        <select
          value={vm}
          onChange={e => setVm(Number(e.target.value))}
          className={selCls}
          style={{ width: 110 }}
        >
          {TR_MONTHS.map((name, i) => (
            <option key={i} value={i + 1}>{name}</option>
          ))}
        </select>

        {/* Yıl seçici */}
        <select
          value={vy}
          onChange={e => setVy(Number(e.target.value))}
          className={selCls}
          style={{ width: 80 }}
        >
          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* ── Gün başlıkları ── */}
      <div className="grid grid-cols-7 px-4 pt-3 pb-1">
        {TR_DAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-gray-400">{d}</div>
        ))}
      </div>

      {/* ── Gün hücreleri ── */}
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

      {/* ── Footer ── */}
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
    </div>,
    document.body,
  ) : null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full bg-[#f2f4f7] rounded-xl h-[46px] px-4 text-[13px] font-medium text-left flex items-center justify-between border border-transparent focus:outline-none hover:bg-gray-200 transition-colors"
      >
        <span className={display ? 'text-gray-900' : 'text-gray-400'}>
          {display || placeholder}
        </span>
        <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0 ml-2" />
      </button>
      {popup}
    </div>
  );
}
