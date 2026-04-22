import { useMemo, useState, useRef } from 'react';
import { useKasalar } from '@/hooks/useKasalar';
import { useBankAccounts } from '@/hooks/useSettings';
import { useTransactions } from '@/hooks/useTransactions';
import { useTransfers } from '@/hooks/useTransfers';
import type { Transaction, Kasa, BankAccount, AccountTransfer } from '@/types/database';
import { fCurrency, fDate } from '@/lib/formatters';
import { useTheme } from '@/contexts/ThemeContext';
import { Banknote, Landmark, CalendarDays, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Sparkles, X, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { streamFinanceAnalysis } from '@/lib/financeAI';
import { MonoDatePicker } from '@/components/ui/MonoDatePicker';

/** Basit markdown renderer — ##, **, - destekler */
function AiMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <h3 key={i} className="text-[13px] font-bold text-gray-900 mt-4 first:mt-0">
              {line.slice(3)}
            </h3>
          );
        }
        if (line.startsWith('### ')) {
          return (
            <h4 key={i} className="text-[12px] font-bold text-gray-700 mt-3">
              {line.slice(4)}
            </h4>
          );
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={i} className="flex gap-2 text-[12px] text-gray-600">
              <span className="text-gray-300 shrink-0 mt-0.5">•</span>
              <span dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-1" />;
        return (
          <p key={i} className="text-[12px] text-gray-600 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }}
          />
        );
      })}
    </div>
  );
}

/** Para bize geliyor mu? — TransactionModal ile aynı mantık */
function isMoneyIn(txnType: string, partyType: string | null): boolean {
  if (txnType === 'receipt' || txnType === 'sale_inv') return true;
  if (txnType === 'advance') return partyType === 'customer';
  return false;
}

/** Hesap para birimine göre doğru miktarı seç */
function pickAmt(t: Transaction, currency: string): number {
  return currency === 'USD' ? (t.amount_usd ?? t.amount) : t.amount;
}

/** Kasa veya banka hesabına ait işlemlerin bakiyesini hesapla */
function computeBalance(
  openingBalance: number,
  txns: Transaction[],
  currency: string,
  incomingTransfers: AccountTransfer[] = [],
  outgoingTransfers: AccountTransfer[] = [],
): number {
  const txnBalance = txns.reduce((acc, t) => {
    const moneyIn = isMoneyIn(t.transaction_type, t.party_type);
    const amt = pickAmt(t, currency);
    return acc + (moneyIn ? amt : -amt);
  }, openingBalance);
  const transferBalance =
    incomingTransfers.reduce((s, t) => s + (currency === 'USD' ? t.amount_usd : t.amount), 0) -
    outgoingTransfers.reduce((s, t) => s + (currency === 'USD' ? t.amount_usd : t.amount), 0);
  return txnBalance + transferBalance;
}

// ─── Ledger row tipi ────────────────────────────────────────────────────────
type LedgerRow =
  | { kind: 'txn';      txn: Transaction;       moneyIn: boolean; running: number }
  | { kind: 'transfer'; transfer: AccountTransfer; moneyIn: boolean; running: number; otherName: string };

// ─── Nakit Pozisyonu Kartı — Mono KPI stili ─────────────────────────────────
function PositionCard({
  name,
  currency,
  balance,
  onClick,
  selected,
  accent,
}: {
  name: string;
  currency: string;
  balance: number;
  onClick: () => void;
  selected: boolean;
  accent: string;
}) {
  const positive = balance >= 0;
  const balanceColor = positive ? '#16a34a' : '#dc2626';
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl border px-3 py-2.5 transition-all outline-none"
      style={{
        borderColor: selected ? accent : '#f3f4f6',
        boxShadow: selected ? `0 0 0 1px ${accent}` : undefined,
      }}
    >
      <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1 truncate">{name}</div>
      <div className="text-[14px] font-black leading-tight tabular-nums" style={{ color: balanceColor }}>
        {fCurrency(Math.abs(balance), currency as any)}
      </div>
      <div className="text-[9px] font-semibold mt-0.5 text-gray-400">{currency} · {positive ? 'Bakiye' : 'Açık'}</div>
    </button>
  );
}

