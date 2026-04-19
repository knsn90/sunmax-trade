/**
 * companySearch.ts — Şirket bilgilerini ücretsiz API'lardan toplar
 * ve AI form doldurma için zengin bir metin bağlamı oluşturur.
 *
 * Hiçbir API anahtarı gerekmez.
 */

async function getJson<T>(url: string, timeoutMs = 6000): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Şirket adı (ve varsa website) için birden fazla ücretsiz kaynaktan
 * bilgi toplayarak AI prompt'una geçirilmek üzere zengin bir metin döndürür.
 *
 * Kaynaklar (paralel):
 *  1. DuckDuckGo Instant Answer — Wikipedia infobox özeti
 *  2. Wikipedia REST API — detaylı şirket özeti (HQ, ülke, sektör vb.)
 *  3. Clearbit Autocomplete — domain + resmi firma adı
 */
export async function getCompanyContext(
  name: string,
  website?: string | null,
): Promise<string> {
  const lines: string[] = [`Company name: ${name.trim()}`];
  if (website?.trim()) lines.push(`Website: ${website.trim()}`);

  interface DDGResult {
    Abstract?: string;
    AbstractURL?: string;
  }
  interface WikiResult {
    extract?: string;
  }
  interface ClearbitSug {
    name: string;
    domain: string;
  }

  const [ddgRes, wikiRes, cbRes] = await Promise.allSettled([
    getJson<DDGResult>(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(name)}&format=json&no_redirect=1&skip_disambig=1`,
    ),
    getJson<WikiResult>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`,
    ),
    getJson<ClearbitSug[]>(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(name.trim())}`,
    ),
  ]);

  // ── Clearbit — domain / resmi isim ────────────────────────────────────────
  if (cbRes.status === 'fulfilled' && cbRes.value?.[0]) {
    const top = cbRes.value[0];
    lines.push(`Official name: ${top.name}`);
    lines.push(`Domain: ${top.domain}`);
    if (!website?.trim()) lines.push(`Website: https://${top.domain}`);
  }

  // ── DuckDuckGo Abstract ───────────────────────────────────────────────────
  if (ddgRes.status === 'fulfilled' && ddgRes.value?.Abstract) {
    lines.push(`Summary: ${ddgRes.value.Abstract}`);
  }

  // ── Wikipedia özeti (en fazla 700 karakter) ───────────────────────────────
  if (wikiRes.status === 'fulfilled' && wikiRes.value?.extract) {
    lines.push(`Wikipedia: ${wikiRes.value.extract.slice(0, 700)}`);
  }

  return lines.join('\n');
}
