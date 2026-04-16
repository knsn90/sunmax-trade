import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Keyboard, Wand2, X, Loader2, Send, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { smartFillForm, FIELD_LABELS, type ChatMessage } from '@/lib/smartfill';
import type { OcrMode, OcrResult } from '@/lib/openai';
import { toast } from 'sonner';

// ─── Web Speech API types ─────────────────────────────────────────────────────
interface ISpeechRecognition extends EventTarget {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start(): void; stop(): void;
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
  getCurrentValues?: () => Record<string, unknown>;
  context?: Record<string, unknown>;
  formName?: string;
  iconOnly?: boolean;
}

interface ConversationEntry {
  id: number;
  userText: string;
  filledFields: string[];
  isProcessing?: boolean;
}

// ─── Examples per mode ───────────────────────────────────────────────────────

const EXAMPLES: Record<OcrMode, string[]> = {
  new_file: [
    'Customer ABC Trading, product pulp, 150 MT',
    'Date today, XYZ customer, Kraft paper, 200 ADMT, ref REF-2026-01',
    'Tonnage 1000 MT, customer Iran Paper Co.',
  ],
  transaction: [
    'Received 5000 USD from ABC Ltd today, payment ref INV-2024-001',
    'Payment to XYZ supplier tomorrow, 3500 EUR, freight invoice',
    'Set date to today, amount 1500 USD',
  ],
  invoice: [
    '150 ADMT, unit price 520 USD, freight 25 USD, CFR, 60 days payment terms',
    'Date today, quantity 200 ADMT, unit price 500 USD, CIF',
    'Proforma no PRF-001, CB no CB-2024-01, insurance POL-123',
  ],
  proforma: [
    '150 ADMT, 520 USD, CFR Iskenderun, 60 days, origin Turkey',
    'Quantity 200 ADMT, price 500 USD, port of loading Mersin, discharge Hamburg',
    'Date tomorrow, freight 30 USD, incoterms FOB',
  ],
  packing_list: [
    'Truck plate 34ABC123, 5 reels, 12.5 ADMT, 14000 kg gross',
    'Two trucks: 34XYZ456 four reels 10 ADMT 11000 kg, 06DEF789 six reels 15 ADMT 16500 kg',
    'Date today, plate 34AAA111, 8 reels, 20 ADMT, 22000 kg',
  ],
};

