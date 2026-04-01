/**
 * legacyImportService.ts
 *
 * Handles bulk-import of legacy (Excel) data into the legacy_transactions table.
 * This is REPORTING-ONLY data — never touches journal_entries.
 *
 * Excel column mapping (case-insensitive):
 *   date        → txn_date
 *   description → description
 *   amount      → amount (always positive)
 *   type        → 'debit' | 'credit'  (or 'D'/'C', 'Borç'/'Alacak')
 *   currency    → 'USD' | 'EUR' | 'TRY'  (default: USD)
 *   reference   → external_ref
 *   notes       → notes
 */

import { supabase } from './supabase';

export interface LegacyRow {
  txn_date: string;          // ISO date: '2022-03-15'
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  currency?: 'USD' | 'EUR' | 'TRY';
  external_ref?: string;
  notes?: string;
}

export interface ImportTarget {
  party_type: 'customer' | 'supplier';
  party_id: string;          // UUID of customer or supplier
}

export interface ImportBatchOptions {
  batch_key: string;         // unique identifier, e.g. '2022-customer-abc-import'
  label: string;             // human label, e.g. 'ABC Ltd – 2022 AR from Excel'
  source_file?: string;
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

// ── Column normaliser ─────────────────────────────────────────────────────────
const TYPE_MAP: Record<string, 'debit' | 'credit'> = {
  debit: 'debit', credit: 'credit',
  d: 'debit', c: 'credit',
  borç: 'debit', alacak: 'credit',
  borc: 'debit',
  dr: 'debit', cr: 'credit',
};

export function normaliseType(raw: unknown): 'debit' | 'credit' | null {
  const s = String(raw ?? '').toLowerCase().trim();
  return TYPE_MAP[s] ?? null;
}

export function normaliseCurrency(raw: unknown): 'USD' | 'EUR' | 'TRY' {
  const s = String(raw ?? '').toUpperCase().trim();
  if (s === 'EUR') return 'EUR';
  if (s === 'TRY' || s === '₺') return 'TRY';
  return 'USD';
}

export function normaliseDate(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim();

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD.MM.YYYY or DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;

  // MM/DD/YYYY (US format)
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;

  // Excel serial number (days since 1899-12-30)
  const n = Number(s);
  if (!isNaN(n) && n > 1000) {
    const d = new Date((n - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }

  return null;
}

// ── Bulk insert ───────────────────────────────────────────────────────────────

export const legacyImportService = {

  async importRows(
    rows: LegacyRow[],
    target: ImportTarget,
    batch: ImportBatchOptions,
  ): Promise<ImportResult> {
    const result: ImportResult = { inserted: 0, skipped: 0, errors: [] };

    if (rows.length === 0) return result;

    // Build insert payload
    const payload = rows.map((row, i) => ({
      party_type:   target.party_type,
      customer_id:  target.party_type === 'customer' ? target.party_id : null,
      supplier_id:  target.party_type === 'supplier' ? target.party_id : null,
      txn_date:     row.txn_date,
      description:  row.description,
      amount:       row.amount,
      currency:     row.currency ?? 'USD',
      type:         row.type,
      source:       'excel',
      import_batch: batch.batch_key,
      external_ref: row.external_ref ?? `row-${i + 1}`,
      notes:        row.notes ?? '',
    }));

    // Insert in chunks of 500 for performance
    const CHUNK = 500;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const chunk = payload.slice(i, i + CHUNK);
      const { error, count } = await supabase
        .from('legacy_transactions')
        .insert(chunk, { count: 'exact' });

      if (error) {
        // On conflict (duplicate external_ref in batch) — skip silently
        if (error.code === '23505') {
          result.skipped += chunk.length;
        } else {
          result.errors.push({ row: i, message: error.message });
        }
      } else {
        result.inserted += count ?? chunk.length;
      }
    }

    // Register batch summary
    if (result.inserted > 0) {
      await supabase.rpc('fn_legacy_import_summary', {
        p_batch_key: batch.batch_key,
        p_label:     batch.label,
        p_file_name: batch.source_file ?? '',
      });
    }

    return result;
  },

  /** Fetch all batches (for the import history UI) */
  async getBatches() {
    const { data, error } = await supabase
      .from('legacy_import_batches')
      .select('*')
      .order('imported_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  /** Fetch legacy rows for a specific party */
  async getByParty(
    partyType: 'customer' | 'supplier',
    partyId: string,
    fromYear?: number,
    toYear?: number,
  ) {
    let q = supabase
      .from('legacy_transactions')
      .select('*')
      .eq('party_type', partyType)
      .eq(partyType === 'customer' ? 'customer_id' : 'supplier_id', partyId)
      .order('txn_date', { ascending: true });

    if (fromYear) q = q.gte('period_year', fromYear);
    if (toYear)   q = q.lte('period_year', toYear);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  /** Combined statement for a party (legacy + journal lines) */
  async getCombinedStatement(
    partyType: 'customer' | 'supplier',
    partyId: string,
  ) {
    const view = partyType === 'customer'
      ? 'v_combined_statement_customer'
      : 'v_combined_statement_supplier';

    const idCol = partyType === 'customer' ? 'customer_id' : 'supplier_id';

    const { data, error } = await supabase
      .from(view)
      .select('*')
      .eq(idCol, partyId)
      .order('txn_date', { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  },

  /** Rollback an entire import batch */
  async rollbackBatch(batchKey: string): Promise<number> {
    const { count, error } = await supabase
      .from('legacy_transactions')
      .delete({ count: 'exact' })
      .eq('import_batch', batchKey);
    if (error) throw new Error(error.message);

    await supabase
      .from('legacy_import_batches')
      .delete()
      .eq('batch_key', batchKey);

    return count ?? 0;
  },
};
