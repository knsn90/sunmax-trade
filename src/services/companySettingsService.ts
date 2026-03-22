import { supabase } from './supabase';

// ─── In-memory cache ─────────────────────────────────────────────────────────
// Keys are loaded from Supabase at app startup and cached here.
// This allows synchronous reads in OCR functions.

let cache: Record<string, string> = {};
let loaded = false;

export async function loadCompanySettings(): Promise<void> {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('setting_key, value');
    if (data) {
      cache = Object.fromEntries(data.map((r) => [r.setting_key, r.value]));
    }
    loaded = true;
  } catch {
    loaded = true; // don't block app if table not ready
  }
}

export function isSettingsLoaded(): boolean {
  return loaded;
}

// Synchronous read from cache
export function getCachedSetting(key: string): string {
  return cache[key] ?? '';
}

// Async save to Supabase + update cache
export async function saveSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ setting_key: key, value, updated_at: new Date().toISOString() }, { onConflict: 'setting_key' });
  if (error) throw new Error(error.message);
  cache[key] = value;
}

// Async delete from Supabase + update cache
export async function deleteSetting(key: string): Promise<void> {
  await supabase.from('app_settings').delete().eq('setting_key', key);
  delete cache[key];
}

// ─── API Key helpers ──────────────────────────────────────────────────────────

export type ApiService = 'openai' | 'anthropic' | 'gemini';

export function getApiKeyFromCache(service: ApiService): string {
  return getCachedSetting(`api_key_${service}`);
}

export async function saveApiKeyToDb(service: ApiService, key: string): Promise<void> {
  await saveSetting(`api_key_${service}`, key);
}

export async function deleteApiKeyFromDb(service: ApiService): Promise<void> {
  await deleteSetting(`api_key_${service}`);
}
