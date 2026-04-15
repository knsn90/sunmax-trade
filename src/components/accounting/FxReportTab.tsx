import { useMemo, useState } from 'react';
import { useTransactions } from '@/hooks/useTransactions';
import { fCurrency, fDate, fUSD } from '@/lib/formatters';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { RefreshCw } from 'lucide-react';

const inp = 'bg-gray-100 rounded-lg h-8 px-3 text-[12px] font-mono text-gray-900 placeholder:text-gray-400 border-0 shadow-none outline-none focus:outline-none w-full';
const sel = 'bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-gray-900 border-0 shadow-none outline-none w-full appearance-none cursor-pointer';
function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{children}</div>;
}

/**
 * exchange_rate convention (same as transactionService):
 *   amount_usd = amount / exchange_rate
 *   exchange_rate = local_currency / USD (e.g. EUR/USD = 0.926 → 1 USD = 0.926 EUR)
 */
function toUsd(amount: number, rate: number) {
  return rate > 0 ? amount / rate : 0;
}

function isIncoming(txnType: string, partyType: string | null): boolean {
  if (txnType === 'receipt' || txnType === 'sale_inv') return true;
  if (txnType === 'advance') return partyType === 'customer';
  return false;
}

const CURRENCIES = ['EUR', 'AED', 'TRY', 'GBP'] as const;
const RATE_PLACEHOLDERS: Record<string, string> = {
  EUR: '0.9260', AED: '3.6725', TRY: '34.20', GBP: '0.7900',
};

