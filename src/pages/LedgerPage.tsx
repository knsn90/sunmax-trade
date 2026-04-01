import { useState } from 'react';
import { useJournalEntries } from '@/hooks/useJournal';
import { useTheme } from '@/contexts/ThemeContext';
import { fDate } from '@/lib/formatters';
import { LoadingSpinner } from '@/components/ui/shared';
import { ChevronDown, ChevronRight, BookOpen } from 'lucide-react';
import type { JournalEntry, JournalLine } from '@/types/database';

function fN(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  posted:   { bg: '#dcfce7', text: '#166534' },
  draft:    { bg: '#fef9c3', text: '#854d0e' },
  reversed: { bg: '#fee2e2', text: '#991b1b' },
};

function JournalLinesTable({ lines }: { lines: JournalLine[] }) {
  const totalDr = lines.reduce((s, l) => s + l.debit, 0);
  const totalCr = lines.reduce((s, l) => s + l.credit, 0);
  const totalBDr = lines.reduce((s, l) => s + (l.base_debit ?? 0), 0);
  const totalBCr = lines.reduce((s, l) => s + (l.base_credit ?? 0), 0);
  const balanced = Math.abs(totalBDr - totalBCr) < 0.01;

  return (
    <div className="mx-4 mb-3 rounded-xl border border-gray-100 overflow-hidden bg-gray-50">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-100 text-gray-500">
            <th className="text-left px-3 py-2 font-semibold">#</th>
            <th className="text-left px-3 py-2 font-semibold">Account</th>
            <th className="text-left px-3 py-2 font-semibold">Description</th>
            <th className="text-right px-3 py-2 font-semibold">Debit</th>
            <th className="text-right px-3 py-2 font-semibold">Credit</th>
            <th className="text-right px-3 py-2 font-semibold">Curr</th>
            <th className="text-right px-3 py-2 font-semibold">Rate</th>
            <th className="text-right px-3 py-2 font-semibold">DR (TRY)</th>
            <th className="text-right px-3 py-2 font-semibold">CR (TRY)</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-t border-gray-100 hover:bg-white transition-colors">
              <td className="px-3 py-1.5 text-gray-400">{line.line_no}</td>
              <td className="px-3 py-1.5 font-mono text-gray-700">
                {line.account?.code ?? '—'}{' '}
                <span className="text-gray-500 font-sans">{line.account?.name ?? ''}</span>
              </td>
              <td className="px-3 py-1.5 text-gray-600">{line.description ?? '—'}</td>
              <td className="px-3 py-1.5 text-right font-mono text-gray-800">
                {line.debit  > 0 ? fN(line.debit)  : ''}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-gray-800">
                {line.credit > 0 ? fN(line.credit) : ''}
              </td>
              <td className="px-3 py-1.5 text-right text-gray-500">{line.line_currency}</td>
              <td className="px-3 py-1.5 text-right text-gray-500">
                {line.exchange_rate_try !== 1 ? fN(line.exchange_rate_try, 4) : '1'}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-blue-700">
                {(line.base_debit ?? 0) > 0 ? fN(line.base_debit ?? 0) : ''}
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-blue-700">
                {(line.base_credit ?? 0) > 0 ? fN(line.base_credit ?? 0) : ''}
              </td>
            </tr>
          ))}
          {/* Totals */}
          <tr className="border-t-2 border-gray-200 bg-gray-100 font-semibold">
            <td colSpan={3} className="px-3 py-2 text-xs text-gray-500">TOTAL</td>
            <td className="px-3 py-2 text-right font-mono text-gray-800">{fN(totalDr)}</td>
            <td className="px-3 py-2 text-right font-mono text-gray-800">{fN(totalCr)}</td>
            <td colSpan={2} />
            <td className="px-3 py-2 text-right font-mono text-blue-700">{fN(totalBDr)}</td>
            <td className="px-3 py-2 text-right font-mono text-blue-700">{fN(totalBCr)}</td>
          </tr>
          {!balanced && (
            <tr>
              <td colSpan={9} className="px-3 py-1.5 text-red-600 text-xs font-semibold bg-red-50 text-center">
                ⚠ UNBALANCED — TRY diff: {fN(Math.abs(totalBDr - totalBCr))}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function EntryRow({ entry }: { entry: JournalEntry }) {
  const [open, setOpen] = useState(false);
  const sc = STATUS_COLORS[entry.status] ?? { bg: '#f3f4f6', text: '#374151' };
  const lines = entry.lines ?? [];
  const totalDr = lines.reduce((s, l) => s + l.debit, 0);

  return (
    <>
      <tr
        className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-4 py-3">
          <span className="text-gray-400">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </span>
        </td>
        <td className="px-3 py-3 font-mono text-xs text-gray-700">{entry.entry_no}</td>
        <td className="px-3 py-3 text-xs text-gray-500">{fDate(entry.entry_date)}</td>
        <td className="px-3 py-3 text-xs text-gray-800 max-w-xs truncate">{entry.description}</td>
        <td className="px-3 py-3 text-xs text-gray-500">{entry.source_type ?? '—'}</td>
        <td className="px-3 py-3 text-xs text-right font-mono text-gray-700">
          {fN(totalDr)} {entry.currency}
        </td>
        <td className="px-3 py-3">
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: sc.bg, color: sc.text }}
          >
            {entry.status}
          </span>
        </td>
        <td className="px-3 py-3 text-xs text-gray-400">{lines.length} lines</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="p-0">
            <JournalLinesTable lines={lines} />
          </td>
        </tr>
      )}
    </>
  );
}

