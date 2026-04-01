import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useBankTransactions, useBankReconciliationSummary,
  useUpdateBankTxnStatus, useCreateMatch,
  useCreateBankTransaction,
} from '@/hooks/useBankReconciliation';
import { useTransactions } from '@/hooks/useTransactions';
import { useBankAccounts } from '@/hooks/useSettings';
import { useTheme } from '@/contexts/ThemeContext';
import { fDate } from '@/lib/formatters';
import { LoadingSpinner } from '@/components/ui/shared';
import { Building2, Plus, Link2, Unlink, X, CheckCircle2 } from 'lucide-react';
import type { BankTransaction } from '@/types/database';

function fN(n: number, d = 2) {
  return (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });
}

// ─── Add Bank Transaction Modal ───────────────────────────────────────────────

function AddBankTxnModal({ onClose, bankAccountId }: { onClose: () => void; bankAccountId: string }) {
  const { t }  = useTranslation('bankRecon');
  const { t: tc } = useTranslation('common');
  const { mutate, isPending } = useCreateBankTransaction();
  const [form, setForm] = useState({
    txn_date: new Date().toISOString().slice(0, 10),
    description: '',
    amount: '',
    currency: 'USD',
    reference: '',
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    mutate(
      {
        bank_account_id: bankAccountId,
        txn_date: form.txn_date,
        description: form.description,
        amount: parseFloat(form.amount),
        currency: form.currency,
        reference: form.reference || undefined,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-5">
          <h2 className="font-bold text-gray-900">{t('modal.addTitle')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{tc('form.date')}</label>
            <input type="date" value={form.txn_date}
              onChange={e => setForm(f => ({ ...f, txn_date: e.target.value }))}
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none" required />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('modal.form.description')}</label>
            <input type="text" value={form.description} placeholder={t('modal.form.descriptionPlaceholder')}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('modal.form.amount')}</label>
              <input type="number" step="0.01" value={form.amount} placeholder={t('modal.form.amountPlaceholder')}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none" required />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{tc('form.currency')}</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none bg-white">
                <option>USD</option><option>EUR</option><option>TRY</option><option>GBP</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('modal.form.reference')}</label>
            <input type="text" value={form.reference} placeholder={t('modal.form.referencePlaceholder')}
              onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 h-9 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
              {tc('btn.cancel')}
            </button>
            <button type="submit" disabled={isPending}
              className="flex-1 h-9 rounded-xl text-white text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
              {isPending ? t('modal.buttons.adding') : t('modal.buttons.add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Match dialog ─────────────────────────────────────────────────────────────

function MatchDialog({
  bankTxn, onClose,
}: {
  bankTxn: BankTransaction;
  onClose: () => void;
}) {
  const { t }  = useTranslation('bankRecon');
  const { data: transactions = [] } = useTransactions({ type: bankTxn.amount > 0 ? 'receipt' : 'payment' });
  const { mutate, isPending } = useCreateMatch();
  const [selectedTxnId, setSelectedTxnId] = useState('');
  const [diffNote, setDiffNote] = useState('');

  const selected = transactions.find(tx => tx.id === selectedTxnId);
  const diff = selected ? Math.abs(bankTxn.amount) - selected.amount : 0;

  function doMatch() {
    if (!selectedTxnId) return;
    mutate(
      { bank_transaction_id: bankTxn.id, transaction_id: selectedTxnId, difference_amount: diff, notes: diffNote || undefined },
      { onSuccess: onClose },
    );
  }

  const selectLabel = bankTxn.amount > 0
    ? t('modal.form.selectMatchingReceipt')
    : t('modal.form.selectMatchingPayment');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-gray-900">{t('modal.matchTitle')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Bank side */}
        <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm">
          <div className="text-xs text-gray-400 mb-1">{t('modal.form.bankTransaction')}</div>
          <div className="font-semibold text-gray-800">{bankTxn.description}</div>
          <div className="flex gap-4 mt-1 text-xs text-gray-500">
            <span>{fDate(bankTxn.txn_date)}</span>
            <span className={`font-bold ${bankTxn.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {fN(bankTxn.amount)} {bankTxn.currency}
            </span>
          </div>
        </div>

        {/* System transaction picker */}
        <div className="mb-3">
          <label className="text-xs text-gray-500 mb-1 block">{selectLabel}</label>
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
            {transactions.length === 0 ? (
              <p className="p-4 text-xs text-gray-400 text-center">{t('empty.noUnmatched')}</p>
            ) : (
              transactions.map(tx => (
                <label key={tx.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                  <input type="radio" name="txn" value={tx.id}
                    checked={selectedTxnId === tx.id}
                    onChange={() => setSelectedTxnId(tx.id)}
                    className="accent-blue-600" />
                  <div className="flex-1 text-xs">
                    <div className="font-medium text-gray-800">{tx.party_name || tx.description}</div>
                    <div className="text-gray-400">{fDate(tx.transaction_date)} · {fN(tx.amount)} {tx.currency}</div>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Difference note */}
        {Math.abs(diff) > 0.01 && (
          <div className="mb-3">
            <div className="text-xs text-orange-600 mb-1">
              {t('modal.form.differenceNote', { amount: fN(diff) })}
            </div>
            <input type="text" value={diffNote} placeholder={t('modal.form.differencePlaceholder')}
              onChange={e => setDiffNote(e.target.value)}
              className="w-full h-8 px-3 text-xs border border-gray-200 rounded-xl focus:outline-none" />
          </div>
        )}

        <div className="flex gap-3 mt-4">
          <button onClick={onClose}
            className="flex-1 h-9 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={doMatch} disabled={!selectedTxnId || isPending}
            className="flex-1 h-9 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {isPending ? t('modal.buttons.matching') : t('modal.buttons.createMatch')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Bank Transaction Row ─────────────────────────────────────────────────────

function BankTxnRow({
  txn,
  onMatch,
}: {
  txn: BankTransaction;
  onMatch: (t: BankTransaction) => void;
}) {
  const { t }  = useTranslation('bankRecon');
  const { t: tc } = useTranslation('common');
  const { mutate: updateStatus, isPending } = useUpdateBankTxnStatus();

  const isPositive = txn.amount > 0;
  const statusColors: Record<string, string> = {
    matched:   'bg-green-50 text-green-700',
    unmatched: 'bg-yellow-50 text-yellow-700',
    excluded:  'bg-gray-100 text-gray-500',
  };

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-xs text-gray-500">{fDate(txn.txn_date)}</td>
      <td className="px-4 py-3 text-xs text-gray-800 max-w-[200px] truncate">{txn.description}</td>
      <td className="px-4 py-3 text-xs text-gray-400">{txn.reference ?? '—'}</td>
      <td className={`px-4 py-3 text-xs font-mono font-semibold text-right ${isPositive ? 'text-green-700' : 'text-red-700'}`}>
        {fN(txn.amount)} {txn.currency}
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColors[txn.status]}`}>
          {tc(`status.${txn.status}`)}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2 justify-end">
          {txn.status === 'unmatched' && (
            <>
              <button
                onClick={() => onMatch(txn)}
                className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50"
              >
                <Link2 className="w-3.5 h-3.5" /> {t('actions.match')}
              </button>
              <button
                onClick={() => updateStatus({ id: txn.id, status: 'excluded' })}
                disabled={isPending}
                className="text-[11px] font-medium text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100"
              >
                {t('actions.exclude')}
              </button>
            </>
          )}
          {txn.status === 'excluded' && (
            <button
              onClick={() => updateStatus({ id: txn.id, status: 'unmatched' })}
              disabled={isPending}
              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100"
            >
              <Unlink className="w-3.5 h-3.5" /> {t('actions.restore')}
            </button>
          )}
          {txn.status === 'matched' && (
            <span className="flex items-center gap-1 text-[11px] text-green-600">
              <CheckCircle2 className="w-3.5 h-3.5" /> {tc('status.matched')}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function BankReconciliationPage() {
  const { theme } = useTheme();
  const { t }  = useTranslation('bankRecon');
  const { t: tc } = useTranslation('common');
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [matchTarget, setMatchTarget]   = useState<BankTransaction | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedBankAccount, setSelectedBankAccount] = useState('');

  const { data: bankTxns = [], isLoading, error } = useBankTransactions(statusFilter || undefined);
  const { data: summary }                          = useBankReconciliationSummary();
  const { data: bankAccounts = [] }                = useBankAccounts();

  const defaultBankAccount = bankAccounts[0]?.id ?? '';

  const filterTabs: [string, string][] = [
    ['',          t('filters.all')],
    ['unmatched', t('filters.unmatched')],
    ['matched',   t('filters.matched')],
    ['excluded',  t('filters.excluded')],
  ];

  const kpiItems = summary ? [
    { label: t('kpi.total'),     value: summary.total,     color: '#374151' },
    { label: t('kpi.matched'),   value: summary.matched,   color: '#10b981' },
    { label: t('kpi.unmatched'), value: summary.unmatched, color: '#f59e0b' },
    { label: t('kpi.excluded'),  value: summary.excluded,  color: '#9ca3af' },
  ] : [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: accent + '18' }}>
            <Building2 className="w-5 h-5" style={{ color: accent }} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>
            <p className="text-xs text-gray-400">{t('description')}</p>
          </div>
        </div>
        <button
          onClick={() => {
            setSelectedBankAccount(defaultBankAccount);
            setShowAddModal(true);
          }}
          className="flex items-center gap-2 px-4 h-9 rounded-xl text-white text-xs font-semibold"
          style={{ background: accent }}
        >
          <Plus className="w-4 h-4" /> {t('buttons.addTransaction')}
        </button>
      </div>

      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpiItems.map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="text-xs text-gray-400 mb-1">{k.label}</div>
              <div className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</div>
              {k.label === t('kpi.matched') && summary.total > 0 && (
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {Math.round(summary.matched / summary.total * 100)}{t('kpi.matchRate')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit">
        {filterTabs.map(([v, l]) => (
          <button
            key={v}
            onClick={() => setStatusFilter(v)}
            className={`px-4 h-8 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : error ? (
          <div className="p-8 text-center text-red-500 text-sm">
            <p className="font-semibold mb-1">{t('error.loading')}</p>
            <p className="text-xs text-gray-400">{(error as Error).message}</p>
            <p className="text-xs text-orange-500 mt-2">{t('error.migration')}</p>
          </div>
        ) : bankTxns.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">{t('empty.title')}</p>
            <p className="text-xs mt-1">{t('empty.hint')}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="text-left px-4 py-3 text-xs font-semibold">{tc('table.date')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold">{tc('table.description')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold">{t('table.reference')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold">{tc('table.amount')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold">{tc('table.status')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold">{tc('table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {bankTxns.map(txn => (
                <BankTxnRow key={txn.id} txn={txn} onMatch={setMatchTarget} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {matchTarget && (
        <MatchDialog bankTxn={matchTarget} onClose={() => setMatchTarget(null)} />
      )}
      {showAddModal && (
        <AddBankTxnModal
          bankAccountId={selectedBankAccount || defaultBankAccount}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
