import { useEffect, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useSuppliers } from '@/hooks/useEntities';
import { useAllTradeFiles } from '@/hooks/useTradeFiles';
import { useCreateTransaction, useUpdateTransaction } from '@/hooks/useTransactions';
import { today, fCurrency, fN } from '@/lib/formatters';
import { toast } from 'sonner';
import type { Transaction } from '@/types/database';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { DateInput } from '@/components/ui/form-elements';
import { SmartFill } from '@/components/ui/SmartFill';
import { OcrButton } from '@/components/ui/OcrButton';
import type { OcrResult } from '@/lib/openai';
import {
  HelpCircle, Banknote, Building2, CreditCard,
  ChevronDown, ChevronUp, Plus, Trash2, X,
} from 'lucide-react';

// ── Styled primitives ───────────────────────────────────────────────────────
const inp = 'bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-gray-900 placeholder:text-gray-400 border-0 shadow-none focus:outline-none focus:ring-0 w-full';
const sel = 'bg-gray-100 rounded-lg h-8 px-3 text-[12px] text-gray-900 border-0 shadow-none focus:outline-none w-full appearance-none cursor-pointer';

function Lbl({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{children}</div>;
}
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Lbl>{label}</Lbl>
      {children}
    </div>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 pt-1">{children}</div>;
}
function Divider() { return <div className="border-t border-gray-100 my-1" />; }

// ── Constants ───────────────────────────────────────────────────────────────
const TXN_TYPES = [
  { value: 'sale_inv',     label: 'Satış Faturası' },
  { value: 'purchase_inv', label: 'Satın Alma Faturası' },
  { value: 'svc_inv',      label: 'Hizmet Faturası' },
  { value: 'receipt',      label: 'Tahsilat' },
  { value: 'payment',      label: 'Ödeme' },
  { value: 'advance',      label: 'Ön Ödeme' },
  { value: 'ic_transfer',  label: 'İç Transfer' },
] as const;

const PAYMENT_METHODS = [
  { value: '' as const,               label: 'Belirtilmedi', icon: <HelpCircle className="h-4 w-4" /> },
  { value: 'nakit' as const,          label: 'Nakit',        icon: <Banknote className="h-4 w-4" /> },
  { value: 'banka_havalesi' as const, label: 'Banka',        icon: <Building2 className="h-4 w-4" /> },
  { value: 'kredi_karti' as const,    label: 'Kredi Kartı',  icon: <CreditCard className="h-4 w-4" /> },
] as const;

const KDV_OPTIONS = [{ value: 0, label: '%0 (İstisna)' }, { value: 1, label: '%1' }, { value: 10, label: '%10' }, { value: 20, label: '%20' }];
const CURRENCIES = ['USD', 'EUR', 'AED', 'GBP', 'TRY'];

// ── Line item ───────────────────────────────────────────────────────────────
interface PurchaseLine { aciklama: string; netAgirlik: number; birimFiyat: number; kdvOrani: number; }
const emptyLine = (): PurchaseLine => ({ aciklama: '', netAgirlik: 0, birimFiyat: 0, kdvOrani: 0 });
function lineTotal(l: PurchaseLine) { return l.netAgirlik * l.birimFiyat * (1 + l.kdvOrani / 100); }

// ── Props ───────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transaction?: Transaction | null;
  onSwitchToTransaction?: (type: string) => void;
  defaultTradeFileId?: string;
}