export function LedgerPage() {
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';

  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');
  const [hideZero, setHideZero]         = useState(false);

  const { data: entries = [], isLoading, error } = useJournalEntries({
    status:   statusFilter || undefined,
    dateFrom: dateFrom     || undefined,
    dateTo:   dateTo       || undefined,
  });

  const filtered = hideZero
    ? entries.filter(e => (e.lines ?? []).reduce((s, l) => s + l.debit, 0) > 0)
    : entries;

  const totalPosted = entries.filter(e => e.status === 'posted').length;
  const totalDraft  = entries.filter(e => e.status === 'draft').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: accent + '18' }}>
            <BookOpen className="w-5 h-5" style={{ color: accent }} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Journal Ledger</h1>
            <p className="text-xs text-gray-400">Double-entry accounting records</p>
          </div>
        </div>
        <div className="flex gap-3 text-xs">
          <div className="bg-green-50 px-3 py-1.5 rounded-xl">
            <span className="font-bold text-green-700">{totalPosted}</span>
            <span className="text-green-600 ml-1">posted</span>
          </div>
          <div className="bg-yellow-50 px-3 py-1.5 rounded-xl">
            <span className="font-bold text-yellow-700">{totalDraft}</span>
            <span className="text-yellow-600 ml-1">draft</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap gap-3 items-center">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-8 px-3 text-xs border border-gray-200 rounded-xl bg-white text-gray-700 focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="posted">Posted</option>
          <option value="draft">Draft</option>
          <option value="reversed">Reversed</option>
        </select>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">From</span>
          <input
            type="date" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-8 px-3 text-xs border border-gray-200 rounded-xl focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">To</span>
          <input
            type="date" value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-8 px-3 text-xs border border-gray-200 rounded-xl focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer ml-auto">
          <input
            type="checkbox" checked={hideZero}
            onChange={e => setHideZero(e.target.checked)}
            className="rounded"
          />
          Hide zero-amount
        </label>
        {(statusFilter || dateFrom || dateTo) && (
          <button
            onClick={() => { setStatusFilter(''); setDateFrom(''); setDateTo(''); }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><LoadingSpinner /></div>
        ) : error ? (
          <div className="p-8 text-center text-red-500 text-sm">
            <p className="font-semibold mb-1">Error loading journal entries</p>
            <p className="text-xs text-gray-400">{(error as Error).message}</p>
            <p className="text-xs text-gray-400 mt-2">Make sure migrations 018–025 have been run in Supabase.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No journal entries yet</p>
            <p className="text-xs mt-1">
              Entries are created automatically when invoices or transactions are saved.
            </p>
            <p className="text-xs text-orange-500 mt-2 font-medium">
              Run migrations 018–025 in Supabase SQL Editor first.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="w-8 px-4 py-3" />
                <th className="text-left px-3 py-3 text-xs font-semibold">Entry #</th>
                <th className="text-left px-3 py-3 text-xs font-semibold">Date</th>
                <th className="text-left px-3 py-3 text-xs font-semibold">Description</th>
                <th className="text-left px-3 py-3 text-xs font-semibold">Source</th>
                <th className="text-right px-3 py-3 text-xs font-semibold">Amount</th>
                <th className="text-left px-3 py-3 text-xs font-semibold">Status</th>
                <th className="text-left px-3 py-3 text-xs font-semibold">Lines</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => (
                <EntryRow key={entry.id} entry={entry} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!error && filtered.length > 0 && (
        <p className="text-xs text-gray-400 text-right">
          {filtered.length} entries — click any row to expand lines
        </p>
      )}
    </div>
  );
}
