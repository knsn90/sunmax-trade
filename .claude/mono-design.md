# Mono Tasarım Referansı

> "Mono tasarım uygula" denildiğinde bu dosyadaki kurallar uygulanır.
> Referans dosya: `src/components/accounting/PurchaseInvoiceModal.tsx`

---

## 1. Input & Select Primitives

```ts
const inp = 'bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-gray-900 placeholder:text-gray-400 border-0 shadow-none focus:outline-none focus:ring-0 w-full';
const sel = 'bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-gray-900 border-0 shadow-none focus:outline-none w-full appearance-none cursor-pointer';
```

- Shadcn `<Input>` veya `<NativeSelect>` **kullanılmaz**; native `<input className={inp}>` ve `<select className={sel}>` kullanılır.
- Shadcn `<FormRow>` / `<FormGroup>` **kullanılmaz**; doğrudan `<div className="grid grid-cols-N gap-3">` + `<Field>` kullanılır.

---

## 2. Yerel Yardımcı Bileşenler

```tsx
function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{children}</div>;
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Lbl>{label}</Lbl>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 pt-1">{children}</div>;
}

function Divider() { return <div className="border-t border-gray-100 my-1" />; }
```

---

## 3. Form Container

```tsx
<div className="space-y-3 py-1">
  {/* form alanları */}
</div>
```

---

## 4. Grid Düzeni

```tsx
// 2 kolon
<div className="grid grid-cols-2 gap-3">

// 3 kolon
<div className="grid grid-cols-3 gap-3">

// Özel genişlik (tablo gibi)
<div className="grid gap-2" style={{ gridTemplateColumns: '2fr 110px 110px 80px 70px 32px' }}>
```

---

## 5. Ödeme Yöntemi Butonları

```tsx
<button
  className={cn(
    'flex flex-col items-center gap-1 py-2 px-2 rounded-lg text-[10px] font-semibold transition-all',
    isActive ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
  )}
>
```

---

## 6. Masraf / Komisyon Toggle

```tsx
<button
  className="w-full flex items-center justify-center gap-2 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-[11px] font-semibold text-gray-500 transition-colors"
>
  {open ? <ChevronUp /> : <ChevronDown />}
  + Masraf / Komisyon Ekle
</button>
```

---

## 7. Satır Ekle Butonu

```tsx
<button
  className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-[11px] font-semibold text-gray-500 transition-colors"
>
  <Plus className="h-3.5 w-3.5" /> Satır Ekle
</button>
```

---

## 8. Döviz Kuru Yön Toggleu

```tsx
<div className="flex bg-gray-100 rounded-lg overflow-hidden shrink-0">
  <button
    className={cn('px-2 h-8 text-[10px] font-bold whitespace-nowrap transition-colors',
      isActive ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700')}
  >
    {currency}→USD
  </button>
  <button ...>USD→{currency}</button>
</div>
```

---

## 9. Footer (Modal Alt Butonları)

```tsx
<div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-1">
  {/* Sol: yardımcı butonlar (şablon, excel import vb.) */}
  <div className="flex gap-2">
    <button className="h-8 px-3 rounded-lg text-[11px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
      Şablon İndir
    </button>
  </div>
  {/* Sağ: iptal + kaydet */}
  <div className="flex gap-2">
    <button className="h-8 px-4 rounded-lg text-[12px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
      İptal
    </button>
    <button
      disabled={isSaving}
      className="h-8 px-4 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
      style={{ background: accent }}
    >
      {isSaving ? 'Kaydediliyor…' : 'Kaydet'}
    </button>
  </div>
</div>
```

---

## 10. Pill Tab Seçici (Modal Header)

```tsx
<div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto scrollbar-none mt-3">
  {TYPES.map(o => (
    <button
      key={o.value}
      type="button"
      onClick={() => { /* switch logic */ }}
      className={cn(
        'shrink-0 px-3 h-7 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap',
        o.value === currentType
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-500 hover:text-gray-700',
      )}
    >
      {o.label}
    </button>
  ))}
</div>
```

---

## 11. Bölüm Ayırıcısı

```tsx
<Divider />  // → <div className="border-t border-gray-100 my-1" />
```

---

## 12. Accent Rengi

```ts
const { theme } = useTheme();
const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';
// Kaydet butonu: style={{ background: accent }}
// Sabit bg-blue veya bg-red KULLANILMAZ
```

---

## Özet: Mono vs Varsayılan

| Özellik | Varsayılan | Mono |
|---|---|---|
| Input | `<Input className="bg-gray-100 border-0 focus:ring-0">` | `<input className={inp}>` |
| Select | `<NativeSelect className="bg-gray-100 border-0 focus:ring-0">` | `<select className={sel}>` |
| Label | `<FormGroup label="...">` | `<Field label="...">` / `<Lbl>` |
| Grid | `<FormRow cols={2}>` | `<div className="grid grid-cols-2 gap-3">` |
| Ödeme btn aktif | `bg-white border text-gray-900` | `bg-gray-900 text-white` |
| Ödeme btn pasif | `bg-white border text-gray-500` | `bg-gray-100 text-gray-500` |
| Masraf toggle border | `border border-dashed border-gray-300` | `bg-gray-100` (no border) |
