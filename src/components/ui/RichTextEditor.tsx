import { useEffect, useRef } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, RemoveFormatting } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
  minHeight?: number;
}

/** Düz metni güvenle HTML'e çevir (kaçış + satır sonları <br>) */
function escapeToHtml(text: string): string {
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc.replace(/\r?\n/g, '<br>');
}

/** Değer HTML mi yoksa düz metin mi? */
function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value);
}

/**
 * Bağımlılıksız zengin metin editörü (contentEditable + toolbar).
 * Değer HTML string olarak saklanır. Düz metin verilirse otomatik HTML'e çevrilir.
 */
export function RichTextEditor({
  value,
  onChange,
  className,
  placeholder,
  minHeight = 140,
}: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);

  // Dış değeri editöre yaz — yalnızca odak dışındayken (yazarken imleci sıfırlamamak için)
  useEffect(() => {
    const el = ref.current;
    if (!el || focusedRef.current) return;
    const html = value ? (looksLikeHtml(value) ? value : escapeToHtml(value)) : '';
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [value]);

  function emit() {
    const el = ref.current;
    if (el) onChange(el.innerHTML);
  }

  function exec(cmd: string) {
    ref.current?.focus();
    focusedRef.current = true;
    document.execCommand(cmd, false);
    emit();
  }

  const ToolbarBtn = ({
    cmd, icon: Icon, title,
  }: { cmd: string; icon: typeof Bold; title: string }) => (
    <button
      type="button"
      title={title}
      // mousedown'ı engelle → contentEditable seçimi/odağı korunur
      onMouseDown={(e) => { e.preventDefault(); exec(cmd); }}
      className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:bg-white hover:text-gray-900 transition-colors"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div className={cn('bg-gray-100 rounded-lg overflow-hidden', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-gray-200/70">
        <ToolbarBtn cmd="bold"                 icon={Bold}            title="Kalın" />
        <ToolbarBtn cmd="italic"               icon={Italic}          title="İtalik" />
        <ToolbarBtn cmd="underline"            icon={Underline}       title="Altı çizili" />
        <span className="w-px h-4 bg-gray-200/80 mx-1" />
        <ToolbarBtn cmd="insertUnorderedList"  icon={List}            title="Madde listesi" />
        <ToolbarBtn cmd="insertOrderedList"    icon={ListOrdered}     title="Numaralı liste" />
        <span className="w-px h-4 bg-gray-200/80 mx-1" />
        <ToolbarBtn cmd="removeFormat"         icon={RemoveFormatting} title="Biçimi temizle" />
      </div>

      {/* Editable alan */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emit}
        onFocus={() => { focusedRef.current = true; }}
        onBlur={() => { focusedRef.current = false; emit(); }}
        className="rte-content px-3 py-2 text-[12px] text-gray-900 leading-relaxed outline-none overflow-y-auto"
        style={{ minHeight }}
      />
      <style>{`
        .rte-content:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        .rte-content ul { list-style: disc;    padding-left: 1.25rem; margin: 0.15rem 0; }
        .rte-content ol { list-style: decimal; padding-left: 1.25rem; margin: 0.15rem 0; }
        .rte-content li { margin: 0.05rem 0; }
      `}</style>
    </div>
  );
}
