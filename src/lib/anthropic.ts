import { supabase } from '@/services/supabase';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/anthropic-proxy`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/**
 * Anthropic Messages API'yi Supabase Edge Function proxy üzerinden çağırır.
 * API anahtarı sunucuda (secret) durur, client'a HİÇ inmez.
 *
 * Anthropic /v1/messages ile AYNI Response'u döndürür (status + gövde aynen
 * iletilir) → çağrı noktalarındaki `response.ok` / `response.json()` işleyişi
 * değişmeden kalır.
 *
 * @param body Anthropic /v1/messages gövdesi: { model, max_tokens, messages, ... }
 */
export async function anthropicMessages(body: unknown): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Edge function verify_jwt=true → giriş yapmış kullanıcının token'ı gerekli
      Authorization: `Bearer ${session?.access_token ?? ANON}`,
      apikey: ANON,
    },
    body: JSON.stringify(body),
  });
}
