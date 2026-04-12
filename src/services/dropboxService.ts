import { supabase } from './supabase';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** Supabase edge function'ına istek at — 30 sn timeout, 401'de bir kez token yenile. */
async function callDropbox(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? SUPABASE_ANON_KEY;
  };

  const doFetch = async (token: string) => {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 30_000); // 30 sn timeout
    try {
      return await fetch(`${SUPABASE_URL}/functions/v1/dropbox`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(tid);
    }
  };

  const parseResponse = (res: Response, text: string): Record<string, unknown> => {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`Edge fn yanıt hatası (HTTP ${res.status}): ${text.slice(0, 400) || '(boş yanıt)'}`);
    }
    if (!data?.success) {
      const errorMsg = (data?.error as string)
        || `Dropbox API hatası: ${JSON.stringify(data).slice(0, 300)}`;
      throw new Error(errorMsg);
    }
    return data;
  };

  let token = await getAuthToken();
  let res: Response;
  try { res = await doFetch(token); }
  catch (fetchErr) {
    const msg = (fetchErr as Error).name === 'AbortError'
      ? 'Dropbox isteği zaman aşımına uğradı (30 sn)'
      : `Ağ hatası: ${(fetchErr as Error).message}`;
    throw new Error(msg);
  }

  const text = await res.text().catch(() => '');

  // 401 → token'ı yenile, bir kez daha dene
  if (res.status === 401) {
    const { data: refreshData } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
    token = refreshData.session?.access_token ?? SUPABASE_ANON_KEY;
    let res2: Response;
    try { res2 = await doFetch(token); }
    catch (fetchErr2) {
      const msg = (fetchErr2 as Error).name === 'AbortError'
        ? 'Dropbox isteği zaman aşımına uğradı (30 sn)'
        : `Ağ hatası (retry): ${(fetchErr2 as Error).message}`;
      throw new Error(msg);
    }
    const text2 = await res2.text().catch(() => '');
    return parseResponse(res2, text2);
  }

  return parseResponse(res, text);
}

export const dropboxService = {
  /** Klasör oluştur: /Family Room/01-SELÜLOZ/Sunplus Trade / Müşteri / Dosya No */
  async createTradeFolder(customerName: string, fileNo: string) {
    return callDropbox({ action: 'createTradeFolder', customerName, fileNo });
  },

  /** HTML içeriğini PDF'e çevirip Dropbox'a yükle */
  async uploadDocument(customerName: string, fileNo: string, documentName: string, htmlContent: string) {
    // Convert HTML body → PDF blob → base64 (client-side, no server dependency)
    const { htmlBodyToPdfBase64 } = await import('@/lib/pdfExport');
    const pdfBase64 = await htmlBodyToPdfBase64(htmlContent);

    return callDropbox({
      action: 'uploadDocument',
      customerName,
      fileNo,
      documentName,
      pdfBase64,   // binary PDF sent as base64
    });
  },

  /** Mevcut klasör URL'ini getir */
  async getFolder(customerName: string, fileNo: string) {
    return callDropbox({ action: 'getFolder', customerName, fileNo });
  },

  /** Herhangi bir dosyayı Dropbox'a yükle (ek/belge) */
  async uploadAttachment(
    customerName: string,
    fileNo: string,
    fileName: string,
    fileBase64: string,
  ): Promise<{ viewLink: string; filePath: string }> {
    return callDropbox({ action: 'uploadAttachment', customerName, fileNo, fileName, fileBase64 }) as Promise<{ viewLink: string; filePath: string }>;
  },

  /** Dropbox klasöründeki dosyaları listele */
  async listFolder(
    customerName: string,
    fileNo: string,
  ): Promise<Array<{ name: string; path: string; size: number; modified: string }>> {
    const res = await callDropbox({ action: 'listFolder', customerName, fileNo });
    return (res.files as Array<{ name: string; path: string; size: number; modified: string }>) ?? [];
  },

  /** trade_files tablosuna Dropbox klasör bilgisini kaydet */
  async saveFolderToDb(tradeFileId: string, folderPath: string, folderUrl: string) {
    const { error } = await supabase
      .from('trade_files')
      .update({ dropbox_folder_path: folderPath, dropbox_folder_url: folderUrl })
      .eq('id', tradeFileId);
    if (error) throw new Error(error.message);
  },
};
