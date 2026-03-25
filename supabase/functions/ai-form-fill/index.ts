import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  if (formType === "new_customer") {
    return `Sen bir ticaret şirketinin müşteri kayıt asistanısın.
Kullanıcı Türkçe veya İngilizce serbest metin ile yeni müşteri bilgilerini anlatacak.
Bugünün tarihi: ${today}

Kullanıcı metninden aşağıdaki bilgileri çıkar:
- name: firma/şirket adı (zorunlu)
- country: ülke
- city: şehir
- address: adres
- contact_email: e-posta
- contact_phone: telefon numarası
- tax_id: vergi numarası / tax ID / VAT numarası
- website: web sitesi (http/https dahil)
- payment_terms: ödeme koşulları (örn: "Net 30", "60 gün", "L/C 90 gün", "Peşin" vb.)
- notes: ekstra notlar

SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma:
{
  "name": "string veya boş",
  "country": "string veya boş",
  "city": "string veya boş",
  "address": "string veya boş",
  "contact_email": "string veya boş",
  "contact_phone": "string veya boş",
  "tax_id": "string veya boş",
  "website": "string veya boş",
  "payment_terms": "string veya boş",
  "notes": "string veya boş"
}`;
  }

  if (formType === "new_supplier") {
    return `Sen bir ticaret şirketinin tedarikçi kayıt asistanısın.
Kullanıcı Türkçe veya İngilizce serbest metin ile yeni tedarikçi bilgilerini anlatacak.
Bugünün tarihi: ${today}

Kullanıcı metninden aşağıdaki bilgileri çıkar:
- name: firma/şirket adı (zorunlu)
- country: ülke
- city: şehir
- address: adres
- contact_name: iletişim kişisi adı
- phone: telefon numarası
- email: e-posta
- tax_id: vergi numarası / tax ID
- website: web sitesi
- payment_terms: ödeme koşulları (örn: "Net 30", "60 gün", "TT 30 gün" vb.)
- swift_code: SWIFT / BIC kodu
- iban: IBAN numarası
- notes: ekstra notlar

SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma:
{
  "name": "string veya boş",
  "country": "string veya boş",
  "city": "string veya boş",
  "address": "string veya boş",
  "contact_name": "string veya boş",
  "phone": "string veya boş",
  "email": "string veya boş",
  "tax_id": "string veya boş",
  "website": "string veya boş",
  "payment_terms": "string veya boş",
  "swift_code": "string veya boş",
  "iban": "string veya boş",
  "notes": "string veya boş"
}`;
  }

  if (formType === "new_service_provider") {
    const typeLabels = {
      customs: "Gümrük",
      port: "Liman",
      warehouse: "Depo",
      freight: "Navlun / Taşıma",
      insurance: "Sigorta",
      financial: "Finansal / Banka",
      other: "Diğer",
    };
    return `Sen bir ticaret şirketinin hizmet sağlayıcı kayıt asistanısın.
Kullanıcı Türkçe veya İngilizce serbest metin ile yeni hizmet sağlayıcı bilgilerini anlatacak.
Bugünün tarihi: ${new Date().toISOString().split("T")[0]}

Hizmet türleri ve kodları:
${Object.entries(typeLabels).map(([k,v]) => `- "${k}": ${v}`).join("\n")}

Kullanıcı metninden aşağıdaki bilgileri çıkar:
- name: firma/şirket adı (zorunlu)
- service_type: yukarıdaki listeden en uygun tür kodu (customs/port/warehouse/freight/insurance/financial/other)
- country: ülke
- city: şehir
- address: tam adres
- contact_name: iletişim kişisi
- phone: telefon numarası
- email: e-posta
- notes: ekstra notlar

SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma:
{
  "name": "string veya boş",
  "service_type": "customs/port/warehouse/freight/insurance/financial/other",
  "country": "string veya boş",
  "city": "string veya boş",
  "address": "string veya boş",
  "contact_name": "string veya boş",
  "phone": "string veya boş",
  "email": "string veya boş",
  "notes": "string veya boş"
}`;
  }

  if (formType === "new_product") {
    return `Sen bir ticaret şirketinin ürün kayıt asistanısın. Şirket kağıt hamuru (pulp) ve kağıt ürünleri ticareti yapmaktadır.
Kullanıcı Türkçe veya İngilizce serbest metin ile yeni ürün bilgilerini anlatacak.

Kullanıcı metninden aşağıdaki bilgileri çıkar:
- name: ürün adı (zorunlu, örn: "NBSK Pulp", "Eucalyptus BHKP", "Kraftliner")
- hs_code: Gümrük tarife kodu (HS Code, örn: "470321", "470329", "4707")
- unit: ölçü birimi — sadece şu değerlerden biri: "ADMT", "MT", "KG" (varsayılan ADMT)
- description: ürün açıklaması (teknik özellikler, kullanım alanı vb.)
- origin_country: menşei ülke (üretim yapılan ülke, örn: "USA", "Canada", "Brazil", "Finland")
- species: ağaç türü / hamur tipi (örn: "NBSK", "NBHK", "BHKP", "Eucalyptus", "Mixed Hardwood", "Pine")
- grade: kalite/grade (örn: "Standard", "Premium", "Softwood", "Hardwood", "Fluff")

SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma:
{
  "name": "string veya boş",
  "hs_code": "string veya boş",
  "unit": "ADMT veya MT veya KG",
  "description": "string veya boş",
  "origin_country": "string veya boş",
  "species": "string veya boş",
  "grade": "string veya boş"
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
    // 1) Try environment secret first, fall back to app_settings table
    let ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

    if (!ANTHROPIC_API_KEY) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

      if (!supabaseUrl || !supabaseKey) {
        return new Response(
          JSON.stringify({ error: `Missing env vars — SUPABASE_URL: ${!!supabaseUrl}, SERVICE_ROLE_KEY: ${!!supabaseKey}` }),
          { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      const sb = createClient(supabaseUrl, supabaseKey);
      const { data, error: dbErr } = await sb
        .from("app_settings")
        .select("value")
        .eq("setting_key", "api_key_anthropic")
        .single();

      if (dbErr) {
        return new Response(
          JSON.stringify({ error: `app_settings query failed: ${dbErr.message}` }),
          { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      ANTHROPIC_API_KEY = data?.value ?? "";
    }

    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Anthropic API key not found. Please add it in Settings." }),
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
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.text();
      throw new Error(`Anthropic API error ${aiRes.status}: ${errBody}`);
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
