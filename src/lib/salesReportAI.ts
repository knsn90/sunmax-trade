import { anthropicMessages } from './anthropic';
import type { TradeFile } from '@/types/database';

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(files: TradeFile[], today: string): string {
  const fmtN = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtK = (n: number) => `$${(n / 1000).toFixed(1)}K`;

  // Özet KPI
  const totalFiles = files.length;
  const totalAdmt = files.reduce((s, f) => s + (f.delivered_admt ?? f.tonnage_mt ?? 0), 0);
  const totalRevenue = files.reduce((s, f) => {
    const q = f.delivered_admt ?? f.tonnage_mt ?? 0;
    return s + q * (f.selling_price ?? 0);
  }, 0);
  const totalCost = files.reduce((s, f) => {
    const q = f.delivered_admt ?? f.tonnage_mt ?? 0;
    return s + q * (f.purchase_price ?? 0);
  }, 0);
  const totalProfit = totalRevenue - totalCost;
  const marginPct = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0.0';

  // Durum dağılımı
  const byStatus: Record<string, number> = {};
  for (const f of files) byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
  const statusLines = Object.entries(byStatus)
    .map(([s, n]) => `  ${s}: ${n} dosya`)
    .join('\n');

  // Müşteri bazında
  const byCustomer: Record<string, { files: number; admt: number; rev: number; cost: number }> = {};
  for (const f of files) {
    const name = (f.customer as { name?: string } | null)?.name ?? 'Bilinmeyen';
    if (!byCustomer[name]) byCustomer[name] = { files: 0, admt: 0, rev: 0, cost: 0 };
    const q = f.delivered_admt ?? f.tonnage_mt ?? 0;
    byCustomer[name].files++;
    byCustomer[name].admt += q;
    byCustomer[name].rev += q * (f.selling_price ?? 0);
    byCustomer[name].cost += q * (f.purchase_price ?? 0);
  }
  const custLines = Object.entries(byCustomer)
    .sort((a, b) => b[1].rev - a[1].rev)
    .slice(0, 10)
    .map(([name, d]) => {
      const margin = d.rev > 0 ? (((d.rev - d.cost) / d.rev) * 100).toFixed(1) : '0.0';
      return `  ${name}: ${d.files} dosya | ${fmtN(d.admt)} ADMT | Ciro: ${fmtK(d.rev)} | Marj: %${margin}`;
    })
    .join('\n');

  // Ürün bazında
  const byProduct: Record<string, { files: number; admt: number; rev: number }> = {};
  for (const f of files) {
    const name = (f.product as { name?: string } | null)?.name ?? 'Bilinmeyen';
    if (!byProduct[name]) byProduct[name] = { files: 0, admt: 0, rev: 0 };
    const q = f.delivered_admt ?? f.tonnage_mt ?? 0;
    byProduct[name].files++;
    byProduct[name].admt += q;
    byProduct[name].rev += q * (f.selling_price ?? 0);
  }
  const productLines = Object.entries(byProduct)
    .sort((a, b) => b[1].rev - a[1].rev)
    .slice(0, 5)
    .map(([name, d]) => `  ${name}: ${d.files} dosya | ${fmtN(d.admt)} ADMT | ${fmtK(d.rev)}`)
    .join('\n');

  // En yüksek/düşük marjlı dosyalar
  const withMargin = files
    .filter(f => (f.selling_price ?? 0) > 0 && (f.purchase_price ?? 0) > 0)
    .map(f => {
      const margin = ((((f.selling_price ?? 0) - (f.purchase_price ?? 0)) / (f.selling_price ?? 1)) * 100);
      return { no: f.file_no, status: f.status, margin, cust: (f.customer as { name?: string } | null)?.name ?? '?' };
    });
  const topMargin = [...withMargin].sort((a, b) => b.margin - a.margin).slice(0, 3)
    .map(r => `  ${r.no} (${r.cust}): %${r.margin.toFixed(1)}`).join('\n');
  const lowMargin = [...withMargin].sort((a, b) => a.margin - b.margin).slice(0, 3)
    .map(r => `  ${r.no} (${r.cust}): %${r.margin.toFixed(1)}`).join('\n');

  // Bekleyen ETA'lar (teslim bekleyen)
  const pending = files.filter(f => f.status === 'sale' || f.status === 'delivery');
  const pendingRev = pending.reduce((s, f) => {
    const q = f.delivered_admt ?? f.tonnage_mt ?? 0;
    return s + q * (f.selling_price ?? 0);
  }, 0);

  return `Analiz Tarihi: ${today}

=== GENEL ÖZET ===
Toplam Dosya: ${totalFiles}
Toplam Hacim: ${fmtN(totalAdmt)} ADMT
Toplam Ciro (USD): ${fmtK(totalRevenue)}
Toplam Maliyet (USD): ${fmtK(totalCost)}
Kâr: ${fmtK(totalProfit)} | Marj: %${marginPct}
Bekleyen Ciro (satış+teslimatta): ${fmtK(pendingRev)} | ${pending.length} dosya

=== DURUM DAĞILIMI ===
${statusLines || '  (veri yok)'}

=== MÜŞTERİ BAZLI (ilk 10, ciro sırası) ===
${custLines || '  (veri yok)'}

=== ÜRÜN BAZLI (ilk 5) ===
${productLines || '  (veri yok)'}

=== EN YÜKSEK MARJLI DOSYALAR ===
${topMargin || '  (veri yok)'}

=== EN DÜŞÜK MARJLI DOSYALAR ===
${lowMargin || '  (veri yok)'}

Yukarıdaki satış raporu verilerini analiz et. Şunları kapsa:

## Genel Değerlendirme
Dönemin performansı nasıl? Ciro, hacim ve marj yorumu.

## Müşteri Analizi
En karlı/riskli müşteriler. Yoğunlaşma riski var mı?

## Dikkat Noktaları
Düşük marjlı dosyalar, bekleyen tahsilatlar, risk faktörleri.

## Öneriler
2-3 somut aksiyon: hangi müşteriyle fiyat revizyonu, hangi ürün ön plana çıkarılmalı vb.

Kısa, pratik ve Türkçe yaz. 350-450 kelime.`;
}

// ─── Streaming API çağrısı ────────────────────────────────────────────────────

export async function* streamSalesReportAnalysis(files: TradeFile[]): AsyncGenerator<string> {
  const today = new Date().toISOString().slice(0, 10);

  const response = await anthropicMessages({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    stream: true,
    system: `Sen deneyimli bir uluslararası ticaret satış analisti ve iş geliştirme danışmanısın.
Kullanıcının şirketi emtia/hammadde ihracatı yapıyor; USD bazlı çalışıyor.
Analizini TÜRKÇE yaz. Markdown kullan: ## başlıklar, - maddeler, **kalın** önemli rakamlar.
Gereksiz giriş cümlesi yazma — direkt analize geç.`,
    messages: [{ role: 'user', content: buildPrompt(files, today) }],
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
