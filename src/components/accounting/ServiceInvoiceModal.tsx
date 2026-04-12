import { useEffect, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAllTradeFiles } from '@/hooks/useTradeFiles';
import { useCreateTransaction, useUpdateTransaction } from '@/hooks/useTransactions';
import { today, fCurrency, fN } from '@/lib/formatters';
import { toast } from 'sonner';
import type { Transaction } from '@/types/database';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SmartFill } from '@/components/ui/SmartFill';
import { OcrButton } from '@/components/ui/OcrButton';
import type { OcrResult } from '@/lib/openai';
import { PartyCombobox, type SelectedParty } from '@/components/accounting/PartyCombobox';
import { cn } from '@/lib/utils';
import { DateInput } from '@/components/ui/form-elements';
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
function Divider() {
  return <div className="border-t border-gray-100 my-1" />;
}

// ── Constants ───────────────────────────────────────────────────────────────
const PAYMENT_METHODS = [
  { value: '' as const,               label: 'Belirtilmedi', icon: <HelpCircle className="h-4 w-4" /> },
  { value: 'nakit' as const,          label: 'Nakit',        icon: <Banknote className="h-4 w-4" /> },
  { value: 'banka_havalesi' as const, label: 'Banka',        icon: <Building2 className="h-4 w-4" /> },
  { value: 'kredi_karti' as const,    label: 'Kredi Kartı',  icon: <CreditCard className="h-4 w-4" /> },
] as const;

const UNITS = ['Adet', 'KG', 'Ton', 'MT', 'LT', 'M²', 'M³', 'Set', 'Paket', 'Sefer', 'Gün', 'Saat', 'Diğer'];
const KDV_OPTIONS = [{ value: 0, label: '%0 (İstisna)' }, { value: 1, label: '%1' }, { value: 10, label: '%10' }, { value: 20, label: '%20' }];
const CURRENCIES = ['USD', 'EUR', 'AED', 'GBP', 'TRY'];

// ── Line item ───────────────────────────────────────────────────────────────
interface SvcLine { aciklama: string; miktar: number; birim: string; birimFiyat: number; kdvOrani: number; }
const emptyLine = (): SvcLine => ({ aciklama: '', miktar: 0, birim: 'Adet', birimFiyat: 0, kdvOrani: 0 });
function lineTotal(l: SvcLine) { return l.miktar * l.birimFiyat * (1 + l.kdvOrani / 100); }

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

// ── Props ───────────────────────────────────────────────────────────────────
const SVC_TXN_TYPES = [
  { value: 'sale_inv',     label: 'Satış Faturası' },
  { value: 'purchase_inv', label: 'Satın Alma Faturası' },
  { value: 'svc_inv',      label: 'Hizmet Faturası' },
  { value: 'receipt',      label: 'Tahsilat' },
  { value: 'payment',      label: 'Ödeme' },
  { value: 'advance',      label: 'Ön Ödeme' },
  { value: 'ic_transfer',  label: 'İç Transfer' },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transaction?: Transaction | null;
  defaultTradeFileId?: string;
  onSwitchToTransaction?: (type: string) => void;
}

