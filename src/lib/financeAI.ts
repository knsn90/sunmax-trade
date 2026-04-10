import { getApiKey } from './openai';
import type { Transaction, Kasa, BankAccount } from '@/types/database';

// ─── Input tip tanımları ──────────────────────────────────────────────────────

export interface FinanceAIInput {
  today: string;
  kasaBalances: Array<{ name: string; currency: string; balance: number }>;
  bankBalances: Array<{ name: string; currency: string; balance: number }>;
  recentTxns: Transaction[];       // son 60 gün
  allTxns: Transaction[];          // açık faturalar için
  kasalar: Kasa[];
  bankAccounts: BankAccount[];
  eurRate: number;
  tryRate: number;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(input: FinanceAIInput): string {
  const { today, kasaBalances, bankBalances, recentTxns, allTxns, eurRate, tryRate } = input;

  // Toplam USD pozisyonu
  const totalUSD = [
    ...kasaBalances.map(k => k.currency === 'USD' ? k.balance : k.currency === 'EUR' ? k.balance / eurRate : k.balance / tryRate),
    ...bankBalances.map(b => b.currency === 'USD' ? b.balance : b.currency === 'EUR' ? b.balance / eurRate : b.balance / tryRate),
  ].reduce((s, v) => s + v, 0);

  // Kasa özeti
  const kasaLines = kasaBalances
    .map(k => `  - ${k.name} (${k.currency}): ${k.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
    .join('\n');

  const bankLines = bankBalances.length
    ? bankBalances.map(b => `  - ${b.name} (${b.currency}): ${b.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`).join('\n')
    : '  (kayıtlı banka hesabı yok)';

  // Son 60 gün işlem özeti
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const cutoff = sixtyDaysAgo.toISOString().slice(0, 10);

  const recent = recentTxns.filter(t => t.transaction_date >= cutoff);

  const totalIn = recent
    .filter(t => t.transaction_type === 'receipt' || t.transaction_type === 'sale_inv')
    .reduce((s, t) => s + (t.amount_usd ?? 0), 0);

  const totalOut = recent
    .filter(t => t.transaction_type !== 'receipt' && t.transaction_type !== 'sale_inv')
    .reduce((s, t) => s + (t.amount_usd ?? 0), 0);

  // En büyük 5 tahsilat
  const topReceipts = [...recent]
    .filter(t => t.transaction_type === 'receipt' || t.transaction_type === 'sale_inv')
    .sort((a, b) => (b.amount_usd ?? 0) - (a.amount_usd ?? 0))
    .slice(0, 5)
    .map(t => `  - ${t.transaction_date} | ${t.party_name ?? '?'} | +$${(t.amount_usd ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
    .join('\n');

  // En büyük 5 çıkış
  const topPayments = [...recent]
    .filter(t => t.transaction_type !== 'receipt' && t.transaction_type !== 'sale_inv')
    .sort((a, b) => (b.amount_usd ?? 0) - (a.amount_usd ?? 0))
    .slice(0, 5)
    .map(t => `  - ${t.transaction_date} | ${t.party_name ?? '?'} | -$${(t.amount_usd ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
    .join('\n');

  // Açık faturalar (ödenmemiş)
  const openInvoices = allTxns.filter(
    t => t.payment_status === 'open' &&
      ['purchase_inv', 'svc_inv', 'receipt'].includes(t.transaction_type),
  );

  const openInvLines = openInvoices.length
    ? openInvoices
        .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))
        .slice(0, 10)
        .map(t => {
          const days = Math.floor((Date.now() - new Date(t.transaction_date).getTime()) / 86400000);
          return `  - ${t.transaction_date} (${days} gün) | ${t.party_name ?? '?'} | ${t.transaction_type} | $${(t.amount_usd ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        })
        .join('\n')
    : '  (açık fatura yok)';

  const openInvTotal = openInvoices.reduce((s, t) => s + (t.amount_usd ?? 0), 0);

  // Para birimi dağılımı (son 60 gün)
  const currencyDist: Record<string, number> = {};
  for (const t of recent) {
    const c = t.currency ?? 'USD';
    currencyDist[c] = (currencyDist[c] ?? 0) + (t.amount_usd ?? 0);
  }
  const currencyLines = Object.entries(currencyDist)
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => `  ${c}: $${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
    .join('\n');

  return `Tarih: ${today}
Döviz Kurları: EUR/USD=${eurRate.toFixed(4)}, TRY/USD=${(1 / tryRate).toFixed(4)}

=== NAKİT POZİSYONU ===
Toplam USD Eşdeğeri: $${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}

KASALAR:
${kasaLines || '  (kasa yok)'}

BANKA HESAPLARI:
${bankLines}

=== SON 60 GÜN HAREKETLERİ ===
Toplam Giriş (USD): $${totalIn.toLocaleString('en-US', { minimumFractionDigits: 2 })}
Toplam Çıkış (USD): $${totalOut.toLocaleString('en-US', { minimumFractionDigits: 2 })}
Net: $${(totalIn - totalOut).toLocaleString('en-US', { minimumFractionDigits: 2 })}
İşlem Sayısı: ${recent.length}

En Büyük Tahsilatlar:
${topReceipts || '  (yok)'}

En Büyük Ödemeler:
${topPayments || '  (yok)'}

Para Birimi Dağılımı (işlem hacmi):
${currencyLines || '  (veri yok)'}

=== AÇIK FATURALAR ===
Toplam Açık Tutar: $${openInvTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${openInvoices.length} fatura)
${openInvLines}

Yukarıdaki finansal verileri analiz et. Şunları kapsa:
1. **Genel Değerlendirme** — nakit pozisyonu sağlıklı mı?
2. **Dikkat Noktaları** — riskler, gecikmiş tahsilatlar, yoğunlaşma riski
3. **Kur Riski** — USD dışı para birimlerindeki maruziyet
4. **Öneri** — 1-2 somut aksiyon önerisi

Kısa ve pratik ol. 300-400 kelime.`;
}

// ─── Streaming API çağrısı ────────────────────────────────────────────────────

export async function* streamFinanceAnalysis(input: FinanceAIInput): AsyncGenerator<string> {
  const apiKey = getApiKey('anthropic');
  if (!apiKey) {
    throw new Error('Claude API anahtarı ayarlanmamış. Ayarlar → API Anahtarları bölümüne gidin.');
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
      stream: true,
      system: `Sen deneyimli bir ticaret finansı uzmanısın. Kullanıcının şirketi ithalat/ihracat yapıyor;
USD, AED, EUR ve TRY ile işlem yapıyor. Analizini TÜRKÇE yaz.
Markdown kullan: ## başlıklar, - maddeler, **kalın** önemli rakamlar.
Gereksiz giriş cümlesi yazma — direkt analize geç.`,
      messages: [{ role: 'user', content: buildPrompt(input) }],
    }),
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
      } catch {
        // geçersiz JSON satırı — atla
      }
    }
  }
}
