/**
 * Satış Detayları / Teslimat kartlarındaki satır içi düzenlenebilir bilgi satırı.
 * Boş alanlar da görünür ("Girilmedi"); tıklayınca yazılır, Enter/odak kaybında dosyaya
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
import { Edit02Icon, Add01Icon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';

type FieldType = 'text' | 'date' | 'number';
interface FieldDef { label: string; type: FieldType; hint?: string }

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
  packages:          { label: 'Paket Sayısı',    type: 'number' },
  payment_terms:     { label: 'Ödeme Şartı',     type: 'text', hint: 'Proforma ve faturaya otomatik gelir' },
  incoterms:         { label: 'Teslim Koşulları', type: 'text', hint: 'Belgelere otomatik gelir' },
  port_of_loading:   { label: 'Yükleme Limanı',  type: 'text' },
  port_of_discharge: { label: 'Boşaltma Limanı', type: 'text' },
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

  const shown = empty ? '' : def.type === 'date' ? fDate(String(value)) : def.type === 'number' ? fN(Number(value), 0) : String(value);

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
          )}
        >
          {empty ? (
            <span className="inline-flex items-center gap-1">
              {writable && <HugeiconsIcon icon={Add01Icon} size={12} />} Girilmedi
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
