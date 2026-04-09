import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTradeFileAttachments, useCreateTradeFileAttachment, useDeleteTradeFileAttachment } from '@/hooks/useTradeFileAttachments';
import { dropboxService } from '@/services/dropboxService';
import { useTheme } from '@/contexts/ThemeContext';
import { Paperclip, Upload, Trash2, ExternalLink, FileText, FolderOpen, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModified(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function AttachmentsSection({
  tradeFileId,
  customerName,
  fileNo,
  dropboxFolderUrl,
}: {
  tradeFileId: string;
  customerName: string;
  fileNo: string;
  dropboxFolderUrl?: string | null;
}) {
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';
  const { data: attachments = [], isLoading } = useTradeFileAttachments(tradeFileId);
  const create = useCreateTradeFileAttachment(tradeFileId);
  const remove = useDeleteTradeFileAttachment(tradeFileId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Dropbox folder contents — fetched lazily, cached 5 min
  const {
    data: dropboxFiles = [],
    isLoading: dbxLoading,
    refetch: refetchDbx,
    isFetching: dbxFetching,
  } = useQuery({
    queryKey: ['dropbox-folder-files', customerName, fileNo],
    queryFn: () => dropboxService.listFolder(customerName, fileNo),
    staleTime: 1000 * 60 * 5,
    enabled: !!customerName && !!fileNo,
    retry: false,
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        toast.loading(`Yükleniyor: ${file.name}`, { id: `upload-${file.name}` });
        // Read as base64
        const fileBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        // Upload to Dropbox
        const res = await dropboxService.uploadAttachment(customerName, fileNo, file.name, fileBase64);
        // Save to DB
        await create.mutateAsync({
          trade_file_id: tradeFileId,
          name: file.name,
          file_type: file.type || null,
          file_size_bytes: file.size,
          dropbox_url: res.viewLink,
          dropbox_path: res.filePath,
        });
        toast.success(`${file.name} yüklendi`, { id: `upload-${file.name}` });
        // Refresh Dropbox listing after upload
        refetchDbx();
      } catch (err) {
        toast.error(`${file.name}: ${(err as Error).message}`, { id: `upload-${file.name}` });
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 flex items-center gap-2.5 border-b border-gray-50">
        <Paperclip className="h-4 w-4 text-gray-400" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Ekler</span>
        {attachments.length > 0 && (
          <span className="ml-1 text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
            {attachments.length}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {dropboxFolderUrl && (
            <a
              href={dropboxFolderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-blue-600 px-2.5 py-1.5 rounded-xl hover:bg-blue-50 transition-colors"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Dropbox
            </a>
          )}
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-xl text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
            style={{ background: accent }}
          >
            <Upload className="h-3.5 w-3.5" />
            {uploading ? 'Yükleniyor…' : 'Dosya Ekle'}
          </button>
        </div>
      </div>

      {/* DB-tracked attachments */}
      {isLoading ? (
        <div className="px-6 py-4 text-[12px] text-gray-400">Yükleniyor…</div>
      ) : attachments.length === 0 ? (
        <div
          className="px-6 py-8 text-center border-2 border-dashed border-gray-100 m-4 rounded-xl cursor-pointer hover:border-gray-300 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="h-6 w-6 text-gray-300 mx-auto mb-2" />
          <p className="text-[12px] text-gray-400">Dosya eklemek için tıkla veya sürükle</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {attachments.map(att => (
            <div key={att.id} className="px-6 py-3 flex items-center gap-3 group hover:bg-gray-50/60 transition-colors">
              <FileText className="h-4 w-4 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-800 truncate">{att.name}</p>
                <p className="text-[10px] text-gray-400">{formatBytes(att.file_size_bytes)}</p>
              </div>
              {att.dropbox_url && (
                <a
                  href={att.dropbox_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50 transition-colors shrink-0"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <button
                onClick={() => remove.mutate(att.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Dropbox folder contents */}
      <div className="border-t border-gray-100">
        <div className="px-6 py-3 flex items-center gap-2 bg-gray-50/60">
          <FolderOpen className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Dropbox Klasör</span>
          <button
            onClick={() => refetchDbx()}
            disabled={dbxFetching}
            className="ml-auto text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40"
            title="Yenile"
          >
            <RefreshCw className={`h-3 w-3 ${dbxFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {dbxLoading ? (
          <div className="px-6 py-3 text-[12px] text-gray-400">Yükleniyor…</div>
        ) : dropboxFiles.length === 0 ? (
          <div className="px-6 py-4 text-center text-[12px] text-gray-400">Klasör boş veya henüz oluşturulmadı</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {dropboxFiles.map((f, i) => (
              <div key={i} className="px-6 py-2.5 flex items-center gap-3 hover:bg-gray-50/60 transition-colors">
                <FileText className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-gray-700 truncate">{f.name}</p>
                  <p className="text-[10px] text-gray-400">{formatBytes(f.size)} · {formatModified(f.modified)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
