import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Wallet, Plus, X, CheckCircle2, Clock, AlertCircle, BookCheck, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useTradeObligations, useRecordObligationPayment } from '@/hooks/useObligations';
import type { TradeObligation } from '@/services/obligationService';
import type { TradeFile } from '@/types/database';
import { fCurrency } from '@/lib/formatters';
import type { CurrencyCode } from '@/types/enums';
import { cn } from '@/lib/utils';
import { journalService } from '@/services/journalService';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/contexts/ThemeContext';

// ─── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: TradeObligation['status'] }) {
  const { t } = useTranslation('tradeFiles');
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    pending:   { cls: 'bg-red-50 text-red-600',     icon: <AlertCircle className="h-3 w-3" /> },
    partial:   { cls: 'bg-amber-50 text-amber-600', icon: <Clock className="h-3 w-3" /> },
    settled:   { cls: 'bg-green-50 text-green-600', icon: <CheckCircle2 className="h-3 w-3" /> },
    cancelled: { cls: 'bg-gray-100 text-gray-400',  icon: <X className="h-3 w-3" /> },
  };
  const m = map[status] ?? map.pending;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full', m.cls)}>
      {m.icon}
      {t(`obligations.status.${status}`)}
    </span>
  );
}

// ─── Inline payment form ───────────────────────────────────────────────────────
function PaymentForm({ obligation, onClose }: { obligation: TradeObligation; onClose: () => void }) {
  const { t } = useTranslation('tradeFiles');
  const { t: tc } = useTranslation('common');
  const { accent } = useTheme();
  const record = useRecordObligationPayment();

  const [amount, setAmount] = useState(obligation.balance.toFixed(2));
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef]       = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    record.mutate(
      {
        obligation_id: obligation.id,
        party:         obligation.party,
        customer_id:   obligation.customer_id,
        supplier_id:   obligation.supplier_id,
        amount:        val,
        currency:      obligation.currency,
        payment_date:  date,
        reference_no:  ref,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
        {t('obligations.recordPayment')}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-gray-400 font-medium block mb-1">{t('obligations.amount')}</label>
          <input
            type="number" step="0.01" min="0.01" max={obligation.balance} required
            value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full px-3 py-2 text-[12px] font-semibold rounded-xl border border-gray-200 bg-white outline-none focus:border-blue-400"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 font-medium block mb-1">{t('obligations.date')}</label>
          <input
            type="date" required value={date} onChange={e => setDate(e.target.value)}
            className="w-full px-3 py-2 text-[12px] rounded-xl border border-gray-200 bg-white outline-none focus:border-blue-400"
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-gray-400 font-medium block mb-1">{t('obligations.ref')}</label>
        <input
          type="text" placeholder={t('obligations.refPlaceholder')}
          value={ref} onChange={e => setRef(e.target.value)}
          className="w-full px-3 py-2 text-[12px] rounded-xl border border-gray-200 bg-white outline-none focus:border-blue-400"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose}
          className="flex-1 h-9 rounded-xl text-[12px] font-semibold text-gray-600 border border-gray-200 hover:bg-gray-100 transition-colors">
          {tc('btn.cancel')}
        </button>
        <button type="submit" disabled={record.isPending}
          className="flex-1 h-9 rounded-xl text-[12px] font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ background: accent }}>
          {record.isPending ? t('obligations.saving') : t('obligations.save')}
        </button>
      </div>
    </form>
  );
}

