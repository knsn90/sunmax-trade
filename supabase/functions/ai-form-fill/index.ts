import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Prompts per form type ────────────────────────────────────────────────────

function buildPrompt(formType: string, context: Record<string, unknown>): string {
  const today = new Date().toISOString().split("T")[0];

  if (formType === "new_file") {
    const customers = (context.customers as Array<{ id: string; name: string }>) ?? [];
    const products  = (context.products  as Array<{ id: string; name: string }>) ?? [];

    return `Sen bir ticaret dosyası yönetim sisteminin asistanısın.
Kullanıcı Türkçe veya İngilizce serbest metin ile yeni dosya bilgilerini söyleyecek.

Mevcut müşteriler (id → isim):
${customers.map(c => `${c.id} → ${c.name}`).join("\n") || "(boş)"}

Mevcut ürünler (id → isim):
${products.map(p => `${p.id} → ${p.name}`).join("\n") || "(boş)"}

Bugünün tarihi: ${today}

Kullanıcı metnini analiz et:
- Müşteri adını yukarıdaki listeden en iyi eşleşme ile bul, id'sini kullan.
- Ürün adını yukarıdaki listeden en iyi eşleşme ile bul, id'sini kullan.
- Tonnaj: sayısal değeri çıkar (MT, ton, tonne sözcüklerini yok say).
- Tarih: "bugün", "yarın" gibi ifadeleri ${today} referansıyla YYYY-MM-DD'ye çevir.
- customer_ref ve notes: varsa çıkar.

SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma:
{
  "customer_id": "uuid veya boş string",
  "customer_name": "eşleşen müşteri adı veya boş string",
  "product_id": "uuid veya boş string",
  "product_name": "eşleşen ürün adı veya boş string",
  "tonnage_mt": sayı_veya_null,
  "file_date": "YYYY-MM-DD veya null",
  "customer_ref": "string veya boş string",
  "notes": "string veya boş string"
}`;
  }

  if (formType === "transport_plan") {
    return `Sen bir taşıma planlama asistanısın.
Bugünün tarihi: ${today}

Kullanıcı metninden aşağıdaki bilgileri çıkar:
- loading_date: yükleme tarihi (YYYY-MM-DD), "yarın", "pazartesi" gibi ifadeleri çevir.
- freight_company: navlun/nakliye firması adı.

SADECE şu JSON formatında yanıt ver:
{
  "loading_date": "YYYY-MM-DD veya null",
  "freight_company": "firma adı veya boş string"
}`;
  }

  if (formType === "to_sale") {
    return `Sen bir satış detayı asistanısın.
Bugünün tarihi: ${today}
Mevcut tedarikçiler: ${JSON.stringify((context.suppliers ?? []) as unknown[])}

Kullanıcı metninden aşağıdaki bilgileri çıkar:
- selling_price: satış fiyatı (sadece sayı)
- purchase_price: alış fiyatı (sadece sayı)
- freight_cost: nakliye maliyeti (sadece sayı, yoksa null)
- incoterms: teslim şekli (FOB, CIF, CFR, EXW vb.)
- port_of_loading: yükleme limanı
- port_of_discharge: tahliye limanı
- eta: tahmini varış tarihi (YYYY-MM-DD)
- supplier_id: tedarikçi id (listeden eşleştir, yoksa boş)
- payment_terms: ödeme koşulları

SADECE JSON formatında yanıt ver:
{
  "selling_price": sayı_veya_null,
  "purchase_price": sayı_veya_null,
  "freight_cost": sayı_veya_null,
  "incoterms": "string veya boş",
  "port_of_loading": "string veya boş",
  "port_of_discharge": "string veya boş",
  "eta": "YYYY-MM-DD veya null",
  "supplier_id": "uuid veya boş",
  "payment_terms": "string veya boş"
}`;
  }

  // Generic fallback
  return `Extract form field values from the user's text and return as JSON only. Today: ${today}.`;
}

// ── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY ayarlanmamış. Supabase → Settings → Edge Functions → Secrets bölümünden ekleyin." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const { text, formType, context = {} } = await req.json();
    if (!text?.trim()) {
      return new Response(JSON.stringify({ error: "text boş olamaz" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = buildPrompt(formType ?? "generic", context);

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-20240307",
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.text();
      throw new Error(`Anthropic API hatası: ${aiRes.status} — ${errBody}`);
    }

    const aiData = await aiRes.json();
    const raw = aiData.content?.[0]?.text ?? "{}";

    // Extract JSON block
    const match = raw.match(/\{[\s\S]*\}/);
    const fields = match ? JSON.parse(match[0]) : {};

    return new Response(JSON.stringify({ fields }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
