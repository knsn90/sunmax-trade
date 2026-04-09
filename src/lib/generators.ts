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
 * Generate an invoice number from a database sequence value.
 * Format: ESN-INV-2503-001
 */
export function formatInvoiceNo(prefix: string, seqVal: number): string {
  const now = new Date();
  const yr = String(now.getFullYear()).slice(2);
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  return `${prefix}-INV-${yr}${mo}-${String(seqVal).padStart(3, '0')}`;
}

/**
 * Generate a packing list number from a database sequence value.
 * Format: ESN-PL-2503-001
 */
export function formatPLNo(prefix: string, seqVal: number): string {
  const now = new Date();
  const yr = String(now.getFullYear()).slice(2);
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  return `${prefix}-PL-${yr}${mo}-${String(seqVal).padStart(3, '0')}`;
}

/**
 * Generate a proforma invoice number from a database sequence value.
 * Format: ESN-PI-250317-01
 */
export function formatProformaNo(prefix: string, seqVal: number): string {
  const now = new Date();
  const yr = String(now.getFullYear()).slice(2);
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const dy = String(now.getDate()).padStart(2, '0');
  return `${prefix}-PI-${yr}${mo}${dy}-${String(seqVal).padStart(2, '0')}`;
}