// ─── Single obligation row ─────────────────────────────────────────────────────
function ObligationRow({ ob, writable }: { ob: TradeObligation; writable: boolean }) {
  const { t } = useTranslation('tradeFiles');
  const [payOpen, setPayOpen] = useState(false);
  const canPay = writable && ob.type !== 'advance' && ob.status !== 'settled' && ob.status !== 'cancelled';

  return (
    <div className="border-b border-dashed border-gray-100 last:border-0 py-3">
      <div className="flex items-center justify-between gap-3">
        {/* Left: type + amounts */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className={cn(
            'shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide',
            ob.type === 'advance' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600',
          )}>
            {t(`obligations.type.${ob.type}`)}
          </span>
          <div className="min-w-0">
            <span className="text-[13px] font-bold text-gray-900">
              {fCurrency(ob.amount, ob.currency as CurrencyCode)}
            </span>
            {ob.paid_amount > 0 && (
              <span className="text-[11px] text-green-600 font-semibold ml-2">
                +{fCurrency(ob.paid_amount, ob.currency as CurrencyCode)} {t('obligations.paid')}
              </span>
            )}
            {ob.balance > 0 && ob.paid_amount > 0 && (
              <span className="text-[11px] text-red-500 font-semibold ml-1.5">
                · {fCurrency(ob.balance, ob.currency as CurrencyCode)} {t('obligations.remaining')}
              </span>
            )}
          </div>
        </div>
        {/* Right: status + pay button */}
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={ob.status} />
          {canPay && (
            <button
              onClick={() => setPayOpen(o => !o)}
              className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center transition-colors shrink-0',
                payOpen ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-600 hover:bg-blue-200',
              )}
              title={t('obligations.recordPayment')}
            >
              {payOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>
      {payOpen && <PaymentForm obligation={ob} onClose={() => setPayOpen(false)} />}
    </div>
  );
}

// ─── Post customer advance to accounting ───────────────────────────────────────
function PostAdvanceButton({ file }: { file: TradeFile }) {
  const qc = useQueryClient();
  const [posting, setPosting] = useState(false);
  const [done, setDone]       = useState(false);
  const [err, setErr]         = useState('');

  const advanceRate = file.advance_rate ?? 0;
  const sellTotal   = (file.selling_price ?? 0) * (file.tonnage_mt ?? 0);
  const advanceAmt  = Math.round(sellTotal * advanceRate / 100 * 100) / 100;
  const canPost     = advanceRate > 0 && advanceAmt > 0 && !!file.customer_id;

  const { data: alreadyPosted, isLoading: checking } = useQuery({
    queryKey: ['advance-posted', file.id],
    queryFn: () => journalService.advanceAlreadyPosted(file.id),
    enabled: canPost,
  });

  if (!canPost || alreadyPosted || checking) return null;

  async function handle() {
    setPosting(true); setErr('');
    try {
      await journalService.postAdvanceReceivable({
        tradeFileId:  file.id, fileNo: file.file_no,
        customerId:   file.customer_id!,
        customerName: (file.customer as any)?.name ?? '',
        amount:       advanceAmt,
        currency:     file.sale_currency ?? file.currency ?? 'USD',
        advanceRate,
      });
      setDone(true);
      qc.invalidateQueries({ queryKey: ['advance-posted', file.id] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    } catch (e: any) { setErr(e.message ?? 'Hata'); }
    finally { setPosting(false); }
  }

  if (done) return (
    <div className="flex items-center gap-1.5 text-[11px] text-green-600 font-semibold py-2 px-1">
      <CheckCircle2 className="h-3.5 w-3.5" /> Muhasebeye işlendi ✓
    </div>
  );

  return (
    <div className="space-y-1">
      <button onClick={handle} disabled={posting}
        className="w-full flex items-center justify-center gap-2 h-8 rounded-xl text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 disabled:opacity-50 transition-colors">
        <BookCheck className="h-3.5 w-3.5" />
        {posting ? 'İşleniyor…' : `Muhasebeye işle · %${advanceRate} · ${fCurrency(advanceAmt, (file.sale_currency ?? file.currency ?? 'USD') as CurrencyCode)}`}
      </button>
      {err && <p className="text-[11px] text-red-500 px-1">{err}</p>}
    </div>
  );
}

// ─── Post supplier advance to accounting ───────────────────────────────────────
function PostSupplierAdvanceButton({ file }: { file: TradeFile }) {
  const qc = useQueryClient();
  const [posting, setPosting] = useState(false);
  const [done, setDone]       = useState(false);
  const [err, setErr]         = useState('');

  const purchaseRate = (file as any).purchase_advance_rate ?? 0;
  const purchTotal   = (file.purchase_price ?? 0) * (file.tonnage_mt ?? 0);
  const purchAmt     = Math.round(purchTotal * purchaseRate / 100 * 100) / 100;
  const canPost      = purchaseRate > 0 && purchAmt > 0 && !!file.supplier_id;

  const { data: alreadyPosted, isLoading: checking } = useQuery({
    queryKey: ['supplier-advance-posted', file.id],
    queryFn: () => journalService.supplierAdvanceAlreadyPosted(file.id),
    enabled: canPost,
  });

  if (!canPost || alreadyPosted || checking) return null;

  async function handle() {
    setPosting(true); setErr('');
    try {
      await journalService.postAdvancePayable({
        tradeFileId:  file.id, fileNo: file.file_no,
        supplierId:   file.supplier_id!,
        supplierName: (file.supplier as any)?.name ?? '',
        amount:       purchAmt,
        currency:     file.purchase_currency ?? file.currency ?? 'USD',
        advanceRate:  purchaseRate,
      });
      setDone(true);
      qc.invalidateQueries({ queryKey: ['supplier-advance-posted', file.id] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    } catch (e: any) { setErr(e.message ?? 'Hata'); }
    finally { setPosting(false); }
  }

  if (done) return (
    <div className="flex items-center gap-1.5 text-[11px] text-green-600 font-semibold py-2 px-1">
      <CheckCircle2 className="h-3.5 w-3.5" /> Satıcı ön ödemesi işlendi ✓
    </div>
  );

  return (
    <div className="space-y-1">
      <button onClick={handle} disabled={posting}
        className="w-full flex items-center justify-center gap-2 h-8 rounded-xl text-[11px] font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 disabled:opacity-50 transition-colors">
        <BookCheck className="h-3.5 w-3.5" />
        {posting ? 'İşleniyor…' : `Muhasebeye işle · %${purchaseRate} · ${fCurrency(purchAmt, (file.purchase_currency ?? file.currency ?? 'USD') as CurrencyCode)}`}
      </button>
      {err && <p className="text-[11px] text-red-500 px-1">{err}</p>}
    </div>
  );
}

// ─── Party panel: customer or supplier ────────────────────────────────────────
function PartyPanel({
  party, obligations, file, writable,
}: {
  party: 'customer' | 'supplier';
  obligations: TradeObligation[];
  file: TradeFile;
  writable: boolean;
}) {
  const { t } = useTranslation('tradeFiles');
  const [expanded, setExpanded] = useState(false);

  const rows        = obligations.filter(ob => ob.party === party);
  const totalAmount = rows.reduce((s, ob) => s + ob.amount, 0);
  const totalPaid   = rows.reduce((s, ob) => s + ob.paid_amount, 0);
  const allSettled  = rows.length > 0 && rows.every(ob => ob.status === 'settled');
  const currency    = (rows[0]?.currency ?? 'USD') as CurrencyCode;
  const pct         = totalAmount > 0 ? Math.min(Math.round((totalPaid / totalAmount) * 100), 100) : 0;

  const partyName = party === 'customer'
    ? (file.customer as any)?.name ?? t('obligations.customer')
    : (file.supplier as any)?.name ?? t('obligations.supplier');

  const isCustomer = party === 'customer';
  const accentCls  = isCustomer ? 'text-blue-600' : 'text-violet-600';
  const barCls     = allSettled ? 'bg-green-500' : isCustomer ? 'bg-blue-500' : 'bg-violet-500';

  if (rows.length === 0) return null;

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      {/* Compact header — clickable to expand */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-3 py-2.5 bg-gray-50/60 hover:bg-gray-100/40 transition-colors text-left"
      >
        {/* Progress ring substitute: small dot */}
        <div className={cn(
          'w-2 h-2 rounded-full shrink-0',
          allSettled ? 'bg-green-500' : pct > 0 ? 'bg-amber-400' : 'bg-red-400',
        )} />

        <div className="flex-1 min-w-0">
          <div className={cn('text-[9px] font-extrabold uppercase tracking-[0.12em]', accentCls)}>
            {party === 'customer' ? t('obligations.customer') : t('obligations.supplier')}
          </div>
          <div className="text-[12px] font-semibold text-gray-800 truncate">{partyName}</div>
        </div>

        <div className="text-right shrink-0">
          {allSettled ? (
            <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto" />
          ) : (
            <span className="text-[11px] font-bold text-gray-900 tabular-nums">
              {pct}%
            </span>
          )}
        </div>

        {expanded
          ? <ChevronUp className="h-3.5 w-3.5 text-gray-300 shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 text-gray-300 shrink-0" />}
      </button>

      {/* Summary strip — always visible */}
      <div className="px-3 py-2 bg-white border-t border-gray-50">
        {/* Progress bar */}
        <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-1.5">
          <div
            className={cn('h-full rounded-full transition-all duration-500', barCls)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-gray-400">{t('obligations.paid')}</span>
          <span className="text-[11px] font-bold text-gray-700 tabular-nums">
            {fCurrency(totalPaid, currency)}
            <span className="text-gray-300 font-normal mx-1">/</span>
            {fCurrency(totalAmount, currency)}
          </span>
        </div>
      </div>

      {/* Rows (collapsible) */}
      {expanded && (
        <div className="px-3 pt-1 pb-2 border-t border-gray-50">
          {writable && isCustomer  && <div className="mb-1.5 mt-1.5"><PostAdvanceButton file={file} /></div>}
          {writable && !isCustomer && <div className="mb-1.5 mt-1.5"><PostSupplierAdvanceButton file={file} /></div>}
          {rows.map(ob => (
            <ObligationRow key={ob.id} ob={ob} writable={writable} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main section ──────────────────────────────────────────────────────────────
export function ObligationsSection({
  file, writable, collapsed = false, onToggle,
}: { file: TradeFile; writable: boolean; collapsed?: boolean; onToggle?: () => void }) {
  const { t } = useTranslation('tradeFiles');
  const { data: obligations = [], isLoading } = useTradeObligations(file.id);

  if (!['sale', 'delivery', 'completed'].includes(file.status)) return null;

  // Summary numbers
  const totalAmount = obligations.reduce((s, ob) => s + ob.amount, 0);
  const totalPaid   = obligations.reduce((s, ob) => s + ob.paid_amount, 0);
  const pct         = totalAmount > 0 ? Math.min(Math.round((totalPaid / totalAmount) * 100), 100) : 0;

  // Advance info
  const advanceRate  = file.advance_rate ?? 0;
  const sellingTotal = (file.selling_price ?? 0) * (file.tonnage_mt ?? 0);
  const advanceAmt   = sellingTotal * advanceRate / 100;
  const currency     = (file.sale_currency ?? file.currency ?? 'USD') as CurrencyCode;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

      {/* Header */}
      <div
        className={cn('px-6 py-4 flex items-center justify-between border-b border-gray-50', onToggle ? 'cursor-pointer select-none' : '')}
        onClick={onToggle}
      >
        <div className="flex items-center gap-2.5">
          <Wallet className="h-4 w-4 text-gray-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
            {t('obligations.title')}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {obligations.length > 0 && !collapsed && (
            <>
              <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-green-500 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold text-gray-400 tabular-nums">
                {pct}% {t('obligations.collected')}
              </span>
            </>
          )}
          {onToggle && (collapsed
            ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            : <ChevronUp className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          )}
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Advance rate summary strip */}
          {advanceAmt > 0 && (
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-50 bg-blue-50/30">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Ön Ödeme</span>
                <span className="text-[11px] font-extrabold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                  %{advanceRate}
                </span>
              </div>
              <span className="text-[14px] font-extrabold text-gray-900">
                {fCurrency(advanceAmt, currency)}
              </span>
            </div>
          )}

          {/* Content */}
          <div className="px-5 py-4">
            {isLoading ? (
              <div className="text-[12px] text-gray-400 py-3 text-center">{t('obligations.loading')}</div>
            ) : obligations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-gray-400">
                <Wallet className="h-6 w-6 mb-2 opacity-20" />
                <p className="text-[12px] font-medium text-gray-500">{t('obligations.noObligations')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <PartyPanel party="customer" obligations={obligations} file={file} writable={writable} />
                <PartyPanel party="supplier" obligations={obligations} file={file} writable={writable} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
