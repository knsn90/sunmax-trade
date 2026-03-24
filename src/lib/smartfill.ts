import { getApiKey } from './openai';
import { today } from './formatters';
import type { OcrMode, OcrResult } from './openai';

// ─── Form context definitions ─────────────────────────────────────────────────

const FORM_CONTEXTS: Record<OcrMode, { name: string; fields: Record<string, string> }> = {
  new_file: {
    name: 'Yeni Ticaret Dosyası',
    fields: {
      customer_id:  'Müşteri ID — listeden eşleştir',
      product_id:   'Ürün ID — listeden eşleştir',
      tonnage_mt:   'Tonaj (sayı) — "yüz ton" → 100, "bin beş yüz" → 1500',
      file_date:    'Dosya tarihi (YYYY-MM-DD) — "bugün", "yarın" kabul edilir',
      customer_ref: 'Müşteri referans numarası',
      notes:        'Notlar',
    },
  },
  transaction: {
    name: 'Muhasebe İşlemi (Tahsilat / Ödeme / Fatura)',
    fields: {
      date:         'Tarih (YYYY-MM-DD) — "bugün", "yarın", "3 gün sonra" gibi ifadeler kabul edilir',
      amount:       'Tutar (sayı) — "bin beş yüz" → 1500',
      currency:     'Para birimi: USD, EUR veya TRY',
      party_name:   'Karşı taraf adı (müşteri veya tedarikçi firma adı)',
      description:  'İşlem açıklaması',
      reference_no: 'Referans numarası veya fatura numarası',
    },
  },
  invoice: {
    name: 'Com-Invoice (Ticari Fatura)',
    fields: {
      date:         'Fatura tarihi (YYYY-MM-DD)',
      quantity_admt:'Miktar ADMT (sayı)',
      unit_price:   'Ton başına birim fiyat (sayı)',
      currency:     'Para birimi: USD, EUR veya TRY (belirtilmezse USD)',
      freight:      'Navlun ücreti (sayı)',
      incoterms:    'Incoterms: CFR, FOB, CIF, DAP, EXW vb.',
      payment_terms:'Ödeme koşulları — örn: "60 days", "30 gün vadeli", "peşin"',
      proforma_no:  'Proforma numarası',
      cb_no:        'CB / konşimento numarası',
      insurance_no: 'Sigorta poliçe numarası',
    },
  },
  proforma: {
    name: 'Proforma Invoice',
    fields: {
      date:               'Proforma tarihi (YYYY-MM-DD)',
      quantity_admt:      'Miktar ADMT (sayı)',
      unit_price:         'Ton başına birim fiyat (sayı)',
      currency:           'Para birimi: USD, EUR veya TRY (belirtilmezse USD)',
      freight:            'Navlun ücreti (sayı)',
      incoterms:          'Incoterms: CFR, FOB, CIF, DAP, EXW vb.',
      payment_terms:      'Ödeme koşulları',
      port_of_loading:    'Yükleme limanı (şehir/liman adı)',
      port_of_discharge:  'Boşaltma/varış limanı',
      country_of_origin:  'Menşei ülke',
    },
  },
  packing_list: {
    name: 'Packing List (Ambalaj Listesi)',
    fields: {
      date:  'Packing list tarihi (YYYY-MM-DD)',
      items: `Araç/konteyner listesi — her satır için:
        vehicle_plate: Araç plakası
        reels:         Rulo sayısı
        admt:          ADMT miktarı
        gross_weight_kg: Brüt ağırlık (kg)`,
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
    ? `\nMEVCUT FORM DURUMU (dolu alanlar):\n${JSON.stringify(currentValues, null, 2)}\n`
    : '';

  // Extra context block for new_file (customer & product lists)
  let contextStr = '';
  if (mode === 'new_file') {
    const customers = (context.customers as Array<{ id: string; name: string }>) ?? [];
    const products  = (context.products  as Array<{ id: string; name: string }>) ?? [];
    contextStr = `
MÜŞTERİ LİSTESİ (customer_id → isim):
${customers.map(c => `  ${c.id} → ${c.name}`).join('\n') || '  (boş)'}

ÜRÜN LİSTESİ (product_id → isim):
${products.map(p => `  ${p.id} → ${p.name}`).join('\n') || '  (boş)'}

Kullanıcının söylediği müşteri adını yukarıdaki listeden en yakın eşleşmeyle bul, customer_id olarak o UUID'yi döndür. Aynısını ürün için yap.
customer_name ve product_name alanlarını da döndür (okunabilirlik için).
`;
  }

  return `Sen SunPlus ticaret yönetim sisteminin akıllı form asistanısın.
Kullanıcı şu an "${ctx.name}" formunu dolduruyor.
Bugünün tarihi: ${today()}
${currentStr}${contextStr}
DOLDURULACAK ALANLAR:
${fieldList}

GÖREVIN:
Kullanıcının Türkçe isteğini anlayarak uygun alanları JSON olarak döndür.

KURALLAR:
- Tamamen doğal Türkçe konuşmayı anlarsın
- Sayı kelimelerini rakama çevir: "yüz elli" → 150, "bin" → 1000, "iki buçuk" → 2.5
- Tarih ifadelerini çevir: "bugün" → ${today()}, "yarın" → ileri tarih, "önümüzdeki Pazartesi" vb.
- Sadece kullanıcının bahsettiği alanları dahil et — diğerlerini atlat
- Eğer kullanıcı mevcut bir alanı değiştirmek istiyorsa yeni değeri ver
- incoterms büyük harf olmalı (cif → CIF, cfr → CFR)
- currency büyük harf olmalı (usd → USD)
- Anlaşılmayan veya eksik bilgileri dahil etme
- SADECE geçerli bir JSON objesi döndür, başka hiçbir şey yazma
- Yanıt şu formatta olacak: {"alan1": değer1, "alan2": değer2, ...}`;
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
      'Anthropic (Claude) API key bulunamadı. Lütfen Ayarlar → API Anahtarları bölümünden ekleyin.',
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
    throw new Error(err.error?.message ?? `API hatası: ${response.status}`);
  }

  const data = await response.json() as { content: Array<{ text: string }> };
  const content = data.content[0]?.text ?? '';

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI yanıtı işlenemedi. Lütfen daha açık bir şekilde tekrar deneyin.');

  return JSON.parse(jsonMatch[0]) as OcrResult;
}

// ─── Field Labels for feedback ───────────────────────────────────────────────

export const FIELD_LABELS: Record<string, string> = {
  // new_file
  customer_name: 'Müşteri',
  product_name:  'Ürün',
  tonnage_mt:    'Tonaj (MT)',
  file_date:     'Tarih',
  customer_ref:  'Müşteri Ref',
  notes:         'Notlar',
  // common
  date: 'Tarih',
  amount: 'Tutar',
  currency: 'Para Birimi',
  party_name: 'Taraf',
  description: 'Açıklama',
  reference_no: 'Referans No',
  quantity_admt: 'Miktar (ADMT)',
  unit_price: 'Birim Fiyat',
  freight: 'Navlun',
  payment_terms: 'Ödeme Koşulları',
  incoterms: 'Incoterms',
  proforma_no: 'Proforma No',
  cb_no: 'CB No',
  insurance_no: 'Sigorta No',
  port_of_loading: 'Yükleme Limanı',
  port_of_discharge: 'Varış Limanı',
  country_of_origin: 'Menşei Ülke',
  items: 'Araç Listesi',
};
