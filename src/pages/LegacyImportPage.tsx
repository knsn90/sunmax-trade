/**
 * LegacyImportPage.tsx
 *
 * UI for bulk-importing historical (Excel) data into legacy_transactions.
 * Accessible at /legacy-import (admin only).
 *
 * Workflow:
 *   1. Select party (customer or supplier)
 *   2. Paste / upload CSV rows or fill a manual form
 *   3. Preview the parsed rows
 *   4. Confirm → bulk insert
 *   5. See import history / batch list
 */

import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileSpreadsheet, Trash2, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useCustomers, useSuppliers } from '@/hooks/useEntities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  legacyImportService,
  normaliseDate, normaliseType, normaliseCurrency,
  type LegacyRow, type ImportResult,
} from '@/services/legacyImportService';
import { fDate, fCurrency } from '@/lib/formatters';
import type { CurrencyCode } from '@/types/enums';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── CSV parser (client-side, no library needed) ─────────────────────────────
function parseCSV(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter(l => l.trim())
    .map(line => {
      const cols: string[] = [];
      let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; continue; }
        if (ch === '\t' && !inQ) { cols.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      cols.push(cur.trim());
      return cols;
    });
}

// ─── Excel / CSV row → LegacyRow ─────────────────────────────────────────────
// Expected header (order does NOT matter — matched by name):
//   date, description, amount, type, currency, reference, notes
function rowsToLegacy(rows: string[][]): { data: LegacyRow[]; errors: string[] } {
  if (rows.length < 2) return { data: [], errors: ['No data rows found'] };

  const headers = rows[0].map(h => h.toLowerCase().trim());
  const idx = (name: string) => headers.indexOf(name);

  const iDate = idx('date');
  const iDesc = idx('description');
  const iAmt  = idx('amount');
  const iType = idx('type');
  const iCurr = idx('currency');
  const iRef  = idx('reference');
  const iNote = idx('notes');

  const errors: string[] = [];
  const data: LegacyRow[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const d   = normaliseDate(row[iDate]);
    const amt = parseFloat(String(row[iAmt] ?? '').replace(/,/g, ''));
    const typ = normaliseType(row[iType]);

    if (!d)               { errors.push(`Row ${r + 1}: invalid date "${row[iDate]}"`); continue; }
    if (isNaN(amt) || amt <= 0) { errors.push(`Row ${r + 1}: invalid amount "${row[iAmt]}"`); continue; }
    if (!typ)             { errors.push(`Row ${r + 1}: type must be debit/credit`); continue; }

    data.push({
      txn_date:     d,
      description:  String(row[iDesc] ?? '').trim(),
      amount:       amt,
      type:         typ,
      currency:     normaliseCurrency(row[iCurr]),
      external_ref: iRef >= 0 ? String(row[iRef] ?? '').trim() : undefined,
      notes:        iNote >= 0 ? String(row[iNote] ?? '').trim() : undefined,
    });
  }

  return { data, errors };
}

// ─── Preview table ────────────────────────────────────────────────────────────
function PreviewTable({ rows }: { rows: LegacyRow[] }) {
  const { t } = useTranslation('legacy');
  const [expanded, setExpanded] = useState(false);
  const show = expanded ? rows : rows.slice(0, 10);

  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <table className="w-full text-[11px]">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-bold text-gray-500">{t('col.date')}</th>
            <th className="px-3 py-2 text-left font-bold text-gray-500">{t('col.description')}</th>
            <th className="px-3 py-2 text-right font-bold text-gray-500">{t('col.amount')}</th>
            <th className="px-3 py-2 text-center font-bold text-gray-500">{t('col.type')}</th>
            <th className="px-3 py-2 text-center font-bold text-gray-500">{t('col.currency')}</th>
          </tr>
        </thead>
        <tbody>
          {show.map((r, i) => (
            <tr key={i} className="border-t border-gray-50">
              <td className="px-3 py-1.5 text-gray-700">{fDate(r.txn_date)}</td>
              <td className="px-3 py-1.5 text-gray-700 max-w-[200px] truncate">{r.description}</td>
              <td className="px-3 py-1.5 text-right font-semibold text-gray-900">
                {fCurrency(r.amount, r.currency as CurrencyCode)}
              </td>
              <td className="px-3 py-1.5 text-center">
                <span className={cn(
                  'px-2 py-0.5 rounded-full text-[10px] font-bold',
                  r.type === 'debit' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700',
                )}>
                  {r.type === 'debit' ? t('debit') : t('credit')}
                </span>
              </td>
              <td className="px-3 py-1.5 text-center text-gray-500">{r.currency}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 10 && (
        <button
          className="w-full py-2 text-[11px] text-gray-400 hover:bg-gray-50 flex items-center justify-center gap-1"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded
            ? <><ChevronUp className="h-3 w-3" /> {t('showLess')}</>
            : <><ChevronDown className="h-3 w-3" /> {t('showAll', { count: rows.length })}</>}
        </button>
      )}
    </div>
  );
}

