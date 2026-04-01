import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('ledger');
  const { t: tc } = useTranslation('common');

  const totalDr  = lines.reduce((s, l) => s + l.debit, 0);
  const totalCr  = lines.reduce((s, l) => s + l.credit, 0);
  const totalBDr = lines.reduce((s, l) => s + (l.base_debit ?? 0), 0);
  const totalBCr = lines.reduce((s, l) => s + (l.base_credit ?? 0), 0);
  const balanced = Math.abs(totalBDr - totalBCr) < 0.01;

  return (
    <div className="mx-4 mb-3 rounded-xl border border-gray-100 overflow-hidden bg-gray-50">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-100 text-gray-500">
            <th className="text-left px-3 py-2 font-semibold">#</th>
            <th className="text-left px-3 py-2 font-semibold">{t('table.account')}</th>
            <th className="text-left px-3 py-2 font-semibold">{tc('table.description')}</th>
            <th className="text-right px-3 py-2 font-semibold">{t('table.debit')}</th>
            <th className="text-right px-3 py-2 font-semibold">{t('table.credit')}</th>
            <th className="text-right px-3 py-2 font-semibold">{t('table.curr')}</th>
            <th className="text-right px-3 py-2 font-semibold">{tc('rate')}</th>
            <th className="text-right px-3 py-2 font-semibold">{t('table.debitTry')}</th>
            <th className="text-right px-3 py-2 font-semibold">{t('table.creditTry')}</th>
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
          <tr className="border-t-2 border-gray-200 bg-gray-100 font-semibold">
            <td colSpan={3} className="px-3 py-2 text-xs text-gray-500">{t('table.total')}</td>
            <td className="px-3 py-2 text-right font-mono text-gray-800">{fN(totalDr)}</td>
            <td className="px-3 py-2 text-right font-mono text-gray-800">{fN(totalCr)}</td>
            <td colSpan={2} />
            <td className="px-3 py-2 text-right font-mono text-blue-700">{fN(totalBDr)}</td>
            <td className="px-3 py-2 text-right font-mono text-blue-700">{fN(totalBCr)}</td>
          </tr>
          {!balanced && (
            <tr>
              <td colSpan={9} className="px-3 py-1.5 text-red-600 text-xs font-semibold bg-red-50 text-center">
                {t('unbalanced', { diff: fN(Math.abs(totalBDr - totalBCr)) })}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function EntryRow({ entry }: { entry: JournalEntry }) {
  const { t } = useTranslation('ledger');
  const { t: tc } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const sc    = STATUS_COLORS[entry.status] ?? { bg: '#f3f4f6', text: '#374151' };
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
            {tc(`status.${entry.status}`)}
          </span>
        </td>
        <td className="px-3 py-3 text-xs text-gray-400">{lines.length} {t('lines')}</td>
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
  const { t } = useTranslation('ledger');
  const { t: tc } = useTranslation('common');
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

  const filtered    = hideZero ? entries.filter(e => (e.lines ?? []).reduce((s, l) => s + l.debit, 0) > 0) : entries;
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
            <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>
            <p className="text-xs text-gray-400">{t('description')}</p>
          </div>
        </div>
        <div className="flex gap-3 text-xs">
          <div className="bg-green-50 px-3 py-1.5 rounded-xl">
            <span className="font-bold text-green-700">{totalPosted}</span>
            <span className="text-green-600 ml-1">{t('stats.posted')}</span>
          </div>
          <div className="bg-yellow-50 px-3 py-1.5 rounded-xl">
            <span className="font-bold text-yellow-700">{totalDraft}</span>
            <span className="text-yellow-600 ml-1">{t('stats.draft')}</span>
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
          <option value="">{t('filters.allStatuses')}</option>
          <option value="posted">{tc('status.posted')}</option>
          <option value="draft">{tc('status.draft')}</option>
          <option value="reversed">{tc('status.reversed')}</option>
        </select>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{tc('from')}</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="h-8 px-3 text-xs border border-gray-200 rounded-xl focus:outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{tc('to')}</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="h-8 px-3 text-xs border border-gray-200 rounded-xl focus:outline-none" />
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer ml-auto">
          <input type="checkbox" checked={hideZero} onChange={e => setHideZero(e.target.checked)} className="rounded" />
          {t('filters.hideZero')}
        </label>
        {(statusFilter || dateFrom || dateTo) && (
          <button onClick={() => { setStatusFilter(''); setDateFrom(''); setDateTo(''); }}
            className="text-xs text-gray-400 hover:text-gray-600 underline">
            {tc('btn.clear')}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><LoadingSpinner /></div>
        ) : error ? (
          <div className="p-8 text-center text-red-500 text-sm">
            <p className="font-semibold mb-1">{t('error.loading')}</p>
            <p className="text-xs text-gray-400">{(error as Error).message}</p>
            <p className="text-xs text-orange-500 mt-2">{t('error.migration')}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">{t('empty.title')}</p>
            <p className="text-xs mt-1">{t('empty.hint')}</p>
            <p className="text-xs text-orange-500 mt-2 font-medium">{t('empty.migrationHint')}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="w-8 px-4 py-3" />
                <th className="text-left px-3 py-3 text-xs font-semibold">{t('table.entryNo')}</th>
                <th className="text-left px-3 py-3 text-xs font-semibold">{tc('table.date')}</th>
                <th className="text-left px-3 py-3 text-xs font-semibold">{tc('table.description')}</th>
                <th className="text-left px-3 py-3 text-xs font-semibold">{t('table.source')}</th>
                <th className="text-right px-3 py-3 text-xs font-semibold">{tc('table.amount')}</th>
                <th className="text-left px-3 py-3 text-xs font-semibold">{tc('table.status')}</th>
                <th className="text-left px-3 py-3 text-xs font-semibold">{t('lines')}</th>
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
          {filtered.length} {t('footer')}
        </p>
      )}
    </div>
  );
}