// ─── Speech Recognition ───────────────────────────────────────────────────────

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w['SpeechRecognition'] ?? w['webkitSpeechRecognition'] ?? null) as SpeechRecognitionCtor | null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SmartFill({ mode, onResult, getCurrentValues, context = {}, formName, iconOnly = true }: SmartFillProps) {
  const [open, setOpen] = useState(false);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>(() =>
    getSpeechRecognition() ? 'voice' : 'text',
  );
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const isListeningRef = useRef(false);
  const speechSupported = !!getSpeechRecognition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  useEffect(() => () => stopListening(), [stopListening]);

  function startListening() {
    const SR = getSpeechRecognition();
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e: ISpeechRecognitionEvent) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join(' ');
      setInputText(t);
    };

    recognition.onend = () => {
      if (isListeningRef.current) {
        try { recognition.start(); } catch { /* ignore */ }
      } else {
        setIsListening(false);
      }
    };

    recognition.onerror = () => {
      isListeningRef.current = false;
      setIsListening(false);
      toast.error('Microphone access error. Check permissions.');
    };

    recognitionRef.current = recognition;
    isListeningRef.current = true;
    recognition.start();
    setIsListening(true);
  }

  function handleMicToggle() {
    if (isListening) {
      stopListening();
    } else {
      setInputText('');
      startListening();
    }
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text) return;

    stopListening();
    setInputText('');
    setIsProcessing(true);

    // Add processing entry to conversation
    const entryId = Date.now();
    setConversation(prev => [...prev, { id: entryId, userText: text, filledFields: [], isProcessing: true }]);

    try {
      const currentValues = getCurrentValues?.() ?? {};
      const result = await smartFillForm(text, mode, currentValues, chatHistory, context);

      // Update filled fields feedback
      const filled = Object.entries(result)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k]) => FIELD_LABELS[k] ?? k);

      setConversation(prev => prev.map(e =>
        e.id === entryId ? { ...e, filledFields: filled, isProcessing: false } : e
      ));

      // Update chat history for multi-turn
      setChatHistory(prev => [
        ...prev,
        { role: 'user', content: text },
        { role: 'assistant', content: JSON.stringify(result) },
      ]);

      // Apply to form
      onResult(result);

      if (filled.length === 0) {
        toast.warning('No fields filled. Try a different phrase.');
      }

    } catch (err) {
      setConversation(prev => prev.map(e =>
        e.id === entryId ? { ...e, filledFields: [], isProcessing: false } : e
      ));
      toast.error(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsProcessing(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleReset() {
    setConversation([]);
    setChatHistory([]);
    setInputText('');
    stopListening();
  }

  function handleClose() {
    stopListening();
    setOpen(false);
    setInputText('');
  }

  function useExample(ex: string) {
    setInputText(ex);
    setInputMode('text');
    textareaRef.current?.focus();
  }

  return (
    <>
      {/* Trigger button */}
      {iconOnly ? (
        <button
          type="button"
          title="Akıllı Doldur"
          onClick={() => setOpen(true)}
          className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
        >
          <Wand2 className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-brand-600 border-brand-300 hover:bg-brand-50"
          onClick={() => setOpen(true)}
        >
          <Wand2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Akıllı Doldur</span>
          <span className="sm:hidden">AI</span>
        </Button>
      )}

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="w-full max-w-lg flex flex-col gap-0 p-0 max-h-[90vh]">

          {/* Header */}
          <DialogHeader className="px-4 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
                <Wand2 className="h-4 w-4 text-brand-500" />
                Akıllı Doldur {formName ? `— ${formName}` : ''}
              </DialogTitle>
              <div className="flex items-center gap-1">
                {conversation.length > 0 && (
                  <Button variant="ghost" size="xs" onClick={handleReset} className="text-muted-foreground">
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Temizle
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Conversation area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 min-h-[200px] max-h-[400px]">
            {conversation.length === 0 ? (
              /* Empty state — examples */
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground text-center">
                  Ne doldurmamı istediğinizi yazın veya söyleyin.
                </p>
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground">Örnek komutlar:</p>
                  {EXAMPLES[mode].map((ex, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => useExample(ex)}
                      className="w-full text-left text-xs bg-gray-50 hover:bg-brand-50 border border-border hover:border-brand-300 rounded-lg px-3 py-2 transition-colors text-gray-700"
                    >
                      "{ex}"
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Conversation entries */
              <div className="space-y-3">
                {conversation.map((entry) => (
                  <div key={entry.id} className="space-y-1.5">
                    {/* User message */}
                    <div className="flex justify-end">
                      <div className="bg-brand-500 text-white text-xs px-3 py-2 rounded-2xl rounded-tr-sm max-w-[85%]">
                        {entry.userText}
                      </div>
                    </div>

                    {/* AI response */}
                    <div className="flex justify-start">
                      {entry.isProcessing ? (
                        <div className="bg-gray-100 text-xs px-3 py-2 rounded-2xl rounded-tl-sm flex items-center gap-1.5 text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          İşleniyor...
                        </div>
                      ) : entry.filledFields.length > 0 ? (
                        <div className="bg-green-50 border border-green-200 text-xs px-3 py-2 rounded-2xl rounded-tl-sm max-w-[85%]">
                          <p className="font-semibold text-green-700 mb-1.5">
                            ✅ {entry.filledFields.length} alan dolduruldu
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {entry.filledFields.map((f) => (
                              <span key={f} className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full text-[10px] border border-green-200">
                                {f}
                              </span>
                            ))}
                          </div>
                          <p className="text-[10px] text-green-600 mt-1.5">Daha fazla detay ekleyebilirsiniz.</p>
                        </div>
                      ) : (
                        <div className="bg-orange-50 border border-orange-200 text-xs px-3 py-2 rounded-2xl rounded-tl-sm text-orange-700">
                          ⚠️ Alan doldurulamadı. Daha net bir ifade deneyin.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="border-t border-border px-3 py-3 flex-shrink-0 bg-gray-50/50">
            {/* Voice / Text toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden mb-2 bg-white">
              <button
                type="button"
                disabled={!speechSupported}
                className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  inputMode === 'voice' ? 'bg-brand-500 text-white' : 'text-muted-foreground hover:bg-gray-50'
                } ${!speechSupported ? 'opacity-40 cursor-not-allowed' : ''}`}
                onClick={() => { if (speechSupported) { setInputMode('voice'); } }}
              >
                <Mic className="h-3.5 w-3.5" /> Voice
              </button>
              <button
                type="button"
                className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  inputMode === 'text' ? 'bg-brand-500 text-white' : 'text-muted-foreground hover:bg-gray-50'
                }`}
                onClick={() => { setInputMode('text'); stopListening(); }}
              >
                <Keyboard className="h-3.5 w-3.5" /> Text
              </button>
            </div>

            {inputMode === 'voice' ? (
              /* Voice mode */
              <div className="flex flex-col items-center gap-2 py-1">
                <button
                  type="button"
                  onClick={handleMicToggle}
                  className={`w-16 h-16 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 ${
                    isListening
                      ? 'bg-red-500 text-white scale-110 ring-4 ring-red-200 animate-pulse'
                      : 'bg-brand-500 text-white hover:bg-brand-600'
                  }`}
                >
                  {isListening ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
                </button>
                <p className="text-xs text-muted-foreground text-center">
                  {isListening ? '🔴 Listening...' : 'Press the mic button and speak'}
                </p>
                {inputText && (
                  <div className="w-full bg-white border border-border rounded-xl px-3 py-2 text-xs text-gray-800 min-h-[44px]">
                    {inputText}
                  </div>
                )}
                {inputText && (
                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleSend}
                    disabled={isProcessing}
                  >
                    {isProcessing
                      ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Processing...</>
                      : <><Wand2 className="h-4 w-4 mr-1.5" /> Fill Form</>
                    }
                  </Button>
                )}
              </div>
            ) : (
              /* Text mode */
              <div className="flex gap-2">
                <textarea
                  ref={textareaRef}
                  className="flex-1 resize-none rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white min-h-[44px] max-h-[120px]"
                  placeholder="Type your request... (Enter to send, Shift+Enter for new line)"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  autoFocus
                />
                <Button
                  type="button"
                  onClick={handleSend}
                  disabled={!inputText.trim() || isProcessing}
                  className="self-end h-10 w-10 p-0 rounded-xl flex-shrink-0"
                >
                  {isProcessing
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />
                  }
                </Button>
              </div>
            )}
          </div>

          {/* Close button */}
          <div className="px-3 pb-3 flex-shrink-0">
            <Button type="button" variant="outline" className="w-full" onClick={handleClose} size="sm">
              <X className="h-4 w-4 mr-1.5" /> Close
            </Button>
          </div>

        </DialogContent>
      </Dialog>
    </>
  );
}
