import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables. ' +
    'Create a .env file with these values from your Supabase project settings.'
  );
}

/**
 * Custom fetch with timeout — SADECE data (PostgREST) isteklerine uygulanır.
 *
 * Neden auth hariç tutuldu:
 *   Supabase'in token refresh mekanizması /auth/v1/ endpoint'ini kullanır.
 *   Bu isteğe timeout uygularsak Supabase'in iç retry/refresh mantığı bozulur
 *   → session expire olunca tüm sonraki istekler silent fail eder.
 *
 * AbortSignal.any() neden kullanılmıyor:
 *   Bazı Supabase iç operasyonları zaten aborted olan bir signal ile
 *   init.signal gönderir. AbortSignal.any() bu durumda hemen aborted bir
 *   signal döndürür → fetch başlamadan iptal olur → promise hiç settle etmez
 *   → button/loading sonsuza asılı kalır.
 *   Bunun yerine caller signal'ini dinleyip kendi controller'ımızı abort ediyoruz.
 */
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);

  // Auth istekleri: hiç dokunma, Supabase kendi yönetsin
  if (url.includes('/auth/v1/')) {
    return fetch(input, init);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  // Caller'ın signal'ini dinle ama AbortSignal.any() kullanma
  if (init?.signal) {
    // Eğer zaten aborted ise hemen abort et
    if (init.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      init.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        controller.abort();
      }, { once: true });
    }
  }

  return fetch(input, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: fetchWithTimeout,
  },
});