export function ServiceInvoiceModal({ open, onOpenChange, transaction, defaultTradeFileId, onSwitchToTransaction }: Props) {
  const { accent } = useTheme();
  const { data: allFiles = [] } = useAllTradeFiles(['sale', 'delivery', 'completed']);
  const createTxn = useCreateTransaction();
  const updateTxn = useUpdateTransaction();
  const isEdit = !!transaction;

  // Grouped file lists for optgroup display
  const svcParentFiles    = allFiles.filter(f => !f.parent_file_id);
  const svcBatchFiles     = allFiles.filter(f =>  !!f.parent_file_id);
  const svcParentMap      = new Map(svcParentFiles.map(f => [f.id, f.file_no]));
  const svcParentsWithBatch = [...new Set(svcBatchFiles.map(b => b.parent_file_id!))];

  const [faturaNo,     setFaturaNo]     = useState('');
  const [faturaTarihi, setFaturaTarihi] = useState(today());
  const [party,        setParty]        = useState<SelectedParty | null>(null);
  const [fileId,       setFileId]       = useState(defaultTradeFileId ?? '');
  const [lines,        setLines]        = useState<SvcLine[]>([emptyLine()]);
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

  const toplamYerel = lines.reduce((s, l) => s + lineTotal(l), 0);
  const isNonUsd    = currency !== 'USD';
  const toplamUsd   = !isNonUsd ? toplamYerel
    : kurYon === 'direct' ? toplamYerel * dovizKuru
    : dovizKuru > 0 ? toplamYerel / dovizKuru : 0;

  function addLine() { setLines(p => [...p, emptyLine()]); }
  function removeLine(i: number) { setLines(p => p.length === 1 ? p : p.filter((_, idx) => idx !== i)); }
  function updateLine<K extends keyof SvcLine>(i: number, k: K, v: SvcLine[K]) {
    setLines(p => p.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  }

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      setFaturaTarihi(transaction.transaction_date);
      setFaturaNo(transaction.reference_no ?? '');
      setFileId(transaction.trade_file_id ?? '');
      setPaymentMethod((transaction.payment_method ?? '') as typeof paymentMethod);
      setMasrafTuru(transaction.masraf_turu ?? '');
      setMasrafTutar(transaction.masraf_tutar ?? 0);
      setMasrafCurrency((transaction.masraf_currency ?? 'USD') as 'USD' | 'EUR' | 'TRY');
      setMasrafRate(transaction.masraf_rate ?? 1);
      setMasrafOpen((transaction.masraf_tutar ?? 0) > 0);
      if (transaction.supplier_id && transaction.supplier)
        setParty({ id: transaction.supplier_id, name: transaction.supplier.name, entityType: 'supplier' });
      else if (transaction.service_provider_id && transaction.service_provider)
        setParty({ id: transaction.service_provider_id, name: transaction.service_provider.name, entityType: 'service_provider' });
      else setParty(null);
      let n: Record<string, unknown> = {};
      try { n = JSON.parse(transaction.notes ?? '{}'); } catch { /* */ }
      if (n.original_currency) {
        setCurrency(n.original_currency as 'USD' | 'EUR' | 'TRY' | 'AED' | 'GBP');
        setDovizKuru(Number(n.usd_rate ?? 1));
        setKurYon((n.kur_yon as 'direct' | 'inverse') ?? 'direct');
      } else { setCurrency('USD'); setDovizKuru(transaction.exchange_rate ?? 1); setKurYon('direct'); }
      if (Array.isArray(n.lines) && (n.lines as unknown[]).length > 0) {
        setLines((n.lines as SvcLine[]).map(l => ({
          aciklama: l.aciklama ?? '', miktar: Number(l.miktar ?? 0),
          birim: l.birim ?? 'Adet', birimFiyat: Number(l.birimFiyat ?? 0), kdvOrani: Number(l.kdvOrani ?? 0),
        })));
      } else {
        const bp = Number(n.birim_fiyat ?? 0); const kv = Number(n.kdv_orani ?? 0);
        let m = Number(n.miktar ?? 0);
        if (!m && bp > 0) { const d = bp * (1 + kv / 100); m = d > 0 ? parseFloat((transaction.amount / d).toFixed(3)) : 0; }
        setLines([{ aciklama: transaction.description ?? '', miktar: m, birim: String(n.birim ?? 'Adet'), birimFiyat: bp, kdvOrani: kv }]);
      }
    } else {
      setFaturaNo(''); setFaturaTarihi(today()); setParty(null); setFileId(defaultTradeFileId ?? '');
      setLines([emptyLine()]); setCurrency('USD'); setDovizKuru(1); setKurYon('direct');
      setPaymentMethod(''); setMasrafOpen(false); setMasrafTuru(''); setMasrafTutar(0); setMasrafCurrency('USD'); setMasrafRate(1); setMasrafKurYon('direct');
    }
  }, [open, transaction, defaultTradeFileId]);

  async function handleSubmit() {
    if (!party)         { toast.error('Lütfen hizmet sağlayıcı seçin'); return; }
    if (toplamUsd <= 0) { toast.error('Tutar sıfırdan büyük olmalı'); return; }
    const notesObj = {
      lines: lines.map(l => ({ aciklama: l.aciklama, miktar: l.miktar || undefined, birim: l.birim, birimFiyat: l.birimFiyat, kdvOrani: l.kdvOrani })),
      original_currency: isNonUsd ? currency : undefined,
      original_amount: isNonUsd ? toplamYerel : undefined,
      usd_rate: isNonUsd ? dovizKuru : undefined,
      kur_yon: isNonUsd ? kurYon : undefined,
    };
    const description = lines.length === 1 ? (lines[0].aciklama || 'Hizmet Faturası') : lines.map(l => l.aciklama).filter(Boolean).join(', ') || 'Hizmet Faturası';
    const payload = {
      transaction_date: faturaTarihi, transaction_type: 'svc_inv' as const,
      trade_file_id: fileId || undefined,
      party_type: party.entityType as 'service_provider' | 'supplier',
      customer_id: '', supplier_id: party.entityType === 'supplier' ? party.id : '',
      service_provider_id: party.entityType === 'service_provider' ? party.id : '',
      party_name: party.name, description, reference_no: faturaNo,
      currency: 'USD' as const, amount: toplamUsd, exchange_rate: isNonUsd ? dovizKuru : 1,
      paid_amount: transaction?.paid_amount ?? 0,
      payment_status: (transaction?.payment_status ?? 'open') as 'open' | 'partial' | 'paid',
      payment_method: paymentMethod, bank_name: '', bank_account_no: '', swift_bic: '',
      card_type: '' as const, cash_receiver: '', masraf_turu: masrafTuru, masraf_tutar: masrafTutar,
      masraf_currency: masrafCurrency as 'USD' | 'EUR' | 'TRY' | 'AED' | 'GBP', masraf_rate: masrafRate,
      notes: JSON.stringify(notesObj), kasa_id: '', bank_account_id: '',
    };
    if (isEdit && transaction) {
      await updateTxn.mutateAsync({ id: transaction.id, data: payload });
      toast.success('Hizmet faturası güncellendi');
    } else {
      await createTxn.mutateAsync(payload);
      toast.success('Hizmet faturası kaydedildi');
    }
    onOpenChange(false);
  }

  const isSaving = createTxn.isPending || updateTxn.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle className="flex-1">{isEdit ? 'Hizmet Faturasını Düzenle' : 'Hizmet Faturası'}</DialogTitle>
            <div className="flex gap-1.5 shrink-0">
              <SmartFill mode="transaction" onResult={(_r: OcrResult) => {}} formName="ServiceInvoice" iconOnly />
              <OcrButton mode="transaction" onResult={(_r: OcrResult) => {}} iconOnly />
            </div>
          </div>

          {/* ── İşlem türü pill seçici ── */}
          {!isEdit && onSwitchToTransaction && (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto scrollbar-none mt-3">
              {SVC_TXN_TYPES.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    if (o.value !== 'svc_inv') { onOpenChange(false); onSwitchToTransaction(o.value); }
                  }}
                  className={cn(
                    'shrink-0 px-3 h-7 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap',
                    o.value === 'svc_inv'
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
              <Field label="Fatura No / Dosya No">
                <input className={inp} value={faturaNo} onChange={e => setFaturaNo(e.target.value)} placeholder="ÖRN: GÜM-2026-001" />
              </Field>
              <Field label="Fatura Tarihi">
                <DateInput value={faturaTarihi} onChange={setFaturaTarihi} className={inp} />
              </Field>
            </div>
          </div>

          <Divider />

          {/* ── Dosya Detayları ── */}
          <div>


            <div className="grid grid-cols-2 gap-3">
              <Field label="Hizmet Sağlayıcı">
                {party ? (
                  <div className="flex items-center gap-2 bg-gray-100 rounded-lg h-8 px-3">
                    <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                      {initials(party.name)}
                    </div>
                    <span className="flex-1 min-w-0 text-[12px] font-semibold text-gray-900 truncate">{party.name}</span>
                    <button onClick={() => setParty(null)} className="text-gray-300 hover:text-red-400 transition-colors shrink-0">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <PartyCombobox value={party} onChange={setParty} filter="service_provider" placeholder="Ara…" />
                )}
              </Field>
              <Field label="Ticaret Dosyası">
                <select className={sel} value={fileId} onChange={e => setFileId(e.target.value)}>
                  <option value="">— Opsiyonel —</option>
                  {/* Ana dosyalar — batch'i olmayanlar */}
                  {svcParentFiles.filter(f => !svcParentsWithBatch.includes(f.id)).map(f => (
                    <option key={f.id} value={f.id}>{f.file_no}{f.customer?.name ? ` – ${f.customer.name}` : ''}</option>
                  ))}
                  {/* Batch'i olan ana dosyalar → alt partiler optgroup */}
                  {svcParentsWithBatch.map(parentId => {
                    const children = svcBatchFiles.filter(b => b.parent_file_id === parentId);
                    return (
                      <optgroup key={parentId} label={`↳ Alt Partiler — ${svcParentMap.get(parentId) ?? ''}`}>
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

            <div className={cn('grid gap-3', isNonUsd ? 'grid-cols-2' : 'grid-cols-2')}>
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

          {/* ── Hizmet Kalemleri ── */}
          <div>


            {/* Tablo başlığı */}
            <div className="grid gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 px-1 mb-2"
              style={{ gridTemplateColumns: '2fr 70px 80px 100px 80px 70px 32px' }}>
              <span>Açıklama</span><span>Miktar</span><span>Birim</span>
              <span>Birim Fiyat</span><span>KDV</span><span className="text-right">Tutar</span><span />
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="grid gap-2 items-center"
                  style={{ gridTemplateColumns: '2fr 70px 80px 100px 80px 70px 32px' }}>
                  <input className={inp} value={line.aciklama} onChange={e => updateLine(i, 'aciklama', e.target.value)} placeholder="Hizmet açıklaması…" />
                  <input type="text" inputMode="decimal" className={inp} value={line.miktar || ''} onChange={e => updateLine(i, 'miktar', Number(e.target.value))} placeholder="0" />
                  <select className={sel} value={line.birim} onChange={e => updateLine(i, 'birim', e.target.value)}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
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
              <Plus className="h-3.5 w-3.5" />
              Satır Ekle
            </button>

            {/* Özet */}
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

          {/* ── Ödeme ── */}
          <div>
            <SectionTitle>Ödeme</SectionTitle>
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {PAYMENT_METHODS.map(pm => (
                <button key={pm.value} type="button" onClick={() => setPaymentMethod(pm.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2 px-2 rounded-lg text-[10px] font-semibold transition-all',
                    paymentMethod === pm.value
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>İptal</Button>
          <button onClick={handleSubmit} disabled={isSaving}
            className="h-9 px-4 rounded-xl text-white text-[13px] font-semibold shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{ background: accent }}>
            {isSaving ? 'Kaydediliyor…' : isEdit ? 'Güncelle' : 'Kaydet'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
