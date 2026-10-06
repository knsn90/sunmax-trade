/**
 * Satış Detayları / Teslimat kartlarındaki satır içi düzenlenebilir bilgi satırı.
 * Boş alanlar da görünür ("Henüz girilmedi"); tıklayınca yazılır, Enter/odak kaybında dosyaya
 * kaydedilir. Belgeler (proforma, fatura, ambalaj listesi) bu alanlardan otomatik dolar;
 * ana dosyada girilen metin alanları partilerin BOŞ alanlarına da işlenir.
 */
import { useRef, useState } from 'react';
import type { TradeFile } from '@/types/database';
import type { OrderInfoField } from '@/services/tradeFileService';
import { useUpdateOrderInfo } from '@/hooks/useTradeFiles';
import { fDate, fN } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { HugeiconsIcon } from '@hugeicons/react';
import { Edit02Icon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';

type FieldType = 'text' | 'date' | 'number' | 'select';
interface FieldDef { label: string; type: FieldType; hint?: string; decimals?: number; options?: { value: string; label: string }[] }

export const ORDER_FIELD_DEFS: Record<OrderInfoField, FieldDef> = {
  septi_ref:         { label: 'SEPTİ / CB No',   type: 'text', hint: 'Ambalaj listesi ve faturaya otomatik gelir' },
  insurance_tr:      { label: 'Sigorta (TR)',    type: 'text', hint: 'Ambalaj listesi ve faturaya otomatik gelir' },
  insurance_ir:      { label: 'Sigorta (IR)',    type: 'text' },
  bl_number:         { label: 'Konşimento No',   type: 'text' },
  proforma_ref:      { label: 'Proforma Ref.',   type: 'text', hint: 'Faturaya otomatik gelir' },
  customer_ref:      { label: 'Müşteri Ref.',    type: 'text' },
  vessel_name:       { label: 'Gemi / Araç',     type: 'text' },
  eta:               { label: 'Tahmini Varış',   type: 'date' },
  arrival_date:      { label: 'Varış',           type: 'date' },
  gross_weight_kg:   { label: 'Brüt (KG)',       type: 'number', hint: 'Faturaya otomatik gelir' },
  tonnage_mt:        { label: 'Sipariş Miktarı', type: 'number', decimals: 3, hint: 'Ürün birimi (MT/ADMT) cinsinden sipariş edilen miktar' },
  delivered_admt:    { label: 'Teslim Miktarı',  type: 'number', decimals: 3, hint: 'Gerçek teslim miktarı — belgelerin tek doğru kaynağı. Boşsa sipariş miktarı kullanılır' },
  packages:          { label: 'Paket Sayısı',    type: 'number' },
  payment_terms:     { label: 'Ödeme Şartı',     type: 'text', hint: 'Proforma ve faturaya otomatik gelir' },
  incoterms:         { label: 'Teslim Koşulları', type: 'text', hint: 'Belgelere otomatik gelir' },
  port_of_loading:   { label: 'Yükleme Limanı',  type: 'text' },
  port_of_discharge: { label: 'Boşaltma Limanı', type: 'text' },
  count_unit:        { label: 'Sayım Birimi',    type: 'select', options: [
    { value: 'Reels', label: 'Reels' }, { value: 'Bales', label: 'Bales' },
    { value: 'Packages', label: 'Packages' }, { value: 'Cartons', label: 'Cartons' },
  ] },
  qty_unit:          { label: 'Miktar Birimi',   type: 'select', options: [
    { value: 'ADMT', label: 'ADMT' }, { value: 'MT', label: 'MT' },
  ] },
  transport_mode:    {
    label: 'Yükleme Türü', type: 'select', hint: 'Plaka / vagon no ve belgelerdeki araç etiketi buna göre değişir',
    options: [
      { value: 'truck', label: 'Kara (Tır)' },
      { value: 'railway', label: 'Demiryolu (Vagon)' },
      { value: 'sea', label: 'Deniz' },
    ],
  },
};

function isEmpty(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '') || (typeof v === 'number' && v === 0);
}

