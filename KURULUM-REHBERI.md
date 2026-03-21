# SunMax Trade Management — Kurulum ve Çalıştırma Rehberi

Bu rehber seni sıfırdan, adım adım çalışan uygulamaya kadar götürür.

---

## Gereksinimler

Bilgisayarında şunlar yüklü olmalı:

| Araç | Minimum Versiyon | Kontrol Komutu |
|------|-----------------|----------------|
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Git | herhangi | `git --version` |

Yüklü değilse:
- Node.js → https://nodejs.org (LTS versiyonu indir)
- Git → https://git-scm.com

---

## ADIM 1 — Supabase Projesi Oluştur (Veritabanı + Auth)

### 1.1 Hesap Aç
1. https://supabase.com adresine git
2. "Start your project" → GitHub hesabınla giriş yap (ücretsiz)

### 1.2 Yeni Proje Oluştur
1. Dashboard'da "New Project" tıkla
2. Ayarlar:
   - **Organization:** kendi ismin (otomatik oluşur)
   - **Project name:** `sunmax-trade`
   - **Database password:** güçlü bir şifre belirle (not al, lazım olacak)
   - **Region:** en yakın lokasyon (Frankfurt veya Istanbul yakınsa)
3. "Create new project" tıkla
4. 1-2 dakika bekle, proje hazırlanacak

### 1.3 API Anahtarlarını Kopyala
Proje hazır olduğunda:
1. Sol menüde **Settings** → **API** git
2. Şu iki değeri bir yere kopyala:
   - **Project URL** → `https://xxxxx.supabase.co` gibi bir şey
   - **anon public key** → `eyJhbGciOiJIUzI1NiIs...` gibi uzun bir key

> ⚠️ Bu değerler ADIM 3'te `.env` dosyasına yazılacak.

### 1.4 Veritabanı Tablolarını Oluştur
1. Sol menüde **SQL Editor** tıkla
2. "New query" tıkla
3. Daha önce sana verdiğim `001_complete_schema.sql` dosyasının tüm içeriğini kopyala-yapıştır
4. **Run** butonuna bas
5. Yeşil "Success" mesajı gelecek
6. Tekrar "New query" → `002_rls_policies.sql` dosyasının içeriğini yapıştır → **Run**

