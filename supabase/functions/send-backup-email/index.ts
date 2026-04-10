import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BACKUP_TABLES = [
  "customers", "suppliers", "service_providers", "products",
  "trade_files", "proformas", "invoices", "packing_lists", "packing_list_items",
  "transactions", "company_settings", "bank_accounts",
] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY secret is not set in Supabase.");

    const supabaseUrl       = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { to, trigger } = await req.json() as { to: string; trigger?: string };
    if (!to) throw new Error("Missing 'to' email address.");

    // Use service role to read all backup tables (bypasses RLS)
    const sb = createClient(supabaseUrl, serviceRoleKey);

    const tables: Record<string, unknown[]> = {};
    for (const table of BACKUP_TABLES) {
      const { data, error } = await sb.from(table).select("*");
      if (error) {
        console.warn(`Skipping ${table}: ${error.message}`);
        tables[table] = [];
      } else {
        tables[table] = data ?? [];
      }
    }

    const now    = new Date().toISOString();
    const today  = now.slice(0, 10);
    const backup = { version: 1, exported_at: now, trigger: trigger ?? "manual", tables };
    const json   = JSON.stringify(backup, null, 2);

    // Base64-encode the JSON for the email attachment
    const encoder  = new TextEncoder();
    const bytes    = encoder.encode(json);
    const b64      = btoa(String.fromCharCode(...bytes));

    const rowCount = BACKUP_TABLES.reduce((s, t) => s + (tables[t]?.length ?? 0), 0);

    // Send via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Plus Kimya Backup <onboarding@resend.dev>",
        to: [to],
        subject: `📦 Plus Kimya Yedek — ${today}`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
            <h2 style="font-size:18px;font-weight:700;margin-bottom:4px">Plus Kimya Trade — Otomatik Yedek</h2>
            <p style="color:#666;font-size:13px;margin-top:0">Tarih: ${now.replace("T"," ").slice(0,19)} UTC</p>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
            <table style="width:100%;font-size:13px;border-collapse:collapse">
              ${BACKUP_TABLES.map(t => `
                <tr>
                  <td style="padding:4px 8px 4px 0;color:#888">${t}</td>
                  <td style="padding:4px 0;font-weight:600;text-align:right">${tables[t]?.length ?? 0} kayıt</td>
                </tr>
              `).join("")}
            </table>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
            <p style="font-size:13px;color:#444">Toplam: <strong>${rowCount} kayıt</strong></p>
            <p style="font-size:11px;color:#999">Tetikleyici: ${trigger ?? "manuel"} · Plus Kimya Trade Sistemi</p>
          </div>
        `,
        attachments: [
          {
            filename: `pluskimya-backup-${today}.json`,
            content: b64,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Resend API error: ${err}`);
    }

    return new Response(
      JSON.stringify({ ok: true, sent_to: to, rows: rowCount }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[send-backup-email]", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
