# Test Altyapısı

Bu proje için katmanlı test/CI altyapısı. Aşağıdaki tablo istenen kapsamı ve
mevcut durumu gösterir.

| Test | Araç | Ne zaman | Durum | Komut / Dosya |
|---|---|---|---|---|
| Lint | ESLint 9 | Her commit (CI) | ✅ çalışır (CI'da şimdilik bloklamıyor) | `npm run lint` · `eslint.config.js` |
| Type Check | TypeScript | Her commit (CI) | ✅ bloklar | `npm run typecheck` |
| Unit Test | Vitest | Her commit (CI) | ✅ bloklar | `npm test` / `npm run test:run` |
| API Test | Vitest (fetch) | Her commit (CI) | ⚠️ scaffold | `tests/unit/` (aşağıya bak) |
| E2E Test | Playwright | Her PR + deploy | ✅ smoke çalışır; auth'lu kısım secret ister | `npm run test:e2e` · `e2e/` |
| Load Test | k6 | Haftalık / manuel | ⚠️ guard'lı; TEST ortamı ister | `tests/load/k6-smoke.js` |
| Security Scan | Semgrep + npm audit | Günlük (CI) | ✅ çalışır | `.github/workflows/security.yml` |
| Lighthouse | Lighthouse CI | UI değişimlerinde / PR | ✅ çalışır | `lighthouserc.json` |
| Regression | Playwright | Her deploy (main push) | ✅ e2e.yml push'ta çalışır | `.github/workflows/e2e.yml` |
| DB Migration Test | Supabase CLI (yerel) | Her migration | ⚠️ `supabase/config.toml` ister | `.github/workflows/migration-test.yml` |

## Yerel komutlar

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm test              # vitest (watch)
npm run test:run      # vitest tek sefer
npm run test:coverage # kapsam raporu (coverage/)
npm run test:e2e      # playwright (önce: npm run build)
```

## CI iş akışları (`.github/workflows/`)

- **ci.yml** — her push/PR: typecheck (bloklar), lint (raporlar), unit/API test
  (bloklar), coverage, build, npm audit.
- **e2e.yml** — her PR + main push (regression): Playwright + Lighthouse.
- **security.yml** — günlük + push: Semgrep (SAST) + npm audit.
- **load-test.yml** — manuel + haftalık: k6 (yalnız TEST ortamı).
- **migration-test.yml** — migration değişince: migration'ları taze DB'ye uygular.

## Karar / kurulum gerektirenler

### E2E (auth'lu akışlar)
Login sonrası testler için GitHub repo secret'ları:
`E2E_BASE_URL` (staging/preview URL), `E2E_EMAIL`, `E2E_PASSWORD`,
`E2E_TENANT_SLUG`. Ayarlanmazsa auth'lu testler otomatik atlanır; public
smoke testi yine çalışır. Not: giriş selektörleri (`e2e/smoke.spec.ts`)
uygulamaya göre ince ayar gerektirebilir.

### Load test (k6) — ⚠️ ÖNEMLİ
**ASLA production'a çalıştırma.** Yüksek istek hacmi Supabase Disk IO bütçesini
tüketip kesinti yaratır. Script'te production alan adı/proje-ref'i reddeden bir
guard var. Kullanım: ayrı bir **test/staging Supabase projesi** veya **Supabase
branch** oluştur, URL'ini manuel tetiklemede gir veya `K6_LOAD_TARGET` secret'ı
olarak ver.

### Migration test
Yerel Supabase stack'i gerektirir. Bir kez:
```bash
supabase init      # supabase/config.toml oluşturur → commit et
```
Sonra CI her migration'da `supabase db reset` ile tüm migration'ları taze bir
DB'ye sırayla uygular; sıra/sözdizim/bağımlılık hatalarını yakalar.

### API testleri
Proje bir Express sunucusu içermez (Vite SPA + Supabase). Bu yüzden "Supertest"
yerine API testleri: (a) edge function'lara karşı `fetch` tabanlı entegrasyon
testleri, (b) servis modüllerinin mock'lu Supabase client ile testi. `tests/unit/`
altında yazılır ve Vitest ile çalışır.

## Mevcut testler
- `src/lib/formatters.test.ts` — toUSD, fN, fCurrency, fDateDMY, today (16 assertion)
- `src/lib/generators.test.ts` — nextAvailableDocNo (doc-no çakışma mantığı)

## Yol haritası (öneri)
1. Lint uyarılarını kademeli temizle → CI'da lint'i **bloklayıcı** yap
   (`ci.yml`'de `continue-on-error` kaldır).
2. Kritik servisler için unit test kapsamını artır (transactionService,
   invoiceService — para/USD mantığı).
3. E2E secret'larını ayarla → auth'lu regression akışları.
4. Test Supabase projesi/branch → migration testi + güvenli load test.
