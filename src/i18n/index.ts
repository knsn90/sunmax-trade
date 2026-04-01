import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
] as const;

export type LangCode = typeof SUPPORTED_LANGUAGES[number]['code'];

export const NAMESPACES = [
  'common',
  'nav',
  'auth',
  'dashboard',
  'accounting',
  'tradeFiles',
  'pipeline',
  'contacts',
  'settings',
  'documents',
  'profile',
  'ledger',
  'finReports',
  'bankRecon',
  'activity',
  'reports',
  'priceList',
  'products',
  'legacy',
] as const;

export type Namespace = typeof NAMESPACES[number];

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // Default & fallback
    fallbackLng: 'en',
    supportedLngs: ['en', 'tr'],
    defaultNS: 'common',
    ns: NAMESPACES,

    // Lazy loading via http-backend
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },

    // Language detection order
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18n_lang',
      caches: ['localStorage'],
    },

    // React options
    react: {
      useSuspense: true,
    },

    interpolation: {
      escapeValue: false, // React already escapes
    },

    // No debug in production
    debug: import.meta.env.DEV,
  });

export default i18n;

/**
 * Change language and persist to localStorage
 */
export function setLanguage(lang: LangCode) {
  i18n.changeLanguage(lang);
  localStorage.setItem('i18n_lang', lang);
}

/**
 * Get current language code
 */
export function getCurrentLang(): LangCode {
  const lang = i18n.language?.slice(0, 2) as LangCode;
  return ['en', 'tr'].includes(lang) ? lang : 'en';
}
