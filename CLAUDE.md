# Sunmax Trade — Proje Kuralları

## Tech Stack

- **Vite + React + TypeScript** (Next.js DEĞİL — `'use client'` yok, `next/font` yok)
- **Tailwind CSS** + **shadcn/ui** bileşenleri
- **Supabase** (PostgreSQL + RLS)
- **React Query** (`useQuery`, `useMutation`, `useQueryClient`)
- **React Router** (`useNavigate`, `useParams`)
- **react-hook-form** + **zod** (form validasyonu)

---

## Tasarım Sistemi — ZORUNLU KURALLAR

> Tüm yeni sayfalar, listeler, formlar ve bileşenler bu kurallara uymalıdır.
> Referans: `src/pages/TradeFilesPage.tsx`

### Primary Renk

```ts
// Tema'dan al — ASLA sabit mavi kullanma
const { theme } = useTheme();
const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';
// Aktif tema: 'donezo' → primary = #dc2626 (kırmızı)
```

- Tüm primary butonlar, aktif seçimler, FAB'lar → `style={{ background: accent }}`
- Sabit `bg-blue-600`, `text-blue-600` kullanma — accent değişkenini kullan

### Tipografi Skalası

| Kullanım | Class |
|---|---|
| Ana içerik, kişi/dosya adı | `text-[13px] font-semibold text-gray-900` |
| İkincil bilgi (alt satır) | `text-[11px] text-gray-400` |
| Meta bilgi, etiket, badge | `text-[10px] font-semibold` |
| Tablo başlığı | `text-[10px] font-bold uppercase tracking-wider text-gray-400` |
| Monospace ID / referans no | `text-[10px] font-mono text-gray-400` |
| Form label | `text-[11px] font-medium text-gray-500` (veya `text-[11px] text-gray-400`) |
| Büyük sayısal değer (KPI) | `text-xl font-black` veya `text-2xl font-black` |

### Kart / Konteyner

```tsx
// Standart kart
<div className="bg-white rounded-2xl shadow-sm overflow-hidden">

// Mobil liste (kenarlarda boşluk)
<div className="mx-3 rounded-2xl overflow-hidden shadow-sm bg-white divide-y divide-gray-50">

// İçerik padding
<div className="px-5 py-4">  // büyük kart
<div className="px-4 py-3">  // tablo hücresi
<div className="p-4">        // form kartı
```

### Tablo

```tsx
// Wrapper
<div className="bg-white rounded-2xl shadow-sm overflow-hidden">
  <table className="w-full">
    <thead>
      <tr className="border-b border-gray-100">
        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Başlık
        </th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-b border-gray-50 hover:bg-gray-50/60 cursor-pointer transition-colors">
        <td className="px-4 py-3 text-[12px] text-gray-600">İçerik</td>
      </tr>
    </tbody>
  </table>
</div>
```

- Zebra satır: `i % 2 === 1 && 'bg-gray-50/40'`
- Hover: `hover:bg-gray-50/60 transition-colors`
- Satır separator: `border-b border-gray-50`

### Filtre Pilleri (Segment)

```tsx
// Konteyner
<div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto scrollbar-none">
  <button
    className={`shrink-0 px-3 h-8 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap ${
      active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
    }`}
  >
    Etiket
  </button>
</div>
```

### Tab Bar (sayfa içi sekme geçişi)

```tsx
<div className="flex border-b border-gray-100">
  {tabs.map((tab) => (
    <button
      key={tab.key}
      onClick={() => setActiveTab(tab.key)}
      className={cn(
        'flex-1 py-3 text-[13px] font-semibold transition-all border-b-2 -mb-px',
        activeTab === tab.key
          ? 'border-red-600 text-red-600 bg-red-50/40'  // accent rengi
          : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50',
      )}
    >
      {tab.label}
    </button>
  ))}
</div>
```

### Butonlar

```tsx
// Primary (CTA)
<button
  className="h-9 px-4 rounded-xl text-white text-[13px] font-semibold shadow-sm hover:opacity-90 transition-opacity"
  style={{ background: accent }}
>
  Yeni Dosya
</button>

// Mobil FAB
<button
  className="w-8 h-8 rounded-full flex items-center justify-center text-white shadow"
  style={{ background: accent }}
>
  <Plus className="h-4 w-4" />
</button>

// Tehlikeli / Sil
<button className="text-[11px] text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50">
  Sil
</button>

// Ghost / ikincil
<button className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 transition-colors px-2 py-1 rounded-lg hover:bg-gray-50">
  İptal
</button>
```

### Arama Kutusu

