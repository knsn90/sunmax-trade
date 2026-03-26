import { getApiKey } from './openai';
import { today } from './formatters';
import type { OcrMode, OcrResult } from './openai';

// ─── Form context definitions ─────────────────────────────────────────────────

const FORM_CONTEXTS: Record<OcrMode, { name: string; fields: Record<string, string> }> = {
  new_file: {
    name: 'New Trade File',
    fields: {
      customer_id:  'Customer ID — match from list',
      product_id:   'Product ID — match from list',
      tonnage_mt:   'Tonnage (number) — e.g. "150" or "one thousand five hundred" → 1500',
      file_date:    'File date (YYYY-MM-DD) — "today", "tomorrow" accepted',
      customer_ref: 'Customer reference number',
      notes:        'Notes',
    },
  },
  transaction: {
    name: 'Accounting Transaction (Receipt / Payment / Invoice)',
    fields: {
      date:         'Date (YYYY-MM-DD) — expressions like "today", "tomorrow", "in 3 days" accepted',
      amount:       'Amount (number) — e.g. "fifteen hundred" → 1500',
      currency:     'Currency: USD, EUR or TRY',
      party_name:   'Counterparty name (customer or supplier company name)',
      description:  'Transaction description',
      reference_no: 'Reference number or invoice number',
    },
  },
  invoice: {
    name: 'Commercial Invoice',
    fields: {
      date:         'Invoice date (YYYY-MM-DD)',
      quantity_admt:'Quantity ADMT (number)',
      unit_price:   'Unit price per ton (number)',
      currency:     'Currency: USD, EUR or TRY (default USD)',
      freight:      'Freight cost (number)',
      incoterms:    'Incoterms: CFR, FOB, CIF, DAP, EXW etc.',
      payment_terms:'Payment terms — e.g. "60 days", "30 days net", "prepaid"',
      proforma_no:  'Proforma number',
      cb_no:        'CB / bill of lading number',
      insurance_no: 'Insurance policy number',
    },
  },
  proforma: {
    name: 'Proforma Invoice',
    fields: {
      date:               'Proforma date (YYYY-MM-DD)',
      quantity_admt:      'Quantity ADMT (number)',
      unit_price:         'Unit price per ton (number)',
      currency:           'Currency: USD, EUR or TRY (default USD)',
      freight:            'Freight cost (number)',
      incoterms:          'Incoterms: CFR, FOB, CIF, DAP, EXW etc.',
      payment_terms:      'Payment terms',
      port_of_loading:    'Port of loading (city/port name)',
      port_of_discharge:  'Port of discharge / destination port',
      country_of_origin:  'Country of origin',
    },
  },
  packing_list: {
    name: 'Packing List',
    fields: {
      date:  'Packing list date (YYYY-MM-DD)',
      items: `Vehicle/container list — for each entry:
        vehicle_plate: Truck plate number
        reels:         Number of reels
        admt:          ADMT quantity
        gross_weight_kg: Gross weight (kg)`,
    },
  },
};

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(mode: OcrMode, currentValues: Record<string, unknown> = {}, context: Record<string, unknown> = {}): string {
  const ctx = FORM_CONTEXTS[mode];
  const fieldList = Object.entries(ctx.fields)
    .map(([k, v]) => `  • ${k}: ${v}`)
    .join('\n');

  const currentStr = Object.keys(currentValues).length > 0
    ? `\nCURRENT FORM STATE (already filled fields):\n${JSON.stringify(currentValues, null, 2)}\n`
    : '';

  // Extra context block for new_file (customer & product lists)
  let contextStr = '';
  if (mode === 'new_file') {
    const customers = (context.customers as Array<{ id: string; name: string }>) ?? [];
    const products  = (context.products  as Array<{ id: string; name: string }>) ?? [];
    contextStr = `
CUSTOMER LIST (customer_id → name):
${customers.map(c => `  ${c.id} → ${c.name}`).join('\n') || '  (empty)'}

PRODUCT LIST (product_id → name):
${products.map(p => `  ${p.id} → ${p.name}`).join('\n') || '  (empty)'}

Match the customer name the user mentioned to the closest entry above and return that UUID as customer_id. Do the same for product_id.
Also return customer_name and product_name for readability.
`;
  }

  return `You are the smart form assistant for the SunPlus trade management system.
The user is currently filling in the "${ctx.name}" form.
Today's date: ${today()}
${currentStr}${contextStr}
FIELDS TO FILL:
${fieldList}

YOUR TASK:
Understand the user's request and return the appropriate fields as JSON.

RULES:
- Understand natural language in any language
- Convert number words to digits: "one fifty" → 150, "one thousand" → 1000, "two and a half" → 2.5
- Convert date expressions: "today" → ${today()}, "tomorrow" → next day, "next Monday" etc.
- Only include fields the user mentioned — skip the rest
- If the user wants to change an existing field, provide the new value
- incoterms must be uppercase (cif → CIF, cfr → CFR)
- currency must be uppercase (usd → USD)
- Do not include unclear or missing information
- Return ONLY a valid JSON object, nothing else
- Response format: {"field1": value1, "field2": value2, ...}`;
}

// ─── Conversation message type ────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── API Call ─────────────────────────────────────────────────────────────────

export async function smartFillForm(
  text: string,
  mode: OcrMode,
  currentValues: Record<string, unknown> = {},
  history: ChatMessage[] = [],
  context: Record<string, unknown> = {},
): Promise<OcrResult> {
  const apiKey = getApiKey('anthropic');
  if (!apiKey) {
    throw new Error(
      'Anthropic API key not found. Please add it in Settings → API Keys.',
    );
  }

  // Build conversation: history + new user message
  const messages: ChatMessage[] = [
    ...history,
    { role: 'user', content: text },
  ];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: buildSystemPrompt(mode, currentValues, context),
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `API error: ${response.status}`);
  }

  const data = await response.json() as { content: Array<{ text: string }> };
  const content = data.content[0]?.text ?? '';

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse AI response. Please try again with a clearer description.');

  return JSON.parse(jsonMatch[0]) as OcrResult;
}

// ─── Field Labels for feedback ───────────────────────────────────────────────

export const FIELD_LABELS: Record<string, string> = {
  // new_file
  customer_name: 'Customer',
  product_name:  'Product',
  tonnage_mt:    'Tonnage (MT)',
  file_date:     'Date',
  customer_ref:  'Customer Ref',
  notes:         'Notes',
  // common
  date: 'Date',
  amount: 'Amount',
  currency: 'Currency',
  party_name: 'Party',
  description: 'Description',
  reference_no: 'Reference No',
  quantity_admt: 'Quantity (ADMT)',
  unit_price: 'Unit Price',
  freight: 'Freight',
  payment_terms: 'Payment Terms',
  incoterms: 'Incoterms',
  proforma_no: 'Proforma No',
  cb_no: 'CB No',
  insurance_no: 'Insurance No',
  port_of_loading: 'Port of Loading',
  port_of_discharge: 'Port of Discharge',
  country_of_origin: 'Country of Origin',
  items: 'Vehicle List',
};
