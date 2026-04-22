import { useState } from 'react';
import { useBankAccounts, useUpsertBankAccount } from '@/hooks/useSettings';
import { useCurrencies } from '@/hooks/useCurrencies';
import { CURRENCY_LABELS } from '@/types/enums';
import { useTransactions } from '@/hooks/useTransactions';
import { useTheme } from '@/contexts/ThemeContext';
import { fCurrency, fDate } from '@/lib/formatters';
import type { CurrencyCode } from '@/types/enums';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/form-elements';
import { FormRow, FormGroup } from '@/components/ui/shared';
import { Landmark, Plus, Pencil, X, Check, ChevronsUpDown } from 'lucide-react';

const ACCOUNT_TYPES = [
  { value: 'checking',  label: 'Vadesiz (Cari Hesap)' },
  { value: 'savings',   label: 'Vadeli Mevduat' },
  { value: 'fx',        label: 'Döviz Hesabı' },
  { value: 'loan',      label: 'Kredi Hesabı' },
];

type BankForm = {
  bank_name: string;
  account_name: string;
  currency: string;
  account_number: string;
  branch_name: string;
  branch_code: string;
  iban_usd: string;
  iban_eur: string;
  swift_bic: string;
  correspondent_bank: string;
  opening_balance: string;
  opening_balance_date: string;
  account_type: string;
  is_default: boolean;
};

const EMPTY: BankForm = {
  bank_name: '',
  account_name: '',
  currency: 'USD',
  account_number: '',
  branch_name: '',
  branch_code: '',
  iban_usd: '',
  iban_eur: '',
  swift_bic: '',
  correspondent_bank: '',
  opening_balance: '',
  opening_balance_date: '',
  account_type: 'checking',
  is_default: false,
};

function isMoneyIn(txnType: string, partyType: string): boolean {
  if (txnType === 'receipt' || txnType === 'sale_inv') return true;
  if (txnType === 'advance') return partyType === 'customer';
  return false;
}

