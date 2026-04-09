import { useMemo, useState } from 'react';
import { useKasalar } from '@/hooks/useKasalar';
import { useBankAccounts } from '@/hooks/useSettings';
import { useTransactions } from '@/hooks/useTransactions';
import type { Transaction, Kasa, BankAccount } from '@/types/database';
import { fCurrency, fDate } from '@/lib/formatters';
import { useTheme } from '@/contexts/ThemeContext';
import { Banknote, Landmark, TrendingUp, CalendarDays, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Para bize geliyor mu? — TransactionModal ile aynı mantık */
function isMoneyIn(txnType: string, partyType: string | null): boolean {
  if (txnType === 'receipt' || txnType === 'sale_inv') return true;
  if (txnType === 'advance') return partyType === 'customer';
  return false;
}

/** Kasa veya banka hesabına ait işlemlerin bakiyesini hesapla */
function computeBalance(
  openingBalance: number,
  txns: Transaction[],
): number {
  return txns.reduce((acc, t) => {
    const moneyIn = isMoneyIn(t.transaction_type, t.party_type);
    return acc + (moneyIn ? t.amount : -t.amount);
  }, openingBalance);
}

// ─── Nakit Pozisyonu Kartı ───────────────────────────────────────────────────
function PositionCard({
  name,
  currency,
  balance,
  icon,
  onClick,
  selected,
  accent,
}: {
  name: string;
  currency: string;
  balance: number;
  icon: React.ReactNode;
  onClick: () => void;
  selected: boolean;
  accent: string;
}) {
  const positive = balance >= 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left bg-white rounded-2xl border shadow-sm p-4 transition-all hover:shadow-md',
        selected ? 'ring-2' : 'border-gray-100',
      )}
      style={selected ? { outline: `2px solid ${accent}`, outlineOffset: '-2px' } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: selected ? accent + '18' : '#f3f4f620' }}
          >
            <span style={{ color: selected ? accent : '#9ca3af' }}>{icon}</span>
          </div>
          <div>
            <div className="text-[12px] font-bold text-gray-800 truncate max-w-[140px]">{name}</div>
            <div className="text-[10px] text-gray-400 font-mono">{currency}</div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className={cn('text-[16px] font-black tabular-nums', positive ? 'text-emerald-700' : 'text-red-600')}
          >
            {fCurrency(Math.abs(balance), currency as any)}
          </div>
          <div className={cn('text-[10px] font-semibold mt-0.5', positive ? 'text-emerald-500' : 'text-red-400')}>
            {positive ? 'Bakiye' : 'Açık'}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Hesap Tipi ─────────────────────────────────────────────────────────────
