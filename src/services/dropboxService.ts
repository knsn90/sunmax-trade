import { supabase } from './supabase';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function callDropbox(body: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/dropbox`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch (fetchErr) {
    throw new Error(`Ağ hatası: ${(fetchErr as Error).message}`);
  }

  // Read body as text first — avoids "body already used" issues when parsing fails
  const text = await res.text().catch(() => '');

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Edge fn yanıt hatası (HTTP ${res.status}): ${text.slice(0, 400) || '(boş yanıt)'}`);
  }

  if (!data?.success) throw new Error((data?.error as string) ?? 'Dropbox error');
  return data;
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
