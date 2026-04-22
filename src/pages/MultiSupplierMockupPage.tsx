import { useState, useMemo } from 'react';
import { Plus, Trash2, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useSuppliers } from '@/hooks/useEntities';
import { useCurrencies } from '@/hooks/useCurrencies';
import { cn } from '@/lib/utils';

// ── Mono stil sabitleri (ToSaleModal ile aynı dil) ────────────────────────────
const inp = 'bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-gray-900 placeholder:text-gray-400 border-0 shadow-none focus:outline-none focus:ring-0 w-full';
const sel = 'bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-gray-900 border-0 shadow-none focus:outline-none w-full appearance-none cursor-pointer';

const MAX_SUPPLIERS = 5;
const BASE_CURRENCY = 'USD'; // Ayarlardan gelir — mockup için sabit

interface SupplierRow {
  uid: string;
  supplier_id: string;
  quantity_mt: string;
  purchase_price: string;
  currency: string;
  fx_rate: string; // tedarikçi para biriminin base'e çevrim kuru (1 CUR = X USD)
}

function makeRow(): SupplierRow {
  return {
    uid: crypto.randomUUID(),
    supplier_id: '',
    quantity_mt: '',
    purchase_price: '',
    currency: BASE_CURRENCY,
    fx_rate: '1',
  };
}

