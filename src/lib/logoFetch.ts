/**
 * logoFetch.ts
 * Fetches company logos using Clearbit's free public APIs.
 *
 * - Clearbit Autocomplete: https://autocomplete.clearbit.com/v1/companies/suggest?query={name}
 *   Returns domain + logo URL. No API key required.
 * - Clearbit Logo API: https://logo.clearbit.com/{domain}
 *   If the entity has a website, use the domain directly.
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

/**
 * Fetch a company logo URL.
 * Priority: website domain → Clearbit name search
 * Returns null if nothing found.
 */
export async function fetchCompanyLogo(
  name: string,
  website?: string | null,
): Promise<string | null> {
  const signal = AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined;

  // 1. If website is provided, try Clearbit Logo API directly
  if (website?.trim()) {
    const domain = extractDomain(website.trim());
    if (domain) {
      try {
        const logoUrl = `https://logo.clearbit.com/${domain}`;
        const resp = await fetch(logoUrl, { method: 'HEAD', signal });
        if (resp.ok) return logoUrl;
      } catch { /* fall through */ }
    }
  }

  // 2. Search by company name using Clearbit Autocomplete
  const query = name.trim();
  if (!query) return null;
  try {
    const url = `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(query)}`;
    const resp = await fetch(url, { signal });
    if (!resp.ok) return null;
    const suggestions: ClearbitSuggestion[] = await resp.json();
    const best = suggestions.find(s => s.logo) ?? null;
    return best?.logo ?? null;
  } catch {
    return null;
  }
}

/**
 * Batch-fetch logos for a list of entities that have no logo yet.
 * Calls onProgress({ done, total, name }) after each item.
 * Returns the count of logos successfully fetched.
 */
export async function batchFetchLogos<T extends { id: string; name: string; logo_url?: string | null; website?: string | null }>(
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
    // Small delay to avoid rate-limiting
    await new Promise(r => setTimeout(r, 150));
  }
  return fetched;
}
