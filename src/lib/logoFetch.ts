/**
 * logoFetch.ts
 * Fetches company logos — no API key required anywhere.
 *
 * Kaynak önceliği (sırayla denenir, ilk çalışan döner):
 *  1. Clearbit Logo API   — logo.clearbit.com/{domain}
 *  2. Google Favicon API  — www.google.com/s2/favicons?domain=...&sz=256
 *  3. DuckDuckGo Favicon  — icons.duckduckgo.com/ip3/{domain}.ico
 *
 * Domain bulma (website yoksa):
 *  a. Clearbit Autocomplete (ücretsiz, kayıtsız)
 *  b. Brandfetch herkese açık arama
 */

interface ClearbitSuggestion {
  name: string;
  domain: string;
  logo: string;
}

function extractDomain(url: string): string | null {
  try {
    const withProto = url.startsWith('http') ? url : `https://${url}`;
    return new URL(withProto).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Belirtilen URL'den HEAD isteği ile logo var mı diye kontrol et */
async function probe(url: string, timeoutMs = 4000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Belirli bir domain için en iyi logo URL'ini döner.
 * Önce Clearbit, ardından Google Favicon, ardından DuckDuckGo.
 */
async function logoFromDomain(domain: string): Promise<string | null> {
  const candidates = [
    `https://logo.clearbit.com/${domain}`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=256`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  ];
  for (const url of candidates) {
    if (await probe(url)) return url;
  }
  return null;
}

/**
 * Şirket adından domain bulmaya çalışır.
 * Clearbit Autocomplete önce denenir, sonra Brandfetch.
 */
async function domainFromName(name: string): Promise<string | null> {
  const q = encodeURIComponent(name.trim());

  // 1. Clearbit Autocomplete (ücretsiz, kayıt gerekmez)
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${q}`,
      { signal: ctrl.signal },
    );
    if (r.ok) {
      const list: ClearbitSuggestion[] = await r.json();
      const hit = list.find(s => s.domain);
      if (hit?.domain) return hit.domain;
    }
  } catch { /* fall through */ }

  // 2. Brandfetch genel arama (kayıt gerekmez)
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(
      `https://api.brandfetch.io/v2/search?query=${q}`,
      { signal: ctrl.signal },
    );
    if (r.ok) {
      const data = await r.json();
      // yanıt biçimi: [{ domain: "...", ... }]
      const hit = Array.isArray(data) ? data.find((d: { domain?: string }) => d.domain) : null;
      if (hit?.domain) return hit.domain;
    }
  } catch { /* fall through */ }

  return null;
}

/**
 * Şirket logosu URL'ini döner.
 * website varsa domain oradan çıkarılır; yoksa ad üzerinden aranır.
 * Hiçbir şey bulunamazsa null döner.
 */
export async function fetchCompanyLogo(
  name: string,
  website?: string | null,
): Promise<string | null> {
  // 1. Website üzerinden dene
  if (website?.trim()) {
    const domain = extractDomain(website.trim());
    if (domain) {
      const url = await logoFromDomain(domain);
      if (url) return url;
    }
  }

  // 2. İsimden domain bul, sonra logoya dön
  const query = name.trim();
  if (!query) return null;

  const domain = await domainFromName(query);
  if (domain) {
    const url = await logoFromDomain(domain);
    if (url) return url;
  }

  // 3. Son çare: sadece Google Favicon ile isimden direkt dene
  // (domain tahmini: "UPM Pulp" → "upm.com")
  const guessedDomain = query.split(/\s+/)[0].toLowerCase() + '.com';
  const fallback = `https://www.google.com/s2/favicons?domain=${guessedDomain}&sz=256`;
  if (await probe(fallback)) return fallback;

  return null;
}

/**
 * Logosu olmayan firmalar için toplu logo çekme.
 * Her item işlenince onProgress çağrılır.
 * Başarıyla çekilen logo sayısını döner.
 */
export async function batchFetchLogos<T extends {
  id: string;
  name: string;
  logo_url?: string | null;
  website?: string | null;
}>(
  entities: T[],
  patchFn: (id: string, url: string) => Promise<void>,
  onProgress?: (state: { done: number; total: number; name: string }) => void,
): Promise<number> {
  const targets = entities.filter(e => !e.logo_url);
  let done = 0;
  let fetched = 0;
  for (const entity of targets) {
    const url = await fetchCompanyLogo(entity.name, entity.website);
    done++;
    if (url) {
      try {
        await patchFn(entity.id, url);
        fetched++;
      } catch { /* ignore individual errors */ }
    }
    onProgress?.({ done, total: targets.length, name: entity.name });
    // Rate limit'e takılmamak için küçük bekleme
    await new Promise(r => setTimeout(r, 200));
  }
  return fetched;
}
