/**
 * logoFetch.ts — API anahtarı gerektirmeyen logo çekici
 *
 * Kaynak önceliği:
 *  1. DuckDuckGo Instant Answer API  (ücretsiz, kayıtsız)
 *  2. Wikipedia REST API             (ücretsiz, kayıtsız)
 *  3. Clearbit Logo API              (ücretsiz, kayıtsız)
 *  4. Google Favicon yüksek çözünürlük (her zaman çalışır)
 *  5. DuckDuckGo Favicon             (yedek)
 */

function extractDomain(url: string): string | null {
  try {
    const withProto = url.startsWith('http') ? url : `https://${url}`;
    return new URL(withProto).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

async function probe(url: string, timeoutMs = 4000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    clearTimeout(t);
    return r.ok && (r.status < 400);
  } catch {
    return false;
  }
}

async function getJson<T>(url: string, timeoutMs = 6000): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json() as T;
  } catch {
    return null;
  }
}

// ─── 1. DuckDuckGo Instant Answer ───────────────────────────────────────────
// Büyük şirketler için Wikipedia infobox'tan logo/resim döndürür.
// Ayrıca AbstractURL üzerinden şirket domain'ini tahmin eder.
async function tryDuckDuckGo(name: string): Promise<{ imageUrl?: string; domain?: string } | null> {
  interface DDGResponse {
    Image?: string;
    AbstractURL?: string;
    Icon?: { URL?: string };
    RelatedTopics?: { Icon?: { URL?: string } }[];
  }

  const q = encodeURIComponent(name);
  const data = await getJson<DDGResponse>(
    `https://api.duckduckgo.com/?q=${q}&format=json&no_redirect=1&skip_disambig=1`,
  );
  if (!data) return null;

  const domain = data.AbstractURL ? extractDomain(data.AbstractURL) : undefined;

  // Doğrudan bir logo/resim varsa kullan
  const imageUrl = data.Image || data.Icon?.URL || undefined;

  if (imageUrl || domain) return { imageUrl: imageUrl || undefined, domain: domain || undefined };
  return null;
}

// ─── 2. Wikipedia REST API ───────────────────────────────────────────────────
// Şirketin Wikipedia sayfasındaki küçük resmi (logo/infobox görseli) döndürür.
async function tryWikipedia(name: string): Promise<string | null> {
  interface WikiSummary {
    thumbnail?: { source?: string };
    originalimage?: { source?: string };
    content_urls?: { desktop?: { page?: string } };
  }

  // Önce tam adla dene, sonra kısa adla
  for (const query of [name, name.split(/\s+/).slice(0, 2).join(' ')]) {
    const q = encodeURIComponent(query);
    const data = await getJson<WikiSummary>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${q}`,
    );
    const img = data?.thumbnail?.source || data?.originalimage?.source;
    if (img) return img;
  }
  return null;
}

// ─── 3. Domain → Logo kaynakları ────────────────────────────────────────────
async function logoFromDomain(domain: string): Promise<string | null> {
  const candidates = [
    `https://logo.clearbit.com/${domain}`,
    // Google Favicon yüksek çözünürlük (256px)
    `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=256`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=256`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  ];
  for (const url of candidates) {
    if (await probe(url)) return url;
  }
  return null;
}

// ─── 4. Clearbit Autocomplete (domain tahmini) ───────────────────────────────
async function clearbitDomain(name: string): Promise<string | null> {
  interface ClearbitSug { domain: string; logo: string }
  const q = encodeURIComponent(name.trim());
  const list = await getJson<ClearbitSug[]>(
    `https://autocomplete.clearbit.com/v1/companies/suggest?query=${q}`,
  );
  return list?.find(s => s.domain)?.domain ?? null;
}

// ─── Ana fonksiyon ───────────────────────────────────────────────────────────
/**
 * Şirket adı (ve varsa website) üzerinden logo URL'i döner.
 * Hiçbir API anahtarı gerekmez.
 */
export async function fetchCompanyLogo(
  name: string,
  website?: string | null,
): Promise<string | null> {
  const trimmedName = name.trim();
  if (!trimmedName) return null;

  // Website domain'i varsa direkt logo kaynağı dene
  if (website?.trim()) {
    const domain = extractDomain(website.trim());
    if (domain) {
      const url = await logoFromDomain(domain);
      if (url) return url;
    }
  }

  // DuckDuckGo — çoğu zaman tanınmış şirketlerde logo/domain döndürür
  const ddg = await tryDuckDuckGo(trimmedName);
  if (ddg?.imageUrl && await probe(ddg.imageUrl)) return ddg.imageUrl;
  if (ddg?.domain) {
    const url = await logoFromDomain(ddg.domain);
    if (url) return url;
  }

  // Wikipedia — infobox logosu (SVG/PNG)
  const wikiImg = await tryWikipedia(trimmedName);
  if (wikiImg && await probe(wikiImg)) return wikiImg;

  // Clearbit Autocomplete — domain tahmini
  const cbDomain = await clearbitDomain(trimmedName);
  if (cbDomain) {
    const url = await logoFromDomain(cbDomain);
    if (url) return url;
  }

  return null;
}

// ─── Toplu logo çekme ────────────────────────────────────────────────────────
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
      try { await patchFn(entity.id, url); fetched++; }
      catch { /* ignore */ }
    }
    onProgress?.({ done, total: targets.length, name: entity.name });
    await new Promise(r => setTimeout(r, 250)); // rate limit koruması
  }
  return fetched;
}
