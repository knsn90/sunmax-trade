/**
 * Teslimat kartında yükleme türüne bağlı araç listesi — ambalaj listesindeki gibi satır satır:
 *  - Kara (Tır)  → "Tır Plakaları"
 *  - Demiryolu   → "Vagon No"
 *  - Deniz       → gösterilmez
 * Her satır: plaka / vagon no, kap adedi, ADMT, brüt kg. Veri mevcut Taşıma Planı tablosuna
 * (transport_plates) yazılır — çift kayıt yok. Yeni ambalaj listesi bu satırlarla hazır açılır.
 */
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TradeFile } from '@/types/database';
import { useTransportPlan, useUpsertPlan, useUpdatePlate, useDeletePlate } from '@/hooks/useTransportPlan';
import { useUpdateOrderInfo } from '@/hooks/useTradeFiles';
import { transportService, type TransportPlate } from '@/services/transportService';
import { checkAdmt } from '@/lib/admtCheck';
import { fN } from '@/lib/formatters';
import { OrderInfoRow } from '@/components/trade-files/OrderInfoRow';
import { SmartFill } from '@/components/ui/SmartFill';
import { OcrButton } from '@/components/ui/OcrButton';
import { parsePLExcel, downloadPLTemplate } from '@/lib/excelImport';
import type { OcrResult } from '@/lib/openai';
import { cn } from '@/lib/utils';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Cancel01Icon, DeliveryTruck01Icon, TrainIcon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';

