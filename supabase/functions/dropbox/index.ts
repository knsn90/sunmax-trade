import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Dropbox OAuth ─────────────────────────────────────────────────────────────

async function getAccessToken(appKey: string, appSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: appKey,
      client_secret: appSecret,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Dropbox token error: " + JSON.stringify(data));
  return data.access_token;
}

// ── Dropbox API helpers ───────────────────────────────────────────────────────

async function apiCall(token: string, endpoint: string, body: unknown): Promise<unknown> {
  const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Klasörü oluştur, zaten varsa veya çakışma varsa sessizce devam et */
async function createFolder(token: string, path: string): Promise<void> {
  const res = await fetch("https://api.dropboxapi.com/2/files/create_folder_v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path, autorename: false }),
  });
  const data = await res.json();
  if (!data.error_summary) return; // başarılı
  const errSummary: string = data.error_summary;
  // Klasör veya dosya zaten varsa sessizce geç
  if (errSummary.startsWith("path/conflict/")) return;
  // "already_exists" varyantı
  if (errSummary.includes("already_exists")) return;
  // Diğer hatalar gerçek hata
  throw new Error("Create folder error: " + errSummary);
}

/** Dropbox web linki üret (fallback) */
function dropboxWebUrl(path: string): string {
  // /Family Room/... → https://www.dropbox.com/home/Family%20Room/...
  return "https://www.dropbox.com/home" + path.split("/").map(encodeURIComponent).join("/");
}

/** Klasör için paylaşım linki oluştur veya mevcut olanı getir.
 *  Hiçbir koşulda throw yapmaz — hata durumunda Dropbox web linki döner. */
async function getOrCreateSharedLink(token: string, path: string): Promise<string> {
  try {
    // 1. Yeni link oluşturmayı dene (team/personal plan gerektirebilir)
    const createRes = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ path, settings: { requested_visibility: "public" } }),
    });
    const createData = await createRes.json();

    if (createData.url) return createData.url;

    const errSummary: string = createData.error_summary ?? "";

    // 2. Zaten var — mevcut linkleri getir
    if (errSummary.includes("shared_link_already_exists")) {
      // direct_only ile dene
      const r1 = await fetch("https://api.dropboxapi.com/2/sharing/list_shared_links", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ path, direct_only: true }),
      });
      const d1 = await r1.json();
      if (d1.links?.[0]?.url) return d1.links[0].url;

      // direct_only olmadan dene
      const r2 = await fetch("https://api.dropboxapi.com/2/sharing/list_shared_links", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const d2 = await r2.json();
      if (d2.links?.[0]?.url) return d2.links[0].url;
    }

    // 3. Herhangi bir hata durumunda Dropbox web linkini döndür
    console.warn("[dropbox] getOrCreateSharedLink fallback, error_summary:", errSummary, "path:", path);
    return dropboxWebUrl(path);
  } catch (e) {
    // Ağ hatası veya parse hatası → yine Dropbox web linki
    console.warn("[dropbox] getOrCreateSharedLink exception:", e, "path:", path);
    return dropboxWebUrl(path);
  }
}

/** Binary bayt dizisini Dropbox'a yükle ve paylaşım linki döndür */
async function uploadBytes(token: string, path: string, bytes: Uint8Array): Promise<string> {
  const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": asciiJson({
        path,
        mode: { ".tag": "add" },
        autorename: true,
        mute: false,
      }),
    },
    body: bytes,
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(text); } catch { throw new Error(`Upload parse error (${res.status}): ${text.slice(0, 200)}`); }
  if (!data.id) throw new Error("Upload error: " + JSON.stringify(data));

  const fileLink = await getOrCreateSharedLink(token, data.path_display as string ?? path);
  return fileLink;
}

