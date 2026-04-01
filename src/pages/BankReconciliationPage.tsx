import { useState } from 'react';
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
          <h2 className="font-bold text-gray-900">Add Bank Transaction</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Date</label>
            <input type="date" value={form.txn_date}
              onChange={e => setForm(f => ({ ...f, txn_date: e.target.value }))}
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none" required />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Description</label>
            <input type="text" value={form.description} placeholder="Payment from customer..."
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Amount (+ incoming, - outgoing)</label>
              <input type="number" step="0.01" value={form.amount} placeholder="1000.00"
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none" required />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Currency</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none bg-white">
                <option>USD</option><option>EUR</option><option>TRY</option><option>GBP</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Reference (optional)</label>
            <input type="text" value={form.reference} placeholder="REF-001"
              onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 h-9 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={isPending}
              className="flex-1 h-9 rounded-xl text-white text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
              {isPending ? 'Saving…' : 'Add'}
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
  const { data: transactions = [] } = useTransactions({ type: bankTxn.amount > 0 ? 'receipt' : 'payment' });
  const { mutate, isPending } = useCreateMatch();
  const [selectedTxnId, setSelectedTxnId] = useState('');
  const [diffNote, setDiffNote] = useState('');

  const selected = transactions.find(t => t.id === selectedTxnId);
  const diff = selected ? Math.abs(bankTxn.amount) - selected.amount : 0;

  function doMatch() {
    if (!selectedTxnId) return;
    mutate(
      { bank_transaction_id: bankTxn.id, transaction_id: selectedTxnId, difference_amount: diff, notes: diffNote || undefined },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-gray-900">Match Bank Transaction</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Bank side */}
        <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm">
          <div className="text-xs text-gray-400 mb-1">Bank transaction</div>
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
          <label className="text-xs text-gray-500 mb-1 block">
            Select matching {bankTxn.amount > 0 ? 'receipt' : 'payment'}
          </label>
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
            {transactions.length === 0 ? (
              <p className="p-4 text-xs text-gray-400 text-center">No unmatched transactions</p>
            ) : (
              transactions.map(t => (
                <label key={t.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                  <input type="radio" name="txn" value={t.id}
                    checked={selectedTxnId === t.id}
                    onChange={() => setSelectedTxnId(t.id)}
                    className="accent-blue-600" />
                  <div className="flex-1 text-xs">
                    <div className="font-medium text-gray-800">{t.party_name || t.description}</div>
                    <div className="text-gray-400">{fDate(t.transaction_date)} · {fN(t.amount)} {t.currency}</div>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Difference note */}
        {Math.abs(diff) > 0.01 && (
          <div className="mb-3">
            <div className="text-xs text-orange-600 mb-1">Difference: {fN(diff)} — add a note</div>
            <input type="text" value={diffNote} placeholder="Bank fee, FX difference..."
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
            {isPending ? 'Matching…' : 'Create Match'}
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
          {txn.status}
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
                <Link2 className="w-3.5 h-3.5" /> Match
              </button>
              <button
                onClick={() => updateStatus({ id: txn.id, status: 'excluded' })}
                disabled={isPending}
                className="text-[11px] font-medium text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100"
              >
                Exclude
              </button>
            </>
          )}
          {txn.status === 'excluded' && (
            <button
              onClick={() => updateStatus({ id: txn.id, status: 'unmatched' })}
              disabled={isPending}
              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100"
            >
              <Unlink className="w-3.5 h-3.5" /> Restore
            </button>
          )}
          {txn.status === 'matched' && (
            <span className="flex items-center gap-1 text-[11px] text-green-600">
              <CheckCircle2 className="w-3.5 h-3.5" /> Matched
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
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [matchTarget, setMatchTarget]   = useState<BankTransaction | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedBankAccount, setSelectedBankAccount] = useState('');

  const { data: bankTxns = [], isLoading, error } = useBankTransactions(statusFilter || undefined);
  const { data: summary }                          = useBankReconciliationSummary();
  const { data: bankAccounts = [] }                = useBankAccounts();

  const defaultBankAccount = bankAccounts[0]?.id ?? '';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: accent + '18' }}>
            <Building2 className="w-5 h-5" style={{ color: accent }} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Bank Reconciliation</h1>
            <p className="text-xs text-gray-400">Match bank transactions to system records</p>
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
          <Plus className="w-4 h-4" /> Add Bank Transaction
        </button>
      </div>

      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total',     value: summary.total,     color: '#374151' },
            { label: 'Matched',   value: summary.matched,   color: '#10b981' },
            { label: 'Unmatched', value: summary.unmatched, color: '#f59e0b' },
            { label: 'Excluded',  value: summary.excluded,  color: '#9ca3af' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="text-xs text-gray-400 mb-1">{k.label}</div>
              <div className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</div>
              {k.label === 'Matched' && summary.total > 0 && (
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {Math.round(summary.matched / summary.total * 100)}% match rate
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit">
        {[['', 'All'], ['unmatched', 'Unmatched'], ['matched', 'Matched'], ['excluded', 'Excluded']].map(([v, l]) => (
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
            <p className="font-semibold mb-1">Error loading bank transactions</p>
            <p className="text-xs text-gray-400">{(error as Error).message}</p>
            <p className="text-xs text-orange-500 mt-2">Run migration 023 in Supabase first.</p>
          </div>
        ) : bankTxns.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No bank transactions</p>
            <p className="text-xs mt-1">Import your bank statement or add transactions manually.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="text-left px-4 py-3 text-xs font-semibold">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold">Description</th>
                <th className="text-left px-4 py-3 text-xs font-semibold">Reference</th>
                <th className="text-right px-4 py-3 text-xs font-semibold">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold">Actions</th>
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
