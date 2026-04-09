import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── JWT helpers ───────────────────────────────────────────────────────────────

function base64url(input: string | ArrayBuffer): string {
  const str = typeof input === "string"
    ? btoa(input)
    : btoa(String.fromCharCode(...new Uint8Array(input)));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buf;
}

async function getAccessToken(sa: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }));
  const signingInput = `${header}.${payload}`;

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );

  const jwt = `${signingInput}.${base64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Google token error: " + JSON.stringify(data));
  return data.access_token;
}

// ── Drive API helpers ─────────────────────────────────────────────────────────

async function findFolder(token: string, name: string, parentId: string): Promise<string | null> {
  const safeName = name.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `name='${safeName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

async function findOrCreateFolder(token: string, name: string, parentId: string): Promise<string> {
  const existing = await findFolder(token, name, parentId);
  if (existing) return existing;

  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  const data = await res.json();
  if (!data.id) throw new Error("Folder create error: " + JSON.stringify(data));
  return data.id;
}

// Klasör yapısı: Sunmax Trade / Müşteri Adı / Dosya No
async function resolveTradeFileFolder(
  token: string,
  rootId: string,
  customerName: string,
  fileNo: string,
): Promise<{ folderId: string; folderUrl: string }> {
  const customerFolderId = await findOrCreateFolder(token, customerName, rootId);
  const fileFolderId = await findOrCreateFolder(token, fileNo, customerFolderId);
  return {
    folderId: fileFolderId,
    folderUrl: `https://drive.google.com/drive/folders/${fileFolderId}`,
  };
}

async function uploadDocument(
  token: string,
  folderId: string,
  name: string,
  htmlContent: string,
): Promise<string> {
  const boundary = "boundary_sunmax";
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify({ name, parents: [folderId], mimeType: "text/html" }),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    htmlContent,
    `--${boundary}--`,
  ].join("\r\n");

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  const data = await res.json();
  if (!data.id) throw new Error("Upload error: " + JSON.stringify(data));
  return data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON secret not set");
    const sa = JSON.parse(atob(saJson));

    const rootFolderId = Deno.env.get("GOOGLE_DRIVE_PARENT_FOLDER_ID");
    if (!rootFolderId) throw new Error("GOOGLE_DRIVE_PARENT_FOLDER_ID secret not set");

    const body = await req.json();
    const { action, customerName, fileNo, documentName, htmlContent } = body;
    const token = await getAccessToken(sa);

    // ── createTradeFolder: Sunmax Trade / Müşteri / Dosya No ────────────────
    if (action === "createTradeFolder") {
      if (!customerName || !fileNo) throw new Error("customerName and fileNo required");
      const result = await resolveTradeFileFolder(token, rootFolderId, customerName, fileNo);
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── uploadDocument: HTML belgeyi Drive'a yükle ──────────────────────────
    if (action === "uploadDocument") {
      if (!customerName || !fileNo || !documentName || !htmlContent) {
        throw new Error("customerName, fileNo, documentName and htmlContent required");
      }
      const { folderId } = await resolveTradeFileFolder(token, rootFolderId, customerName, fileNo);
      const viewLink = await uploadDocument(token, folderId, documentName, htmlContent);
      return new Response(JSON.stringify({ success: true, viewLink }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── getFolder: Mevcut klasörün URL'ini getir ─────────────────────────────
    if (action === "getFolder") {
      if (!customerName || !fileNo) throw new Error("customerName and fileNo required");
      const customerFolderId = await findFolder(token, customerName, rootFolderId);
      let fileFolderId: string | null = null;
      if (customerFolderId) {
        fileFolderId = await findFolder(token, fileNo, customerFolderId);
      }
      return new Response(
        JSON.stringify({
          success: true,
          folderId: fileFolderId,
          folderUrl: fileFolderId
            ? `https://drive.google.com/drive/folders/${fileFolderId}`
            : null,
        }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    console.error('[google-drive] error:', (err as Error).message);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