/** JSON stringini ASCII-safe hale getirir (HTTP header için) */
function asciiJson(obj: unknown): string {
  return JSON.stringify(obj).replace(
    /[^\x00-\x7F]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** Dosya yükle */
async function uploadFile(token: string, path: string, content: string): Promise<string> {
  const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      // HTTP headers must be ASCII — escape non-ASCII chars in path as \uXXXX
      "Dropbox-API-Arg": asciiJson({
        path,
        mode: { ".tag": "add" },
        autorename: true,
        mute: false,
      }),
    },
    body: new TextEncoder().encode(content),
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(text); } catch { throw new Error(`Upload parse error (${res.status}): ${text.slice(0, 200)}`); }
  if (!data.id) throw new Error("Upload error: " + JSON.stringify(data));

  // Dosya için paylaşım linki oluştur
  const fileLink = await getOrCreateSharedLink(token, data.path_display ?? path);
  return fileLink;
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const appKey = Deno.env.get("DROPBOX_APP_KEY");
    const appSecret = Deno.env.get("DROPBOX_APP_SECRET");
    const refreshToken = Deno.env.get("DROPBOX_REFRESH_TOKEN");

    if (!appKey || !appSecret || !refreshToken) {
      throw new Error("Dropbox credentials not configured (DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN)");
    }

    const token = await getAccessToken(appKey, appSecret, refreshToken);
    const body = await req.json();
    const { action, customerName, fileNo, documentName } = body;

    // Dosya içeriği: PDF (base64) veya HTML (metin/base64)
    let htmlContent: string | undefined;
    let pdfContent: Uint8Array | undefined;
    let isPdf = false;

    if (body.pdfBase64) {
      // Client tarafında oluşturulan PDF — binary olarak yükle
      pdfContent = Uint8Array.from(atob(body.pdfBase64 as string), (c) => c.charCodeAt(0));
      isPdf = true;
    } else if (body.htmlBase64) {
      htmlContent = new TextDecoder().decode(
        Uint8Array.from(atob(body.htmlBase64 as string), (c) => c.charCodeAt(0)),
      );
    } else {
      htmlContent = body.htmlContent as string | undefined;
    }

    // Full Dropbox erişimi — hedef path: /Family Room/01-SELÜLOZ/Sunplus Trade/{müşteri}/{dosyaNo}
    // fileNo, batch dosyalar için "/" içerebilir (ör. "ABC123/P1") → iç içe klasör olarak oluştur
    const ROOT = "/Family Room/01-SELÜLOZ/Sunplus Trade";
    const safeName = (s: string) => s.replace(/[<>:"\\|?*]/g, "_");  // "/" hariç tutuldu
    const fileSegments = (fileNo ?? "").split("/").map((s) => safeName(s));
    const folderPath = `${ROOT}/${safeName(customerName ?? "")}/${fileSegments.join("/")}`;

    // ── createTradeFolder ─────────────────────────────────────────────────────
    if (action === "createTradeFolder") {
      if (!customerName || !fileNo) throw new Error("customerName and fileNo required");

      // Üst klasörleri sırayla oluştur (zaten varsa hata sessizce geçilir)
      await createFolder(token, "/Family Room");
      await createFolder(token, "/Family Room/01-SELÜLOZ");
      await createFolder(token, ROOT);
      await createFolder(token, `${ROOT}/${safeName(customerName)}`);
      // fileNo "/" içeriyorsa (batch dosya) her segmenti ayrı ayrı oluştur
      let segPath = `${ROOT}/${safeName(customerName)}`;
      for (const seg of fileSegments) {
        segPath = `${segPath}/${seg}`;
        await createFolder(token, segPath);
      }

      const folderUrl = await getOrCreateSharedLink(token, folderPath);
      return new Response(JSON.stringify({ success: true, folderPath, folderUrl }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── uploadDocument ────────────────────────────────────────────────────────
    if (action === "uploadDocument") {
      if (!customerName || !fileNo || !documentName || (!htmlContent && !pdfContent)) {
        throw new Error("customerName, fileNo, documentName, and htmlContent or pdfBase64 required");
      }
      // Klasörü hazır et (batch dosyalar için iç içe klasörler)
      await createFolder(token, "/Family Room");
      await createFolder(token, "/Family Room/01-SELÜLOZ");
      await createFolder(token, ROOT);
      await createFolder(token, `${ROOT}/${safeName(customerName)}`);
      let docSegPath = `${ROOT}/${safeName(customerName)}`;
      for (const seg of fileSegments) {
        docSegPath = `${docSegPath}/${seg}`;
        await createFolder(token, docSegPath);
      }

      const ext = isPdf ? "pdf" : "html";
      const filePath = `${folderPath}/${documentName}.${ext}`;
      const fileBytes = isPdf ? pdfContent! : new TextEncoder().encode(htmlContent!);
      const viewLink = await uploadBytes(token, filePath, fileBytes);
      // Klasör URL'ini de döndür — sharing.write izni yoksa null döner (dosya yine de yüklendi)
      let folderUrl: string | null = null;
      try {
        folderUrl = await getOrCreateSharedLink(token, folderPath);
      } catch { /* sharing.write izni olmayabilir, önemli değil */ }
      return new Response(JSON.stringify({ success: true, viewLink, folderPath, folderUrl }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── getFolder ─────────────────────────────────────────────────────────────
    if (action === "getFolder") {
      if (!customerName || !fileNo) throw new Error("customerName and fileNo required");
      try {
        // Klasörün varlığını kontrol et
        const meta = await apiCall(token, "files/get_metadata", { path: folderPath }) as Record<string, unknown>;
        if (meta[".tag"] === "folder") {
          const folderUrl = await getOrCreateSharedLink(token, folderPath);
          return new Response(JSON.stringify({ success: true, folderPath, folderUrl }), {
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }
      } catch {
        // Klasör yok
      }
      return new Response(JSON.stringify({ success: true, folderPath: null, folderUrl: null }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── listFolder ────────────────────────────────────────────────────────────
    if (action === 'listFolder') {
      if (!customerName || !fileNo) throw new Error("customerName and fileNo required");
      try {
        const result = await apiCall(token, 'files/list_folder', {
          path: folderPath,
          recursive: false,
          include_media_info: false,
          include_deleted: false,
          limit: 200,
        }) as { entries?: Array<{ '.tag': string; name: string; path_display: string; size?: number; server_modified?: string }> };

        const files = (result.entries ?? [])
          .filter((e) => e['.tag'] === 'file')
          .map((e) => ({
            name: e.name,
            path: e.path_display,
            size: e.size ?? 0,
            modified: e.server_modified ?? '',
          }));

        return new Response(JSON.stringify({ success: true, files }), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      } catch {
        // Folder doesn't exist yet — return empty list
        return new Response(JSON.stringify({ success: true, files: [] }), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── uploadAttachment ──────────────────────────────────────────────────────
    if (action === 'uploadAttachment') {
      const { customerName: cn, fileNo: fn, fileName, fileBase64 } = body as {
        action: string; customerName: string; fileNo: string; fileName: string; fileBase64: string;
      };
      if (!cn || !fn || !fileName || !fileBase64) {
        throw new Error("customerName, fileNo, fileName, and fileBase64 required");
      }
      // fileNo "/" içeriyorsa (batch dosya) iç içe klasör oluştur
      const attSegs = fn.split("/").map((s: string) => safeName(s));
      const attFolderPath = `${ROOT}/${safeName(cn)}/${attSegs.join("/")}`;
      const attFilePath = `${attFolderPath}/${fileName}`;
      // Ensure folder exists
      await createFolder(token, "/Family Room");
      await createFolder(token, "/Family Room/01-SELÜLOZ");
      await createFolder(token, ROOT);
      await createFolder(token, `${ROOT}/${safeName(cn)}`);
      let attSegPath = `${ROOT}/${safeName(cn)}`;
      for (const seg of attSegs) {
        attSegPath = `${attSegPath}/${seg}`;
        await createFolder(token, attSegPath);
      }
      const fileBytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
      const viewLink = await uploadBytes(token, attFilePath, fileBytes);
      return new Response(JSON.stringify({ success: true, viewLink, filePath: attFilePath }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[dropbox] error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
