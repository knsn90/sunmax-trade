import { useState } from 'react';
import { useBankAccounts, useUpsertBankAccount } from '@/hooks/useSettings';
import { useTransactions } from '@/hooks/useTransactions';
import { useTheme } from '@/contexts/ThemeContext';
import { fCurrency } from '@/lib/formatters';
import type { CurrencyCode } from '@/types/enums';
import { Input } from '@/components/ui/input';
import { FormRow, FormGroup } from '@/components/ui/shared';
import { Landmark, Plus, Pencil, X, Check, ChevronsUpDown } from 'lucide-react';

type BankForm = {
  bank_name: string;
  account_name: string;
  iban_usd: string;
  iban_eur: string;
  swift_bic: string;
  correspondent_bank: string;
  is_default: boolean;
};

const EMPTY_FORM: BankForm = {
  bank_name: '',
  account_name: '',
  iban_usd: '',
  iban_eur: '',
  swift_bic: '',
  correspondent_bank: '',
  is_default: false,
};

/** Determine currency of a bank account — USD if has USD IBAN, else EUR, else TRY */
function accountCurrency(iban_usd: string, iban_eur: string): CurrencyCode {
  if (iban_usd) return 'USD';
  if (iban_eur) return 'EUR';
  return 'TRY';
}

export function BankAccountManager() {
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';
  const { data: accounts = [], isLoading } = useBankAccounts();
  const { data: allTxns = [] } = useTransactions();
  const upsert = useUpsertBankAccount();

  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<BankForm>(EMPTY_FORM);
  const [expanded, setExpanded] = useState<string | null>(null);

  /** Compute balance for a bank account from linked transactions */
  function accountBalance(accountId: string, currency: CurrencyCode): number {
    return allTxns
      .filter(t => t.bank_account_id === accountId)
      .reduce((sum, t) => {
        // Incoming: receipt = money we received, advance from customer = incoming
        const isCredit = t.transaction_type === 'receipt' ||
          (t.transaction_type === 'advance' && t.party_type === 'customer');
        const txnAmt = currency === 'USD' ? t.amount_usd : t.amount;
        return sum + (isCredit ? txnAmt : -txnAmt);
      }, 0);
  }

  /** Count transactions for a bank account */
  function txnCount(accountId: string): number {
    return allTxns.filter(t => t.bank_account_id === accountId).length;
  }

  async function handleSave() {
    if (!form.bank_name.trim()) return;
    await upsert.mutateAsync({ id: editId, data: form });
    setEditId(null);
    setShowNew(false);
    setForm(EMPTY_FORM);
  }

  function startEdit(acc: typeof accounts[number]) {
    setEditId(acc.id);
    setShowNew(false);
    setForm({
      bank_name: acc.bank_name,
      account_name: acc.account_name,
      iban_usd: acc.iban_usd,
      iban_eur: acc.iban_eur,
      swift_bic: acc.swift_bic,
      correspondent_bank: acc.correspondent_bank,
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
          onClick={() => {
            setShowNew(true);
            setEditId(null);
            setForm(EMPTY_FORM);
          }}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-xl text-white hover:opacity-90 transition-opacity"
          style={{ background: accent }}
        >
          <Plus className="h-3.5 w-3.5" /> Yeni Hesap
        </button>
      </div>

      {/* New / edit form */}
      {(showNew || editId) && (
        <div className="px-6 py-4 bg-gray-50/60 border-b border-gray-100">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
            {editId ? 'Hesabı Düzenle' : 'Yeni Banka Hesabı'}
          </p>
          <FormRow cols={2}>
            <FormGroup label="Banka Adı *">
              <Input
                value={form.bank_name}
                onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                placeholder="örn. Garanti BBVA"
              />
            </FormGroup>
            <FormGroup label="Hesap Adı / Şube">
              <Input
                value={form.account_name}
                onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))}
                placeholder="örn. USD Ana Hesap"
              />
            </FormGroup>
          </FormRow>
          <FormRow cols={2}>
            <FormGroup label="IBAN (USD)">
              <Input
                value={form.iban_usd}
                onChange={e => setForm(f => ({ ...f, iban_usd: e.target.value }))}
                placeholder="TR00 0000 0000 0000 0000 00"
                className="font-mono text-[12px]"
              />
            </FormGroup>
            <FormGroup label="IBAN (EUR)">
              <Input
                value={form.iban_eur}
                onChange={e => setForm(f => ({ ...f, iban_eur: e.target.value }))}
                placeholder="TR00 0000 0000 0000 0000 00"
                className="font-mono text-[12px]"
              />
            </FormGroup>
          </FormRow>
          <FormRow cols={2}>
            <FormGroup label="Swift / BIC">
              <Input
                value={form.swift_bic}
                onChange={e => setForm(f => ({ ...f, swift_bic: e.target.value }))}
                placeholder="örn. TGBATRIS"
                className="font-mono text-[12px]"
              />
            </FormGroup>
            <FormGroup label="Muhabir Banka">
              <Input
                value={form.correspondent_bank}
                onChange={e => setForm(f => ({ ...f, correspondent_bank: e.target.value }))}
                placeholder="örn. JP Morgan Chase"
              />
            </FormGroup>
          </FormRow>
          <div className="flex items-center gap-4 mt-2">
            <label className="flex items-center gap-2 text-[11px] font-medium text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))}
                className="rounded"
              />
              Varsayılan hesap
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
                onClick={() => { setShowNew(false); setEditId(null); setForm(EMPTY_FORM); }}
                className="px-3 h-8 rounded-xl text-[12px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account list */}
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
            const cur = accountCurrency(acc.iban_usd, acc.iban_eur);
            const balance = accountBalance(acc.id, cur);
            const count = txnCount(acc.id);
            const isPos = balance >= 0;
            const isExpanded = expanded === acc.id;

            return (
              <div key={acc.id}>
                <div className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/40 transition-colors group">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    <Landmark className="h-4 w-4 text-blue-500" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-gray-900">{acc.bank_name}</p>
                      {acc.is_default && (
                        <span className="text-[9px] font-bold uppercase tracking-wide bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                          Varsayılan
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {acc.account_name || '—'}{acc.swift_bic ? ` · ${acc.swift_bic}` : ''}
                      {count > 0 ? ` · ${count} işlem` : ''}
                    </p>
                  </div>

                  {/* Balance */}
                  <div className="text-right shrink-0">
                    <p className={`text-[15px] font-black ${isPos ? 'text-green-600' : 'text-red-500'}`}>
                      {isPos ? '+' : ''}{fCurrency(balance, cur)}
                    </p>
                    <p className="text-[10px] text-gray-400">{cur} Bakiye</p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setExpanded(isExpanded ? null : acc.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                      title="IBAN detayları"
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

                {/* Expanded IBAN details */}
                {isExpanded && (
                  <div className="px-6 pb-4 -mt-1 bg-gray-50/50">
                    <div className="grid grid-cols-2 gap-3 p-3 bg-white rounded-xl border border-gray-100">
                      {acc.iban_usd && (
                        <div>
                          <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">IBAN — USD</div>
                          <div className="text-[12px] font-mono text-gray-800 break-all">{acc.iban_usd}</div>
                        </div>
                      )}
                      {acc.iban_eur && (
                        <div>
                          <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">IBAN — EUR</div>
                          <div className="text-[12px] font-mono text-gray-800 break-all">{acc.iban_eur}</div>
                        </div>
                      )}
                      {acc.swift_bic && (
                        <div>
                          <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">Swift / BIC</div>
                          <div className="text-[12px] font-mono text-gray-800">{acc.swift_bic}</div>
                        </div>
                      )}
                      {acc.correspondent_bank && (
                        <div>
                          <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1">Muhabir Banka</div>
                          <div className="text-[12px] text-gray-800">{acc.correspondent_bank}</div>
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
