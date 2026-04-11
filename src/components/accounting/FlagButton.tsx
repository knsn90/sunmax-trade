import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Flag, X } from 'lucide-react';
import { useFlagTransaction } from '@/hooks/useTransactions';
import type { Transaction } from '@/types/database';

interface Props {
  transaction: Transaction;
}

export function FlagButton({ transaction }: Props) {
  const flag = useFlagTransaction();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const isFlagged = !!transaction.flagged;

  useEffect(() => {
    if (open) setNote(transaction.flag_note ?? '');
  }, [open, transaction.flag_note]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const t = e.target as Element;
      if (!btnRef.current?.contains(t) && !t.closest('[data-flag-portal]')) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function openPopover() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const popW = 280;
    const left = r.left + popW > window.innerWidth ? r.right - popW : r.left;
    setPos({ top: r.bottom + 4, left });
    setOpen(true);
  }

  function handleSave() {
    flag.mutate({ id: transaction.id, flagged: true, flag_note: note });
    setOpen(false);
  }

  function handleClear() {
    flag.mutate({ id: transaction.id, flagged: false, flag_note: '' });
    setOpen(false);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={openPopover}
        title={isFlagged ? transaction.flag_note ?? 'Sorunlu' : 'Sorunlu İşaretle'}
        className={`p-1 rounded-lg transition-colors ${
          isFlagged
            ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50'
            : 'text-gray-300 hover:text-amber-400 hover:bg-amber-50'
        }`}
      >
        <Flag className="h-3.5 w-3.5" fill={isFlagged ? 'currentColor' : 'none'} />
      </button>

      {open && pos && createPortal(
        <div
          data-flag-portal
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: 280 }}
          className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flag className="h-3.5 w-3.5 text-amber-500" fill="currentColor" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                Sorun Notu
              </span>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
              <X className="h-3.5 w-3.5 text-gray-400" />
            </button>
          </div>

          <div className="px-4 py-3 space-y-3">
            <div className="text-[11px] text-gray-500 font-medium truncate">
              {transaction.party_name || '—'} · {transaction.reference_no || transaction.description || '—'}
            </div>
            <textarea
              autoFocus
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Sorunun açıklamasını yazın… (ör. Net ağırlık yanlış: 450 yerine 420 MT girilmiş)"
              className="w-full bg-gray-100 rounded-lg px-3 py-2 text-[12px] text-gray-900 placeholder:text-gray-400 border-0 focus:outline-none resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={flag.isPending}
                className="flex-1 h-8 rounded-lg text-[12px] font-semibold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {isFlagged ? 'Güncelle' : 'İşaretle'}
              </button>
              {isFlagged && (
                <button
                  onClick={handleClear}
                  disabled={flag.isPending}
                  className="h-8 px-3 rounded-lg text-[12px] font-semibold text-red-500 border border-red-100 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  Kaldır
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
