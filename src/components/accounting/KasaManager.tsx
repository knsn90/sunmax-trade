import { useState } from 'react';
import { useKasalar, useCreateKasa, useUpdateKasa, useDeleteKasa } from '@/hooks/useKasalar';
import { useTransactions } from '@/hooks/useTransactions';
import { useTheme } from '@/contexts/ThemeContext';
import { fCurrency } from '@/lib/formatters';
import type { CurrencyCode } from '@/types/enums';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/form-elements';
import { FormRow, FormGroup } from '@/components/ui/shared';
import { Vault, Plus, Pencil, Trash2, X, Check } from 'lucide-react';

export function KasaManager() {
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';
  const { data: kasalar = [], isLoading } = useKasalar();
  const { data: allTxns = [] } = useTransactions();
  const createKasa = useCreateKasa();
  const updateKasa = useUpdateKasa();
  const deleteKasa = useDeleteKasa();

  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', currency: 'TRY', notes: '' });

  // Compute balance per kasa from transactions
  function kasaBalance(kasaId: string): number {
    return allTxns
      .filter(t => t.kasa_id === kasaId)
      .reduce((sum, t) => {
        const credit = ['receipt', 'advance'].includes(t.transaction_type);
        return sum + (credit ? t.amount : -t.amount);
      }, 0);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    if (editId) {
      await updateKasa.mutateAsync({ id: editId, ...form });
      setEditId(null);
    } else {
      await createKasa.mutateAsync(form);
      setShowNew(false);
    }
    setForm({ name: '', currency: 'TRY', notes: '' });
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
          onClick={() => {
            setShowNew(true);
            setEditId(null);
            setForm({ name: '', currency: 'TRY', notes: '' });
          }}
          className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-xl text-white hover:opacity-90 transition-opacity"
          style={{ background: accent }}
        >
          <Plus className="h-3.5 w-3.5" /> Yeni Kasa
        </button>
      </div>

      {/* New / edit kasa form */}
      {(showNew || editId) && (
        <div className="px-6 py-4 bg-gray-50/60 border-b border-gray-100">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
            {editId ? 'Kasayı Düzenle' : 'Yeni Kasa'}
          </p>
          <FormRow cols={3}>
            <FormGroup label="Kasa Adı">
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="örn. Ana Kasa, Dolar Kasa"
              />
            </FormGroup>
            <FormGroup label="Para Birimi">
              <NativeSelect
                value={form.currency}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              >
                <option value="TRY">TRY — Türk Lirası</option>
                <option value="USD">USD — Dolar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="AED">AED — Dirhem</option>
              </NativeSelect>
            </FormGroup>
            <FormGroup label="Notlar">
              <Input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="İsteğe bağlı"
              />
            </FormGroup>
          </FormRow>
          <div className="flex gap-2 mt-2">
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
              onClick={() => {
                setShowNew(false);
                setEditId(null);
              }}
              className="px-3 h-8 rounded-xl text-[12px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Kasa list */}
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
            const balance = kasaBalance(kasa.id);
            const isPos = balance >= 0;
            return (
              <div
                key={kasa.id}
                className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/40 transition-colors group"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <Vault className="h-4 w-4 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900">{kasa.name}</p>
                  <p className="text-[10px] text-gray-400">
                    {kasa.currency}{kasa.notes ? ` · ${kasa.notes}` : ''}
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
                      setForm({ name: kasa.name, currency: kasa.currency, notes: kasa.notes });
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