// ─── Import history ───────────────────────────────────────────────────────────
function BatchHistory() {
  const { t } = useTranslation('legacy');
  const qc = useQueryClient();
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['legacy-batches'],
    queryFn:  () => legacyImportService.getBatches(),
  });

  const rollback = useMutation({
    mutationFn: (key: string) => legacyImportService.rollbackBatch(key),
    onSuccess: (count, key) => {
      qc.invalidateQueries({ queryKey: ['legacy-batches'] });
      toast.success(t('rollbackOk', { count, key }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-[12px] text-gray-400 py-4 text-center">{t('loading')}</div>;
  if (batches.length === 0) return <div className="text-[12px] text-gray-400 py-4 text-center">{t('noBatches')}</div>;

  return (
    <div className="space-y-2">
      {batches.map((b: any) => (
        <div key={b.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-white">
          <FileSpreadsheet className="h-4 w-4 text-gray-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold text-gray-800 truncate">{b.label}</div>
            <div className="text-[10px] text-gray-400">
              {b.row_count} {t('rows')} · {fDate(b.imported_at)} · {b.batch_key}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {t('totalDebit')}: {fCurrency(b.total_debit, b.currency)}
              {' · '}
              {t('totalCredit')}: {fCurrency(b.total_credit, b.currency)}
            </div>
          </div>
          <button
            onClick={() => {
              if (window.confirm(t('confirmRollback', { key: b.batch_key })))
                rollback.mutate(b.batch_key);
            }}
            className="h-7 w-7 rounded-full bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-600 flex items-center justify-center transition-colors"
            title={t('rollback')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function LegacyImportPage() {
  const { t } = useTranslation('legacy');
  const qc = useQueryClient();

  const { data: customers = [] } = useCustomers();
  const { data: suppliers  = [] } = useSuppliers();

  const fileRef = useRef<HTMLInputElement>(null);
  const [partyType, setPartyType] = useState<'customer' | 'supplier'>('customer');
  const [partyId,   setPartyId]   = useState('');
  const [batchKey,  setBatchKey]  = useState('');
  const [batchLabel, setBatchLabel] = useState('');
  const [preview,   setPreview]   = useState<LegacyRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [result,    setResult]    = useState<ImportResult | null>(null);

  const partyList = partyType === 'customer' ? customers : suppliers;

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      const { data, errors } = rowsToLegacy(rows);
      setPreview(data);
      setParseErrors(errors);
      setResult(null);
      // Auto-generate batch key
      if (!batchKey) {
        setBatchKey(`${file.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`);
      }
      if (!batchLabel) setBatchLabel(file.name.replace(/\.[^.]+$/, ''));
    };
    reader.readAsText(file);
  }

  const importMut = useMutation({
    mutationFn: () => legacyImportService.importRows(
      preview,
      { party_type: partyType, party_id: partyId },
      { batch_key: batchKey, label: batchLabel },
    ),
    onSuccess: (res) => {
      setResult(res);
      qc.invalidateQueries({ queryKey: ['legacy-batches'] });
      if (res.inserted > 0) toast.success(t('importOk', { count: res.inserted }));
      else toast.warning(t('nothingInserted'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canImport = partyId && batchKey && batchLabel && preview.length > 0;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
          <FileSpreadsheet className="h-4.5 w-4.5 text-orange-600" style={{ width: 18, height: 18 }} />
        </div>
        <div>
          <h1 className="text-[15px] font-bold text-gray-900">{t('title')}</h1>
          <p className="text-[11px] text-gray-400">{t('subtitle')}</p>
        </div>
      </div>

      {/* Notice */}
      <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[12px] text-amber-700">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>{t('notice')}</span>
      </div>

      {/* Step 1 – Party selection */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{t('step1')}</div>

        <div className="flex gap-2">
          {(['customer', 'supplier'] as const).map(pt => (
            <button
              key={pt}
              onClick={() => { setPartyType(pt); setPartyId(''); }}
              className={cn(
                'flex-1 h-9 rounded-xl text-[12px] font-semibold border transition-all',
                partyType === pt
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300',
              )}
            >
              {t(pt)}
            </button>
          ))}
        </div>

        <select
          value={partyId}
          onChange={e => setPartyId(e.target.value)}
          className="w-full px-3 py-2 text-[12px] rounded-xl border border-gray-200 bg-white outline-none focus:border-blue-400"
        >
          <option value="">{t('selectParty')}</option>
          {partyList.map((p: any) => (
            <option key={p.id} value={p.id}>{p.company_name ?? p.name}</option>
          ))}
        </select>
      </div>

      {/* Step 2 – File upload */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{t('step2')}</div>

        <div
          className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
          onClick={() => fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onDragOver={e => e.preventDefault()}
        >
          <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <div className="text-[12px] text-gray-500">{t('dropHint')}</div>
          <div className="text-[10px] text-gray-400 mt-1">CSV · TSV · TXT</div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>

        <div className="text-[10px] text-gray-400 font-medium">{t('csvFormat')}:</div>
        <pre className="text-[10px] bg-gray-50 rounded-lg p-2 text-gray-500 overflow-x-auto">
{`date,description,amount,type,currency,reference
15.03.2022,Invoice #INV-001,5000,debit,USD,INV-001
20.03.2022,Payment received,2500,credit,USD,PAY-001`}
        </pre>
      </div>

      {/* Step 3 – Batch metadata */}
      {preview.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{t('step3')}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                {t('batchLabel')}
              </label>
              <input
                value={batchLabel}
                onChange={e => setBatchLabel(e.target.value)}
                placeholder={t('batchLabelPlaceholder')}
                className="w-full px-3 py-2 text-[12px] rounded-xl border border-gray-200 outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                {t('batchKey')} <span className="text-gray-300 normal-case font-normal">(unique id)</span>
              </label>
              <input
                value={batchKey}
                onChange={e => setBatchKey(e.target.value)}
                className="w-full px-3 py-2 text-[12px] font-mono rounded-xl border border-gray-200 outline-none focus:border-blue-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* Parse errors */}
      {parseErrors.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-1">
          <div className="text-[11px] font-bold text-red-600">{t('parseErrors', { count: parseErrors.length })}</div>
          {parseErrors.slice(0, 10).map((e, i) => (
            <div key={i} className="text-[11px] text-red-500">{e}</div>
          ))}
        </div>
      )}

      {/* Preview */}
      {preview.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              {t('preview')} ({preview.length} {t('rows')})
            </div>
            <div className="flex gap-3 text-[11px]">
              <span className="text-red-600 font-semibold">
                ↑ {preview.filter(r => r.type === 'debit').length} {t('debits')}
              </span>
              <span className="text-green-600 font-semibold">
                ↓ {preview.filter(r => r.type === 'credit').length} {t('credits')}
              </span>
            </div>
          </div>
          <PreviewTable rows={preview} />

          <button
            onClick={() => importMut.mutate()}
            disabled={!canImport || importMut.isPending}
            className={cn(
              'w-full h-10 rounded-xl text-[13px] font-semibold text-white transition-all',
              canImport ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed',
              importMut.isPending && 'opacity-70',
            )}
          >
            {importMut.isPending
              ? t('importing')
              : t('importBtn', { count: preview.length })}
          </button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={cn(
          'rounded-xl border px-4 py-3 flex items-start gap-2',
          result.inserted > 0 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200',
        )}>
          <CheckCircle2 className={cn('h-4 w-4 shrink-0 mt-0.5', result.inserted > 0 ? 'text-green-600' : 'text-yellow-500')} />
          <div className="text-[12px]">
            <div className="font-semibold text-gray-800">
              {t('resultInserted', { count: result.inserted })}
              {result.skipped > 0 && `, ${result.skipped} ${t('skipped')}`}
            </div>
            {result.errors.length > 0 && (
              <div className="text-red-500 mt-1">
                {result.errors.slice(0, 5).map((e, i) => <div key={i}>{e.message}</div>)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import history */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{t('history')}</div>
        <BatchHistory />
      </div>

    </div>
  );
}
