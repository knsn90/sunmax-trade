import { useState, useRef } from 'react';
import { Mic, MicOff, Sparkles, Loader2, Check, X } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AIFormFillProps {
  formType: 'new_file' | 'transport_plan' | 'to_sale' | string;
  context?: Record<string, unknown>;
  onFill: (fields: Record<string, unknown>) => void;
  placeholder?: string;
}

interface PreviewItem {
  label: string;
  value: string;
}

// Field labels for preview display
const FIELD_LABELS: Record<string, string> = {
  customer_name:    'Müşteri',
  product_name:     'Ürün',
  tonnage_mt:       'Tonaj (MT)',
  file_date:        'Tarih',
  customer_ref:     'Müşteri Ref',
  notes:            'Notlar',
  loading_date:     'Yükleme Tarihi',
  freight_company:  'Navlun Firması',
  selling_price:    'Satış Fiyatı',
  purchase_price:   'Alış Fiyatı',
  freight_cost:     'Nakliye Maliyeti',
  incoterms:        'Incoterms',
  port_of_loading:  'Yükleme Limanı',
  port_of_discharge:'Tahliye Limanı',
  eta:              'ETA',
  payment_terms:    'Ödeme Koşulları',
};

// Fields that should be hidden from the preview (raw IDs)
const HIDDEN_FIELDS = new Set(['customer_id', 'product_id', 'supplier_id']);

// ── Speech Recognition ────────────────────────────────────────────────────────
interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
}
declare global {
  interface Window {
    SpeechRecognition: new () => ISpeechRecognition;
    webkitSpeechRecognition: new () => ISpeechRecognition;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AIFormFill({ formType, context = {}, onFill, placeholder }: AIFormFillProps) {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [rawFields, setRawFields] = useState<Record<string, unknown> | null>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  const SpeechAPI: (new () => ISpeechRecognition) | null =
    typeof window !== 'undefined'
      ? (window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null)
      : null;
  const voiceSupported = !!SpeechAPI;

  // ── Voice ──────────────────────────────────────────────────────────────────

  function toggleRecording() {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    if (!SpeechAPI) return;

    const rec = new SpeechAPI();
    rec.lang = 'tr-TR';
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      setText(prev => (prev ? `${prev} ${transcript}` : transcript));
    };
    rec.onerror = () => {
      setIsRecording(false);
      toast.error('Ses tanıma başarısız');
    };
    rec.onend = () => setIsRecording(false);

    rec.start();
    recognitionRef.current = rec;
    setIsRecording(true);
  }

  // ── AI call ────────────────────────────────────────────────────────────────

  async function handleAnalyze() {
    if (!text.trim()) return;
    setIsLoading(true);
    setPreview(null);
    setRawFields(null);

    try {
      const { data, error } = await supabase.functions.invoke('ai-form-fill', {
        body: { text, formType, context },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const fields = data?.fields ?? {};
      setRawFields(fields);

      // Build human-readable preview (hide raw IDs, show names)
      const items: PreviewItem[] = Object.entries(fields)
        .filter(([k, v]) => !HIDDEN_FIELDS.has(k) && v !== null && v !== undefined && v !== '')
        .map(([k, v]) => ({
          label: FIELD_LABELS[k] ?? k,
          value: String(v),
        }));

      if (items.length === 0) {
        toast.warning('Metinden bilgi çıkarılamadı. Daha açık bir şekilde tarif edin.');
        return;
      }

      setPreview(items);
    } catch (e) {
      toast.error(`AI hatası: ${(e as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }

  function applyFields() {
    if (!rawFields) return;
    onFill(rawFields);
    setPreview(null);
    setRawFields(null);
    setText('');
    toast.success('Form dolduruldu ✓');
  }

  function dismiss() {
    setPreview(null);
    setRawFields(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mb-4 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50/80 to-indigo-50/60 p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-violet-600" />
        <span className="text-xs font-semibold text-violet-700">AI ile Doldur</span>
        <span className="text-[10px] text-violet-400 ml-1">
          {voiceSupported ? '— sesle veya yazarak tarif edin' : '— yazarak tarif edin'}
        </span>
      </div>

      {/* Input row */}
      <div className="flex gap-1.5">
        {voiceSupported && (
          <button
            type="button"
            onClick={toggleRecording}
            title={isRecording ? 'Kaydı durdur' : 'Sesle giriş'}
            className={`flex-shrink-0 p-2 rounded-lg border transition-all ${
              isRecording
                ? 'bg-red-500 border-red-500 text-white shadow-md animate-pulse'
                : 'bg-white border-gray-200 text-gray-500 hover:border-violet-300 hover:text-violet-600'
            }`}
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        )}

        <Input
          value={text}
          onChange={e => { setText(e.target.value); setPreview(null); }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAnalyze(); } }}
          placeholder={
            placeholder ??
            (formType === 'new_file'
              ? 'Örn: "ABC müşterisi, kağıt ürünü, 100 ton, ref REF-001"'
              : formType === 'transport_plan'
              ? 'Örn: "Yükleme tarihi 3 Nisan, navlun firması XYZ Lojistik"'
              : 'Form bilgilerini tarif edin…')
          }
          className="flex-1 text-xs h-9 bg-white"
          disabled={isLoading || isRecording}
        />

        <Button
          type="button"
          size="sm"
          onClick={handleAnalyze}
          disabled={!text.trim() || isLoading || isRecording}
          className="bg-violet-600 hover:bg-violet-700 text-white h-9 px-3 flex-shrink-0"
        >
          {isLoading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Sparkles className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* Recording indicator */}
      {isRecording && (
        <div className="flex items-center gap-1.5 text-xs text-red-600">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Dinleniyor… Konuşmayı bitirince otomatik durur.
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="bg-white border border-violet-200 rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-violet-700">Algılanan bilgiler</p>
            <button type="button" onClick={dismiss} className="text-gray-400 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {preview.map(({ label, value }) => (
              <div key={label} className="contents text-xs">
                <span className="text-gray-400">{label}</span>
                <span className="font-medium text-gray-800">{value}</span>
              </div>
            ))}
          </div>

          <Button
            type="button"
            size="xs"
            onClick={applyFields}
            className="mt-1.5 bg-violet-600 hover:bg-violet-700 text-white"
          >
            <Check className="h-3 w-3 mr-1" /> Formu Doldur
          </Button>
        </div>
      )}
    </div>
  );
}
