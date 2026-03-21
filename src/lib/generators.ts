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
