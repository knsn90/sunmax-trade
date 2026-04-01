import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet, Plus, X, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { useTradeObligations, useRecordObligationPayment } from '@/hooks/useObligations';
import type { TradeObligation } from '@/services/obligationService';
import type { TradeFile } from '@/types/database';
import { fCurrency } from '@/lib/formatters';
import type { CurrencyCode } from '@/types/enums';
import { cn } from '@/lib/utils';

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: TradeObligation['status'] }) {
  const { t } = useTranslation('tradeFiles');
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    pending:  { cls: 'bg-red-100 text-red-700',    icon: <AlertCircle className="h-3 w-3" /> },
    partial:  { cls: 'bg-yellow-100 text-yellow-700', icon: <Clock className="h-3 w-3" /> },
    settled:  { cls: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="h-3 w-3" /> },
    cancelled:{ cls: 'bg-gray-100 text-gray-500',  icon: <X className="h-3 w-3" /> },
  };
  const m = map[status] ?? map.pending;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full', m.cls)}>
      {m.icon}
      {t(`obligations.status.${status}`)}
    </span>
  );
}

// ─── Record Payment inline mini-form ─────────────────────────────────────────
function PaymentForm({
  obligation,
  onClose,
}: {
  obligation: TradeObligation;
  onClose: () => void;
}) {
  const { t } = useTranslation('tradeFiles');
  const { t: tc } = useTranslation('common');
  const record = useRecordObligationPayment();

  const [amount, setAmount] = useState(obligation.balance.toFixed(2));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    record.mutate(
      {
        obligation_id: obligation.id,
        party: obligation.party,
        customer_id: obligation.customer_id,
        supplier_id: obligation.supplier_id,
        amount: val,
        currency: obligation.currency,
        payment_date: date,
        reference_no: ref,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 mb-1 bg-gray-50 rounded-xl border border-gray-100 p-3 space-y-2"
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
        {t('obligations.recordPayment')}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-400 block mb-0.5">{t('obligations.amount')}</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max={obligation.balance}
            required
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full px-2.5 py-1.5 text-[12px] font-semibold rounded-lg border border-gray-200 bg-white outline-none focus:border-blue-400"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 block mb-0.5">{t('obligations.date')}</label>
          <input
            type="date"
            required
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full px-2.5 py-1.5 text-[12px] rounded-lg border border-gray-200 bg-white outline-none focus:border-blue-400"
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-gray-400 block mb-0.5">{t('obligations.ref')}</label>
        <input
          type="text"
          placeholder={t('obligations.refPlaceholder')}
          value={ref}
          onChange={e => setRef(e.target.value)}
          className="w-full px-2.5 py-1.5 text-[12px] rounded-lg border border-gray-200 bg-white outline-none focus:border-blue-400"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 h-8 rounded-xl text-[12px] font-semibold text-gray-600 border border-gray-200 hover:bg-gray-100 transition-colors"
        >
          {tc('btn.cancel')}
        </button>
        <button
          type="submit"
          disabled={record.isPending}
          className="flex-1 h-8 rounded-xl text-[12px] font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {record.isPending ? t('obligations.saving') : t('obligations.save')}
        </button>
      </div>
    </form>
  );
}

// ─── Single obligation row ────────────────────────────────────────────────────
function ObligationRow({
  ob,
  writable,
}: {
  ob: TradeObligation;
  writable: boolean;
}) {
  const { t } = useTranslation('tradeFiles');
  const [payOpen, setPayOpen] = useState(false);
  const canPay = writable && ob.status !== 'settled' && ob.status !== 'cancelled';

  return (
    <div className="border-b border-gray-50 last:border-0 py-2.5">
      <div className="flex items-center gap-2">
        {/* Type label */}
        <span className={cn(
          'text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide',
          ob.type === 'advance' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600',
        )}>
          {t(`obligations.type.${ob.type}`)}
        </span>

        {/* Amounts */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-gray-900">
              {fCurrency(ob.amount, ob.currency as CurrencyCode)}
            </span>
            {ob.paid_amount > 0 && (
              <span className="text-[10px] text-green-600 font-semibold">
                +{fCurrency(ob.paid_amount, ob.currency as CurrencyCode)} {t('obligations.paid')}
              </span>
            )}
            {ob.balance > 0 && ob.paid_amount > 0 && (
              <span className="text-[10px] text-red-500 font-semibold">
                {fCurrency(ob.balance, ob.currency as CurrencyCode)} {t('obligations.remaining')}
              </span>
            )}
          </div>
        </div>

        {/* Status + action */}
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusBadge status={ob.status} />
          {canPay && (
            <button
              onClick={() => setPayOpen(o => !o)}
              className={cn(
                'h-6 w-6 rounded-full flex items-center justify-center transition-colors',
                payOpen
                  ? 'bg-gray-200 text-gray-600'
                  : 'bg-blue-100 text-blue-600 hover:bg-blue-200',
              )}
              title={t('obligations.recordPayment')}
            >
              {payOpen ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>

      {payOpen && (
        <PaymentForm obligation={ob} onClose={() => setPayOpen(false)} />
      )}
    </div>
  );
}

// ─── Party card: customer or supplier ────────────────────────────────────────
function PartyCard({
  party,
  obligations,
  file,
  writable,
}: {
  party: 'customer' | 'supplier';
  obligations: TradeObligation[];
  file: TradeFile;
  writable: boolean;
}) {
  const { t } = useTranslation('tradeFiles');
  const rows = obligations.filter(ob => ob.party === party);

  const totalAmount = rows.reduce((s, ob) => s + ob.amount, 0);
  const totalPaid   = rows.reduce((s, ob) => s + ob.paid_amount, 0);
  const allSettled  = rows.length > 0 && rows.every(ob => ob.status === 'settled');
  const currency    = rows[0]?.currency ?? 'USD';

  const partyLabel = party === 'customer'
    ? (file.customer as any)?.name ?? t('obligations.customer')
    : (file.supplier as any)?.name ?? t('obligations.supplier');

  if (rows.length === 0) return null;

  return (
    <div className={cn(
      'rounded-xl border p-3',
      party === 'customer' ? 'border-blue-100 bg-blue-50/30' : 'border-violet-100 bg-violet-50/30',
    )}>
      {/* Party header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className={cn(
            'text-[10px] font-bold uppercase tracking-wider',
            party === 'customer' ? 'text-blue-600' : 'text-violet-600',
          )}>
            {party === 'customer' ? t('obligations.customer') : t('obligations.supplier')}
          </div>
          <div className="text-[12px] font-semibold text-gray-700 mt-0.5">{partyLabel}</div>
        </div>
        <div className="text-right">
          <div className="text-[12px] font-bold text-gray-900">
            {fCurrency(totalPaid, currency as CurrencyCode)} / {fCurrency(totalAmount, currency as CurrencyCode)}
          </div>
          {allSettled && (
            <div className="flex items-center gap-1 justify-end mt-0.5">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              <span className="text-[10px] text-green-600 font-semibold">{t('obligations.allSettled')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {totalAmount > 0 && (
        <div className="h-1.5 bg-gray-200 rounded-full mb-2 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', allSettled ? 'bg-green-500' : 'bg-blue-500')}
            style={{ width: `${Math.min((totalPaid / totalAmount) * 100, 100)}%` }}
          />
        </div>
      )}

      {/* Obligation rows */}
      {rows.map(ob => (
        <ObligationRow key={ob.id} ob={ob} writable={writable} />
      ))}
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────
export function ObligationsSection({ file, writable }: { file: TradeFile; writable: boolean }) {
  const { t } = useTranslation('tradeFiles');
  const { data: obligations = [], isLoading } = useTradeObligations(file.id);

  // Only show for sale+ status
  if (!['sale', 'delivery', 'completed'].includes(file.status)) return null;

  const hasObligation = obligations.length > 0;

  return (
    <div className="rounded-2xl bg-white shadow-sm overflow-hidden mb-3">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
        <Wallet className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
          {t('obligations.title')}
        </span>
        {hasObligation && (() => {
          const totalAmount = obligations.reduce((s, ob) => s + ob.amount, 0);
          const totalPaid   = obligations.reduce((s, ob) => s + ob.paid_amount, 0);
          const pct = totalAmount > 0 ? Math.round((totalPaid / totalAmount) * 100) : 0;
          return (
            <span className="ml-auto text-[10px] font-semibold text-gray-400">
              {pct}% {t('obligations.collected')}
            </span>
          );
        })()}
      </div>

      <div className="px-4 py-3 space-y-3">
        {isLoading ? (
          <div className="text-[12px] text-gray-400 py-2 text-center">{t('obligations.loading')}</div>
        ) : !hasObligation ? (
          <div className="text-[12px] text-gray-400 py-2 text-center">
            {t('obligations.noObligations')}
          </div>
        ) : (
          <>
            <PartyCard party="customer" obligations={obligations} file={file} writable={writable} />
            <PartyCard party="supplier" obligations={obligations} file={file} writable={writable} />
          </>
        )}
      </div>
    </div>
  );
}