export function PurchaseInvoiceModal({ open, onOpenChange, transaction, onSwitchToTransaction, defaultTradeFileId }: Props) {
  const { accent } = useTheme();
  const { data: suppliers = [] } = useSuppliers();
  const { data: allFiles  = [] } = useAllTradeFiles(['sale', 'delivery', 'completed']);
  const createTxn = useCreateTransaction();
  const updateTxn = useUpdateTransaction();
  const isEdit = !!transaction;

  const [faturaNo,     setFaturaNo]     = useState('');
  const [faturaTarihi, setFaturaTarihi] = useState(today());
  const [supplierId,   setSupplierId]   = useState('');
  const [fileId,       setFileId]       = useState('');
  const [brutAgirlik,  setBrutAgirlik]  = useState(0);
  const [kapAdeti,     setKapAdeti]     = useState(0);
  const [mensei,       setMensei]       = useState('');
  const [lines,        setLines]        = useState<PurchaseLine[]>([emptyLine()]);
  const [currency,     setCurrency]     = useState<'USD' | 'EUR' | 'TRY' | 'AED' | 'GBP'>('USD');
  const [dovizKuru,    setDovizKuru]    = useState(1);
  const [kurYon,       setKurYon]       = useState<'direct' | 'inverse'>('direct');
  const [paymentMethod, setPaymentMethod] = useState<'' | 'nakit' | 'banka_havalesi' | 'kredi_karti'>('');
  const [masrafOpen,   setMasrafOpen]   = useState(false);
  const [masrafTuru,   setMasrafTuru]   = useState('');
  const [masrafTutar,  setMasrafTutar]  = useState(0);
  const [masrafCurrency, setMasrafCurrency] = useState<'USD' | 'EUR' | 'TRY' | 'AED' | 'GBP'>('USD');
  const [masrafRate,   setMasrafRate]   = useState(1);
  const [masrafKurYon, setMasrafKurYon] = useState<'direct' | 'inverse'>('direct');

  // Tedarikçiye göre filtrele — hem ana dosyalar hem alt partiler (status zaten listAll'dan geliyor)
  const supplierFiles  = allFiles.filter(f => f.supplier_id === supplierId);
  const parentFiles    = supplierFiles.filter(f => !f.parent_file_id);
  const batchFiles     = supplierFiles.filter(f =>  !!f.parent_file_id);
  // Parent id → file_no (optgroup başlığı için)
  const parentMap      = new Map(allFiles.filter(f => !f.parent_file_id).map(f => [f.id, f.file_no]));
  // Hangi parent'ların batch'i var (sadece bunlar için optgroup açılır)
  const parentsWithBatch = [...new Set(batchFiles.map(b => b.parent_file_id!))];

  const pickedFile     = supplierFiles.find(f => f.id === fileId) ?? null;
  const selectedSupplier = suppliers.find(s => s.id === supplierId);

  const toplamYerel = lines.reduce((s, l) => s + lineTotal(l), 0);
  const isNonUsd    = currency !== 'USD';
  const toplamUsd   = !isNonUsd ? toplamYerel
    : kurYon === 'direct' ? toplamYerel * dovizKuru
    : dovizKuru > 0 ? toplamYerel / dovizKuru : 0;

  function addLine() { setLines(p => [...p, emptyLine()]); }
  function removeLine(i: number) { setLines(p => p.length === 1 ? p : p.filter((_, idx) => idx !== i)); }
  function updateLine<K extends keyof PurchaseLine>(i: number, k: K, v: PurchaseLine[K]) {
    setLines(p => p.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  }

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      setFaturaTarihi(transaction.transaction_date);
      setFaturaNo(transaction.reference_no ?? '');
      setSupplierId(transaction.supplier_id ?? '');
      setFileId(transaction.trade_file_id ?? '');
      setCurrency((transaction.currency ?? 'USD') as 'USD' | 'EUR' | 'TRY' | 'AED' | 'GBP');
      setDovizKuru(transaction.exchange_rate ?? 1);
      setPaymentMethod((transaction.payment_method ?? '') as typeof paymentMethod);
      setMasrafTuru(transaction.masraf_turu ?? '');
      setMasrafTutar(transaction.masraf_tutar ?? 0);
      setMasrafCurrency((transaction.masraf_currency ?? 'USD') as 'USD' | 'EUR' | 'TRY');
      setMasrafRate(transaction.masraf_rate ?? 1);
      setMasrafOpen((transaction.masraf_tutar ?? 0) > 0);
      let n: Record<string, unknown> = {};
      try { n = JSON.parse(transaction.notes ?? '{}'); } catch { /* */ }
      setBrutAgirlik(Number(n.brut_agirlik_kg ?? 0));
      setKapAdeti(Number(n.kap_adeti ?? 0));
      setMensei(String(n.mensei ?? ''));
      setKurYon((n.kur_yon as 'direct' | 'inverse') ?? 'direct');
      if (Array.isArray(n.lines) && (n.lines as unknown[]).length > 0) {
        setLines((n.lines as PurchaseLine[]).map(l => ({
          aciklama: l.aciklama ?? '', netAgirlik: Number(l.netAgirlik ?? 0),
          birimFiyat: Number(l.birimFiyat ?? 0), kdvOrani: Number(l.kdvOrani ?? 0),
        })));
      } else {
        const bp = Number(n.birim_fiyat ?? 0); const kv = Number(n.kdv_orani ?? 0);
        let na = Number(n.net_agirlik ?? 0);
        if (!na && bp > 0) { const d = bp * (1 + kv / 100); na = d > 0 ? parseFloat((transaction.amount / d).toFixed(3)) : 0; }
        setLines([{ aciklama: transaction.description ?? '', netAgirlik: na, birimFiyat: bp, kdvOrani: kv }]);
      }
    } else {
      setFaturaNo(''); setFaturaTarihi(today()); setSupplierId(''); setFileId(defaultTradeFileId ?? '');
      setBrutAgirlik(0); setKapAdeti(0); setMensei(''); setLines([emptyLine()]);
      setCurrency('USD'); setDovizKuru(1); setKurYon('direct');
      setPaymentMethod(''); setMasrafOpen(false); setMasrafTuru(''); setMasrafTutar(0); setMasrafCurrency('USD'); setMasrafRate(1); setMasrafKurYon('direct');
    }
  }, [open, transaction, defaultTradeFileId]);

  useEffect(() => { if (!transaction) setFileId(''); }, [supplierId, transaction]);

  useEffect(() => {
    if (!pickedFile || transaction) return;
    setLines(prev => prev.map((l, i) => i === 0 ? {
      ...l,
      aciklama:   pickedFile.product?.name ?? l.aciklama,
      netAgirlik: pickedFile.delivered_admt ?? pickedFile.tonnage_mt ?? l.netAgirlik,
      birimFiyat: pickedFile.purchase_price ?? l.birimFiyat,
    } : l));
    setBrutAgirlik(pickedFile.gross_weight_kg ?? 0);
    setKapAdeti(pickedFile.packages ?? 0);
    setCurrency((pickedFile.purchase_currency as 'USD' | 'EUR' | 'TRY' | 'AED' | 'GBP') ?? 'USD');
  }, [pickedFile, transaction]);

  function handleOcrResult(r: OcrResult) {
    if (r.date)     setFaturaTarihi(r.date);
    if (r.currency) setCurrency(r.currency as typeof currency);
    if (r.unit_price && lines.length > 0) setLines(p => p.map((l, i) => i === 0 ? { ...l, birimFiyat: r.unit_price! } : l));
    if (r.quantity_admt && lines.length > 0) setLines(p => p.map((l, i) => i === 0 ? { ...l, netAgirlik: r.quantity_admt! } : l));
  }

  async function handleSubmit() {
    if (!supplierId)    { toast.error('Lütfen tedarikçi seçin'); return; }
    if (!faturaNo)      { toast.error('Fatura numarası zorunlu'); return; }
    if (toplamUsd <= 0) { toast.error('Tutar sıfırdan büyük olmalı'); return; }
    const notesObj = {
      lines: lines.map(l => ({ aciklama: l.aciklama, netAgirlik: l.netAgirlik || undefined, birimFiyat: l.birimFiyat, kdvOrani: l.kdvOrani })),
      brut_agirlik_kg: brutAgirlik || undefined, kap_adeti: kapAdeti || undefined,
      mensei: mensei || undefined, kur_yon: isNonUsd ? kurYon : undefined,
    };
    const description = lines.length === 1 ? (lines[0].aciklama || 'Satın Alma Faturası') : lines.map(l => l.aciklama).filter(Boolean).join(', ') || 'Satın Alma Faturası';
    const payload = {
      transaction_date: faturaTarihi, transaction_type: 'purchase_inv' as const,
      trade_file_id: fileId || undefined, party_type: 'supplier' as const,
      customer_id: '', supplier_id: supplierId, service_provider_id: '',
      party_name: selectedSupplier?.name ?? '', description, reference_no: faturaNo,
      currency: currency as 'USD' | 'EUR' | 'TRY' | 'AED' | 'GBP',
      amount: toplamYerel, exchange_rate: isNonUsd ? dovizKuru : 1,
      paid_amount: transaction?.paid_amount ?? 0,
      payment_status: (transaction?.payment_status ?? 'open') as 'open' | 'partial' | 'paid',
      payment_method: paymentMethod, bank_name: '', bank_account_no: '', swift_bic: '',
      card_type: '' as const, cash_receiver: '', masraf_turu: masrafTuru, masraf_tutar: masrafTutar,
      masraf_currency: masrafCurrency as 'USD' | 'EUR' | 'TRY' | 'AED' | 'GBP', masraf_rate: masrafRate,
      notes: JSON.stringify(notesObj), kasa_id: '', bank_account_id: '',
    };
    if (isEdit && transaction) {
      await updateTxn.mutateAsync({ id: transaction.id, data: payload });
      toast.success('Fatura güncellendi');
    } else {
      await createTxn.mutateAsync(payload);
      toast.success('Fatura kaydedildi');
    }
    onOpenChange(false);
  }

  const isSaving = createTxn.isPending || updateTxn.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle className="flex-1">{isEdit ? 'Satın Alma Faturasını Düzenle' : 'Satın Alma Faturası'}</DialogTitle>
            <div className="flex gap-1.5 shrink-0">
              <SmartFill mode="invoice" onResult={handleOcrResult} formName="PurchaseInvoice" iconOnly />
              <OcrButton mode="invoice" onResult={handleOcrResult} iconOnly />
            </div>
          </div>

          {/* ── İşlem türü pill seçici ── */}
          {!isEdit && onSwitchToTransaction && (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto scrollbar-none mt-3">
              {TXN_TYPES.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    if (o.value !== 'purchase_inv') { onOpenChange(false); onSwitchToTransaction(o.value); }
                  }}
                  className={cn(
                    'shrink-0 px-3 h-7 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap',
                    o.value === 'purchase_inv'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </DialogHeader>

        <div className="space-y-3 py-1">

          {/* ── Fatura Bilgileri ── */}
          <div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Fatura No *">
                <input className={inp} value={faturaNo} onChange={e => setFaturaNo(e.target.value)} placeholder="AKS2026000000192" />
              </Field>
              <Field label="Fatura Tarihi *">
                <DateInput value={faturaTarihi} onChange={setFaturaTarihi} className={inp} />
              </Field>
            </div>
          </div>

          <Divider />

          {/* ── Dosya Detayları ── */}
          <div>


            <div className="grid grid-cols-2 gap-3">
              <Field label="Tedarikçi">
                {supplierId && selectedSupplier ? (
                  <div className="flex items-center gap-2 bg-gray-100 rounded-lg h-8 px-3">
                    <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                      {selectedSupplier.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="flex-1 min-w-0 text-[12px] font-semibold text-gray-900 truncate">{selectedSupplier.name}</span>
                    <button onClick={() => setSupplierId('')} className="text-gray-300 hover:text-red-400 transition-colors shrink-0">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <select className={sel} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                    <option value="">— Tedarikçi seçin —</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Ticaret Dosyası">
                <select className={cn(sel, !supplierId && 'opacity-50')} value={fileId} onChange={e => setFileId(e.target.value)} disabled={!supplierId}>
                  <option value="">— Opsiyonel —</option>

                  {/* Ana dosyalar — batch'i olmayanlar */}
                  {parentFiles.filter(f => !parentsWithBatch.includes(f.id)).map(f => (
                    <option key={f.id} value={f.id}>
                      {f.file_no}{f.product?.name ? ` — ${f.product.name}` : ''}
                    </option>
                  ))}

                  {/* Batch'i olan ana dosyalar → kendi satırı + alt partiler optgroup */}
                  {parentsWithBatch.map(parentId => {
                    const parent = parentFiles.find(f => f.id === parentId);
                    const children = batchFiles.filter(b => b.parent_file_id === parentId);
                    return (
                      <optgroup key={parentId} label={`↳ Alt Partiler — ${parentMap.get(parentId) ?? ''}${parent?.product?.name ? ' · ' + parent.product.name : ''}`}>
                        {children.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.file_no}  {b.tonnage_mt ? `(${b.tonnage_mt} MT)` : ''}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </Field>
            </div>
          </div>

          <Divider />

          {/* ── Para Birimi ── */}
          <div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Para Birimi">
                <select className={sel} value={currency} onChange={e => setCurrency(e.target.value as 'USD' | 'EUR' | 'TRY' | 'AED' | 'GBP')}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              {isNonUsd && (
                <Field label="Döviz Kuru">
                  <div className="flex items-center gap-2">
                    <div className="flex bg-gray-100 rounded-lg overflow-hidden shrink-0">
                      <button type="button" onClick={() => setKurYon('direct')}
                        className={cn('px-2 h-8 text-[10px] font-bold whitespace-nowrap transition-colors',
                          kurYon === 'direct' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700')}>
                        {currency}→USD
                      </button>
                      <button type="button" onClick={() => setKurYon('inverse')}
                        className={cn('px-2 h-8 text-[10px] font-bold whitespace-nowrap transition-colors',
                          kurYon === 'inverse' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700')}>
                        USD→{currency}
                      </button>
                    </div>
                    <input type="text" inputMode="decimal" className={cn(inp, 'flex-1')} value={dovizKuru || ''} onChange={e => setDovizKuru(Number(e.target.value))} placeholder="0.0000" />
                  </div>
                </Field>
              )}
            </div>
          </div>

          <Divider />

          {/* ── Ürün Kalemleri ── */}
          <div>


            <div className="grid gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 px-1 mb-2"
              style={{ gridTemplateColumns: '2fr 110px 110px 80px 70px 32px' }}>
              <span>Açıklama / Malzeme</span><span>Net Ağırlık (MT)</span>
              <span>Birim Fiyat</span><span>KDV</span><span className="text-right">Tutar</span><span />
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="grid gap-2 items-center"
                  style={{ gridTemplateColumns: '2fr 110px 110px 80px 70px 32px' }}>
                  <input className={inp} value={line.aciklama} onChange={e => updateLine(i, 'aciklama', e.target.value)} placeholder="Ürün / malzeme…" />
                  <input type="text" inputMode="decimal" className={inp} value={line.netAgirlik || ''} onChange={e => updateLine(i, 'netAgirlik', Number(e.target.value))} placeholder="0.000" />
                  <input type="text" inputMode="decimal" className={inp} value={line.birimFiyat || ''} onChange={e => updateLine(i, 'birimFiyat', Number(e.target.value))} placeholder="0.000" />
                  <select className={sel} value={line.kdvOrani} onChange={e => updateLine(i, 'kdvOrani', Number(e.target.value))}>
                    {KDV_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <div className="text-right text-[12px] font-semibold text-gray-700 tabular-nums pr-1">
                    {fCurrency(lineTotal(line), currency)}
                  </div>
                  <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1}
                    className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-20">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button type="button" onClick={addLine}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-[11px] font-semibold text-gray-500 transition-colors">
              <Plus className="h-3.5 w-3.5" />Satır Ekle
            </button>

            <div className="mt-4 space-y-1.5 text-[13px]">
              {lines.length > 1 && lines.map((l, i) => lineTotal(l) > 0 && (
                <div key={i} className="flex justify-between text-gray-400">
                  <span className="truncate max-w-[60%]">{l.aciklama || `Kalem ${i + 1}`}</span>
                  <span className="tabular-nums">{fCurrency(lineTotal(l), currency)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-100">
                <span>Toplam ({currency})</span>
                <span className="tabular-nums">{fCurrency(toplamYerel, currency)}</span>
              </div>
              {isNonUsd && dovizKuru > 0 && (
                <div className="flex justify-between text-gray-400 text-[12px]">
                  <span>USD Karşılığı ({kurYon === 'direct' ? `1 ${currency} = ${fN(dovizKuru, 4)} USD` : `1 USD = ${fN(dovizKuru, 4)} ${currency}`})</span>
                  <span className="font-semibold text-gray-600 tabular-nums">{fCurrency(toplamUsd, 'USD')}</span>
                </div>
              )}
            </div>
          </div>

          <Divider />

          {/* ── Ek Bilgiler ── */}
          <div>
            <SectionTitle>Ek Bilgiler</SectionTitle>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Menşei">
                <input className={inp} value={mensei} onChange={e => setMensei(e.target.value)} placeholder="FINLAND" />
              </Field>
              <Field label="Brüt Ağırlık (KG)">
                <input type="text" inputMode="decimal" className={inp} value={brutAgirlik || ''} onChange={e => setBrutAgirlik(Number(e.target.value))} placeholder="0.000" />
              </Field>
              <Field label="Kap Adeti">
                <input type="text" inputMode="decimal" className={inp} value={kapAdeti || ''} onChange={e => setKapAdeti(Number(e.target.value))} placeholder="0" />
              </Field>
            </div>
          </div>

          <Divider />

          {/* ── Ödeme ── */}
          <div>
            <SectionTitle>Ödeme</SectionTitle>
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {PAYMENT_METHODS.map(pm => (
                <button key={pm.value} type="button" onClick={() => setPaymentMethod(pm.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2 px-2 rounded-lg text-[10px] font-semibold transition-all',
                    paymentMethod === pm.value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                  )}>
                  {pm.icon}{pm.label}
                </button>
              ))}
            </div>

            <button type="button" onClick={() => setMasrafOpen(v => !v)}
              className="w-full flex items-center justify-center gap-2 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-[11px] font-semibold text-gray-500 transition-colors">
              {masrafOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              + Masraf / Komisyon Ekle
            </button>

            {masrafOpen && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Masraf Türü">
                    <input className={inp} value={masrafTuru} onChange={e => setMasrafTuru(e.target.value)} placeholder="Örn. Banka komisyonu" />
                  </Field>
                  <Field label="Tutar">
                    <input type="text" inputMode="decimal" className={inp} value={masrafTutar || ''} onChange={e => setMasrafTutar(Number(e.target.value))} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Para Birimi">
                    <select className={sel} value={masrafCurrency} onChange={e => setMasrafCurrency(e.target.value as typeof masrafCurrency)}>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="AED">AED</option>
                      <option value="GBP">GBP</option>
                      <option value="TRY">TRY</option>
                    </select>
                  </Field>
                  {masrafCurrency !== 'USD' && (
                    <Field label="Kur">
                      <div className="flex items-center gap-2">
                        <div className="flex bg-gray-100 rounded-lg overflow-hidden shrink-0">
                          <button type="button" onClick={() => setMasrafKurYon('direct')}
                            className={cn('px-2 h-8 text-[10px] font-bold whitespace-nowrap transition-colors',
                              masrafKurYon === 'direct' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700')}>
                            {masrafCurrency}→USD
                          </button>
                          <button type="button" onClick={() => setMasrafKurYon('inverse')}
                            className={cn('px-2 h-8 text-[10px] font-bold whitespace-nowrap transition-colors',
                              masrafKurYon === 'inverse' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700')}>
                            USD→{masrafCurrency}
                          </button>
                        </div>
                        <input type="text" inputMode="decimal" className={cn(inp, 'flex-1')} value={masrafRate || ''} onChange={e => setMasrafRate(Number(e.target.value))} placeholder="0.0000" />
                      </div>
                    </Field>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>

        <div className="flex justify-end gap-2 pt-3 mt-1">
          <button type="button" onClick={() => onOpenChange(false)}
            className="h-8 px-4 rounded-lg text-[12px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
            İptal
          </button>
          <button onClick={handleSubmit} disabled={isSaving}
            className="h-8 px-4 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
            style={{ background: accent }}>
            {isSaving ? 'Kaydediliyor…' : isEdit ? 'Güncelle' : 'Kaydet'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