export function MultiSupplierMockupPage() {
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';

  const { data: suppliers = [] } = useSuppliers();
  const currencies = useCurrencies();

  // Mock trade file — gerçek entegrasyonda prop'tan gelir
  const expectedTonnage = 50;
  const fileNo = 'TF-2026-0042';
  const customerName = 'ACME Steel Trading Ltd.';

  const [rows, setRows] = useState<SupplierRow[]>([makeRow(), makeRow()]);

  function addRow() {
    if (rows.length >= MAX_SUPPLIERS) return;
    setRows([...rows, makeRow()]);
  }
  function removeRow(uid: string) {
    if (rows.length <= 1) return;
    setRows(rows.filter((r) => r.uid !== uid));
  }
  function updateRow(uid: string, patch: Partial<SupplierRow>) {
    setRows(rows.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  }

  // ── Özetler ────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let totalMt = 0;
    let totalCostBase = 0;
    for (const r of rows) {
      const mt = Number(r.quantity_mt) || 0;
      const price = Number(r.purchase_price) || 0;
      const fx = r.currency === BASE_CURRENCY ? 1 : Number(r.fx_rate) || 0;
      totalMt += mt;
      totalCostBase += mt * price * fx;
    }
    const weightedAvg = totalMt > 0 ? totalCostBase / totalMt : 0;
    const diff = Math.round((totalMt - expectedTonnage) * 1000) / 1000;
    const matches = Math.abs(diff) < 0.001;
    return { totalMt, totalCostBase, weightedAvg, diff, matches };
  }, [rows]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Mockup uyarı banneri */}
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-[12px] text-amber-800">
          <strong>Mockup — Çoklu Tedarikçi Satış</strong>
          <p className="text-[11px] text-amber-700 mt-0.5">
            Bu bir önizlemedir, veri kaydedilmez. Geri bildiriminize göre backend entegrasyonu yapılacak.
          </p>
        </div>
      </div>

      {/* Başlık */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">{fileNo}</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Satışa Çevir</span>
        </div>
        <h1 className="text-[22px] font-extrabold text-gray-900 leading-tight">{customerName}</h1>
        <p className="text-[12px] text-gray-500 mt-1">Beklenen miktar: <strong>{expectedTonnage} MT</strong></p>
      </div>

      {/* ── Alım Kartı (Çoklu Tedarikçi) ──────────────────────────────────── */}
      <div className="bg-blue-50/60 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase tracking-widest text-blue-700">
            📦 Alım (Tedarikçiler)
          </div>
          <div className="text-[10px] text-blue-700/70">
            {rows.length} / {MAX_SUPPLIERS} tedarikçi
          </div>
        </div>

        {/* Satırlar */}
        <div className="space-y-2">
          {rows.map((row, idx) => {
            const isBase = row.currency === BASE_CURRENCY;
            const lineTotalCur = (Number(row.quantity_mt) || 0) * (Number(row.purchase_price) || 0);
            const lineTotalBase = lineTotalCur * (isBase ? 1 : Number(row.fx_rate) || 0);

            return (
              <div key={row.uid} className="bg-white rounded-xl p-3 border border-blue-100/70">
                {/* Satır başlığı */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                      style={{ background: accent }}
                    >
                      {idx + 1}
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
                      Tedarikçi {idx + 1}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(row.uid)}
                    disabled={rows.length <= 1}
                    className="text-[10px] text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" /> Kaldır
                  </button>
                </div>

                {/* Grid: tedarikçi + miktar + fiyat + para birimi + kur */}
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Tedarikçi *</div>
                    <select
                      className={sel}
                      value={row.supplier_id}
                      onChange={(e) => updateRow(row.uid, { supplier_id: e.target.value })}
                    >
                      <option value="">— Seçin —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Miktar (MT) *</div>
                    <input
                      type="number" step="0.001" min="0"
                      placeholder="25"
                      className={inp}
                      value={row.quantity_mt}
                      onChange={(e) => updateRow(row.uid, { quantity_mt: e.target.value })}
                    />
                  </div>

                  <div className="col-span-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Fiyat (MT) *</div>
                    <input
                      type="number" step="0.01" min="0"
                      placeholder="720"
                      className={inp}
                      value={row.purchase_price}
                      onChange={(e) => updateRow(row.uid, { purchase_price: e.target.value })}
                    />
                  </div>

                  <div className="col-span-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Para Birimi</div>
                    <select
                      className={sel}
                      value={row.currency}
                      onChange={(e) => updateRow(row.uid, { currency: e.target.value, fx_rate: e.target.value === BASE_CURRENCY ? '1' : row.fx_rate })}
                    >
                      {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div className="col-span-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                      Kur {isBase ? '' : `(1 ${row.currency} = ? ${BASE_CURRENCY})`}
                    </div>
                    <input
                      type="number" step="0.0001" min="0"
                      disabled={isBase}
                      placeholder="1.08"
                      className={cn(inp, isBase && 'opacity-40 cursor-not-allowed')}
                      value={row.fx_rate}
                      onChange={(e) => updateRow(row.uid, { fx_rate: e.target.value })}
                    />
                  </div>
                </div>

                {/* Satır özeti */}
                {lineTotalCur > 0 && (
                  <div className="mt-2 flex items-center justify-end gap-3 text-[10px]">
                    <span className="text-gray-400">
                      {Number(row.quantity_mt).toLocaleString()} MT × {Number(row.purchase_price).toLocaleString()} {row.currency}
                    </span>
                    <span className="font-mono font-bold text-gray-700">
                      = {lineTotalCur.toLocaleString('en-US', { minimumFractionDigits: 2 })} {row.currency}
                    </span>
                    {!isBase && (
                      <span className="font-mono font-bold text-blue-700">
                        ≈ {lineTotalBase.toLocaleString('en-US', { minimumFractionDigits: 2 })} {BASE_CURRENCY}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Tedarikçi ekle butonu */}
        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= MAX_SUPPLIERS}
          className="w-full h-10 rounded-xl border-2 border-dashed border-blue-300 text-[12px] font-semibold text-blue-700 hover:bg-blue-100/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Tedarikçi Ekle {rows.length >= MAX_SUPPLIERS && '(maks. 5)'}
        </button>

        {/* Özet bandı */}
        <div className="bg-white rounded-xl px-4 py-3 border border-blue-100/70 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            {totals.matches ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-500" />
            )}
            <span className="text-[11px] font-semibold text-gray-500">Toplam miktar:</span>
            <span className={cn('text-[13px] font-extrabold font-mono', totals.matches ? 'text-green-700' : 'text-amber-700')}>
              {totals.totalMt.toLocaleString()} / {expectedTonnage} MT
            </span>
            {!totals.matches && (
              <span className="text-[10px] text-amber-600 font-semibold">
                ({totals.diff > 0 ? '+' : ''}{totals.diff} MT fark)
              </span>
            )}
          </div>

          <div className="flex items-center gap-5">
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Ort. Birim</div>
              <div className="text-[13px] font-extrabold text-gray-900 font-mono">
                {totals.weightedAvg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {BASE_CURRENCY}/MT
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Toplam Alım</div>
              <div className="text-[15px] font-extrabold font-mono" style={{ color: accent }}>
                {totals.totalCostBase.toLocaleString('en-US', { minimumFractionDigits: 2 })} {BASE_CURRENCY}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Aksiyonlar */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
        <button
          type="button"
          className="px-4 h-9 rounded-xl text-[12px] font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          İptal
        </button>
        <button
          type="button"
          disabled={!totals.matches}
          className="px-5 h-9 rounded-xl text-[13px] font-bold text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          style={{ background: accent }}
        >
          Satışa Çevir (mockup)
        </button>
      </div>

      {/* Notlar */}
      <div className="bg-gray-50 rounded-xl px-4 py-3 text-[11px] text-gray-600 space-y-1">
        <div className="font-bold text-gray-700 mb-1">Notlar</div>
        <div>• Tek satırda tüm miktar tutulabilir (eski akışla uyumlu).</div>
        <div>• Para birimi base ({BASE_CURRENCY}) değilse kur alanı aktifleşir; o kayıt anındaki değer saklanır.</div>
        <div>• <strong>Satışa Çevir</strong> yalnızca toplam MT dosya miktarıyla eşleşince aktif olur.</div>
        <div>• Tedarikçi obligasyonları bu ekrandan <strong>manuel</strong> oluşturulur (sizin talebiniz).</div>
      </div>
    </div>
  );
}
