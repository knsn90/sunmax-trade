import { useRef, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { Button } from './button';
import { ocrDocument, getApiKey, type OcrResult, type OcrMode } from '@/lib/openai';
import { toast } from 'sonner';

interface OcrButtonProps {
  onResult: (result: OcrResult) => void;
  mode: OcrMode;
  label?: string;
}

export function OcrButton({ onResult, mode, label = 'Belgeden Oku' }: OcrButtonProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!getApiKey('anthropic')) {
      toast.error('Claude API anahtarı yapılandırılmamış. Ayarlar → API Anahtarları bölümünden ekleyin.');
      return;
    }

    setLoading(true);
    try {
      const result = await ocrDocument(file, mode);
      onResult(result);
      toast.success('Belge okundu — alanlar otomatik dolduruldu');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'OCR failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => fileRef.current?.click()}
      >
        <ScanLine className="h-3.5 w-3.5" />
        {loading ? 'Okunuyor…' : label}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf,.xlsx,.xls,.csv,.docx,.doc"
        className="hidden"
        onChange={handleFile}
      />
    </>
  );
}