/** Kartlarda kullanılan tek satır. `layout`: 'row' = geniş kart satırı, 'grid' = 2 kolonlu kart satırı. */
export function OrderInfoRow({ file, field, writable, label }: {
  file: TradeFile;
  field: OrderInfoField;
  writable: boolean;
  label?: string;
}) {
  const def = ORDER_FIELD_DEFS[field];
  const update = useUpdateOrderInfo();
  const value = (file as unknown as Record<string, unknown>)[field];
  const empty = isEmpty(value);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const doneRef = useRef(false);

  const shown = empty ? '' : def.type === 'date' ? fDate(String(value))
    : def.type === 'number' ? fN(Number(value), def.decimals ?? 0)
    : def.type === 'select' ? (def.options?.find(o => o.value === value)?.label ?? String(value))
    : String(value);

  function start() {
    if (!writable) return;
    doneRef.current = false;
    setDraft(empty ? '' : String(value));
    setEditing(true);
  }
  function save(v: string | number | null) {
    update.mutate({ id: file.id, patch: { [field]: v } });
  }
  function commit() {
    if (doneRef.current) return;
    doneRef.current = true;
    setEditing(false);
    const next = draft.trim();
    if (next === (empty ? '' : String(value))) return;
    if (def.type === 'number') {
      if (next === '') return save(null);
      const n = Number(next.replace(',', '.'));
      if (Number.isNaN(n)) { toast.error('Geçerli bir sayı gir'); return; }
      return save(n);
    }
    save(next === '' ? null : next);
  }
  function cancel() { doneRef.current = true; setEditing(false); }

  if (def.type === 'select' && writable) {
    return (
      <div className="flex items-center justify-between gap-3 py-2 border-b border-dashed border-[#ECECEC] min-h-[40px]">
        <span className="text-[12px] text-gray-500 shrink-0" title={def.hint}>{label ?? def.label}</span>
        <select
          value={empty ? '' : String(value)}
          disabled={update.isPending}
          onChange={e => save(e.target.value || null)}
          className={cn(
            'text-right text-[13px] rounded-md px-1.5 py-0.5 -mr-1.5 bg-transparent outline-none cursor-pointer hover:bg-gray-100',
            empty ? 'text-gray-400 italic font-medium' : 'font-bold text-gray-900',
          )}
        >
          <option value="">Henüz girilmedi</option>
          {def.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-dashed border-[#ECECEC] min-h-[40px]">
      <span className="text-[12px] text-gray-500 shrink-0" title={def.hint}>{label ?? def.label}</span>
      {editing ? (
        <input
          autoFocus
          type={def.type === 'number' ? 'text' : def.type}
          inputMode={def.type === 'number' ? 'decimal' : undefined}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
          }}
          className="w-[60%] min-w-0 text-right text-[13px] font-bold text-gray-900 bg-gray-50 rounded-lg px-2 h-8 outline-none ring-1 ring-gray-200 focus:ring-gray-400"
        />
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={!writable || update.isPending}
          className={cn(
            'min-w-0 max-w-[65%] text-right text-[13px] truncate rounded-md px-1.5 py-0.5 -mr-1.5 transition-colors',
            empty ? 'text-gray-300 italic font-medium' : 'font-bold text-gray-900',
            writable && 'hover:bg-gray-100 cursor-text',
            'group',
          )}
        >
          {empty ? (
            <span className="inline-flex items-center gap-1.5">
              Henüz girilmedi
              {/* Düzenlenebilir olduğunu kalem ikonu üzerine gelince gösterir — "+" ile veri ekleme çağrısı yapmaz */}
              {writable && <HugeiconsIcon icon={Edit02Icon} size={11} className="text-gray-300 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity" />}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              {shown}
              {writable && <HugeiconsIcon icon={Edit02Icon} size={11} className="text-gray-300" />}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