type AccountOption =
  | { kind: 'kasa';  kasa: Kasa }
  | { kind: 'bank';  bank: BankAccount };

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────
export function FinancialReportsTab() {
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';

  const { data: kasalar = [] } = useKasalar();
  const { data: bankAccounts = [] } = useBankAccounts();
  const { data: allTxns = [] } = useTransactions();

  const [selectedAccount, setSelectedAccount] = useState<AccountOption | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── Hesap başına bağlı işlemleri ayır ─────────────────────────────────────
  const txnsByKasa = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of allTxns) {
      if (t.kasa_id) {
        if (!map.has(t.kasa_id)) map.set(t.kasa_id, []);
        map.get(t.kasa_id)!.push(t);
      }
    }
    return map;
  }, [allTxns]);

  const txnsByBank = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of allTxns) {
      if (t.bank_account_id) {
        if (!map.has(t.bank_account_id)) map.set(t.bank_account_id, []);
        map.get(t.bank_account_id)!.push(t);
      }
    }
    return map;
  }, [allTxns]);

  // ── Kasa bakiyeleri ────────────────────────────────────────────────────────
  const kasaBalances = useMemo(() =>
    kasalar.map(k => ({
      kasa: k,
      balance: computeBalance(k.opening_balance ?? 0, txnsByKasa.get(k.id) ?? []),
    })),
    [kasalar, txnsByKasa],
  );

  // ── Banka bakiyeleri ───────────────────────────────────────────────────────
  const bankBalances = useMemo(() =>
    bankAccounts.map(b => ({
      bank: b,
      balance: computeBalance(b.opening_balance ?? 0, txnsByBank.get(b.id) ?? []),
    })),
    [bankAccounts, txnsByBank],
  );

  // ── Seçili hesap için defter işlemleri ─────────────────────────────────────
  const ledgerTxns = useMemo(() => {
    let txns: Transaction[] = [];
    if (!selectedAccount) return txns;

    if (selectedAccount.kind === 'kasa') {
      txns = txnsByKasa.get(selectedAccount.kasa.id) ?? [];
    } else {
      txns = txnsByBank.get(selectedAccount.bank.id) ?? [];
    }

    // Tarih filtresi
    if (dateFrom) txns = txns.filter(t => t.transaction_date >= dateFrom);
    if (dateTo)   txns = txns.filter(t => t.transaction_date <= dateTo);

    // Tarihe göre sırala (eskiden yeniye)
    return [...txns].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
  }, [selectedAccount, txnsByKasa, txnsByBank, dateFrom, dateTo]);

  // ── Kümülatif bakiye (tarih filtresinden önceki açılış bakiyesi) ───────────
  const openingForLedger = useMemo(() => {
    if (!selectedAccount) return 0;
    if (selectedAccount.kind === 'kasa') {
      const k = selectedAccount.kasa;
      const preTxns = dateFrom
        ? (txnsByKasa.get(k.id) ?? []).filter(t => t.transaction_date < dateFrom)
        : [];
      return computeBalance(k.opening_balance ?? 0, preTxns);
    } else {
      const b = selectedAccount.bank;
      const preTxns = dateFrom
        ? (txnsByBank.get(b.id) ?? []).filter(t => t.transaction_date < dateFrom)
        : [];
      return computeBalance(b.opening_balance ?? 0, preTxns);
    }
  }, [selectedAccount, dateFrom, txnsByKasa, txnsByBank]);

  // ── Kümülatif dizi ─────────────────────────────────────────────────────────
  const ledgerRows = useMemo(() => {
    let running = openingForLedger;
    return ledgerTxns.map(t => {
      const moneyIn = isMoneyIn(t.transaction_type, t.party_type);
      running = running + (moneyIn ? t.amount : -t.amount);
      return { txn: t, moneyIn, running };
    });
  }, [ledgerTxns, openingForLedger]);

  const closingBalance = ledgerRows.length > 0
    ? ledgerRows[ledgerRows.length - 1].running
    : openingForLedger;

  const selectedName = selectedAccount
    ? selectedAccount.kind === 'kasa'
      ? selectedAccount.kasa.name
      : `${selectedAccount.bank.bank_name}${selectedAccount.bank.account_name ? ` — ${selectedAccount.bank.account_name}` : ''}`
    : '';

  const selectedCurrency = selectedAccount
    ? selectedAccount.kind === 'kasa'
      ? selectedAccount.kasa.currency
      : selectedAccount.bank.currency
    : 'USD';

  return (
    <div className="space-y-5">

      {/* ── BÖLÜM 1: Nakit Pozisyonu ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/60 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-gray-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
            Nakit Pozisyonu
          </span>
        </div>
        <div className="p-4 space-y-4">

          {/* Kasalar */}
          {kasalar.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <Banknote className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Kasalar</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {kasaBalances.map(({ kasa, balance }) => (
                  <PositionCard
                    key={kasa.id}
                    name={kasa.name}
                    currency={kasa.currency}
                    balance={balance}
                    icon={<Banknote className="h-4 w-4" />}
                    selected={selectedAccount?.kind === 'kasa' && selectedAccount.kasa.id === kasa.id}
                    onClick={() => setSelectedAccount({ kind: 'kasa', kasa })}
                    accent={accent}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Banka Hesapları */}
          {bankAccounts.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <Landmark className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Banka Hesapları</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {bankBalances.map(({ bank, balance }) => (
                  <PositionCard
                    key={bank.id}
                    name={`${bank.bank_name}${bank.account_name ? ` — ${bank.account_name}` : ''}`}
                    currency={bank.currency ?? 'USD'}
                    balance={balance}
                    icon={<Landmark className="h-4 w-4" />}
                    selected={selectedAccount?.kind === 'bank' && selectedAccount.bank.id === bank.id}
                    onClick={() => setSelectedAccount({ kind: 'bank', bank })}
                    accent={accent}
                  />
                ))}
              </div>
            </div>
          )}

          {kasalar.length === 0 && bankAccounts.length === 0 && (
            <div className="flex flex-col items-center py-10 text-gray-400">
              <Banknote className="h-8 w-8 mb-2 opacity-20" />
              <p className="text-sm font-medium text-gray-500">Henüz kasa veya banka hesabı yok</p>
              <p className="text-xs mt-1">Muhasebe → Ayarlar'dan ekleyebilirsiniz</p>
            </div>
          )}
        </div>
      </div>

      {/* ── BÖLÜM 2: Hesap Defteri ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/60 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-gray-400" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
              {selectedAccount ? `${selectedName} Defteri` : 'Hesap Defteri'}
            </span>
          </div>
          {/* Tarih filtresi */}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400 font-semibold">Başlangıç</span>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-8 px-2 text-[11px] border border-gray-200 rounded-lg bg-white outline-none focus:border-gray-400"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400 font-semibold">Bitiş</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-8 px-2 text-[11px] border border-gray-200 rounded-lg bg-white outline-none focus:border-gray-400"
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="text-[10px] text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
              >
                Temizle
              </button>
            )}
          </div>
        </div>

        {!selectedAccount ? (
          <div className="flex flex-col items-center py-14 text-gray-400">
            <Landmark className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-sm font-medium text-gray-500">Hesap seçin</p>
            <p className="text-xs mt-1">Yukarıdaki kartlardan bir kasa veya banka hesabı seçin</p>
          </div>
        ) : (
          <>
            {/* Açılış bakiyesi satırı */}
            <div className="px-4 py-2.5 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-gray-500">
                {dateFrom ? `${fDate(dateFrom)} öncesi devir` : 'Açılış Bakiyesi'}
              </span>
              <span className={cn(
                'text-[13px] font-black tabular-nums',
                openingForLedger >= 0 ? 'text-emerald-700' : 'text-red-600',
              )}>
                {fCurrency(openingForLedger, selectedCurrency as any)}
              </span>
            </div>

            {/* Tablo */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[100px]">Tarih</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Açıklama / Firma</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[100px]">Ref No</th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-green-500 w-[120px]">
                      <div className="flex items-center justify-end gap-1">
                        <ArrowDownLeft className="h-3 w-3" /> Giriş
                      </div>
                    </th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-red-400 w-[120px]">
                      <div className="flex items-center justify-end gap-1">
                        <ArrowUpRight className="h-3 w-3" /> Çıkış
                      </div>
                    </th>
                    <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 w-[130px]">Bakiye</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ledgerRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-14 text-center text-[13px] text-gray-400">
                        Bu dönemde işlem bulunamadı
                      </td>
                    </tr>
                  ) : ledgerRows.map(({ txn, moneyIn, running }, i) => {
                    const partyName = txn.customer?.name ?? txn.supplier?.name ?? txn.service_provider?.name ?? txn.party_name ?? '—';
                    return (
                      <tr
                        key={txn.id}
                        className={cn(
                          'hover:bg-gray-50/60 transition-colors',
                          i % 2 === 1 && 'bg-gray-50/30',
                        )}
                      >
                        <td className="px-4 py-3 text-[11px] text-gray-500 whitespace-nowrap">{fDate(txn.transaction_date)}</td>
                        <td className="px-4 py-3">
                          <div className="text-[12px] font-semibold text-gray-800 truncate max-w-[260px]">
                            {txn.description || partyName}
                          </div>
                          {txn.description && partyName !== '—' && (
                            <div className="text-[10px] text-gray-400 truncate max-w-[260px]">{partyName}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[11px] font-mono text-gray-400 truncate">
                          {txn.reference_no || txn.trade_file?.file_no || '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {moneyIn ? (
                            <span className="text-[12px] font-semibold text-emerald-700 tabular-nums">
                              + {fCurrency(txn.amount, txn.currency)}
                            </span>
                          ) : (
                            <span className="text-gray-200 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!moneyIn ? (
                            <span className="text-[12px] font-semibold text-red-600 tabular-nums">
                              − {fCurrency(txn.amount, txn.currency)}
                            </span>
                          ) : (
                            <span className="text-gray-200 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn(
                            'text-[13px] font-black tabular-nums',
                            running >= 0 ? 'text-gray-900' : 'text-red-600',
                          )}>
                            {fCurrency(running, selectedCurrency as any)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Kapanış bakiyesi */}
            {ledgerRows.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/80 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Toplam Giriş</span>
                    <div className="text-[13px] font-bold text-emerald-700 tabular-nums">
                      + {fCurrency(ledgerRows.filter(r => r.moneyIn).reduce((s, r) => s + r.txn.amount, 0), selectedCurrency as any)}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Toplam Çıkış</span>
                    <div className="text-[13px] font-bold text-red-600 tabular-nums">
                      − {fCurrency(ledgerRows.filter(r => !r.moneyIn).reduce((s, r) => s + r.txn.amount, 0), selectedCurrency as any)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Kapanış Bakiyesi</span>
                  <div className={cn(
                    'text-[16px] font-black tabular-nums',
                    closingBalance >= 0 ? 'text-gray-900' : 'text-red-600',
                  )}>
                    {fCurrency(closingBalance, selectedCurrency as any)}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
