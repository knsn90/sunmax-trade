/**
 * Generate a trade file number.
 * Format: ESN-250317-MARIN-01
 */
export function generateFileNo(
  customerName: string,
  prefix: string,
  existingCount: number,
): string {
  const abbr = customerName
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 5) || 'FILE';
  const now = new Date();
  const yr = String(now.getFullYear()).slice(2);
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const dy = String(now.getDate()).padStart(2, '0');
  const seq = String(existingCount + 1).padStart(2, '0');
  return `${prefix}-${yr}${mo}${dy}-${abbr}-${seq}`;
}

// Words to skip when abbreviating product names
const PRODUCT_SKIP_WORDS = new Set(['pulp', 'paper', 'kraft', 'fiber', 'fibre', 'grade', 'board', 'fluff']);

// Known compound-word abbreviations
const PRODUCT_ABBREV_MAP: Record<string, string> = {
  eucalyptus: 'EUCA',
  softwood:   'SW',
  hardwood:   'HW',
  birch:      'BR',
  conifer:    'CON',
  acacia:     'ACA',
  bamboo:     'BAM',
  viscose:    'VISC',
  dissolving: 'DISS',
  bleached:   'BL',
  unbleached: 'UBL',
  fluff:      'FL',
  spandex:    'SPX',
  cotton:     'COT',
  polyester:  'PES',
};

/**
 * Abbreviate a product name for use in file numbers.
 * "UPM Eucalyptus Kraft Pulp" → "UPM EUCA"
 * "Domtar Fluff Pulp"         → "DOMTAR FL"
 * "UPM Softwood"              → "UPM SW"
 */
export function abbreviateProductName(name: string): string {
  const words = name.trim().split(/\s+/);
  const parts: string[] = [];

  for (const raw of words) {
    const lower = raw.toLowerCase();
    if (PRODUCT_SKIP_WORDS.has(lower)) continue;

    if (parts.length === 0) {
      // First significant word → keep in full
      parts.push(raw.toUpperCase());
    } else {
      // Subsequent words → abbreviate
      const mapped = PRODUCT_ABBREV_MAP[lower];
      if (mapped) {
        parts.push(mapped);
      } else if (raw.length <= 5) {
        parts.push(raw.toUpperCase().slice(0, 2));
      } else {
        parts.push(raw.toUpperCase().slice(0, 4));
      }
      break; // only one abbreviation after the brand
    }
  }

  return parts.join(' ');
}

/**
 * Generate a short customer code from the customer name.
 * "Arya Sivan Jam" → "ASJ"
 * "Paper and Board Trading" → "PBT"
 */
const NAME_SKIP = new Set(['and', 'co', 'co.', 'ltd', 'llc', 'inc', 'the', 'of', 'for', 'a', 'an', '&']);
export function generateCustomerCode(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(w => !NAME_SKIP.has(w.toLowerCase()))
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 4);
}

/**
 * Generate a trade file number.
 * Format: ASJ-01 26-04 UPM EUCA
 */
export function generateTradeFileNo(
  customerCode: string,
  sequenceNo: number,
  year: number,
  month: number,
  productName: string,
): string {
  const code = customerCode.trim().toUpperCase() || 'XX';
  const seq = String(sequenceNo).padStart(2, '0');
  const yy = String(year).slice(-2);
  const mon = String(month).padStart(2, '0');
  const prod = abbreviateProductName(productName);
  return `${code}-${seq} ${yy}-${mon}${prod ? ' ' + prod : ''}`;
}

/**
 * Generate an invoice number based on the trade file number.
 * Format: SUN [customerCode-seq yy-mon] INV  (product abbrev stripped for brevity)
 * Example: "ASJ-01 26-04 UPM EUCA" → "SUN ASJ-01 26-04 INV"
 */
export function formatInvoiceNo(fileNo: string): string {
  // fileNo format: "CODE-NN YY-MM PROD ABBREV"
  // Keep only the first two whitespace-separated tokens (code+seq and yy-mon)
  const tokens = fileNo.trim().split(/\s+/);
  const short = tokens.slice(0, 2).join(' ');
  return `SUN ${short} INV`;
}

/**
 * Generate a packing list number based on the trade file number.
 * Format: SUN CODE-NN YY-MM PL  (product abbrev stripped)
 * Example: "PB-10 26-06 IP" → "SUN PB-10 26-06 PL"
 */
export function formatPLNo(fileNo: string): string {
  const short = fileNo.trim().split(/\s+/).slice(0, 2).join(' ');
  return `SUN ${short} PL`;
}

/**
 * Generate a proforma invoice number based on the trade file number.
 * Format: SUN CODE-NN YY-MM PI  (product abbrev stripped)
 * Example: "ASJ-01 26-04 UPM EUCA" → "SUN ASJ-01 26-04 PI"
 */
export function formatProformaNo(fileNo: string): string {
  const short = fileNo.trim().split(/\s+/).slice(0, 2).join(' ');
  return `SUN ${short} PI`;
}
