import * as XLSX from 'xlsx';

// ─── Packing List ────────────────────────────────────────────────────────────

export interface PLImportRow {
  vehicle_plate: string;
  reels: number;
  admt: number;
  gross_weight_kg: number;
}

/**
 * Parse an Excel file and extract Packing List vehicle rows.
 * Expected columns (flexible, case-insensitive):
 *   Plate/TIR/Araç | Reels/Bobbin | ADMT | Gross/Brüt/KG
 */
export async function parsePLExcel(file: File): Promise<PLImportRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  if (!raw.length) return [];

  const headers = Object.keys(raw[0]);
  const find = (patterns: RegExp) =>
    headers.find((h) => patterns.test(h)) ?? headers[0];

  const plateKey = find(/plate|tir|araç|plaka/i);
  const reelsKey = find(/reel|bobbin/i);
  const admtKey  = find(/admt/i);
  const grossKey = find(/gross|brüt|kg/i);

  return raw
    .map((row) => ({
      vehicle_plate: String(row[plateKey] ?? '').trim(),
      reels:         Number(row[reelsKey]) || 0,
      admt:          Number(row[admtKey])  || 0,
      gross_weight_kg: Number(row[grossKey]) || 0,
    }))
    .filter((r) => r.vehicle_plate !== '' || r.admt > 0);
}

/** Download an Excel template for Packing List import */
export function downloadPLTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['TIR No / Plate', 'Reels', 'ADMT', 'Gross (KG)'],
    ['04AAE583 / 04AAZ457', 10, 23.5, 25000],
    ['', '', '', ''],
  ]);
  ws['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Packing List');
  XLSX.writeFile(wb, 'packing-list-import-template.xlsx');
}

// ─── Invoice ─────────────────────────────────────────────────────────────────

export interface InvoiceImportData {
  quantity_admt?: number;
  unit_price?: number;
  freight?: number;
  gross_weight_kg?: number;
  proforma_no?: string;
  cb_no?: string;
  insurance_no?: string;
  payment_terms?: string;
  packing_info?: string;
}

/**
 * Parse an Excel file for Invoice data.
 * Expected format: row 1 = headers, row 2 = values.
 */
export async function parseInvoiceExcel(file: File): Promise<InvoiceImportData> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as unknown[][];

  if (rows.length < 2) return {};

  const headers = (rows[0] as string[]).map((h) => String(h).toLowerCase().trim());
  const values  = rows[1] as unknown[];
  const result: InvoiceImportData = {};

  headers.forEach((h, i) => {
    const v = values[i];
    if (/qty|quantity|admt/.test(h))    result.quantity_admt   = Number(v) || undefined;
    else if (/unit.*price|price/.test(h)) result.unit_price     = Number(v) || undefined;
    else if (/freight/.test(h))           result.freight         = Number(v) || undefined;
    else if (/gross/.test(h))             result.gross_weight_kg = Number(v) || undefined;
    else if (/proforma/.test(h))          result.proforma_no     = String(v || '');
    else if (/cb/.test(h))                result.cb_no           = String(v || '');
    else if (/insurance/.test(h))         result.insurance_no    = String(v || '');
    else if (/payment/.test(h))           result.payment_terms   = String(v || '');
    else if (/packing/.test(h))           result.packing_info    = String(v || '');
  });

  return result;
}

/** Download an Excel template for Invoice import */
export function downloadInvoiceTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Quantity (ADMT)', 'Unit Price', 'Freight', 'Gross (KG)', 'Proforma No', 'CB No', 'Insurance No', 'Payment Terms', 'Packing Info'],
    [0, 0, 0, 0, '', '', '', '', ''],
  ]);
  ws['!cols'] = [
    { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Invoice');
  XLSX.writeFile(wb, 'invoice-import-template.xlsx');
}

// ─── Proforma ─────────────────────────────────────────────────────────────────

export interface ProformaImportData {
  quantity_admt?: number;
  unit_price?: number;
  freight?: number;
  net_weight_kg?: number;
  gross_weight_kg?: number;
  buyer_commercial_id?: string;
  port_of_discharge?: string;
  payment_terms?: string;
  hs_code?: string;
}

/**
 * Parse an Excel file for Proforma data.
 * Expected format: row 1 = headers, row 2 = values.
 */
export async function parseProformaExcel(file: File): Promise<ProformaImportData> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as unknown[][];

  if (rows.length < 2) return {};

  const headers = (rows[0] as string[]).map((h) => String(h).toLowerCase().trim());
  const values  = rows[1] as unknown[];
  const result: ProformaImportData = {};

  headers.forEach((h, i) => {
    const v = values[i];
    if (/qty|quantity|admt/.test(h))      result.quantity_admt       = Number(v) || undefined;
    else if (/unit.*price|price/.test(h)) result.unit_price           = Number(v) || undefined;
    else if (/freight/.test(h))           result.freight               = Number(v) || undefined;
    else if (/net.*weight|net/.test(h))   result.net_weight_kg         = Number(v) || undefined;
    else if (/gross/.test(h))             result.gross_weight_kg       = Number(v) || undefined;
    else if (/buyer|commercial/.test(h))  result.buyer_commercial_id   = String(v || '');
    else if (/discharge|pod/.test(h))     result.port_of_discharge     = String(v || '');
    else if (/payment/.test(h))           result.payment_terms         = String(v || '');
    else if (/hs.*code|hs/.test(h))       result.hs_code               = String(v || '');
  });

  return result;
}

/** Download an Excel template for Proforma import */
export function downloadProformaTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Quantity (ADMT)', 'Unit Price', 'Freight', 'Net Weight (KG)', 'Gross Weight (KG)', 'Buyer Commercial ID', 'Port of Discharge', 'Payment Terms', 'HS Code'],
    [0, 0, 0, 0, 0, '', '', '', '470321'],
  ]);
  ws['!cols'] = [
    { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 18 },
    { wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Proforma');
  XLSX.writeFile(wb, 'proforma-import-template.xlsx');
}