export function FxReportTab() {
  const { accent } = useTheme();

  const { data: allTxns = [] } = useTransactions();

  // Kullanıcının girdiği kapanış kurları (local/USD convention)
  const [closingRates, setClosingRates] = useState<Record<string, string>>({
    EUR: '', AED: '', TRY: '', GBP: '',
  });
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [statusFilter,   setStatusFilter]   = useState('');
  const [ran, setRan] = useState(false);

  // İşlemlerde görünen döviz türleri
  const availableCurrencies = useMemo(
    () => [...new Set(allTxns.filter(t => t.currency !== 'USD').map(t => t.currency))],
    [allTxns],
  );

  // Filtrelenmiş dövizli işlemler
  const fxTxns = useMemo(() => {
    if (!ran) return [];
    let txns = allTxns.filter(t => t.currency !== 'USD' && t.exchange_rate > 0);
    if (currencyFilter) txns = txns.filter(t => t.currency === currencyFilter);
    if (statusFilter)   txns = txns.filter(t => t.payment_status === statusFilter);
    return [...txns].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
  }, [ran, allTxns, currencyFilter, statusFilter]);

  // Kur farkı hesaplaması
  const rows = useMemo(() => fxTxns.map(t => {
    const closingRate  = parseFloat(closingRates[t.currency] || '0') || t.exchange_rate;
    const originalUsd  = t.amount_usd ?? toUsd(t.amount, t.exchange_rate);
    const closingUsd   = toUsd(t.amount, closingRate);
    const incoming     = isIncoming(t.transaction_type, t.party_type);
    // Gelen işlemler: TL/EUR değer artışı = kazanç (+), Giden işlemler: tersine
    const diff = incoming ? (closingUsd - originalUsd) : (originalUsd - closingUsd);
    const isRealized   = t.payment_status === 'paid';
    return { txn: t, originalUsd, closingUsd, diff, isRealized, incoming };
  }), [fxTxns, closingRates]);

  // Para birimi bazında özet
  const byCurrency = useMemo(() => {
    const map: Record<string, { realized: number; unrealized: number; count: number }> = {};
    for (const r of rows) {
      const cur = r.txn.currency;
      if (!map[cur]) map[cur] = { realized: 0, unrealized: 0, count: 0 };
      if (r.isRealized) map[cur].realized += r.diff;
      else map[cur].unrealized += r.diff;
      map[cur].count++;
    }
    return map;
  }, [rows]);

  const currencies    = Object.keys(byCurrency);
  const totalRealized = rows.filter(r => r.isRealized).reduce((s, r) => s + r.diff, 0);
  const totalUnreal   = rows.filter(r => !r.isRealized).reduce((s, r) => s + r.diff, 0);
  const totalNet      = totalRealized + totalUnreal;

  function hasClosingRate(cur: string) {
    return parseFloat(closingRates[cur] || '0') > 0;
  }

  return (
    <div className="space-y-4">

      {/* ── Filtre & Kapanış Kurları ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50/80 border-b border-gray-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Kapanış Kurları — Yerel Para / 1 USD
          </span>
        </div>
        <div className="px-4 py-3 space-y-3">
          {/* Kur inputları */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CURRENCIES.map(cur => (
              <div key={cur}>
                <Lbl>{cur} Kuru</Lbl>
                <input
                  type="number"
                  step="0.0001"
                  placeholder={RATE_PLACEHOLDERS[cur]}
                  value={closingRates[cur]}
                  onChange={e => setClosingRates(prev => ({ ...prev, [cur]: e.target.value }))}
                  className={inp}
                />
              </div>
            ))}
          </div>

          <div className="border-t border-gray-100 my-1" />

          {/* Filtreler + Butonlar */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[140px]">
              <Lbl>Para Birimi</Lbl>
              <select className={sel} value={currencyFilter} onChange={e => setCurrencyFilter(e.target.value)}>
                <option value="">Tüm Dövizler</option>
                {availableCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="min-w-[170px]">
              <Lbl>Ödeme Durumu</Lbl>
              <select className={sel} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">Tüm Durumlar</option>
                <option value="open">Açık</option>
                <option value="partial">Kısmi Ödendi</option>
                <option value="paid">Ödendi (Realize)</option>
              </select>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              {ran && (
                <button
                  onClick={() => { setRan(false); setCurrencyFilter(''); setStatusFilter(''); setClosingRates({ EUR: '', AED: '', TRY: '', GBP: '' }); }}
                  className="h-8 px-3 rounded-lg text-[11px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  Sıfırla
                </button>
              )}
              <button
                onClick={() => setRan(true)}
                className="h-8 px-4 rounded-xl text-white text-[12px] font-semibold hover:opacity-90 transition-opacity shadow-sm"
                style={{ background: accent }}
              >
                Hesapla
              </button>
            </div>
          </div>
        </div>
      </div>

      {!ran && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center py-16 text-gray-400">
          <RefreshCw className="h-8 w-8 mb-2 opacity-20" />
          <p className="text-sm font-medium text-gray-500">Kapanış kurlarını girin ve raporu çalıştırın</p>
          <p className="text-xs mt-1">USD dışındaki tüm işlemlerdeki kur farkı hesaplanır</p>
        </div>
      )}

      {ran && (
        <>
          {/* ── Özet Kartlar ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Para birimi kartları */}
            {currencies.map(cur => {
              const tot = byCurrency[cur];
              const net = tot.realized + tot.unrealized;
              return (
                <div key={cur} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-gray-500 uppercase">{cur}</span>
                    {!hasClosingRate(cur) && (
                      <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">Kur Girilmedi</span>
                    )}
                  </div>
                  <div className={cn('text-[16px] font-black tabular-nums', net >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                    {net >= 0 ? '+' : ''}{fUSD(net)}
                  </div>
                  <div className="mt-2 space-y-0.5">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-400">Realize edilmiş</span>
                      <span className={cn('font-semibold', tot.realized >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                        {tot.realized >= 0 ? '+' : ''}{fUSD(tot.realized)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-400">Realize edilmemiş</span>
                      <span className={cn('font-semibold', tot.unrealized >= 0 ? 'text-amber-600' : 'text-red-500')}>
                        {tot.unrealized >= 0 ? '+' : ''}{fUSD(tot.unrealized)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Net toplam */}
            <div className="bg-white rounded-2xl shadow-sm border-2 p-4" style={{ borderColor: accent }}>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: accent }}>
                Net Kur Farkı
              </div>
              <div className={cn('text-[20px] font-black tabular-nums', totalNet >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                {totalNet >= 0 ? '+' : ''}{fUSD(totalNet)}
              </div>
              <div className="mt-2 space-y-0.5">
                <div className="flex justify-between text-[10px]">
                  <span className="text-gray-400">Realize</span>
                  <span className={cn('font-bold', totalRealized >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                    {totalRealized >= 0 ? '+' : ''}{fUSD(totalRealized)}
                  </span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-gray-400">Realize edilmemiş</span>
                  <span className={cn('font-bold', totalUnreal >= 0 ? 'text-amber-600' : 'text-red-500')}>
                    {totalUnreal >= 0 ? '+' : ''}{fUSD(totalUnreal)}
                  </span>
                </div>
                <div className="text-[10px] text-gray-400 mt-1">{rows.length} işlem</div>
              </div>
            </div>
          </div>

          {/* ── Detay Tablo ───────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/60">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">İşlem Bazında Kur Farkı</span>
            </div>

            {rows.length === 0 ? (
              <div className="py-14 text-center text-sm text-gray-400">Dövizli işlem bulunamadı</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[90px]">Tarih</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Firma / Açıklama</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[110px]">Tutar</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[90px]">İşlem Kuru</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[90px]">Kapanış Kuru</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[100px]">İşlem USD</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[100px]">Kapanış USD</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[100px]">Kur Farkı</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[110px]">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map(({ txn, originalUsd, closingUsd, diff, isRealized }, i) => {
                      const partyName = txn.customer?.name ?? txn.supplier?.name ?? txn.service_provider?.name ?? txn.party_name ?? '—';
                      const closingRateVal = parseFloat(closingRates[txn.currency] || '0');
                      return (
                        <tr key={txn.id} className={cn('transition-colors hover:bg-gray-50/60', i % 2 === 1 && 'bg-gray-50/30')}>
                          <td className="px-4 py-3 text-[11px] text-gray-500 whitespace-nowrap">{fDate(txn.transaction_date)}</td>
                          <td className="px-4 py-3">
                            <div className="text-[12px] font-semibold text-gray-800 truncate max-w-[220px]">{partyName}</div>
                            {txn.description && (
                              <div className="text-[10px] text-gray-400 truncate max-w-[220px]">{txn.description}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-[12px] font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                            {fCurrency(txn.amount, txn.currency)}
                          </td>
                          <td className="px-4 py-3 text-right text-[11px] font-mono text-gray-500 tabular-nums">
                            {txn.exchange_rate.toFixed(4)}
                          </td>
                          <td className="px-4 py-3 text-right text-[11px] font-mono tabular-nums"
                            style={{ color: closingRateVal > 0 ? '#374151' : '#d1d5db' }}>
                            {closingRateVal > 0 ? closingRateVal.toFixed(4) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-[11px] text-gray-600 tabular-nums">{fUSD(originalUsd)}</td>
                          <td className="px-4 py-3 text-right text-[11px] text-gray-600 tabular-nums">{fUSD(closingUsd)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={cn('text-[12px] font-bold tabular-nums', diff >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                              {diff >= 0 ? '+' : ''}{fUSD(diff)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn(
                              'text-[9px] font-bold uppercase px-2 py-0.5 rounded-full',
                              isRealized
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-700',
                            )}>
                              {isRealized ? 'Realize' : 'Realize Edilmemiş'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Tablo altı toplam */}
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td colSpan={7} className="px-4 py-2.5 text-[11px] font-bold text-gray-600 text-right">Net Kur Farkı Toplamı</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={cn('text-[13px] font-black tabular-nums', totalNet >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                          {totalNet >= 0 ? '+' : ''}{fUSD(totalNet)}
                        </span>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
