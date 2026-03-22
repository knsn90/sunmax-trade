import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OcrMode = 'transaction' | 'invoice' | 'proforma' | 'packing_list';

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
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const GEMINI_KEY_STORAGE = 'sunmax_gemini_key';

export function getOpenAIKey(): string {
  return localStorage.getItem(GEMINI_KEY_STORAGE) ?? '';
}

export function saveOpenAIKey(key: string): void {
  localStorage.setItem(GEMINI_KEY_STORAGE, key.trim());
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

const PROMPTS: Record<OcrMode, string> = {
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

function fileToBase64Binary(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const ab = e.target?.result as ArrayBuffer;
      const bytes = new Uint8Array(ab);
      let binary = '';
      bytes.forEach((b) => (binary += String.fromCharCode(b)));
      resolve(btoa(binary));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
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

// ─── Main OCR Function ────────────────────────────────────────────────────────

const GEMINI_MODEL = 'gemini-1.5-flash';

export async function ocrDocument(file: File, mode: OcrMode): Promise<OcrResult> {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    throw new Error('Gemini API key not set. Please add it in Settings → Company → API Keys.');
  }

  const prompt = PROMPTS[mode];
  const isExcel = /\.(xlsx|xls|csv)$/i.test(file.name);
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isWord = /\.(docx|doc)$/i.test(file.name);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parts: any[];

  if (isExcel) {
    // Excel → CSV text
    const text = await xlsxToText(file);
    parts = [
      { text: `${prompt}\n\nDocument content (CSV format):\n${text}\n\nReturn ONLY the JSON object, no markdown fences.` },
    ];
  } else if (isWord) {
    // Word → send as binary inline_data
    const base64 = await fileToBase64Binary(file);
    parts = [
      { text: `${prompt}\n\nReturn ONLY the JSON object, no markdown fences.` },
      { inline_data: { mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: base64 } },
    ];
  } else if (isPdf) {
    // PDF → Gemini reads natively, no conversion needed
    const base64 = await fileToBase64Binary(file);
    parts = [
      { text: `${prompt}\n\nReturn ONLY the JSON object, no markdown fences.` },
      { inline_data: { mime_type: 'application/pdf', data: base64 } },
    ];
  } else {
    // Image
    const base64 = await fileToBase64(file);
    parts = [
      { text: `${prompt}\n\nReturn ONLY the JSON object, no markdown fences.` },
      { inline_data: { mime_type: file.type, data: base64 } },
    ];
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.1 },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Gemini API error ${response.status}`);
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse response from Gemini');

  return JSON.parse(jsonMatch[0]) as OcrResult;
}
