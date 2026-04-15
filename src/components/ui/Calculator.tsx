/**
 * Floating Calculator
 * – Topbar'dan açılır/kapanır
 * – Portal ile render edilir — diyalog overlayin üzerinde kalır
 * – Son 10 işlemi hafızada tutar
 * – Minimize modu
 * – Sonucu panoya kopyala
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CalculatorIcon, X, Minus, Copy, Clock, Delete, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HistoryEntry { expr: string; result: string; }

const MAX_HISTORY = 10;

function safeEval(expr: string): string {
  try {
    // Güvenli değerlendirme — sadece sayı ve operatörler
    const sanitized = expr.replace(/[^0-9+\-*/.()%]/g, '');
    if (!sanitized) return '0';
    // % → /100 dönüşümü
    const withPct = sanitized.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + withPct + ')')();
    if (!isFinite(result)) return 'Hata';
    // Ondalık yuvarla
    return parseFloat(result.toFixed(10)).toString();
  } catch {
    return 'Hata';
  }
}

const BUTTONS = [
  ['C', '()', '%', '/'],
  ['7', '8',  '9', '*'],
  ['4', '5',  '6', '-'],
  ['1', '2',  '3', '+'],
  ['+/-', '0', '.', '='],
];

const HISTORY_KEY = 'sunmax_calc_history';

