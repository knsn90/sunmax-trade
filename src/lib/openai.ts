import * as XLSX from 'xlsx';
import {
  getApiKeyFromCache,
  saveApiKeyToDb,
  deleteApiKeyFromDb,
} from '@/services/companySettingsService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OcrMode = 'transaction' | 'invoice' | 'proforma' | 'packing_list' | 'new_file';

export interface OcrResult {
  // Common
  date?: string;
  currency?: 'USD' | 'EUR' | 'TRY';
  // Transaction
  amount?: number;
  party_name?: string;
  description?: string;
  reference_no?: string;
  // Invoice / Proforma
  quantity_admt?: number;
  unit_price?: number;
  freight?: number;
  proforma_no?: string;
  cb_no?: string;
  insurance_no?: string;
  payment_terms?: string;
  incoterms?: string;
  // Proforma extra
  port_of_loading?: string;
  port_of_discharge?: string;
  country_of_origin?: string;
  // Packing list
  items?: Array<{
    vehicle_plate?: string;
    reels?: number;
    admt?: number;
    gross_weight_kg?: number;
  }>;
  // New File
  customer_id?: string;
  customer_name?: string;
  product_id?: string;
  product_name?: string;
  tonnage_mt?: number;
  file_date?: string;
  customer_ref?: string;
  notes?: string;
}

// ─── Storage (Supabase-backed, in-memory cache) ───────────────────────────────

export type ApiService = 'openai' | 'gemini' | 'anthropic';

// These are now thin wrappers around the companySettingsService cache.
// Keys are loaded from Supabase at app startup via loadCompanySettings().
export function getApiKey(service: ApiService): string {
  return getApiKeyFromCache(service);
}

export async function saveApiKey(service: ApiService, key: string): Promise<void> {
  await saveApiKeyToDb(service, key);
}

export async function deleteApiKey(service: ApiService): Promise<void> {
  await deleteApiKeyFromDb(service);
}

// Legacy compat
export function getOpenAIKey(): string { return getApiKey('openai'); }
export async function saveOpenAIKey(key: string): Promise<void> { await saveApiKey('openai', key); }

// ─── Prompts ─────────────────────────────────────────────────────────────────

const PROMPTS: Record<OcrMode, string> = {
  new_file: '',  // handled by smartfill.ts system prompt
  transaction: `Extract information from this invoice or financial document. Return ONLY a valid JSON object (omit fields not visible):
{
  "date": "YYYY-MM-DD",
  "amount": <total amount as number>,
  "currency": "USD" | "EUR" | "TRY",
  "party_name": "<vendor or customer name>",
  "description": "<brief description of goods/service>",
  "reference_no": "<invoice or reference number>"
}`,

  invoice: `Extract information from this commercial invoice. Return ONLY a valid JSON object (omit fields not visible):
{
  "date": "YYYY-MM-DD",
  "currency": "USD" | "EUR" | "TRY",
  "quantity_admt": <quantity in metric tons or ADMT as number>,
  "unit_price": <unit price per ton as number>,
  "freight": <freight cost as number, 0 if not present>,
  "incoterms": "<e.g. CPT, FOB>",
  "proforma_no": "<proforma or PI number>",
  "cb_no": "<customs or CB number>",
  "insurance_no": "<insurance number>",
  "payment_terms": "<payment terms text>"
}`,

  proforma: `Extract information from this proforma invoice. Return ONLY a valid JSON object (omit fields not visible):
{
  "date": "YYYY-MM-DD",
  "currency": "USD" | "EUR" | "TRY",
  "quantity_admt": <quantity in metric tons as number>,
  "unit_price": <unit price per ton as number>,
  "freight": <freight cost as number, 0 if not present>,
  "incoterms": "<e.g. CPT, FOB>",
  "port_of_loading": "<port name, country>",
  "port_of_discharge": "<port name, country>",
  "country_of_origin": "<country>",
  "payment_terms": "<payment terms text>"
}`,

  packing_list: `Extract information from this packing list. Return ONLY a valid JSON object (omit fields not visible):
{
  "date": "YYYY-MM-DD",
  "items": [
    {
      "vehicle_plate": "<truck plate or wagon number>",
      "reels": <number of reels/rolls as integer>,
      "admt": <ADMT or net weight in metric tons as number>,
      "gross_weight_kg": <gross weight in kg as number>
    }
  ]
}
Extract ALL rows from the table. Each row is one vehicle/truck/wagon.`,
};

// ─── File Converters ──────────────────────────────────────────────────────────

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}


function xlsxToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result as ArrayBuffer;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheets: string[] = [];
        workbook.SheetNames.forEach((name) => {
          const ws = workbook.Sheets[name];
          const csv = XLSX.utils.sheet_to_csv(ws);
          if (csv.trim()) sheets.push(`Sheet: ${name}\n${csv}`);
        });
        resolve(sheets.join('\n\n'));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// ─── Main OCR Function (Claude Vision API) ────────────────────────────────────

async function pdfToBase64Image(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const scale = 2.5;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.render({ canvasContext: ctx, viewport, canvas: canvas as any }).promise;
  return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
}

export async function ocrDocument(file: File, mode: OcrMode): Promise<OcrResult> {
  const apiKey = getApiKey('anthropic');
  if (!apiKey) {
    throw new Error('Claude API key not set. Please add it in Settings → API Keys.');
  }

  const prompt = PROMPTS[mode];
  const isExcel = /\.(xlsx|xls|csv)$/i.test(file.name);
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let messageContent: any;

  if (isExcel) {
    // Excel/CSV → plain text
    const text = await xlsxToText(file);
    messageContent = `${prompt}\n\nDocument content (CSV/Excel):\n${text}\n\nReturn ONLY the JSON object, no markdown fences.`;
  } else {
    // Image or PDF → base64 image
    let base64: string;
    let mimeType: string;
    if (isPdf) {
      base64 = await pdfToBase64Image(file);
      mimeType = 'image/jpeg';
    } else {
      base64 = await fileToBase64(file);
      mimeType = file.type || 'image/jpeg';
    }
    messageContent = [
      {
        type: 'image',
        source: { type: 'base64', media_type: mimeType, data: base64 },
      },
      {
        type: 'text',
        text: `${prompt}\n\nReturn ONLY the JSON object, no markdown fences.`,
      },
    ];
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: messageContent }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Claude API error ${response.status}`);
  }

  const data = await response.json() as { content?: Array<{ type: string; text?: string }> };
  const content = data.content?.find((c) => c.type === 'text')?.text ?? '{}';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse response from Claude');

  return JSON.parse(jsonMatch[0]) as OcrResult;
}