/** "04AAE583, 04AAZ457 / 34 ABC 123" → ['04AAE583','04AAZ457','34 ABC 123'] (virgül, noktalı virgül, satır sonu, '/' ayırıcı) */
export function splitVehicleNos(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\n/]+/)) {
    const v = part.trim().replace(/\s+/g, ' ').toUpperCase();
    if (v && !seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

const num = (v: string): number => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};


type CountUnit = 'Reels' | 'Bales' | 'Packages' | 'Cartons';
type QtyUnit = 'ADMT' | 'MT';
const COUNT_UNITS: CountUnit[] = ['Reels', 'Bales', 'Packages', 'Cartons'];
const QTY_UNITS: QtyUnit[] = ['ADMT', 'MT'];

/** Seçilmemişse ürün biriminden türetilir (ADMT ürün → Reels/ADMT, diğer → Packages/MT). */
export function effectiveUnits(file: TradeFile): { count: CountUnit; qty: QtyUnit } {
  const adm = file.product?.unit === 'ADMT' || !file.product?.unit;
  return {
    count: (file.count_unit ?? (adm ? 'Reels' : 'Packages')) as CountUnit,
    qty: (file.qty_unit ?? (adm ? 'ADMT' : 'MT')) as QtyUnit,
  };
}

function Pills<T extends string>({ label, options, value, onChange, disabled }: {
  label: string; options: T[]; value: T; onChange: (v: T) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
      <div className="flex gap-1">
        {options.map(o => (
          <button
            key={o}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o)}
            className={cn(
              'h-7 px-3 rounded-full text-[11px] font-semibold transition-colors disabled:opacity-60',
              o === value ? 'bg-[#1f2937] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Blur'da kaydeden küçük hücre girdisi */
function Cell({ value, onCommit, numeric, placeholder, className, disabled }: {
  value: string | number;
  onCommit: (v: string) => void;
  numeric?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (numeric && Number(value) === 0 ? '' : String(value));
  return (
    <input
      value={shown}
      disabled={disabled}
      placeholder={placeholder}
      inputMode={numeric ? 'decimal' : undefined}
      onFocus={e => { setDraft(numeric && Number(value) === 0 ? '' : String(value)); e.currentTarget.select(); }}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        const d = draft;
        setDraft(null);
        if (d != null && d.trim() !== (numeric && Number(value) === 0 ? '' : String(value)).trim()) onCommit(d);
      }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur(); } }}
      className={cn(
        'w-full min-w-0 bg-gray-50 hover:bg-gray-100 focus:bg-white rounded-md px-2 h-7 text-[12px] font-semibold text-gray-900 outline-none ring-0 focus:ring-1 focus:ring-gray-300 placeholder:text-gray-300 placeholder:font-normal disabled:opacity-60',
        numeric && 'text-right',
        className,
      )}
    />
  );
}

export function VehiclePlatesRow({ file, writable, hideLabel = false }: { file: TradeFile; writable: boolean; hideLabel?: boolean }) {
  const mode = file.transport_mode;
  const units = effectiveUnits(file);
  const qc = useQueryClient();
  const { data: plan } = useTransportPlan(mode === 'truck' || mode === 'railway' ? file.id : undefined);
  const upsertPlan = useUpsertPlan(file.id);
  const updatePlate = useUpdatePlate(file.id);
  const deletePlate = useDeletePlate(file.id);

  const [draft, setDraft] = useState({ plate: '', reels: '', admt: '', gross: '' });
  const [saving, setSaving] = useState(false);
  const plateInputRef = useRef<HTMLInputElement>(null);

  if (mode !== 'truck' && mode !== 'railway') return null;

  const isTruck = mode === 'truck';
  const label = isTruck ? 'Tır Plakaları' : 'Vagon No';
  const rows: TransportPlate[] = (plan?.transport_plates ?? [])
    .filter(p => p.plate_status !== 'cancelled')
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const tot = rows.reduce(
    (t, r) => ({ reels: t.reels + (Number(r.reels) || 0), admt: t.admt + (Number(r.admt) || 0), gross: t.gross + (Number(r.gross_weight_kg) || 0) }),
    { reels: 0, admt: 0, gross: 0 },
  );
  const admtChk = checkAdmt(file.delivered_admt, tot.admt);

  async function addRow() {
    const plates = splitVehicleNos(draft.plate);
    if (plates.length === 0) return;
    const existing = new Set((plan?.transport_plates ?? []).map(p => p.plate_no.toUpperCase()));
    const fresh = plates.filter(v => !existing.has(v));
    if (fresh.length === 0) { toast.info('Bu plaka zaten listede'); return; }
    setSaving(true);
    try {
      const target = plan ?? await upsertPlan.mutateAsync({});
      const start = Math.max(-1, ...(target.transport_plates ?? []).map(p => p.sort_order ?? 0)) + 1;
      // Tek plaka girildiyse ayrıntıları da kaydet; çoklu yapıştırmada sadece plakalar
      const items = fresh.length === 1
        ? [{ plate_no: fresh[0], reels: Math.round(num(draft.reels)), admt: num(draft.admt), gross_weight_kg: num(draft.gross) }]
        : fresh;
      await transportService.addPlates(target.id, items, start);
      await qc.invalidateQueries({ queryKey: ['transport_plan', file.id] });
      setDraft({ plate: '', reels: '', admt: '', gross: '' });
      plateInputRef.current?.focus();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const patch = (id: string, values: Partial<TransportPlate>) => updatePlate.mutate({ id, values });
  const th = 'text-[9px] font-bold uppercase tracking-wider text-gray-400 px-1.5 py-1.5';

  return (
    <div className={cn('col-span-full', !hideLabel && 'py-2 border-b border-dashed border-[#ECECEC]')}>
      {!hideLabel && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] text-gray-500" title="Ambalaj listesinde araç satırları olarak otomatik gelir">
            {label}{rows.length > 0 && <span className="text-gray-300"> · {rows.length}</span>}
          </span>
          {!writable && rows.length === 0 && <span className="text-[13px] text-gray-300 italic font-medium">Henüz girilmedi</span>}
        </div>
      )}

      {(rows.length > 0 || writable) && (
        <div className="overflow-x-auto rounded-lg border border-[#F0EEEA]">
          <table className="w-full min-w-[460px] text-[12px]">
            <thead>
              <tr className="bg-gray-50/70">
                <th className={cn(th, 'w-7 text-left')}>#</th>
                <th className={cn(th, 'text-left')}>{isTruck ? 'TIR No / Plaka' : 'Vagon No'}</th>
                <th className={cn(th, 'w-[84px] text-right')}>{units.count}</th>
                <th className={cn(th, 'w-[92px] text-right')}>{units.qty}</th>
                <th className={cn(th, 'w-[104px] text-right')}>Brüt (KG)</th>
                <th className="w-7" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-t border-[#F4F2EE]">
                  <td className="px-1.5 text-[11px] text-gray-400">{i + 1}</td>
                  <td className="px-1 py-1">
                    {writable
                      ? <Cell value={r.plate_no} onCommit={v => { const n = splitVehicleNos(v)[0]; if (n) patch(r.id, { plate_no: n }); }} />
                      : <span className="font-semibold text-gray-900 px-1">{r.plate_status === 'changed' && r.replacement_plate ? r.replacement_plate : r.plate_no}</span>}
                  </td>
                  <td className="px-1 py-1">
                    {writable
                      ? <Cell numeric value={r.reels ?? 0} onCommit={v => patch(r.id, { reels: Math.round(num(v)) })} />
                      : <span className="block text-right px-1">{fN(r.reels ?? 0, 0)}</span>}
                  </td>
                  <td className="px-1 py-1">
                    {writable
                      ? <Cell numeric value={r.admt ?? 0} onCommit={v => patch(r.id, { admt: num(v) })} />
                      : <span className="block text-right px-1">{fN(r.admt ?? 0, 3)}</span>}
                  </td>
                  <td className="px-1 py-1">
                    {writable
                      ? <Cell numeric value={r.gross_weight_kg ?? 0} onCommit={v => patch(r.id, { gross_weight_kg: num(v) })} />
                      : <span className="block text-right px-1">{fN(r.gross_weight_kg ?? 0, 0)}</span>}
                  </td>
                  <td className="px-1 text-center">
                    {writable && (
                      <button type="button" onClick={() => deletePlate.mutate(r.id)} className="text-gray-300 hover:text-red-500 transition-colors" title="Satırı sil">
                        <HugeiconsIcon icon={Cancel01Icon} size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {/* Yeni satır */}
              {writable && (
                <tr className="border-t border-dashed border-[#E8E6E0] bg-gray-50/40">
                  <td className="px-1.5 text-gray-300"><HugeiconsIcon icon={Add01Icon} size={11} /></td>
                  <td className="px-1 py-1">
                    <input
                      ref={plateInputRef}
                      data-plate-input
                      value={draft.plate}
                      disabled={saving}
                      placeholder={isTruck ? '04AAE583 (birden fazla: virgülle)' : 'WAGON-001 (birden fazla: virgülle)'}
                      onChange={e => setDraft(d => ({ ...d, plate: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') addRow(); }}
                      className="w-full min-w-0 bg-white rounded-md px-2 h-7 text-[12px] font-semibold text-gray-900 outline-none ring-1 ring-gray-200 focus:ring-gray-400 placeholder:text-gray-300 placeholder:font-normal"
                    />
                  </td>
                  {(['reels', 'admt', 'gross'] as const).map(k => (
                    <td key={k} className="px-1 py-1">
                      <input
                        value={draft[k]}
                        disabled={saving}
                        inputMode="decimal"
                        placeholder="0"
                        onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') addRow(); }}
                        className="w-full min-w-0 text-right bg-white rounded-md px-2 h-7 text-[12px] font-semibold text-gray-900 outline-none ring-1 ring-gray-200 focus:ring-gray-400 placeholder:text-gray-300 placeholder:font-normal"
                      />
                    </td>
                  ))}
                  <td className="px-1 text-center">
                    <button
                      type="button"
                      onClick={addRow}
                      disabled={saving || !draft.plate.trim()}
                      className="h-7 w-7 rounded-md bg-gray-900 text-white flex items-center justify-center disabled:opacity-30"
                      title="Satırı ekle (Enter)"
                    >
                      <HugeiconsIcon icon={Add01Icon} size={13} />
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-[#E8E6E0] bg-gray-50/70 font-bold text-gray-900">
                  <td />
                  <td className="px-2 py-1.5 text-[11px] text-gray-500">{rows.length} {isTruck ? 'araç' : 'vagon'}</td>
                  <td className="px-2 py-1.5 text-right">{fN(tot.reels, 0)}</td>
                  <td className={cn('px-2 py-1.5 text-right', admtChk.diverges && 'text-red-600')}>{fN(tot.admt, 3)}</td>
                  <td className="px-2 py-1.5 text-right">{fN(tot.gross, 0)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {admtChk.diverges && (
        <p className="mt-1.5 text-[11px] text-red-600">
          Toplam {fN(tot.admt, 3)} — teslimat ADMT'si {fN(admtChk.reference, 3)} ({admtChk.diff > 0 ? '+' : ''}{fN(admtChk.diff, 3)} fark). Ambalaj listesi kaydedilirken eşit olmalı.
        </p>
      )}
    </div>
  );
}

/**
 * Ayrı kart: yükleme türü + araç listesi (Tır Plakaları / Vagon Listesi).
 * Tür seçilmediyse önce türü seçtirir; deniz yüklemesinde araç listesi gösterilmez.
 */
export function VehicleListCard({ file, writable }: { file: TradeFile; writable: boolean }) {
  const mode = file.transport_mode;
  const listed = mode === 'truck' || mode === 'railway';
  const title = mode === 'truck' ? 'Tır Plakaları' : mode === 'railway' ? 'Vagon Listesi' : 'Araç Listesi';

  const qc = useQueryClient();
  const units = effectiveUnits(file);
  const unitSaving = useUpdateOrderInfo();
  const { data: plan } = useTransportPlan(listed ? file.id : undefined);
  const upsertPlan = useUpsertPlan(file.id);
  const importRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  /**
   * Belgeden / Excel'den / sesli-yazılı akıllı doldurmadan gelen satırları listeye işle:
   * listede olmayan plakalar eklenir, olanların kap/ADMT/brüt değerleri (boş değilse) güncellenir.
   */
  async function applyImported(items: { vehicle_plate?: string; reels?: number; admt?: number; gross_weight_kg?: number }[]) {
    const rows = items
      .map(r => ({
        plate_no: splitVehicleNos(r.vehicle_plate ?? '')[0] ?? '',
        reels: Math.max(0, Math.round(Number(r.reels) || 0)),
        admt: Math.max(0, Number(r.admt) || 0),
        gross_weight_kg: Math.max(0, Number(r.gross_weight_kg) || 0),
      }))
      .filter(r => r.plate_no);
    if (rows.length === 0) { toast.error('Okunan belgede araç satırı bulunamadı'); return; }
    setImporting(true);
    try {
      const target = plan ?? await upsertPlan.mutateAsync({});
      const existing = new Map((target.transport_plates ?? []).map(p => [p.plate_no.toUpperCase(), p]));
      const start = Math.max(-1, ...(target.transport_plates ?? []).map(p => p.sort_order ?? 0)) + 1;
      const fresh = rows.filter(r => !existing.has(r.plate_no));
      const known = rows.filter(r => existing.has(r.plate_no) && (r.reels || r.admt || r.gross_weight_kg));
      if (fresh.length) await transportService.addPlates(target.id, fresh, start);
      await Promise.all(known.map(r => transportService.updatePlate(existing.get(r.plate_no)!.id, {
        reels: r.reels, admt: r.admt, gross_weight_kg: r.gross_weight_kg,
      })));
      await qc.invalidateQueries({ queryKey: ['transport_plan', file.id] });
      toast.success(`${fresh.length} yeni satır eklendi${known.length ? `, ${known.length} satır güncellendi` : ''}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  const cardRef = useRef<HTMLDivElement>(null);
  function focusNewRow() {
    const input = cardRef.current?.querySelector<HTMLInputElement>('[data-plate-input]');
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input?.focus();
  }

  function handleOcr(result: OcrResult) {
    if (result.items && result.items.length > 0) applyImported(result.items);
    else toast.error('Belgede araç satırı bulunamadı');
  }

  async function handleExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const imported = await parsePLExcel(f);
      if (!imported.length) { toast.error('Dosyada satır bulunamadı'); return; }
      await applyImported(imported);
    } catch {
      toast.error('Dosya okunamadı. Lütfen Excel şablonunu kullanın.');
    }
  }

  return (
    <div ref={cardRef} className="bg-white rounded-[20px] border border-[#ECECEC] shadow-[0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="px-6 py-3.5 border-b border-[#F4F2EE] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <HugeiconsIcon icon={mode === 'railway' ? TrainIcon : DeliveryTruck01Icon} size={16} className="text-gray-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#8A8A8E]">{title}</span>
        </div>
        {writable && listed ? (
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcel} />
            {/* Ana aksiyon: etiketli, tooltip'e bağımlı değil */}
            <button
              type="button"
              onClick={focusNewRow}
              className="h-8 px-3.5 rounded-lg text-white text-[12px] font-semibold flex items-center gap-1.5 hover:opacity-90 transition-opacity"
              style={{ background: '#1e3a8a' }}
            >
              <HugeiconsIcon icon={Add01Icon} size={13} /> {mode === 'railway' ? 'Vagon Ekle' : 'Tır Ekle'}
            </button>
            <button
              type="button"
              disabled={importing}
              onClick={() => importRef.current?.click()}
              className="h-8 px-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-[12px] font-semibold text-gray-700 transition-colors disabled:opacity-50"
            >
              {importing ? 'İşleniyor…' : 'Excel\'den Aktar'}
            </button>
            <button
              type="button"
              onClick={() => downloadPLTemplate()}
              className="h-8 px-3 rounded-lg text-[12px] font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
            >
              Şablon
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-gray-400 hidden sm:block">Ambalaj listesinde araç satırları olarak otomatik gelir</span>
        )}
      </div>
      <div className="px-6 py-2">
        <OrderInfoRow file={file} field="transport_mode" writable={writable} />
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 py-3 border-b border-dashed border-[#ECECEC]">
          <Pills
            label="Count Unit"
            options={COUNT_UNITS}
            value={units.count}
            disabled={!writable || unitSaving.isPending}
            onChange={v => unitSaving.mutate({ id: file.id, patch: { count_unit: v }, propagate: false })}
          />
          <Pills
            label="Qty Unit"
            options={QTY_UNITS}
            value={units.qty}
            disabled={!writable || unitSaving.isPending}
            onChange={v => unitSaving.mutate({ id: file.id, patch: { qty_unit: v }, propagate: false })}
          />
          {writable && listed && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[11px] text-gray-400">Belgeden doldur:</span>
              <OcrButton mode="packing_list" onResult={handleOcr} label="Belgeden Oku (fotoğraf / PDF)" />
              <SmartFill mode="packing_list" onResult={handleOcr} formName="Araç Listesi" />
            </div>
          )}
        </div>
        {listed ? (
          <div className="pt-2 pb-2">
            <VehiclePlatesRow file={file} writable={writable} hideLabel />
          </div>
        ) : (
          <p className="text-[12px] text-gray-400 py-3">
            {mode === 'sea'
              ? 'Deniz yüklemesinde araç listesi tutulmaz.'
              : writable ? 'Plaka / vagon listesi için önce yükleme türünü seç.' : 'Yükleme türü girilmemiş.'}
          </p>
        )}
      </div>
    </div>
  );
}
