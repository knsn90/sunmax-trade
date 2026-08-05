import { anthropicMessages } from './anthropic';
import type { PriceList } from '@/types/database';

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(entries: PriceList[], today: string): string {
  // Ürün bazında grupla
  const byProduct = new Map<string, PriceList[]>();
  for (const e of entries) {
    const key = e.product?.name ?? e.product_id;
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key)!.push(e);
  }

  const productLines: string[] = [];
  for (const [productName, items] of byProduct) {
    // Tarihe göre sırala — en yeni en üstte
    const sorted = [...items].sort((a, b) => b.price_date.localeCompare(a.price_date));

    // Para birimi normalize et (USD varsayım, not: basit karşılaştırma)
    const usdItems = sorted.filter(e => e.currency === 'USD');
    const cheapest = usdItems.length
      ? [...usdItems].sort((a, b) => a.price - b.price)[0]
      : null;

    // Süresi dolmuş fiyatlar
    const expired = sorted.filter(e => e.valid_until && e.valid_until < today);
    const expiringSoon = sorted.filter(e => {
      if (!e.valid_until || e.valid_until < today) return false;
      const daysLeft = Math.floor((new Date(e.valid_until).getTime() - Date.now()) / 86400000);
      return daysLeft <= 14;
    });

    const supplierLines = sorted.slice(0, 6).map(e => {
      const sup = (e.supplier as { name?: string } | null)?.name ?? 'Bilinmeyen';
      const expiredTag = e.valid_until && e.valid_until < today ? ' [SÜRESİ DOLMUŞ]' : '';
      const soonTag = expiringSoon.some(x => x.id === e.id) ? ' [14 gün içinde bitiyor]' : '';
      const cheapTag = cheapest && e.id === cheapest.id ? ' ★EN UCUZ' : '';
      return `    • ${sup}: ${e.price} ${e.currency} (${e.price_date})${expiredTag}${soonTag}${cheapTag}`;
    }).join('\n');

    productLines.push(
      `### ${productName} (${sorted.length} fiyat kaydı, ${expired.length} süresi dolmuş)`,
      supplierLines,
    );
  }

  const totalExpired = entries.filter(e => e.valid_until && e.valid_until < today).length;
  const uniqueSuppliers = new Set(entries.map(e => (e.supplier as { name?: string } | null)?.name ?? e.supplier_id)).size;
  const uniqueProducts = byProduct.size;

  return `Bugün: ${today}

ÖZET:
- Toplam fiyat kaydı: ${entries.length}
- Ürün çeşidi: ${uniqueProducts}
- Tedarikçi sayısı: ${uniqueSuppliers}
- Süresi dolmuş fiyat: ${totalExpired}

ÜRÜN-TEDARİKÇİ FİYAT MATRİSİ:
${productLines.join('\n')}

Yukarıdaki fiyat listesini analiz et. Şunları kapsa:

## En İyi Tedarikçi Önerileri
Her ürün için en uygun tedarikçiyi belirt (fiyat + geçerlilik tarihine göre).

## Dikkat Gerektiren Fiyatlar
- Süresi dolmuş veya dolmak üzere olan önemli fiyatlar
- Aynı ürün için tedarikçiler arası büyük fiyat farkları

## Fiyat Trendi & Pazar Yorumu
Ürün başına fiyat hareketleri: artış/düşüş var mı?

## Aksiyon Önerileri
2-3 somut adım: hangi tedarikçi güncellenmeli, hangi fiyat teklifi istenmeli vb.

Kısa, pratik ve Türkçe yaz. 350-450 kelime.`;
}

// ─── Streaming API çağrısı ────────────────────────────────────────────────────

export async function* streamPriceListAnalysis(entries: PriceList[]): AsyncGenerator<string> {
  const today = new Date().toISOString().slice(0, 10);

  const response = await anthropicMessages({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    stream: true,
    system: `Sen deneyimli bir tedarik zinciri ve satın alma uzmanısın.
Kullanıcının şirketi uluslararası ticaret yapıyor; hammadde/ürün alımı için birden fazla tedarikçiyle çalışıyor.
Analizini TÜRKÇE yaz. Markdown kullan: ## başlıklar, - maddeler, **kalın** önemli noktalar.
Gereksiz giriş cümlesi yazma — direkt analize geç.`,
    messages: [{ role: 'user', content: buildPrompt(entries, today) }],
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Claude API hatası: ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') return;
      try {
        const json = JSON.parse(raw) as {
          type: string;
          delta?: { type: string; text?: string };
        };
        if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
          yield json.delta.text ?? '';
        }
      } catch { /* geçersiz JSON satırı — atla */ }
    }
  }
}