export function BankAccountManager() {
  const { accent } = useTheme();
  const currencies = useCurrencies();
  const { data: accounts = [], isLoading } = useBankAccounts();
  const { data: allTxns = [] } = useTransactions();
  const upsert = useUpsertBankAccount();

  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<BankForm>(EMPTY);
  const [expanded, setExpanded] = useState<string | null>(null);

  function f(field: keyof BankForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  function accountBalance(accountId: string, currency: string, openingBalance: number): number {
    const txnBalance = allTxns
      .filter(t => t.bank_account_id === accountId)
      .reduce((sum, t) => {
        const credit = isMoneyIn(t.transaction_type, t.party_type ?? '');
        const amt = currency === 'USD' ? t.amount_usd : t.amount;
        return sum + (credit ? amt : -amt);
      }, 0);
    return openingBalance + txnBalance;
  }

  function txnCount(accountId: string): number {
    return allTxns.filter(t => t.bank_account_id === accountId).length;
  }

  async function handleSave() {
    if (!form.bank_name.trim()) return;
    await upsert.mutateAsync({
      id: editId,
      data: {
        ...form,
        opening_balance: parseFloat(form.opening_balance) || 0,
        opening_balance_date: form.opening_balance_date || '',
      },
    });
    setEditId(null);
    setShowNew(false);
    setForm(EMPTY);
  }

  function startEdit(acc: typeof accounts[number]) {
    setEditId(acc.id);
    setShowNew(false);
    setForm({
      bank_name: acc.bank_name,
      account_name: acc.account_name,
      currency: acc.currency ?? 'USD',
      account_number: acc.account_number ?? '',
      branch_name: acc.branch_name ?? '',
      branch_code: acc.branch_code ?? '',
      iban_usd: acc.iban_usd,
      iban_eur: acc.iban_eur,
      swift_bic: acc.swift_bic,
      correspondent_bank: acc.correspondent_bank,
      opening_balance: acc.opening_balance ? String(acc.opening_balance) : '',
      opening_balance_date: acc.opening_balance_date ?? '',
      account_type: acc.account_type ?? 'checking',
      is_default: acc.is_default,
    });
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-gray-50">
        <div className="flex items-center gap-2.5">
          <Landmark className="h-4 w-4 text-gray-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Banka Hesapları</span>
          {accounts.length > 0 && (
            <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              {accounts.length}
            </span>
          )}
        </div>
        <button
          onClick={() => { setShowNew(true); setEditId(null); setForm(EMPTY); }}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-xl text-white hover:opacity-90 transition-opacity"
          style={{ background: accent }}
        >
          <Plus className="h-3.5 w-3.5" /> Yeni Hesap
        </button>
      </div>

      {/* Form */}
      {(showNew || editId) && (
        <div className="px-6 py-4 bg-gray-50/60 border-b border-gray-100 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            {editId ? 'Hesabı Düzenle' : 'Yeni Banka Hesabı'}
          </p>

          {/* Kimlik */}
          <FormRow cols={3}>
            <FormGroup label="Banka Adı *">
              <Input value={form.bank_name} onChange={f('bank_name')} placeholder="örn. Garanti BBVA" className="bg-gray-100 border-0 focus:ring-0" />
            </FormGroup>
            <FormGroup label="Hesap Adı">
              <Input value={form.account_name} onChange={f('account_name')} placeholder="örn. USD Operasyon" className="bg-gray-100 border-0 focus:ring-0" />
            </FormGroup>
            <FormGroup label="Para Birimi">
              <NativeSelect value={form.currency} onChange={f('currency')} className="bg-gray-100 border-0 focus:ring-0">
                {currencies.map(c => <option key={c} value={c}>{c}{CURRENCY_LABELS[c] ? ` — ${CURRENCY_LABELS[c]}` : ''}</option>)}
              </NativeSelect>
            </FormGroup>
          </FormRow>

          {/* Hesap türü + hesap no */}
          <FormRow cols={3}>
            <FormGroup label="Hesap Türü">
              <NativeSelect value={form.account_type} onChange={f('account_type')} className="bg-gray-100 border-0 focus:ring-0">
                {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </NativeSelect>
            </FormGroup>
            <FormGroup label="Hesap No">
              <Input value={form.account_number} onChange={f('account_number')} placeholder="0000-0000000-00" className="bg-gray-100 border-0 focus:ring-0 font-mono text-[12px]" />
            </FormGroup>
            <FormGroup label="Swift / BIC">
              <Input value={form.swift_bic} onChange={f('swift_bic')} placeholder="örn. TGBATRIS" className="bg-gray-100 border-0 focus:ring-0 font-mono text-[12px]" />
            </FormGroup>
          </FormRow>

          {/* Şube */}
          <FormRow cols={2}>
            <FormGroup label="Şube Adı">
              <Input value={form.branch_name} onChange={f('branch_name')} placeholder="örn. Levent Şubesi" className="bg-gray-100 border-0 focus:ring-0" />
            </FormGroup>
            <FormGroup label="Şube Kodu">
              <Input value={form.branch_code} onChange={f('branch_code')} placeholder="örn. 0123" className="bg-gray-100 border-0 focus:ring-0 font-mono text-[12px]" />
            </FormGroup>
          </FormRow>

          {/* IBAN */}
          <FormRow cols={2}>
            <FormGroup label="IBAN (USD)">
              <Input value={form.iban_usd} onChange={f('iban_usd')} placeholder="TR00 0000 0000 0000 0000 00" className="bg-gray-100 border-0 focus:ring-0 font-mono text-[12px]" />
            </FormGroup>
            <FormGroup label="IBAN (EUR)">
              <Input value={form.iban_eur} onChange={f('iban_eur')} placeholder="TR00 0000 0000 0000 0000 00" className="bg-gray-100 border-0 focus:ring-0 font-mono text-[12px]" />
            </FormGroup>
          </FormRow>

          {/* Muhabir banka */}
          <FormGroup label="Muhabir Banka (Correspondent)">
            <Input value={form.correspondent_bank} onChange={f('correspondent_bank')} placeholder="örn. JP Morgan Chase, New York — CHASUS33" className="bg-gray-100 border-0 focus:ring-0" />
          </FormGroup>

          {/* Açılış bakiyesi */}
          <FormRow cols={2}>
            <FormGroup label="Açılış Bakiyesi">
              <Input type="number" step="0.01" value={form.opening_balance} onChange={f('opening_balance')} placeholder="0.00" className="bg-gray-100 border-0 focus:ring-0" />
            </FormGroup>
            <FormGroup label="Açılış Tarihi">
              <Input type="date" value={form.opening_balance_date} onChange={f('opening_balance_date')} className="bg-gray-100 border-0 focus:ring-0" />
            </FormGroup>
          </FormRow>

          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-2 text-[11px] font-medium text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={e => setForm(prev => ({ ...prev, is_default: e.target.checked }))}
                className="rounded"
              />
              Varsayılan hesap (faturalarda kullanılır)
            </label>
            <div className="flex gap-2 ml-auto">
              <button
                onClick={handleSave}
                disabled={!form.bank_name.trim() || upsert.isPending}
                className="flex items-center gap-1.5 px-4 h-8 rounded-xl text-[12px] font-semibold text-white disabled:opacity-50"
                style={{ background: accent }}
              >
                <Check className="h-3.5 w-3.5" />
                {editId ? 'Kaydet' : 'Oluştur'}
              </button>
              <button
                onClick={() => { setShowNew(false); setEditId(null); setForm(EMPTY); }}
                className="px-3 h-8 rounded-xl text-[12px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Liste */}
      {isLoading ? (
        <div className="px-6 py-8 text-center text-[12px] text-gray-400">Yükleniyor…</div>
      ) : accounts.length === 0 && !showNew ? (
        <div className="px-6 py-10 text-center">
          <Landmark className="h-8 w-8 text-gray-200 mx-auto mb-2" />
          <p className="text-[13px] font-medium text-gray-400">Henüz banka hesabı yok</p>
          <p className="text-[11px] text-gray-300 mt-1">Hesap ekleyerek bakiye takibi yapın</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {accounts.map(acc => {
            const cur = (acc.currency ?? 'USD') as CurrencyCode;
            const balance = accountBalance(acc.id, acc.currency ?? 'USD', acc.opening_balance ?? 0);
            const count = txnCount(acc.id);
            const isPos = balance >= 0;
            const isExpanded = expanded === acc.id;
            const typeLabel = ACCOUNT_TYPES.find(t => t.value === acc.account_type)?.label ?? acc.account_type;

            return (
              <div key={acc.id}>
                <div className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/40 transition-colors group">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    <Landmark className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-gray-900">{acc.bank_name}</p>
                      {acc.is_default && (
                        <span className="text-[9px] font-bold uppercase tracking-wide bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                          Varsayılan
                        </span>
                      )}
                      <span className="text-[9px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                        {cur}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {acc.account_name || typeLabel}
                      {acc.branch_name ? ` · ${acc.branch_name}` : ''}
                      {count > 0 ? ` · ${count} işlem` : ''}
                      {acc.opening_balance_date ? ` · ${fDate(acc.opening_balance_date)}'den` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-[15px] font-black ${isPos ? 'text-green-600' : 'text-red-500'}`}>
                      {isPos ? '+' : ''}{fCurrency(balance, cur)}
                    </p>
                    <p className="text-[10px] text-gray-400">{cur} Bakiye</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setExpanded(isExpanded ? null : acc.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                      title="Detaylar"
                    >
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => startEdit(acc)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-6 pb-4 -mt-1 bg-gray-50/50">
                    <div className="grid grid-cols-3 gap-3 p-3 bg-white rounded-xl border border-gray-100">
                      {acc.account_number && (
                        <div>
                          <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">Hesap No</div>
                          <div className="text-[12px] font-mono text-gray-800">{acc.account_number}</div>
                        </div>
                      )}
                      {acc.swift_bic && (
                        <div>
                          <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">Swift / BIC</div>
                          <div className="text-[12px] font-mono text-gray-800">{acc.swift_bic}</div>
                        </div>
                      )}
                      {acc.branch_code && (
                        <div>
                          <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">Şube Kodu</div>
                          <div className="text-[12px] font-mono text-gray-800">{acc.branch_code}</div>
                        </div>
                      )}
                      {acc.iban_usd && (
                        <div className="col-span-2">
                          <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">IBAN — USD</div>
                          <div className="text-[12px] font-mono text-gray-800 break-all">{acc.iban_usd}</div>
                        </div>
                      )}
                      {acc.iban_eur && (
                        <div className="col-span-2">
                          <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">IBAN — EUR</div>
                          <div className="text-[12px] font-mono text-gray-800 break-all">{acc.iban_eur}</div>
                        </div>
                      )}
                      {acc.correspondent_bank && (
                        <div className="col-span-3">
                          <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">Muhabir Banka</div>
                          <div className="text-[12px] text-gray-800">{acc.correspondent_bank}</div>
                        </div>
                      )}
                      {acc.opening_balance != null && acc.opening_balance !== 0 && (
                        <div>
                          <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">Açılış Bakiyesi</div>
                          <div className="text-[12px] font-semibold text-gray-800">{fCurrency(acc.opening_balance, cur)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
