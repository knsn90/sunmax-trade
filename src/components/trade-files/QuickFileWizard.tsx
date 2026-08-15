import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MonoDatePicker } from '@/components/ui/MonoDatePicker';
import { PartyCombobox, type SelectedParty } from '@/components/accounting/PartyCombobox';
import { useCustomers, useProducts } from '@/hooks/useEntities';
import { useTradeFiles } from '@/hooks/useTradeFiles';
import { useCreateQuickFile } from '@/hooks/useQuickFile';
import { generateTradeFileNo } from '@/lib/generators';
import { today, fCurrency } from '@/lib/formatters';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { Plus, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';

const inp = 'h-10 w-full rounded-xl bg-gray-50 border border-gray-200 px-3.5 text-[13px] font-medium text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:bg-white focus:outline-none transition-all';
const sel = cn(inp, 'appearance-none cursor-pointer');

function Fld({ label, children, className, required }: { label: string; children: React.ReactNode; className?: string; required?: boolean }) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">{title}</div>
      {children}
    </div>
  );
}

type CostRow = { party: SelectedParty | null; amount: number | ''; desc: string };
const CURRENCIES = ['USD', 'EUR', 'TRY', 'AED', 'GBP'] as const;

export function QuickFileWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';
  const { data: customers = [] } = useCustomers();
  const { data: products = [] } = useProducts();
  const { data: allFiles = [] } = useTradeFiles();
  const createQuick = useCreateQuickFile();

  const [productId, setProductId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [fileDate, setFileDate] = useState(today());
  const [tonnage, setTonnage] = useState<number | ''>('');
  const [fileNo, setFileNo] = useState('');
  const [fileNoTouched, setFileNoTouched] = useState(false);
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('USD');
  const [rate, setRate] = useState(1);
  const [registerNo, setRegisterNo] = useState('');
  const [supplier, setSupplier] = useState<SelectedParty | null>(null);
  const [purchaseTotal, setPurchaseTotal] = useState<number | ''>('');
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [saleTotal, setSaleTotal] = useState<number | ''>('');
  const [saleRef, setSaleRef] = useState('');
  const [autoClose, setAutoClose] = useState(true);

  // Modal açılışında sıfırla
  useEffect(() => {
    if (!open) return;
    setProductId(''); setCustomerId(''); setFileDate(today()); setTonnage('');
    setFileNo(''); setFileNoTouched(false); setCurrency('USD'); setRate(1);
    setRegisterNo(''); setSupplier(null); setPurchaseTotal(''); setCosts([]);
    setSaleTotal(''); setSaleRef(''); setAutoClose(true);
  }, [open]);

  // Dosya no otomatik üret
  useEffect(() => {
    if (fileNoTouched || !customerId) return;
    const customer = customers.find(c => c.id === customerId);
    const product = products.find(p => p.id === productId);
    const maxSeq = allFiles
      .filter(f => f.customer_id === customerId)
      .reduce((mx, f) => { const m = /^[A-Za-z0-9]+-(\d+)/.exec((f.file_no ?? '').trim()); return Math.max(mx, m ? parseInt(m[1], 10) : 0); }, 0);
    const d = new Date(fileDate);
    setFileNo(generateTradeFileNo(customer?.code || 'XX', maxSeq + 1, d.getFullYear(), d.getMonth() + 1, product?.name ?? ''));
  }, [customerId, productId, fileDate, customers, products, allFiles, fileNoTouched]);

  const costSum = useMemo(() => costs.reduce((s, c) => s + (Number(c.amount) || 0), 0), [costs]);
  const profit = (Number(saleTotal) || 0) - (Number(purchaseTotal) || 0) - costSum;

  function addCost() { setCosts(p => [...p, { party: null, amount: '', desc: '' }]); }
  function removeCost(i: number) { setCosts(p => p.filter((_, idx) => idx !== i)); }
  function updateCost(i: number, patch: Partial<CostRow>) { setCosts(p => p.map((c, idx) => idx === i ? { ...c, ...patch } : c)); }

  async function submit() {
    if (!productId) return toast.error('Ürün seçin');
    if (!customerId) return toast.error('Müşteri seçin');
    if (!tonnage || Number(tonnage) <= 0) return toast.error('Miktar girin');
    if (!fileNo.trim()) return toast.error('Dosya no zorunlu');
    if (currency !== 'USD' && (!rate || rate <= 0)) return toast.error('Kur girin');
    const customer = customers.find(c => c.id === customerId);

    await createQuick.mutateAsync({
      file_no: fileNo.trim(), file_date: fileDate, product_id: productId, customer_id: customerId,
      supplier_id: supplier?.id ?? '', supplier_name: supplier?.name ?? '', customer_name: customer?.name ?? '',
      tonnage_mt: Number(tonnage), currency, exchange_rate: currency === 'USD' ? 1 : rate,
      register_no: registerNo, notes: '',
      purchase_total: Number(purchaseTotal) || 0,
      costs: costs.filter(c => c.party && Number(c.amount) > 0).map(c => ({
        service_provider_id: c.party!.id, party_name: c.party!.name, amount: Number(c.amount), description: c.desc,
      })),
      sale_total: Number(saleTotal) || 0,
      sale_customer_id: customerId, sale_customer_name: customer?.name ?? '', sale_reference_no: saleRef,
      auto_close: autoClose,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" style={{ color: accent }} /> Hızlı Dosya
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Dosya */}
          <Section title="Dosya">
            <div className="grid grid-cols-2 gap-3">
              <Fld label="Ürün" required>
                <select className={sel} value={productId} onChange={e => setProductId(e.target.value)}>
                  <option value="">Seçin…</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Fld>
              <Fld label="Müşteri (alıcı)" required>
                <select className={sel} value={customerId} onChange={e => setCustomerId(e.target.value)}>
                  <option value="">Seçin…</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Fld>
              <Fld label="Tarih" required>
                <MonoDatePicker value={fileDate} onChange={setFileDate} />
              </Fld>
              <Fld label="Miktar (ton)" required>
                <input type="number" step="0.001" className={inp} value={tonnage} onChange={e => setTonnage(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" />
              </Fld>
              <Fld label="Para Birimi">
                <select className={sel} value={currency} onChange={e => setCurrency(e.target.value as typeof currency)}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Fld>
              {currency !== 'USD' && (
                <Fld label={`Kur (1 USD = ? ${currency})`} required>
                  <input type="number" step="0.0001" className={inp} value={rate} onChange={e => setRate(Number(e.target.value))} />
                </Fld>
              )}
              <Fld label="Dosya No" required>
                <input className={inp} value={fileNo} onChange={e => { setFileNo(e.target.value); setFileNoTouched(true); }} />
              </Fld>
              <Fld label="Kayıt/Beyanname No">
                <input className={inp} value={registerNo} onChange={e => setRegisterNo(e.target.value)} placeholder="opsiyonel" />
              </Fld>
            </div>
          </Section>

          {/* Alış */}
          <Section title="Alış">
            <div className="grid grid-cols-2 gap-3">
              <Fld label="Tedarikçi">
                <PartyCombobox value={supplier} onChange={setSupplier} filter="supplier" placeholder="Tedarikçi seç/ekle" />
              </Fld>
              <Fld label={`Alış Tutarı (${currency})`}>
                <input type="number" step="0.01" className={inp} value={purchaseTotal} onChange={e => setPurchaseTotal(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0.00" />
              </Fld>
            </div>
          </Section>

          {/* Masraflar */}
          <Section title="Masraflar">
            <div className="space-y-2">
              {costs.map((c, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="flex-1"><PartyCombobox value={c.party} onChange={v => updateCost(i, { party: v })} filter="service_provider" placeholder="Firma seç/ekle" /></div>
                  <input className={cn(inp, 'w-32')} placeholder="Açıklama" value={c.desc} onChange={e => updateCost(i, { desc: e.target.value })} />
                  <input type="number" step="0.01" className={cn(inp, 'w-28')} placeholder="Tutar" value={c.amount} onChange={e => updateCost(i, { amount: e.target.value === '' ? '' : Number(e.target.value) })} />
                  <button type="button" onClick={() => removeCost(i)} className="h-10 w-9 shrink-0 flex items-center justify-center rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button type="button" onClick={addCost} className="w-full flex items-center justify-center gap-1.5 py-2 bg-gray-50 hover:bg-gray-100 rounded-xl text-[12px] font-semibold text-gray-500">
                <Plus className="h-3.5 w-3.5" /> Masraf satırı ekle
              </button>
            </div>
          </Section>

          {/* Satış */}
          <Section title="Satış">
            <div className="grid grid-cols-2 gap-3">
              <Fld label={`Satış Tutarı (${currency})`}>
                <input type="number" step="0.01" className={inp} value={saleTotal} onChange={e => setSaleTotal(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0.00" />
              </Fld>
              <Fld label="Satış Fatura No">
                <input className={inp} value={saleRef} onChange={e => setSaleRef(e.target.value)} placeholder="opsiyonel" />
              </Fld>
            </div>
          </Section>

          {/* Seçenek + özet */}
          <label className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 rounded-xl cursor-pointer select-none">
            <input type="checkbox" checked={autoClose} onChange={e => setAutoClose(e.target.checked)} className="h-4 w-4 rounded accent-emerald-600" />
            <span className="text-[12px] font-semibold text-emerald-800">Hepsi ödendi/tahsil edildi</span>
            <span className="text-[11px] text-emerald-600">— tüm taraflar için otomatik kapanış (cari 0)</span>
          </label>

          <div className="flex items-center justify-between rounded-2xl px-5 py-3.5" style={{ background: profit >= 0 ? '#f0fdf4' : '#fef2f2' }}>
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Kâr / Zarar</span>
            <span className="text-xl font-black" style={{ color: profit >= 0 ? '#16a34a' : '#dc2626' }}>
              {fCurrency(profit)} {currency}
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => onOpenChange(false)} className="px-4 h-10 rounded-xl text-[13px] font-semibold text-gray-500 hover:bg-gray-100">İptal</button>
            <button type="button" onClick={submit} disabled={createQuick.isPending}
              className="px-5 h-10 rounded-xl text-white text-[13px] font-semibold shadow-sm hover:opacity-90 disabled:opacity-50" style={{ background: accent }}>
              {createQuick.isPending ? 'Oluşturuluyor…' : 'Dosyayı Oluştur'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
