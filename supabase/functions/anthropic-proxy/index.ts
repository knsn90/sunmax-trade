// Anthropic Messages API proxy — API anahtarı sunucuda (Deno secret) durur,
// client'a hiç inmez. Client bu fonksiyonu çağırır; fonksiyon Anthropic'e iletir.
//
// Deploy: verify_jwt=true → yalnızca geçerli Supabase JWT'si olan (giriş yapmış)
// kullanıcılar çağırabilir. Anahtar: `ANTHROPIC_API_KEY` secret olarak set edilmeli:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return json({ error: { message: "Method not allowed" } }, 405);
  }

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) {
    return json({ error: { message: "Server API key not configured" } }, 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: { message: "Invalid JSON body" } }, 400);
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    // Gövdeyi STREAM olarak ilet (tamponlama yok) → stream:true çağrıları çalışsın.
    // content-type aynen forward edilir (streaming'de text/event-stream).
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...CORS,
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (e) {
    return json({ error: { message: `Upstream error: ${(e as Error).message}` } }, 502);
  }
});