```tsx
// Desktop
<div className="flex items-center gap-2 bg-white rounded-xl px-3 h-9 shadow-sm border border-gray-100 flex-1 max-w-xs">
  <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
  <input className="flex-1 text-[13px] outline-none bg-transparent placeholder:text-gray-400" />
</div>

// Mobil (açıldığında)
<div className="flex items-center gap-2 bg-white rounded-full px-4 h-11 shadow-sm border border-gray-100">
  <Search className="h-4 w-4 text-gray-400 shrink-0" />
  <input className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400" />
</div>
```

### Mobil Liste Satırı

```tsx
// Avatar
<div
  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-[13px] font-bold shadow-sm"
  style={{ background: avatarColor(name) }}
>
  {initials(name)}
</div>

// Satır
<div className="flex items-center gap-3 px-4 py-3.5 bg-white active:bg-gray-50 cursor-pointer">
  {/* Avatar + içerik + sağ ikon */}
  <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
</div>
```

### Status Badge (Nokta + Etiket)

```tsx
const STATUS_META = {
  request:   { dot: 'bg-amber-400',  text: 'text-amber-700' },
  sale:      { dot: 'bg-blue-400',   text: 'text-blue-700' },
  delivery:  { dot: 'bg-violet-400', text: 'text-violet-700' },
  completed: { dot: 'bg-green-400',  text: 'text-green-700' },
  cancelled: { dot: 'bg-gray-300',   text: 'text-gray-400' },
};

// Kullanım
<span className={cn('w-1.5 h-1.5 rounded-full shrink-0', meta.dot)} />
<span className={cn('text-[10px] font-semibold', meta.text)}>{label}</span>
```

### Sayfalama (Pagination)

```tsx
<button
  className={cn(
    'w-7 h-7 rounded-full text-[11px] font-bold transition-all',
    p === current
      ? 'text-white shadow-sm'
      : 'bg-gray-50 text-gray-400 hover:bg-gray-100',
  )}
  style={p === current ? { background: accent } : {}}
>
  {p}
</button>
```

### Empty State

```tsx
<div className="flex flex-col items-center justify-center py-16 text-gray-400">
  <IconComponent className="h-8 w-8 mb-2 opacity-30" />
  <p className="text-sm font-medium text-gray-500">Kayıt bulunamadı</p>
  <p className="text-xs mt-1">Açıklayıcı alt metin</p>
</div>
```

### Yükleme Durumu

```tsx
// Inline spinner
<div className="w-5 h-5 border-2 border-gray-200 border-t-red-500 rounded-full animate-spin" />

// Sayfa yükleme
import { LoadingSpinner } from '@/components/ui/shared';
if (isLoading) return <LoadingSpinner />;
```

---

## Layout Kuralları

### Mobile / Desktop Ayrımı

```tsx
{/* Mobil */}
<div className="md:hidden flex flex-col min-h-screen -mx-4 bg-gray-50">
  ...
</div>

{/* Desktop */}
<div className="hidden md:block">
  ...
</div>
```

### Spacing

- Bölümler arası: `space-y-4` veya `mb-4`
- Form satırları arası: `space-y-3`
- Toolbar: `flex items-center gap-3 mb-4`

---

## Sayfa Yapısı Şablonu

Yeni bir liste sayfası eklendiğinde bu şablonu kullan:

```tsx
export function XxxPage() {
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  // ... veri, filtreleme

  return (
    <>
      {/* MOBILE */}
      <div className="md:hidden flex flex-col min-h-screen -mx-4 bg-gray-50">
        {/* Arama + filtre pilleri */}
        {/* Liste: rounded-2xl white kart */}
        {/* Sayfalama */}
      </div>

      {/* DESKTOP */}
      <div className="hidden md:block">
        {/* Toolbar: arama + filtreler + primary buton */}
        {/* Tablo: bg-white rounded-2xl shadow-sm */}
        {/* Sayfalama */}
      </div>
    </>
  );
}
```

---

## Bento ERP — Detay Sayfası Tasarım Deseni

> Detay sayfaları (örn. `TradeFileDetailPage`) için zorunlu düzen.
> Referans: `src/pages/TradeFileDetailPage.tsx` (desktop bölümü)

### Sayfa Başlığı

