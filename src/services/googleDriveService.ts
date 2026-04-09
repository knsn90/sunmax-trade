import { supabase } from './supabase';

async function callDrive(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('google-drive', {
    body,
    headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
  });
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error ?? 'Google Drive error');
  return data;
}

export const googleDriveService = {
  /** Dosya oluşturulunca klasörü aç: Sunmax Trade / Müşteri / Dosya No */
  async createTradeFolder(customerName: string, fileNo: string) {
    return callDrive({ action: 'createTradeFolder', customerName, fileNo });
  },

  /** Proforma/Invoice HTML içeriğini Drive'a yükle */
  async uploadDocument(customerName: string, fileNo: string, documentName: string, htmlContent: string) {
    return callDrive({ action: 'uploadDocument', customerName, fileNo, documentName, htmlContent });
  },

  /** Mevcut klasör URL'ini getir */
  async getFolder(customerName: string, fileNo: string) {
    return callDrive({ action: 'getFolder', customerName, fileNo });
  },

  /** trade_files tablosuna Drive klasör bilgisini kaydet */
  async saveFolderToDb(tradeFileId: string, folderId: string, folderUrl: string) {
    const { error } = await supabase
      .from('trade_files')
      .update({ google_drive_folder_id: folderId, google_drive_folder_url: folderUrl })
      .eq('id', tradeFileId);
    if (error) throw new Error(error.message);
  },
};
