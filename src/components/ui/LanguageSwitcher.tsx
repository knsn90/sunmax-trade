import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguage, getCurrentLang, SUPPORTED_LANGUAGES, type LangCode } from '@/i18n';
import { Languages } from 'lucide-react';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentLang = getCurrentLang();
  const current = SUPPORTED_LANGUAGES.find(l => l.code === currentLang);

  // Close on click outside
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function change(lang: LangCode) {
    setLanguage(lang);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 h-8 rounded-xl text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
        title="Change language"
      >
        <Languages className="w-4 h-4" />
        <span className="hidden sm:inline">{current?.flag} {current?.code.toUpperCase()}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 min-w-[140px] overflow-hidden">
          {SUPPORTED_LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => change(lang.code)}
              className={`flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-medium text-left transition-colors hover:bg-gray-50 ${
                i18n.language?.startsWith(lang.code)
                  ? 'text-blue-600 bg-blue-50'
                  : 'text-gray-700'
              }`}
            >
              <span className="text-base">{lang.flag}</span>
              <span>{lang.label}</span>
              {i18n.language?.startsWith(lang.code) && (
                <span className="ml-auto text-blue-600">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
