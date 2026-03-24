/** Turkish plate regex: 01-81 il kodu + 1-3 harf + 2-4 rakam */
const TR_PLATE = /\b([0-9]{1,2})\s*[-\s]\s*([A-ZÇĞİÖŞÜa-zçğışöü]{1,3})\s*[-\s]\s*([0-9]{2,4})\b/g;

export function parsePlatesFromText(raw: string): string[] {
  const matches = [...raw.matchAll(TR_PLATE)];
  const seen = new Set<string>();
  const results: string[] = [];
  for (const m of matches) {
    const norm = `${m[1].padStart(2, '0')} ${m[2].toUpperCase()} ${m[3]}`;
    if (!seen.has(norm)) { seen.add(norm); results.push(norm); }
  }
  return results;
}