```tsx
<div className="flex items-end justify-between mb-7 pt-1">
  <div>
    {/* breadcrumb + durum pill + dosya no */}
    <div className="flex items-center gap-2 mb-2">
      <button onClick={() => navigate(-1)} className="..."><ArrowLeft /></button>
      <span className={cn('px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest', meta.pill)}>
        {status}
      </span>
      <span className="text-[11px] font-mono text-gray-400">{fileNo}</span>
    </div>
    <h1 className="text-[28px] font-extrabold text-gray-900 leading-tight tracking-tight">{title}</h1>
    <p className="text-[13px] text-gray-500 mt-1">{subtitle}</p>
  </div>
  {/* Sağ: action butonlar */}
  <div className="flex gap-3">
    <button className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl text-[13px] flex items-center gap-2 hover:bg-gray-50 shadow-sm">
      <Pencil className="h-3.5 w-3.5" /> Düzenle
    </button>
    <button className="px-5 py-2.5 text-white font-semibold rounded-xl text-[13px] flex items-center gap-2 shadow-sm" style={{ background: accent }}>
      <Plus className="h-3.5 w-3.5" /> Ana Aksiyon
    </button>
  </div>
</div>
```

### Bento Grid (12 kolon)

```tsx
<div className="grid grid-cols-12 gap-6 items-start">
  {/* SOL: 4 kolon — özet + işlemler */}
  <div className="col-span-4 space-y-5">
    {/* Quick info 2×2 */}
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="grid grid-cols-2 divide-x divide-gray-50">
        <div className="px-5 py-4 border-b border-gray-50">
          <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">Etiket</div>
          <div className="text-[15px] font-extrabold text-gray-900">Değer</div>
        </div>
        {/* ... 3 hücre daha */}
      </div>
    </div>

    {/* Operations list */}
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/60">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">İşlemler</span>
      </div>
      <div className="divide-y divide-gray-50">
        <button className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group text-left">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-red-50 transition-colors">
            <Icon className="h-3.5 w-3.5 text-gray-500 group-hover:text-red-600" style={{ color: undefined }} />
          </div>
          <span className="text-[13px] font-semibold text-gray-800">İşlem Adı</span>
        </button>
      </div>
    </div>
  </div>

  {/* SAĞ: 8 kolon — detay kartları */}
  <div className="col-span-8 space-y-5">
    {/* Detay kartı */}
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between border-b border-gray-50">
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-gray-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Başlık</span>
        </div>
        <button className="text-[11px] font-semibold text-gray-400 flex items-center gap-1 hover:text-gray-600">
          <Pencil className="h-3 w-3" /> Düzenle
        </button>
      </div>
      {/* KV satırları */}
      <div className="px-6 py-2">
        <div className="flex justify-between items-center py-2 border-b border-dashed border-gray-100">
          <span className="text-[12px] text-gray-500">Etiket</span>
          <span className="text-[13px] font-bold text-gray-900">Değer</span>
        </div>
      </div>
    </div>
  </div>
</div>
```

### Bento ERP Kuralları

| Element | Class |
|---|---|
| Kart wrapper | `bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden` |
| Kart header | `px-6 py-4 flex items-center justify-between border-b border-gray-50` |
| Bölüm başlığı | `text-[11px] font-bold uppercase tracking-widest text-gray-500` |
| Quick info label | `text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1` |
| Quick info değer | `text-[15px] font-extrabold text-gray-900` |
| KV label | `text-[12px] text-gray-500` |
| KV değer | `text-[13px] font-bold text-gray-900` |
| KV satır ayırıcı | `border-b border-dashed border-gray-100` |
| İşlem ikonu | `w-8 h-8 rounded-xl bg-gray-100 group-hover:bg-red-50` |
| Sayfa başlığı | `text-[28px] font-extrabold text-gray-900 leading-tight tracking-tight` |
| Sayfa altyazı | `text-[13px] text-gray-500 mt-1` |

---

## Finans Renk Kuralları

```tsx
// Borç (debit) — müşteri borcu
className="text-red-600"          // rakam
className="bg-red-50 text-red-700" // badge

// Alacak (credit) — tahsilat
className="text-green-700"           // rakam
className="bg-green-50 text-green-700" // badge

// Bakiye (A) = Alacak → yeşil, (B) = Borç → amber
color: balance < 0 ? '#16a34a' : balance > 0 ? '#b45309' : '#9ca3af'
```

---

## Dil Kuralları

- **Arayüz etiketleri**: Türkçe (`Tarih`, `Firma`, `Durum`)
- **Kod & prop isimleri**: İngilizce (`transaction_date`, `entityType`)
- **Yorum satırları**: Türkçe veya İngilizce, ikisi de kabul

---

## Bileşen Kullanım Kuralları

- `Input` → `@/components/ui/input` (shadcn)
- `NativeSelect` → `@/components/ui/form-elements`
- `Button` → `@/components/ui/button` (shadcn)
- `Dialog`, `DialogContent` vb. → `@/components/ui/dialog`
- `cn()` → `@/lib/utils` (Tailwind class birleştirme)
- `fDate`, `fN`, `fCurrency`, `fUSD` → `@/lib/formatters`
- `toast.success()`, `toast.error()` → `sonner`
- İkonlar → `lucide-react`
