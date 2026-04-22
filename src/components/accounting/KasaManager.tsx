import { useState } from 'react';
import { useCurrencies } from '@/hooks/useCurrencies';
import { CURRENCY_LABELS } from '@/types/enums';
import { useKasalar, useCreateKasa, useUpdateKasa, useDeleteKasa } from '@/hooks/useKasalar';
import { useTransactions } from '@/hooks/useTransactions';
import { useTheme } from '@/contexts/ThemeContext';
import { fCurrency, fDate } from '@/lib/formatters';
import type { CurrencyCode } from '@/types/enums';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/form-elements';
import { FormRow, FormGroup } from '@/components/ui/shared';
import { Vault, Plus, Pencil, Trash2, X, Check } from 'lucide-react';

type KasaForm = {
  name: string;
  account_code: string;
  currency: string;
  opening_balance: string;
  opening_balance_date: string;
  responsible: string;
  notes: string;
};

const EMPTY: KasaForm = {
  name: '',
  account_code: '',
  currency: 'TRY',
  opening_balance: '',
  opening_balance_date: '',
  responsible: '',
  notes: '',
};

export function KasaManager() {
  const { accent } = useTheme();
  const currencies = useCurrencies();
  const { data: kasalar = [], isLoading } = useKasalar();
  const { data: allTxns = [] } = useTransactions();
  const createKasa = useCreateKasa();
  const updateKasa = useUpdateKasa();
  const deleteKasa = useDeleteKasa();

  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<KasaForm>(EMPTY);

  /** Bakiye = açılış bakiyesi + işlemlerden hesaplanan bakiye */
  function kasaBalance(kasaId: string, currency: string, openingBalance: number): number {
    const txnBalance = allTxns
      .filter(t => t.kasa_id === kasaId)
      .reduce((sum, t) => {
        const credit = isMoneyIn(t.transaction_type, t.party_type ?? '');
        const amt = currency === 'USD' ? (t.amount_usd ?? t.amount) : t.amount;
        return sum + (credit ? amt : -amt);
      }, 0);
    return openingBalance + txnBalance;
  }

  function isMoneyIn(txnType: string, partyType: string): boolean {
    if (txnType === 'receipt' || txnType === 'sale_inv') return true;
    if (txnType === 'advance') return partyType === 'customer';
    return false;
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      account_code: form.account_code.trim(),
      currency: form.currency,
      opening_balance: parseFloat(form.opening_balance) || 0,
      opening_balance_date: form.opening_balance_date || null,
      responsible: form.responsible.trim(),
      notes: form.notes.trim(),
    };
    if (editId) {
      await updateKasa.mutateAsync({ id: editId, ...payload });
      setEditId(null);
    } else {
      await createKasa.mutateAsync(payload);
      setShowNew(false);
    }
    setForm(EMPTY);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-gray-50">
        <div className="flex items-center gap-2.5">
          <Vault className="h-4 w-4 text-gray-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Kasalar</span>
          {kasalar.length > 0 && (
            <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              {kasalar.length}
            </span>
          )}
        </div>
        <button
          onClick={() => { setShowNew(true); setEditId(null); setForm(EMPTY); }}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-xl text-white hover:opacity-90 transition-opacity"
          style={{ background: accent }}
        >
          <Plus className="h-3.5 w-3.5" /> Yeni Kasa
        </button>
      </div>

      {/* Form */}
      {(showNew || editId) && (
        <div className="px-6 py-4 bg-gray-50/60 border-b border-gray-100 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            {editId ? 'Kasayı Düzenle' : 'Yeni Kasa'}
          </p>

          {/* Satır 1 — kimlik */}
          <FormRow cols={3}>
            <FormGroup label="Kasa Adı *">
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="örn. Ana Kasa, USD Kasa"
                className="bg-gray-100 border-0 focus:ring-0"
              />
            </FormGroup>
            <FormGroup label="Hesap Kodu">
              <Input
                value={form.account_code}
                onChange={e => setForm(f => ({ ...f, account_code: e.target.value }))}
                placeholder="örn. 100, 100.01"
                className="bg-gray-100 border-0 focus:ring-0 font-mono text-[12px]"
              />
            </FormGroup>
            <FormGroup label="Para Birimi">
              <NativeSelect value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="bg-gray-100 border-0 focus:ring-0">
                {currencies.map(c => <option key={c} value={c}>{c}{CURRENCY_LABELS[c] ? ` — ${CURRENCY_LABELS[c]}` : ''}</option>)}
              </NativeSelect>
            </FormGroup>
          </FormRow>

          {/* Satır 2 — açılış */}
          <FormRow cols={2}>
            <FormGroup label="Açılış Bakiyesi">
              <Input
                type="number"
                step="0.01"
                value={form.opening_balance}
                onChange={e => setForm(f => ({ ...f, opening_balance: e.target.value }))}
                placeholder="0.00"
                className="bg-gray-100 border-0 focus:ring-0"
              />
            </FormGroup>
            <FormGroup label="Açılış Tarihi">
              <Input
                type="date"
                value={form.opening_balance_date}
                onChange={e => setForm(f => ({ ...f, opening_balance_date: e.target.value }))}
                className="bg-gray-100 border-0 focus:ring-0"
              />
            </FormGroup>
          </FormRow>

          {/* Satır 3 — sorumlu + notlar */}
          <FormRow cols={2}>
            <FormGroup label="Sorumlu Kişi">
              <Input
                value={form.responsible}
                onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))}
                placeholder="Ad Soyad"
                className="bg-gray-100 border-0 focus:ring-0"
              />
            </FormGroup>
            <FormGroup label="Notlar">
              <Input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="İsteğe bağlı"
                className="bg-gray-100 border-0 focus:ring-0"
              />
            </FormGroup>
          </FormRow>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={!form.name.trim() || createKasa.isPending || updateKasa.isPending}
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
      )}

      {/* Liste */}
      {isLoading ? (
        <div className="px-6 py-8 text-center text-[12px] text-gray-400">Yükleniyor…</div>
      ) : kasalar.length === 0 && !showNew ? (
        <div className="px-6 py-10 text-center">
          <Vault className="h-8 w-8 text-gray-200 mx-auto mb-2" />
          <p className="text-[13px] font-medium text-gray-400">Henüz kasa yok</p>
          <p className="text-[11px] text-gray-300 mt-1">Nakit işlemlerinizi takip etmek için kasa oluşturun</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {kasalar.map(kasa => {
            const balance = kasaBalance(kasa.id, kasa.currency, kasa.opening_balance ?? 0);
            const isPos = balance >= 0;
            return (
              <div key={kasa.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/40 transition-colors group">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <Vault className="h-4 w-4 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-semibold text-gray-900">{kasa.name}</p>
                    {kasa.account_code && (
                      <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        {kasa.account_code}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400">
                    {kasa.currency}
                    {kasa.responsible ? ` · ${kasa.responsible}` : ''}
                    {kasa.opening_balance_date ? ` · Açılış: ${fDate(kasa.opening_balance_date)}` : ''}
                    {kasa.notes ? ` · ${kasa.notes}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-[15px] font-black ${isPos ? 'text-green-600' : 'text-red-500'}`}>
                    {isPos ? '+' : ''}{fCurrency(balance, kasa.currency as CurrencyCode)}
                  </p>
                  <p className="text-[10px] text-gray-400">Bakiye</p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      setEditId(kasa.id);
                      setForm({
                        name: kasa.name,
                        account_code: kasa.account_code ?? '',
                        currency: kasa.currency,
                        opening_balance: kasa.opening_balance ? String(kasa.opening_balance) : '',
                        opening_balance_date: kasa.opening_balance_date ?? '',
                        responsible: kasa.responsible ?? '',
                        notes: kasa.notes,
                      });
                      setShowNew(false);
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteKasa.mutate(kasa.id)}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
