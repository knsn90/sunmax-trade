import { getApiKey } from './openai';
import { today } from './formatters';
import type { OcrMode, OcrResult } from './openai';

// ─── Turkish NLP Prompts ──────────────────────────────────────────────────────

const PROMPTS: Record<OcrMode, string> = {
  transaction: `Sen bir ticaret muhasebe asistanısın. Kullanıcının Türkçe açıklamasından işlem bilgilerini JSON formatında çıkar.

Çıkarılacak alanlar:
- date: tarih (YYYY-MM-DD, "bugün" → ${today()})
- amount: tutar (sayı, "bin beş yüz" → 1500)
- currency: para birimi (USD/EUR/TRY)
- party_name: karşı taraf adı
- description: açıklama
- reference_no: referans/fatura numarası

Kurallar:
- Sayı kelimelerini rakama çevir (bin→1000, yüz→100, elli→50, yirmi→20 vb.)
- Tarihleri YYYY-MM-DD formatına çevir
- Sadece metinde geçen alanları dahil et
- SADECE JSON döndür, başka açıklama ekleme`,

  invoice: `Sen bir ticaret formu asistanısın. Kullanıcının Türkçe açıklamasından com-invoice bilgilerini JSON formatında çıkar.

Çıkarılacak alanlar:
- date: tarih (YYYY-MM-DD, "bugün" → ${today()})
- quantity_admt: ADMT miktarı (sayı)
- unit_price: birim fiyat (sayı)
- currency: para birimi (USD/EUR/TRY, belirtilmezse USD)
- freight: navlun ücreti (sayı)
- payment_terms: ödeme koşulları
- incoterms: incoterms (CFR/FOB/CIF/DAP/EXW vb.)
- proforma_no: proforma numarası
- cb_no: CB/konşimento numarası
- insurance_no: sigorta numarası

Kurallar:
- Sayı kelimelerini rakama çevir (bin→1000, yüz→100 vb.)
- Tarihleri YYYY-MM-DD formatına çevir
- Sadece metinde geçen alanları dahil et
- SADECE JSON döndür`,

  proforma: `Sen bir ticaret formu asistanısın. Kullanıcının Türkçe açıklamasından proforma invoice bilgilerini JSON formatında çıkar.

Çıkarılacak alanlar:
- date: tarih (YYYY-MM-DD, "bugün" → ${today()})
- quantity_admt: ADMT miktarı (sayı)
- unit_price: birim fiyat (sayı)
- currency: para birimi (USD/EUR/TRY, belirtilmezse USD)
- freight: navlun ücreti (sayı)
- payment_terms: ödeme koşulları (örn: "60 days", "30 gün vadeli")
- port_of_loading: yükleme limanı
- port_of_discharge: varış limanı
- country_of_origin: menşei ülke
- incoterms: incoterms (CFR/FOB/CIF/DAP/EXW vb.)

Kurallar:
- Sayı kelimelerini rakama çevir (yüz elli→150, beş yüz→500 vb.)
- Tarihleri YYYY-MM-DD formatına çevir
- "gelecek ay" veya "önümüzdeki ay" gibi ifadeleri tarih olarak yorumla
- Sadece metinde geçen alanları dahil et
- SADECE JSON döndür`,

  packing_list: `Sen bir ticaret formu asistanısın. Kullanıcının Türkçe açıklamasından packing list bilgilerini JSON formatında çıkar.

Çıkarılacak alanlar:
- date: tarih (YYYY-MM-DD, "bugün" → ${today()})
- items: araç/konteyner listesi (dizi):
  Her öğe: { "vehicle_plate": "plaka", "reels": sayı, "admt": sayı, "gross_weight_kg": sayı }

Örnek girdi: "34ABC123 plakalı araç, 5 rulo, 12.5 ADMT, 14000 kg"
Örnek çıktı: {"items": [{"vehicle_plate": "34ABC123", "reels": 5, "admt": 12.5, "gross_weight_kg": 14000}]}

Kurallar:
- Plakalar boşluksuz yazılabilir, normalize etme
- Sayı kelimelerini rakama çevir
- Birden fazla araç varsa hepsini items dizisine ekle
- SADECE JSON döndür`,
};

// ─── API Call ─────────────────────────────────────────────────────────────────

export async function smartFillForm(text: string, mode: OcrMode): Promise<OcrResult> {
  const apiKey = getApiKey('anthropic');
  if (!apiKey) {
    throw new Error(
      'Anthropic (Claude) API key bulunamadı. Lütfen Ayarlar → Şirket → API Anahtarları bölümünden ekleyin.',
    );
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `${PROMPTS[mode]}\n\nKullanıcı girişi: "${text}"`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `API hatası: ${response.status}`);
  }

  const data = await response.json() as { content: Array<{ text: string }> };
  const content = data.content[0]?.text ?? '';

  // Extract JSON from response (Claude may wrap in backticks)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI yanıtı işlenemedi. Lütfen tekrar deneyin.');

  return JSON.parse(jsonMatch[0]) as OcrResult;
}

// ─── Field Labels for feedback ───────────────────────────────────────────────

export const FIELD_LABELS: Record<string, string> = {
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
