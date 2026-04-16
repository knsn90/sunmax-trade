/**
 * supabaseGuard — Supabase yanıtlarını güvenli şekilde işler.
 *
 * Supabase JS client, fetch isteği iptal edildiğinde (AbortError) veya
 * bazı hata durumlarında { data: null, error: null } döndürebilir.
 * Bu durumda servis katmanı null'ı geçerli cevap sanır ve useQuery
 * sonsuza loading durumunda kalır.
 *
 * Bu yardımcı her iki sorunu da yakalar:
 *   1. error varsa → throw
 *   2. data null ve error null → throw (abort / silent failure)
 */

interface SupabaseResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

export function guardOne<T>(result: SupabaseResult<T>, context = 'query'): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null || result.data === undefined) {
    throw new Error(`${context}: no data returned (request may have been aborted)`);
  }
  return result.data;
}

export function guardMany<T>(result: SupabaseResult<T[]>, context = 'query'): T[] {
  if (result.error) throw new Error(result.error.message);
  // null → abort/silent failure; empty array [] is a valid "no rows" result
  if (result.data === null || result.data === undefined) {
    throw new Error(`${context}: no data returned (request may have been aborted)`);
  }
  return result.data;
}