### 1.5 İlk Kullanıcıyı Oluştur
1. Sol menüde **Authentication** → **Users** git
2. "Add user" → "Create new user" tıkla
3. Email ve şifre gir (bu senin admin login'in olacak)
4. "Create user" tıkla
5. Şimdi sol menüde **Table Editor** → `profiles` tablosuna git
6. Az önce oluşan kullanıcının satırını bul
7. `role` sütununu tıkla → `admin` yaz → kaydet

> Artık veritabanı ve auth hazır.

---

## ADIM 2 — Proje Dosyalarını Bilgisayarına Al

### Seçenek A: Bu chat'ten dosyaları indir
Yukarıda oluşturduğum tüm dosyalar zaten mevcut. İndirip bir klasöre koy.

### Seçenek B: Manuel oluştur
1. Bilgisayarında bir klasör oluştur:
```bash
mkdir sunmax-trade
cd sunmax-trade
```

2. İndirdiğin dosyaları bu klasöre aynen kopyala. Klasör yapısı şöyle olmalı:

```
sunmax-trade/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── src/
│   ├── main.tsx
│   ├── vite-env.d.ts
│   ├── styles/
│   │   └── globals.css
│   ├── app/
│   │   ├── App.tsx
│   │   └── router.tsx
│   ├── types/
│   │   ├── enums.ts
│   │   ├── database.ts
│   │   └── forms.ts
│   ├── lib/
│   │   ├── utils.ts
│   │   ├── formatters.ts
│   │   ├── generators.ts
│   │   └── permissions.ts
│   ├── services/
│   │   ├── supabase.ts
│   │   ├── tradeFileService.ts
│   │   ├── customerService.ts
│   │   ├── supplierService.ts
│   │   ├── serviceProviderService.ts
│   │   ├── productService.ts
│   │   ├── invoiceService.ts
│   │   ├── packingListService.ts
│   │   ├── transactionService.ts
│   │   └── settingsService.ts
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useTradeFiles.ts
│   │   ├── useEntities.ts
│   │   ├── useDocuments.ts
│   │   ├── useTransactions.ts
│   │   └── useSettings.ts
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Topbar.tsx
│   │   │   └── AuthGuard.tsx
│   │   ├── ui/
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── form-elements.tsx
│   │   │   ├── dialog.tsx
│   │   │   └── shared.tsx
│   │   ├── pipeline/
│   │   │   └── KanbanCard.tsx
│   │   ├── trade-files/
│   │   │   ├── NewFileModal.tsx
│   │   │   ├── ToSaleModal.tsx
│   │   │   └── DeliveryModal.tsx
│   │   ├── documents/
│   │   │   └── InvoiceModal.tsx
│   │   └── accounting/
│   │       └── TransactionModal.tsx
│   └── pages/
│       ├── LoginPage.tsx
│       ├── PipelinePage.tsx
│       ├── TradeFilesPage.tsx
│       ├── TradeFileDetailPage.tsx
│       ├── AccountingPage.tsx
│       ├── CustomersPage.tsx
│       ├── SettingsPage.tsx
│       └── StubPages.tsx
└── supabase/
    ├── migrations/
    └── functions/
```

---

## ADIM 3 — Ortam Değişkenlerini Ayarla

Proje klasörünün kök dizininde `.env` adında bir dosya oluştur:

```bash
# sunmax-trade/.env

VITE_SUPABASE_URL=https://XXXXX.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.XXXXXXX
```

> ⚠️ `XXXXX` kısımlarını ADIM 1.3'te kopyaladığın gerçek değerlerle değiştir.

---

## ADIM 4 — Bağımlılıkları Yükle ve Çalıştır

Terminal (komut satırı) aç, proje klasörüne git:

```bash
cd sunmax-trade

# Bağımlılıkları yükle (ilk seferde 1-2 dakika sürer)
npm install

# Geliştirme sunucusunu başlat
npm run dev
```

Şu çıktıyı göreceksin:

```
  VITE v5.4.x  ready in 500ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

---

## ADIM 5 — Uygulamayı Aç

1. Tarayıcıda **http://localhost:5173** adresine git
2. Login sayfası gelecek
3. ADIM 1.5'te oluşturduğun email ve şifreyi gir
4. "Sign In" tıkla
5. Pipeline sayfası açılacak — uygulama çalışıyor!

---

## Sık Karşılaşılan Hatalar ve Çözümleri

### Hata: "Missing VITE_SUPABASE_URL..."
**Sebep:** `.env` dosyası eksik veya yanlış konumda.
**Çözüm:** `.env` dosyasının `package.json` ile aynı klasörde olduğundan emin ol.

### Hata: "Invalid login credentials"
**Sebep:** Supabase'de kullanıcı email/şifre yanlış.
**Çözüm:** Supabase Dashboard → Authentication → Users'dan kontrol et.

### Hata: Login sonrası boş sayfa / "relation does not exist"
**Sebep:** SQL scriptleri çalıştırılmamış.
**Çözüm:** ADIM 1.4'ü tekrar kontrol et. SQL Editor'da her iki script'i de çalıştır.

### Hata: "permission denied for table profiles"
**Sebep:** RLS policies eksik.
**Çözüm:** `002_rls_policies.sql`'i SQL Editor'da çalıştır.

### Hata: Login sonrası profile yüklenmiyor
**Sebep:** `profiles` tablosunda kullanıcının satırı yok veya role atanmamış.
**Çözüm:** Table Editor → `profiles` → kullanıcının `role` sütununu `admin` yap.

### Hata: npm install başarısız
**Çözüm:**
```bash
# Node versiyonunu kontrol et (18+ gerekli)
node --version

# Cache temizle ve tekrar dene
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

---

## Günlük Kullanım

### Uygulamayı başlatmak
```bash
cd sunmax-trade
npm run dev
```
Tarayıcıda http://localhost:5173 aç.

### Uygulamayı durdurmak
Terminal'de `Ctrl + C` bas.

### Production build (sunucuya deploy için)
```bash
npm run build
```
`dist/` klasöründe deploy-ready dosyalar oluşur.

---

## Vercel'e Deploy (İsteğe Bağlı — İnternetten Erişim)

Uygulamayı herkesin erişebileceği bir URL'de yayınlamak istersen:

1. Kodu GitHub'a pushla:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/SENIN-HESABIN/sunmax-trade.git
git push -u origin main
```

2. https://vercel.com → GitHub ile giriş yap
3. "Import Project" → GitHub reposunu seç
4. Environment Variables ekle:
   - `VITE_SUPABASE_URL` = senin Supabase URL'in
   - `VITE_SUPABASE_ANON_KEY` = senin anon key'in
5. "Deploy" tıkla
6. 1-2 dakika sonra `sunmax-trade.vercel.app` gibi bir URL'den erişebilirsin

---

## Mevcut Prototipten Veri Taşıma

Eski HTML prototipindeki verileri yeni sisteme taşımak için:

1. Eski prototipi tarayıcıda aç
2. Settings → "Export Backup" tıkla → JSON dosyası inecek
3. Bu JSON dosyasını saklı tut
4. Yeni sistemde veri import özelliği geliştirildikten sonra yükleyebilirsin

> Not: Veri taşıma (migration) özelliği henüz kodlanmadı. Şu an yeni sisteme elle veri girebilirsin.

---

## Sonraki Adımlar

Uygulama çalışmaya başladıktan sonra sırayla şunları yapabilirsin:

1. **Müşteri/Tedarikçi/Ürün ekle** — Database sayfalarından
2. **İlk trade file'ı oluştur** — Pipeline'dan "+ New File"
3. **Fatura kes** — File detail sayfasından "Invoice" butonu
4. **Muhasebe işlemi gir** — Muhasebe sayfasından "+ Yeni İşlem"

Eksik sayfalar (Suppliers, Products, ServiceProviders, Invoices, PackingLists, Reports)
CustomersPage ile aynı yapıda — bana söyle, hepsini detaylı olarak üreteyim.