// ─── Hesap Tipi ─────────────────────────────────────────────────────────────
type AccountOption =
  | { kind: 'kasa';  kasa: Kasa }
  | { kind: 'bank';  bank: BankAccount };

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────
export function FinancialReportsTab() {
  const { accent } = useTheme();

  const { data: kasalar = [] } = useKasalar();
  const { data: bankAccounts = [] } = useBankAccounts();
  const { data: allTxns = [] } = useTransactions();
  const { data: allTransfers = [] } = useTransfers();

  const [selectedAccount, setSelectedAccount] = useState<AccountOption | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── AI Analizi state ───────────────────────────────────────────────────────
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const abortRef = useRef(false);

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

  // ── Transfer maps ──────────────────────────────────────────────────────────
  const incomingTransfersByKasa = useMemo(() => {
    const map = new Map<string, AccountTransfer[]>();
    for (const t of allTransfers) {
      if (t.to_type === 'kasa') {
        if (!map.has(t.to_id)) map.set(t.to_id, []);
        map.get(t.to_id)!.push(t);
      }
    }
    return map;
  }, [allTransfers]);

  const outgoingTransfersByKasa = useMemo(() => {
    const map = new Map<string, AccountTransfer[]>();
    for (const t of allTransfers) {
      if (t.from_type === 'kasa') {
        if (!map.has(t.from_id)) map.set(t.from_id, []);
        map.get(t.from_id)!.push(t);
      }
    }
    return map;
  }, [allTransfers]);

  const incomingTransfersByBank = useMemo(() => {
    const map = new Map<string, AccountTransfer[]>();
    for (const t of allTransfers) {
      if (t.to_type === 'bank') {
        if (!map.has(t.to_id)) map.set(t.to_id, []);
        map.get(t.to_id)!.push(t);
      }
    }
    return map;
  }, [allTransfers]);

  const outgoingTransfersByBank = useMemo(() => {
    const map = new Map<string, AccountTransfer[]>();
    for (const t of allTransfers) {
      if (t.from_type === 'bank') {
        if (!map.has(t.from_id)) map.set(t.from_id, []);
        map.get(t.from_id)!.push(t);
      }
    }
    return map;
  }, [allTransfers]);

  // ── Kasa bakiyeleri ────────────────────────────────────────────────────────
  const kasaBalances = useMemo(() =>
    kasalar.map(k => ({
      kasa: k,
      balance: computeBalance(
        k.opening_balance ?? 0,
        txnsByKasa.get(k.id) ?? [],
        k.currency,
        incomingTransfersByKasa.get(k.id) ?? [],
        outgoingTransfersByKasa.get(k.id) ?? [],
      ),
    })),
    [kasalar, txnsByKasa, incomingTransfersByKasa, outgoingTransfersByKasa],
  );

  // ── Banka bakiyeleri ───────────────────────────────────────────────────────
  const bankBalances = useMemo(() =>
    bankAccounts.map(b => ({
      bank: b,
      balance: computeBalance(
        b.opening_balance ?? 0,
        txnsByBank.get(b.id) ?? [],
        b.currency ?? 'USD',
        incomingTransfersByBank.get(b.id) ?? [],
        outgoingTransfersByBank.get(b.id) ?? [],
      ),
    })),
    [bankAccounts, txnsByBank, incomingTransfersByBank, outgoingTransfersByBank],
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

  // ── Seçili hesap için transferler ──────────────────────────────────────────
  const ledgerTransfers = useMemo(() => {
    if (!selectedAccount) return { incoming: [] as AccountTransfer[], outgoing: [] as AccountTransfer[] };
    let incoming: AccountTransfer[];
    let outgoing: AccountTransfer[];
    if (selectedAccount.kind === 'kasa') {
      incoming = incomingTransfersByKasa.get(selectedAccount.kasa.id) ?? [];
      outgoing = outgoingTransfersByKasa.get(selectedAccount.kasa.id) ?? [];
    } else {
      incoming = incomingTransfersByBank.get(selectedAccount.bank.id) ?? [];
      outgoing = outgoingTransfersByBank.get(selectedAccount.bank.id) ?? [];
    }
    if (dateFrom) {
      incoming = incoming.filter(t => t.transfer_date >= dateFrom);
      outgoing = outgoing.filter(t => t.transfer_date >= dateFrom);
    }
    if (dateTo) {
      incoming = incoming.filter(t => t.transfer_date <= dateTo);
      outgoing = outgoing.filter(t => t.transfer_date <= dateTo);
    }
    return { incoming, outgoing };
  }, [selectedAccount, incomingTransfersByKasa, outgoingTransfersByKasa, incomingTransfersByBank, outgoingTransfersByBank, dateFrom, dateTo]);

  // ── Kümülatif bakiye (tarih filtresinden önceki açılış bakiyesi) ───────────
  const openingForLedger = useMemo(() => {
    if (!selectedAccount) return 0;
    if (selectedAccount.kind === 'kasa') {
      const k = selectedAccount.kasa;
      const preTxns = dateFrom
        ? (txnsByKasa.get(k.id) ?? []).filter(t => t.transaction_date < dateFrom)
        : [];
      const preIncoming = dateFrom
        ? (incomingTransfersByKasa.get(k.id) ?? []).filter(t => t.transfer_date < dateFrom)
        : [];
      const preOutgoing = dateFrom
        ? (outgoingTransfersByKasa.get(k.id) ?? []).filter(t => t.transfer_date < dateFrom)
        : [];
      return computeBalance(k.opening_balance ?? 0, preTxns, k.currency, preIncoming, preOutgoing);
    } else {
      const b = selectedAccount.bank;
      const preTxns = dateFrom
        ? (txnsByBank.get(b.id) ?? []).filter(t => t.transaction_date < dateFrom)
        : [];
      const preIncoming = dateFrom
        ? (incomingTransfersByBank.get(b.id) ?? []).filter(t => t.transfer_date < dateFrom)
        : [];
      const preOutgoing = dateFrom
        ? (outgoingTransfersByBank.get(b.id) ?? []).filter(t => t.transfer_date < dateFrom)
        : [];
      return computeBalance(b.opening_balance ?? 0, preTxns, b.currency ?? 'USD', preIncoming, preOutgoing);
    }
  }, [selectedAccount, dateFrom, txnsByKasa, txnsByBank, incomingTransfersByKasa, outgoingTransfersByKasa, incomingTransfersByBank, outgoingTransfersByBank]);

  // ── Hesap ismi yardımcısı ──────────────────────────────────────────────────
  function getAccountName(type: 'kasa' | 'bank', id: string): string {
    if (type === 'kasa') {
      const k = kasalar.find(k => k.id === id);
      return k?.name ?? '—';
    } else {
      const b = bankAccounts.find(b => b.id === id);
      return b ? `${b.bank_name}${b.account_name ? ` — ${b.account_name}` : ''}` : '—';
    }
  }

  // ── Seçili hesap bilgileri (ledgerRows'dan önce tanımlanmalı) ────────────────
  const selectedName = selectedAccount
    ? selectedAccount.kind === 'kasa'
      ? selectedAccount.kasa.name
      : `${selectedAccount.bank.bank_name}${selectedAccount.bank.account_name ? ` — ${selectedAccount.bank.account_name}` : ''}`
    : '';

  const selectedCurrency = selectedAccount
    ? selectedAccount.kind === 'kasa'
      ? selectedAccount.kasa.currency
      : (selectedAccount.bank.currency ?? 'USD')
    : 'USD';

  // ── Kümülatif dizi (txn + transfer satırları birleşik) ─────────────────────
  const ledgerRows = useMemo((): LedgerRow[] => {
    const { incoming, outgoing } = ledgerTransfers;

    // Tüm satırları tarih sırasına göre birleştir
    type RawRow =
      | { date: string; kind: 'txn'; txn: Transaction }
      | { date: string; kind: 'transfer'; transfer: AccountTransfer; moneyIn: boolean };

    const rows: RawRow[] = [
      ...ledgerTxns.map(t => ({ date: t.transaction_date, kind: 'txn' as const, txn: t })),
      ...incoming.map(t => ({ date: t.transfer_date, kind: 'transfer' as const, transfer: t, moneyIn: true })),
      ...outgoing.map(t => ({ date: t.transfer_date, kind: 'transfer' as const, transfer: t, moneyIn: false })),
    ];

    rows.sort((a, b) => a.date.localeCompare(b.date));

    const cur = selectedCurrency;
    let running = openingForLedger;
    return rows.map(row => {
      if (row.kind === 'txn') {
        const moneyIn = isMoneyIn(row.txn.transaction_type, row.txn.party_type);
        const amt = pickAmt(row.txn, cur);
        running = running + (moneyIn ? amt : -amt);
        return { kind: 'txn' as const, txn: row.txn, moneyIn, running };
      } else {
        const tAmt = cur === 'USD' ? row.transfer.amount_usd : row.transfer.amount;
        running = running + (row.moneyIn ? tAmt : -tAmt);
        const otherName = row.moneyIn
          ? getAccountName(row.transfer.from_type, row.transfer.from_id)
          : getAccountName(row.transfer.to_type, row.transfer.to_id);
        return { kind: 'transfer' as const, transfer: row.transfer, moneyIn: row.moneyIn, running, otherName };
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerTxns, ledgerTransfers, openingForLedger, kasalar, bankAccounts]);

  const closingBalance = ledgerRows.length > 0
    ? ledgerRows[ledgerRows.length - 1].running
    : openingForLedger;

  const totalIn = ledgerRows.reduce((s, r) => {
    if (!r.moneyIn) return s;
    const amt = r.kind === 'txn' ? pickAmt(r.txn, selectedCurrency) : (selectedCurrency === 'USD' ? r.transfer.amount_usd : r.transfer.amount);
    return s + amt;
  }, 0);
  const totalOut = ledgerRows.reduce((s, r) => {
    if (r.moneyIn) return s;
    const amt = r.kind === 'txn' ? pickAmt(r.txn, selectedCurrency) : (selectedCurrency === 'USD' ? r.transfer.amount_usd : r.transfer.amount);
    return s + amt;
  }, 0);

  // ── AI analizi tetikle ─────────────────────────────────────────────────────
  async function handleAiAnalysis() {
    setAiOpen(true);
    setAiText('');
    setAiError('');
    setAiLoading(true);
    abortRef.current = false;

    // Kur verisi — Topbar'dan zaten çekiliyor, localStorage'dan oku veya sabit fallback
    let eurRate = 1.12;
    let tryRate = 38;
    try {
      const stored = localStorage.getItem('sunmax_rates');
      if (stored) {
        const parsed = JSON.parse(stored) as { EUR?: number; TRY?: number };
        if (parsed.EUR) eurRate = parsed.EUR;
        if (parsed.TRY) tryRate = parsed.TRY;
      }
    } catch { /* fallback */ }

    try {
      const gen = streamFinanceAnalysis({
        today: new Date().toISOString().slice(0, 10),
        kasaBalances: kasaBalances.map(({ kasa, balance }) => ({
          name: kasa.name,
          currency: kasa.currency,
          balance,
        })),
        bankBalances: bankBalances.map(({ bank, balance }) => ({
          name: `${bank.bank_name}${bank.account_name ? ` — ${bank.account_name}` : ''}`,
          currency: bank.currency ?? 'USD',
          balance,
        })),
        recentTxns: allTxns,
        allTxns,
        kasalar,
        bankAccounts,
        eurRate,
        tryRate,
      });

      for await (const chunk of gen) {
        if (abortRef.current) break;
        setAiText(prev => prev + chunk);
      }
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="space-y-5">

      {/* ── BÖLÜM 1: Nakit Pozisyonu ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between bg-gray-50/80 border-b border-gray-100">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Nakit Pozisyonu</span>
          <button
            onClick={handleAiAnalysis}
            disabled={aiLoading}
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[10px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-60"
            style={{ background: accent }}
          >
            {aiLoading
              ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analiz…</>
              : <><Sparkles className="h-3 w-3" />AI Analizi</>
            }
          </button>
        </div>

        {kasalar.length === 0 && bankAccounts.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-gray-400">
            <Banknote className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-sm font-medium text-gray-500">Henüz kasa veya banka hesabı yok</p>
            <p className="text-xs mt-1">Muhasebe → Ayarlar'dan ekleyebilirsiniz</p>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {/* Kasalar */}
            {kasalar.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Kasalar</span>
                  <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-bold">{kasalar.length}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {kasaBalances.map(({ kasa, balance }) => (
                    <PositionCard
                      key={kasa.id}
                      name={kasa.name}
                      currency={kasa.currency}
                      balance={balance}
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
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Banka Hesapları</span>
                  <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full font-bold">{bankAccounts.length}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {bankBalances.map(({ bank, balance }) => (
                    <PositionCard
                      key={bank.id}
                      name={`${bank.bank_name}${bank.account_name ? ` — ${bank.account_name}` : ''}`}
                      currency={bank.currency ?? 'USD'}
                      balance={balance}
                      selected={selectedAccount?.kind === 'bank' && selectedAccount.bank.id === bank.id}
                      onClick={() => setSelectedAccount({ kind: 'bank', bank })}
                      accent={accent}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── BÖLÜM 1.5: AI Analiz Paneli ──────────────────────────────────── */}
      {aiOpen && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/60 flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: accent }} />
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">AI Finansal Analiz</span>
            <div className="ml-auto flex items-center gap-2">
              {!aiLoading && aiText && (
                <button
                  onClick={handleAiAnalysis}
                  className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-50"
                >
                  <RefreshCw className="h-3 w-3" /> Yenile
                </button>
              )}
              <button
                onClick={() => { abortRef.current = true; setAiOpen(false); }}
                className="p-1 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="px-6 py-5">
            {aiError ? (
              <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl">
                <span className="text-red-500 text-[12px]">⚠ {aiError}</span>
              </div>
            ) : aiText ? (
              <div className="prose prose-sm max-w-none text-gray-700">
                <AiMarkdown text={aiText} />
                {aiLoading && (
                  <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse rounded-sm ml-0.5" />
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 py-6 text-gray-400">
                <div className="w-5 h-5 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: 'var(--color-accent, #dc2626)' }} />
                <span className="text-[13px]">Finansal veriler analiz ediliyor…</span>
              </div>
            )}
          </div>
        </div>
      )}

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
              <MonoDatePicker value={dateFrom} onChange={v => setDateFrom(v)} className="h-8 w-36 bg-white border border-gray-200 rounded-lg px-2 text-[11px] text-gray-700 focus:outline-none flex items-center justify-between overflow-hidden hover:bg-gray-50 transition-colors" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400 font-semibold">Bitiş</span>
              <MonoDatePicker value={dateTo} onChange={v => setDateTo(v)} className="h-8 w-36 bg-white border border-gray-200 rounded-lg px-2 text-[11px] text-gray-700 focus:outline-none flex items-center justify-between overflow-hidden hover:bg-gray-50 transition-colors" />
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
                  ) : ledgerRows.map((row, i) => {
                    if (row.kind === 'txn') {
                      const { txn, moneyIn, running } = row;
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
                              <div className="text-right">
                                <span className="text-[12px] font-semibold text-emerald-700 tabular-nums block">
                                  + {fCurrency(pickAmt(txn, selectedCurrency), selectedCurrency as any)}
                                </span>
                                {txn.currency !== selectedCurrency && (
                                  <span className="text-[10px] text-gray-400 font-mono">
                                    {fCurrency(txn.amount, txn.currency)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-200 text-[11px]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {!moneyIn ? (
                              <div className="text-right">
                                <span className="text-[12px] font-semibold text-red-600 tabular-nums block">
                                  − {fCurrency(pickAmt(txn, selectedCurrency), selectedCurrency as any)}
                                </span>
                                {txn.currency !== selectedCurrency && (
                                  <span className="text-[10px] text-gray-400 font-mono">
                                    {fCurrency(txn.amount, txn.currency)}
                                  </span>
                                )}
                              </div>
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
                    } else {
                      // Transfer satırı
                      const { transfer, moneyIn, running, otherName } = row;
                      const label = moneyIn
                        ? `↙ ${otherName}'den gelen transfer`
                        : `↗ ${otherName}'e transfer`;
                      return (
                        <tr
                          key={`tr-${transfer.id}-${moneyIn ? 'in' : 'out'}`}
                          className={cn(
                            'hover:bg-amber-50/40 transition-colors',
                            i % 2 === 1 && 'bg-amber-50/20',
                          )}
                        >
                          <td className="px-4 py-3 text-[11px] text-gray-500 whitespace-nowrap">{fDate(transfer.transfer_date)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <ArrowLeftRight className="h-3 w-3 text-amber-500 shrink-0" />
                              <div className="text-[12px] font-semibold text-amber-700 truncate max-w-[240px]">
                                {transfer.description || label}
                              </div>
                            </div>
                            {transfer.description && (
                              <div className="text-[10px] text-amber-500 truncate max-w-[260px] pl-4">{label}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[11px] font-mono text-gray-400 truncate">
                            {transfer.reference_no || '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {moneyIn ? (
                              <span className="text-[12px] font-semibold text-emerald-700 tabular-nums">
                                + {fCurrency(transfer.amount, transfer.currency as any)}
                              </span>
                            ) : (
                              <span className="text-gray-200 text-[11px]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {!moneyIn ? (
                              <span className="text-[12px] font-semibold text-red-600 tabular-nums">
                                − {fCurrency(transfer.amount, transfer.currency as any)}
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
                    }
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
                      + {fCurrency(totalIn, selectedCurrency as any)}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Toplam Çıkış</span>
                    <div className="text-[13px] font-bold text-red-600 tabular-nums">
                      − {fCurrency(totalOut, selectedCurrency as any)}
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
