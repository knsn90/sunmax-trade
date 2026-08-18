import { fN } from '@/lib/formatters';

/**
 * ADMT tutarlılık kontrolü.
 *
 * Sorun: aynı ADMT değeri teslimat (trade_files.delivered_admt), packing list
 * (packing_lists.total_admt), proforma ve fatura (quantity_admt) gibi birbirinden
 * kopuk yerlerde tutuluyordu; her belge kendi kopyasını serbestçe düzenleyebildiği
 * için tek dosyada 3-4 farklı ADMT oluşabiliyordu.
 *
 * Çözüm: TESLİMAT ADMT'si (delivered_admt) tek doğru kaynaktır. Diğer tüm belgelerin
 * ADMT'si buna eşit olmalıdır. Sapma varsa belge kaydedilmez.
 */

/** Kayan nokta / yuvarlama farklarını yut, gerçek sapmayı yakala (1 kg). */
export const ADMT_TOLERANCE = 0.001;

export interface AdmtCheck {
  /** Referans (teslimat) pozitif ve fark tolerans dışıysa true → kaydı engelle. */
  diverges: boolean;
  /** Karşılaştırma yapılabilir mi (teslimat ADMT'si girilmiş mi). */
  hasReference: boolean;
  reference: number; // teslimat ADMT'si (doğru kaynak)
  actual: number;    // belgenin ADMT'si
  diff: number;      // actual - reference (yuvarlanmış)
}

/**
 * Belgenin ADMT'sini teslimat ADMT'siyle karşılaştırır.
 * Teslimat ADMT'si (reference) girilmemişse (0/null) kontrol yapılmaz.
 */
export function checkAdmt(reference: number | null | undefined, actual: number): AdmtCheck {
  const ref = reference ?? 0;
  const act = actual ?? 0;
  const diff = Number((act - ref).toFixed(3));
  const hasReference = ref > 0;
  return {
    diverges: hasReference && Math.abs(diff) > ADMT_TOLERANCE,
    hasReference,
    reference: ref,
    actual: act,
    diff,
  };
}

/** Kullanıcıya gösterilecek uyarı metni (ör. packing list toplamı teslimattan farklıysa). */
export function admtWarningText(chk: AdmtCheck, docLabel = 'Bu belge'): string {
  const sign = chk.diff > 0 ? '+' : '';
  return (
    `ADMT uyuşmuyor — Teslimat: ${fN(chk.reference, 3)} · ${docLabel}: ${fN(chk.actual, 3)} ` +
    `(${sign}${fN(chk.diff, 3)} fark). Kaydetmeden önce satırları veya teslimat ADMT'sini düzeltin.`
  );
}
