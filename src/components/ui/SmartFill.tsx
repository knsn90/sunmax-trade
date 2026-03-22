import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Keyboard, Wand2, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { smartFillForm, FIELD_LABELS } from '@/lib/smartfill';
import type { OcrMode, OcrResult } from '@/lib/openai';
import { toast } from 'sonner';

// ─── Web Speech API types ─────────────────────────────────────────────────────
interface ISpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: ISpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
interface ISpeechRecognitionResult { 0: { transcript: string } }
interface ISpeechRecognitionEvent { results: ISpeechRecognitionResult[] }
type SpeechRecognitionCtor = new () => ISpeechRecognition;

// ─── Types ────────────────────────────────────────────────────────────────────

interface SmartFillProps {
  mode: OcrMode;
  onResult: (result: OcrResult) => void;
  formName?: string;
}

// ─── Hints per form mode ─────────────────────────────────────────────────────

const HINTS: Record<OcrMode, string> = {
  transaction: '"Tarih bugün, tutar 5000 dolar, ABC Ltd ödemesi"',
  invoice: '"150 ADMT, birim fiyat 520 dolar, navlun 25, ödeme 60 gün"',
  proforma: '"200 ADMT, fiyat 500 dolar, yükleme İskenderun, CIF, 60 gün vadeli"',
  packing_list: '"34ABC123 plakalı, 5 rulo, 12.5 ADMT, 14000 kg"',
};

// ─── Web Speech API detection ────────────────────────────────────────────────

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  return (
    (window as Window & { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ??
    (window as Window & { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition ??
    null
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SmartFill({ mode, onResult, formName }: SmartFillProps) {
  const [open, setOpen] = useState(false);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>(() =>
    getSpeechRecognition() ? 'voice' : 'text',
  );
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filledFields, setFilledFields] = useState<string[]>([]);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const speechSupported = !!getSpeechRecognition();

  // Stop recognition on unmount / close
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  useEffect(() => () => stopListening(), [stopListening]);

  function startListening() {
    const SR = getSpeechRecognition();
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = 'tr-TR';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e: ISpeechRecognitionEvent) => {
      const t = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join('');
      setTranscript(t);
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      toast.error('Ses tanıma hatası. Mikrofon iznini kontrol edin.');
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }

  function handleMicToggle() {
    if (isListening) {
      stopListening();
    } else {
      setTranscript('');
      startListening();
    }
  }

  async function handleFill() {
    if (!transcript.trim()) {
      toast.error('Lütfen önce bilgi girin.');
      return;
    }

    setIsProcessing(true);
    setFilledFields([]);
    stopListening();

    try {
      const result = await smartFillForm(transcript, mode);
      onResult(result);

      const filled = Object.entries(result)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k]) => FIELD_LABELS[k] ?? k);

      setFilledFields(filled);

      if (filled.length === 0) {
        toast.warning('Alan doldurulamadı. Daha açık bir ifade deneyin.');
      } else {
        toast.success(`${filled.length} alan dolduruldu ✓`);
        setTimeout(() => handleClose(), 1800);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setIsProcessing(false);
    }
  }

  function handleClose() {
    stopListening();
    setOpen(false);
    setTranscript('');
    setFilledFields([]);
  }

  return (
    <>
      {/* Trigger button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-brand-600 border-brand-300 hover:bg-brand-50"
        onClick={() => setOpen(true)}
      >
        <Wand2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Akıllı Giriş</span>
        <span className="sm:hidden">AI</span>
      </Button>

      {/* Dialog — works as bottom sheet on mobile */}
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="w-full max-w-md sm:max-w-lg bottom-0 sm:bottom-auto translate-y-0 sm:translate-y-[-50%] rounded-t-2xl sm:rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Wand2 className="h-4 w-4 text-brand-500" />
              Akıllı Giriş {formName ? `— ${formName}` : ''}
            </DialogTitle>
          </DialogHeader>

          {/* Voice / Text tabs */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                inputMode === 'voice'
                  ? 'bg-brand-500 text-white'
                  : 'bg-white text-muted-foreground hover:bg-gray-50'
              } ${!speechSupported ? 'opacity-40 cursor-not-allowed' : ''}`}
              onClick={() => {
                if (!speechSupported) return;
                setInputMode('voice');
                setTranscript('');
              }}
              disabled={!speechSupported}
            >
              <Mic className="h-4 w-4" />
              Sesli Giriş
            </button>
            <button
              type="button"
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                inputMode === 'text'
                  ? 'bg-brand-500 text-white'
                  : 'bg-white text-muted-foreground hover:bg-gray-50'
              }`}
              onClick={() => {
                setInputMode('text');
                stopListening();
              }}
            >
              <Keyboard className="h-4 w-4" />
              Yazılı Giriş
            </button>
          </div>

          {/* ── Voice Mode ── */}
          {inputMode === 'voice' && (
            <div className="flex flex-col items-center gap-4 py-2">
              {/* Big mic button — touch friendly */}
              <button
                type="button"
                className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${
                  isListening
                    ? 'bg-red-500 text-white scale-110 ring-4 ring-red-300 animate-pulse'
                    : 'bg-brand-500 text-white hover:bg-brand-600'
                }`}
                onClick={handleMicToggle}
              >
                {isListening
                  ? <MicOff className="h-9 w-9" />
                  : <Mic className="h-9 w-9" />}
              </button>

              <p className="text-sm text-muted-foreground text-center">
                {isListening
                  ? '🔴 Dinleniyor... (durdurmak için tekrar tıkla)'
                  : transcript
                  ? 'Tekrar başlatmak için tıkla'
                  : 'Mikrofona tıkla ve Türkçe konuş'}
              </p>

              {/* Live transcript */}
              {transcript && (
                <div className="w-full bg-gray-50 border border-border rounded-xl p-3 text-sm text-gray-800 min-h-[60px]">
                  {transcript}
                </div>
              )}
            </div>
          )}

          {/* ── Text Mode ── */}
          {inputMode === 'text' && (
            <div className="flex flex-col gap-2">
              <textarea
                className="w-full h-32 resize-none rounded-xl border border-border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-gray-50"
                placeholder={`Bilgileri Türkçe yazın...\n\nÖrnek: ${HINTS[mode]}`}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {/* Hint (when empty) */}
          {!transcript && inputMode === 'voice' && (
            <p className="text-[11px] text-muted-foreground text-center italic px-2">
              Örnek: {HINTS[mode]}
            </p>
          )}

          {/* Filled fields feedback */}
          {filledFields.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-green-700 mb-2">✅ Doldurulan alanlar:</p>
              <div className="flex flex-wrap gap-1.5">
                {filledFields.map((f) => (
                  <span
                    key={f}
                    className="text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={handleClose}
              disabled={isProcessing}
            >
              <X className="h-4 w-4 mr-1.5" /> İptal
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={handleFill}
              disabled={!transcript.trim() || isProcessing}
            >
              {isProcessing ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> İşleniyor...</>
              ) : (
                <><Wand2 className="h-4 w-4 mr-1.5" /> Formu Doldur</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
