import type { TradeFile } from '@/types/database';

/**
 * Partili ana dosyanın teslimat özeti — aktif (iptal/silinmemiş) partilerden toplanır.
 * Brüt / paket → toplam (parti alanı boşsa partinin ambalaj listesi toplamı; partide tek liste:
 * onaylı olan, yoksa en yüksek ADMT'li). Varış → en geç tarih. B/L · SEPTİ · sigorta → benzersiz değerler.
 * Hem Teslimat kartı hem Teslimat formu ön-doldurması bunu kullanır (tek kaynak).
 */
export interface BatchRollup {
  gross: number;
  packages: number;
  /** En geç varış tarihi (YYYY-MM-DD) veya '' */
  arrivalLatest: string;
  /** Partilerdeki benzersiz değerler, ", " ile birleşik ('' = hiçbirinde yok) */
  bl: string;
  septi: string;
  insuranceTr: string;
  insuranceIr: string;
}

type Batch = NonNullable<TradeFile['batches']>[number];

export function activeBatches(file: Pick<TradeFile, 'batches'>): Batch[] {
  return (file.batches ?? []).filter(
    b => b.status !== 'cancelled' && !(b as { deleted_at?: string | null }).deleted_at,
  );
}

export function pickBatchPackingList(b: Batch) {
  return [...(b.packing_lists ?? [])].sort((x, y) =>
    Number(y.doc_status === 'approved') - Number(x.doc_status === 'approved') ||
    (Number(y.total_admt) || 0) - (Number(x.total_admt) || 0))[0];
}

export function rollupBatches(file: Pick<TradeFile, 'batches'>): BatchRollup {
  const batches = activeBatches(file);
  let gross = 0, packages = 0;
  for (const b of batches) {
    const pl = pickBatchPackingList(b);
    gross    += Number(b.gross_weight_kg) > 0 ? Number(b.gross_weight_kg) : (Number(pl?.total_gross_kg) || 0);
    packages += Number(b.packages) > 0 ? Number(b.packages) : (Number(pl?.total_reels) || 0);
  }
  const arrivals = batches.map(b => b.arrival_date).filter((d): d is string => !!d).sort();
  const uniq = (vals: (string | null | undefined)[]) =>
    [...new Set(vals.map(v => (v ?? '').trim()).filter(Boolean))].join(', ');
  return {
    gross,
    packages,
    arrivalLatest: arrivals.length ? arrivals[arrivals.length - 1] : '',
    bl: uniq(batches.map(b => b.bl_number)),
    septi: uniq(batches.map(b => b.septi_ref)),
    insuranceTr: uniq(batches.map(b => b.insurance_tr)),
    insuranceIr: uniq(batches.map(b => b.insurance_ir)),
  };
}