export function Calculator({ variant = 'topbar' }: { variant?: 'topbar' | 'form' }) {
  const [open, setOpen]         = useState(false);
  const [mini, setMini]         = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expr, setExpr]         = useState('');
  const [copied, setCopied]     = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });
  const [history, setHistory]   = useState<HistoryEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef   = useRef<HTMLDivElement>(null);

  // Panel konumunu trigger butonuna göre hesapla
  function updatePanelPos() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const rightFromEdge = window.innerWidth - rect.right;
    setPanelPos({ top: rect.bottom + 8, right: rightFromEdge });
  }

  // Dışarı tıklayınca kapat
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setMini(false);
        setShowHistory(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Klavye desteği
  useEffect(() => {
    if (!open || mini) return;
    function onKey(e: KeyboardEvent) {
      const k = e.key;
      if (k === 'Escape')     { setOpen(false); return; }
      if (k === 'Enter' || k === '=') { handleButton('='); return; }
      if (k === 'Backspace')  { handleButton('⌫'); return; }
      if ('0123456789+-*/.()%'.includes(k)) handleButton(k);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mini, expr]);

  const result = expr ? safeEval(expr) : '0';

  const saveHistory = useCallback((entries: HistoryEntry[]) => {
    setHistory(entries);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  }, []);

  function handleButton(btn: string) {
    switch (btn) {
      case 'C':
        setExpr('');
        break;
      case '⌫':
        setExpr(e => e.slice(0, -1));
        break;
      case '=': {
        if (!expr) break;
        const res = safeEval(expr);
        if (res !== 'Hata') {
          const entry: HistoryEntry = { expr, result: res };
          const next = [entry, ...history].slice(0, MAX_HISTORY);
          saveHistory(next);
          setExpr(res);
        }
        break;
      }
      case '()': {
        // Açık parantez sayısını say
        const open = (expr.match(/\(/g) ?? []).length;
        const close = (expr.match(/\)/g) ?? []).length;
        setExpr(e => e + (open > close ? ')' : '('));
        break;
      }
      case '+/-':
        setExpr(e => {
          if (!e) return '-';
          if (e.startsWith('-')) return e.slice(1);
          return '-' + e;
        });
        break;
      default:
        setExpr(e => e + btn);
    }
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  function useHistoryEntry(entry: HistoryEntry) {
    setExpr(entry.result);
    setShowHistory(false);
  }

  // Buton stili
  function btnClass(btn: string) {
    if (btn === '=') return 'bg-[var(--color-accent,#dc2626)] text-white hover:opacity-90';
    if (btn === 'C') return 'bg-red-50 text-red-500 hover:bg-red-100';
    if (['+', '-', '*', '/'].includes(btn)) return 'bg-gray-100 text-gray-700 font-bold hover:bg-gray-200';
    if (['%', '()', '+/-'].includes(btn)) return 'bg-gray-100 text-gray-600 hover:bg-gray-200';
    return 'bg-white text-gray-800 shadow-sm hover:bg-gray-50 border border-gray-100';
  }

  const floatingPanel = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.95, y: -8 }}
          animate={{ opacity: 1, scale: 1,    y: 0 }}
          exit={{    opacity: 0, scale: 0.95, y: -8 }}
          transition={{ duration: 0.16, ease: [0.25, 0.1, 0.25, 1] }}
          style={{
            position: 'fixed',
            top: panelPos.top,
            right: panelPos.right,
            zIndex: 9999,
            transformOrigin: 'top right',
          }}
        >
          {/* Minimize modu — sadece sonuç pill'i */}
          {mini ? (
            <div className="flex items-center gap-2 bg-white rounded-2xl shadow-xl border border-gray-100 px-4 py-2.5">
              <span className="text-[15px] font-extrabold text-gray-900 min-w-[60px] text-right">{result}</span>
              <button onClick={copyResult} className="text-gray-400 hover:text-gray-600 transition-colors" title="Kopyala">
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => setMini(false)} className="text-gray-400 hover:text-gray-600 transition-colors" title="Büyüt">
                <CalculatorIcon className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => { setOpen(false); setMini(false); }} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
              {/* Header kontroller */}
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowHistory(v => !v)}
                    title="Geçmiş"
                    className={cn('p-1.5 rounded-lg transition-colors', showHistory ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:text-gray-600')}
                  >
                    <Clock className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setMini(true)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                    title="Küçült"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => { setOpen(false); setShowHistory(false); }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Geçmiş paneli */}
              <AnimatePresence>
                {showHistory && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-2 max-h-52 overflow-y-auto space-y-1">
                      {history.length === 0 ? (
                        <p className="text-[11px] text-gray-400 text-center py-4">Henüz işlem yok</p>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Son {history.length} işlem</p>
                            <button
                              onClick={() => saveHistory([])}
                              className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                            >Temizle</button>
                          </div>
                          {history.map((h, i) => (
                            <button
                              key={i}
                              onClick={() => useHistoryEntry(h)}
                              className="w-full text-right px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors group"
                            >
                              <p className="text-[10px] text-gray-400 group-hover:text-gray-500">{h.expr}</p>
                              <p className="text-[13px] font-bold text-gray-800">= {h.result}</p>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                    <div className="h-px bg-gray-100 mx-4" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Ekran */}
              <div className="px-4 pt-3 pb-2">
                <div className="min-h-[28px] text-right">
                  <p className="text-[11px] text-gray-400 font-mono truncate">{expr || '0'}</p>
                </div>
                <div className="flex items-center justify-end gap-2 mt-0.5">
                  <p className="text-[28px] font-extrabold text-gray-900 leading-none text-right truncate flex-1">
                    {result === 'Hata' ? <span className="text-red-500 text-[18px]">Hata</span> : result}
                  </p>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={copyResult} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 transition-colors" title="Kopyala">
                      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => handleButton('⌫')} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 transition-colors" title="Sil">
                      <Delete className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="h-px bg-gray-100 mx-4 mb-3" />

              {/* Tuşlar */}
              <div className="px-3 pb-4 grid grid-cols-4 gap-2">
                {BUTTONS.flat().map((btn, i) => (
                  <button
                    key={i}
                    onClick={() => handleButton(btn)}
                    className={cn(
                      'h-12 rounded-2xl text-[15px] font-semibold transition-all active:scale-95',
                      btnClass(btn),
                    )}
                  >
                    {btn}
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {/* Trigger butonu */}
      <button
        ref={triggerRef}
        onClick={() => {
          updatePanelPos();
          setOpen(v => !v);
          setMini(false);
          setShowHistory(false);
        }}
        title="Hesap Makinesi"
        className={cn(
          'w-8 h-8 flex items-center justify-center transition-colors',
          variant === 'form'
            ? 'rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500'
            : cn('rounded-xl', open ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'),
        )}
      >
        <CalculatorIcon className="h-4 w-4" />
      </button>

      {/* Portal: her zaman dialog overlayin üzerinde */}
      {createPortal(floatingPanel, document.body)}
    </>
  );
}
