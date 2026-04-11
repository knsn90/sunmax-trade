import { useEffect, useState } from 'react';
import { useSuppliers } from '@/hooks/useEntities';
import { useTradeFiles } from '@/hooks/useTradeFiles';
import { useCreateTransaction, useUpdateTransaction } from '@/hooks/useTransactions';
import { today, fCurrency, fN } from '@/lib/formatters';
import { toast } from 'sonner';
import type { Transaction } from '@/types/database';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/form-elements';
import { FormRow, FormGroup } from '@/components/ui/shared';
import { cn } from '@/lib/utils';
import {
  HelpCircle, Banknote, Building2, CreditCard,
  ChevronDown, ChevronUp, Package, DollarSign, Plus, Trash2,
} from 'lucide-react';

const TXN_TYPES = [
  { value: 'purchase_inv', label: 'Satın Alma Faturası' },
  { value: 'sale_inv',     label: 'Satış Faturası' },
  { value: 'svc_inv',      label: 'Hizmet Faturası' },
  { value: 'receipt',      label: 'Tahsilat' },
  { value: 'payment',      label: 'Ödeme' },
  { value: 'advance',      label: 'Ön Ödeme' },
] as const;

const PAYMENT_METHODS = [
  { value: '' as const,               label: 'Belirtilmedi',   icon: <HelpCircle className="h-4 w-4" /> },
  { value: 'nakit' as const,          label: 'Nakit',          icon: <Banknote className="h-4 w-4" /> },
  { value: 'banka_havalesi' as const, label: 'Banka',          icon: <Building2 className="h-4 w-4" /> },
  { value: 'kredi_karti' as const,    label: 'Kredi Kartı',    icon: <CreditCard className="h-4 w-4" /> },
] as const;

const KDV_OPTIONS = [
  { value: 0,  label: '%0 (İstisna)' },
  { value: 1,  label: '%1' },
  { value: 10, label: '%10' },
  { value: 20, label: '%20' },
];

interface PurchaseLine {
  aciklama: string;
  netAgirlik: number;
  birimFiyat: number;
  kdvOrani: number;
}

const emptyLine = (): PurchaseLine => ({
  aciklama: '', netAgirlik: 0, birimFiyat: 0, kdvOrani: 0,
});

function lineTotal(l: PurchaseLine) {
  return l.netAgirlik * l.birimFiyat * (1 + l.kdvOrani / 100);
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transaction?: Transaction | null;
  onSwitchToTransaction?: (type: string) => void;
  defaultTradeFileId?: string;
}

export function PurchaseInvoiceModal({ open, onOpenChange, transaction, onSwitchToTransaction, defaultTradeFileId }: Props) {
  const { data: suppliers = [] } = useSuppliers();
  const { data: allFiles  = [] } = useTradeFiles();
  const createTxn = useCreateTransaction();
  const updateTxn = useUpdateTransaction();
  const isEdit = !!transaction;

  // ── Fatura Bilgileri ──────────────────────────────────────────────────
  const [faturaNo,     setFaturaNo]     = useState('');
  const [faturaTarihi, setFaturaTarihi] = useState(today());

  // ── Tedarikçi + Dosya ─────────────────────────────────────────────────
  const [supplierId, setSupplierId] = useState('');
  const [fileId,     setFileId]     = useState('');

  const supplierFiles = allFiles.filter(
    f => f.supplier_id === supplierId && ['sale', 'delivery', 'completed'].includes(f.status),
  );
  const pickedFile = supplierFiles.find(f => f.id === fileId) ?? null;

  // ── Header-level ürün bilgileri ───────────────────────────────────────
  const [brutAgirlik, setBrutAgirlik] = useState(0);
  const [kapAdeti,    setKapAdeti]    = useState(0);
  const [mensei,      setMensei]      = useState('');

  // ── Satır Kalemleri ───────────────────────────────────────────────────
  const [lines, setLines] = useState<PurchaseLine[]>([emptyLine()]);

  function addLine() { setLines(prev => [...prev, emptyLine()]); }
  function removeLine(i: number) { setLines(prev => prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)); }
  function updateLine<K extends keyof PurchaseLine>(i: number, key: K, val: PurchaseLine[K]) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [key]: val } : l));
  }

  // ── Para Birimi & Kur ─────────────────────────────────────────────────
  const [currency,   setCurrency]   = useState<'USD' | 'EUR' | 'TRY' | 'AED' | 'GBP'>('USD');
  const [dovizKuru,  setDovizKuru]  = useState(1);
  const [kurYon,     setKurYon]     = useState<'direct' | 'inverse'>('direct');

  // ── Ödeme ─────────────────────────────────────────────────────────────
  const [paymentMethod,  setPaymentMethod]  = useState<'' | 'nakit' | 'banka_havalesi' | 'kredi_karti'>('');
  const [masrafOpen,     setMasrafOpen]     = useState(false);
  const [masrafTuru,     setMasrafTuru]     = useState('');
  const [masrafTutar,    setMasrafTutar]    = useState(0);
  const [masrafCurrency, setMasrafCurrency] = useState<'USD' | 'EUR' | 'TRY'>('USD');
  const [masrafRate,     setMasrafRate]     = useState(1);

  // ── Hesaplamalar ──────────────────────────────────────────────────────
  const toplamYerel = lines.reduce((s, l) => s + lineTotal(l), 0);
  const isNonUsd    = currency !== 'USD';
  const toplamUsd   = !isNonUsd
    ? toplamYerel
    : kurYon === 'direct'
      ? toplamYerel * dovizKuru
      : dovizKuru > 0 ? toplamYerel / dovizKuru : 0;

  // ── Reset / Pre-fill ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    if (transaction) {
      setFaturaTarihi(transaction.transaction_date);
      setFaturaNo(transaction.reference_no ?? '');
      setSupplierId(transaction.supplier_id ?? '');
      setFileId(transaction.trade_file_id ?? '');
      setCurrency((transaction.currency ?? 'USD') as typeof currency);
      setDovizKuru(transaction.exchange_rate ?? 1);
      setPaymentMethod((transaction.payment_method ?? '') as typeof paymentMethod);
      setMasrafTuru(transaction.masraf_turu ?? '');
      setMasrafTutar(transaction.masraf_tutar ?? 0);
      setMasrafCurrency((transaction.masraf_currency ?? 'USD') as 'USD' | 'EUR' | 'TRY');
      setMasrafRate(transaction.masraf_rate ?? 1);
      setMasrafOpen((transaction.masraf_tutar ?? 0) > 0);

      let notesObj: Record<string, unknown> = {};
      try { notesObj = JSON.parse(transaction.notes ?? '{}'); } catch { /* ignore */ }

      setBrutAgirlik(Number(notesObj.brut_agirlik_kg ?? 0));
      setKapAdeti(Number(notesObj.kap_adeti ?? 0));
      setMensei(String(notesObj.mensei ?? ''));
      setKurYon((notesObj.kur_yon as 'direct' | 'inverse') ?? 'direct');

      // Satırlar: yeni format
      if (Array.isArray(notesObj.lines) && (notesObj.lines as unknown[]).length > 0) {
        setLines((notesObj.lines as PurchaseLine[]).map(l => ({
          aciklama:   l.aciklama   ?? '',
          netAgirlik: Number(l.netAgirlik ?? 0),
          birimFiyat: Number(l.birimFiyat ?? 0),
          kdvOrani:   Number(l.kdvOrani   ?? 0),
        })));
      } else {
        // Eski tek-satır format
        const bp = Number(notesObj.birim_fiyat ?? 0);
        const kv = Number(notesObj.kdv_orani ?? 0);
        let netAgirlik = Number(notesObj.net_agirlik ?? 0);
        if (!netAgirlik && bp > 0) {
          const divisor = bp * (1 + kv / 100);
          netAgirlik = divisor > 0 ? parseFloat((transaction.amount / divisor).toFixed(3)) : 0;
        }
        setLines([{
          aciklama:   transaction.description ?? '',
          netAgirlik,
          birimFiyat: bp,
          kdvOrani:   kv,
        }]);
      }
    } else {
      setFaturaNo(''); setFaturaTarihi(today());
      setSupplierId(''); setFileId(defaultTradeFileId ?? '');
      setBrutAgirlik(0); setKapAdeti(0); setMensei('');
      setLines([emptyLine()]);
      setCurrency('USD'); setDovizKuru(1); setKurYon('direct');
      setPaymentMethod(''); setMasrafOpen(false);
      setMasrafTuru(''); setMasrafTutar(0); setMasrafCurrency('USD'); setMasrafRate(1);
    }
  }, [open, transaction, defaultTradeFileId]);

  useEffect(() => {
    if (!transaction) setFileId('');
  }, [supplierId, transaction]);

  useEffect(() => {
    if (!pickedFile || transaction) return;
    // Dosya seçilince sadece ilk satırı ve header alanlarını otomatik doldur
    setLines(prev => prev.map((l, i) =>
      i === 0 ? {
        ...l,
        aciklama:   pickedFile.product?.name ?? l.aciklama,
        netAgirlik: pickedFile.delivered_admt ?? pickedFile.tonnage_mt ?? l.netAgirlik,
        birimFiyat: pickedFile.purchase_price ?? l.birimFiyat,
      } : l,
    ));
    setBrutAgirlik(pickedFile.gross_weight_kg ?? 0);
    setKapAdeti(pickedFile.packages ?? 0);
    setCurrency((pickedFile.purchase_currency as typeof currency) ?? 'USD');
  }, [pickedFile, transaction]);

  // ── Submit ────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!supplierId)    { toast.error('Lütfen tedarikçi seçin'); return; }
    if (!faturaNo)      { toast.error('Fatura numarası zorunlu'); return; }
    if (toplamUsd <= 0) { toast.error('Tutar sıfırdan büyük olmalı'); return; }

    const supplier = suppliers.find(s => s.id === supplierId);

    const notesObj = {
      lines: lines.map(l => ({
        aciklama:   l.aciklama,
        netAgirlik: l.netAgirlik || undefined,
        birimFiyat: l.birimFiyat,
        kdvOrani:   l.kdvOrani,
      })),
      brut_agirlik_kg: brutAgirlik || undefined,
      kap_adeti:       kapAdeti    || undefined,
      mensei:          mensei      || undefined,
      kur_yon:         isNonUsd ? kurYon : undefined,
    };

    const description = lines.length === 1
      ? (lines[0].aciklama || 'Satın Alma Faturası')
      : lines.map(l => l.aciklama).filter(Boolean).join(', ') || 'Satın Alma Faturası';

    const payload = {
      transaction_date:    faturaTarihi,
      transaction_type:    'purchase_inv' as const,
      trade_file_id:       fileId || undefined,
      party_type:          'supplier' as const,
      customer_id:         '',
      supplier_id:         supplierId,
      service_provider_id: '',
      party_name:          supplier?.name ?? '',
      description,
      reference_no:        faturaNo,
      currency,
      amount:              toplamYerel,
      exchange_rate:       isNonUsd ? dovizKuru : 1,
      paid_amount:         transaction?.paid_amount ?? 0,
      payment_status:      (transaction?.payment_status ?? 'open') as 'open' | 'partial' | 'paid',
      payment_method:      paymentMethod,
      bank_name:           '',
      bank_account_no:     '',
      swift_bic:           '',
      card_type:           '' as const,
      cash_receiver:       '',
      masraf_turu:         masrafTuru,
      masraf_tutar:        masrafTutar,
      masraf_currency:     masrafCurrency as 'USD' | 'EUR' | 'TRY' | 'AED' | 'GBP',
      masraf_rate:         masrafRate,
      notes:               JSON.stringify(notesObj),
      kasa_id:             '',
      bank_account_id:     '',
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
          <DialogTitle>{isEdit ? 'Satın Alma Faturasını Düzenle' : 'Satın Alma Faturası'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* ── İşlem Türü ── */}
          {!isEdit && onSwitchToTransaction && (
            <FormRow cols={2}>
              <FormGroup label="İşlem Türü">
                <NativeSelect value="purchase_inv" onChange={e => {
                  if (e.target.value !== 'purchase_inv') {
                    onOpenChange(false);
                    onSwitchToTransaction(e.target.value);
                  }
                }}>
                  {TXN_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </NativeSelect>
              </FormGroup>
            </FormRow>
          )}

          {/* ── Fatura No + Tarih ── */}
          <FormRow cols={2}>
            <FormGroup label="Fatura No *">
              <Input value={faturaNo} onChange={e => setFaturaNo(e.target.value)} placeholder="AKS2026000000192" />
            </FormGroup>
            <FormGroup label="Fatura Tarihi *">
              <Input type="date" value={faturaTarihi} onChange={e => setFaturaTarihi(e.target.value)} />
            </FormGroup>
          </FormRow>

          {/* ── Tedarikçi + Dosya ── */}
          <FormRow cols={2}>
            <FormGroup label="Tedarikçi *">
              <NativeSelect value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">— Tedarikçi seçin —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </NativeSelect>
            </FormGroup>
            <FormGroup label="Ticaret Dosyası">
              <NativeSelect value={fileId} onChange={e => setFileId(e.target.value)} disabled={!supplierId}>
                <option value="">— Opsiyonel —</option>
                {supplierFiles.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.file_no}{f.product?.name ? ` — ${f.product.name}` : ''}
                  </option>
                ))}
              </NativeSelect>
            </FormGroup>
          </FormRow>

          {/* ── Para Birimi & Kur ── */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Para Birimi & Kur</span>
            </div>
            <FormRow cols={2}>
              <FormGroup label="Para Birimi">
                <NativeSelect value={currency} onChange={e => setCurrency(e.target.value as typeof currency)}>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="AED">AED</option>
                  <option value="GBP">GBP</option>
                  <option value="TRY">TRY</option>
                </NativeSelect>
              </FormGroup>
              {isNonUsd && (
                <div className="flex flex-col gap-1">
                  <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Döviz Kuru</span>
                  <div className="flex items-center gap-1.5">
                    <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg shrink-0">
                      <button type="button" onClick={() => setKurYon('direct')}
                        className={cn('px-2 h-7 rounded-md text-[9px] font-bold transition-all whitespace-nowrap',
                          kurYon === 'direct' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600')}>
                        {currency}→USD
                      </button>
                      <button type="button" onClick={() => setKurYon('inverse')}
                        className={cn('px-2 h-7 rounded-md text-[9px] font-bold transition-all whitespace-nowrap',
                          kurYon === 'inverse' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600')}>
                        USD→{currency}
                      </button>
                    </div>
                    <Input type="number" step="0.0001" value={dovizKuru || ''} onChange={e => setDovizKuru(Number(e.target.value))} placeholder="0.0000" className="min-w-0" />
                  </div>
                </div>
              )}
            </FormRow>
          </div>

          {/* ── Satın Alma Kalemleri ── */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Ürün Kalemleri</span>
            </div>

            {/* Tablo başlığı */}
            <div className="grid gap-1.5 text-[9px] font-bold uppercase tracking-wider text-gray-400 px-1"
              style={{ gridTemplateColumns: '2fr 110px 110px 90px 80px 32px' }}>
              <span>Açıklama / Malzeme</span>
              <span>Net Ağırlık (MT)</span>
              <span>Birim Fiyat</span>
              <span>KDV</span>
              <span className="text-right">Tutar</span>
              <span />
            </div>

            <div className="space-y-1.5">
              {lines.map((line, i) => (
                <div key={i} className="grid gap-1.5 items-center"
                  style={{ gridTemplateColumns: '2fr 110px 110px 90px 80px 32px' }}>
                  <Input
                    value={line.aciklama}
                    onChange={e => updateLine(i, 'aciklama', e.target.value)}
                    placeholder="Ürün / malzeme açıklaması…"
                    className="h-8 text-[12px]"
                  />
                  <Input
                    type="number" step="0.001"
                    value={line.netAgirlik || ''}
                    onChange={e => updateLine(i, 'netAgirlik', Number(e.target.value))}
                    placeholder="0.000"
                    className="h-8 text-[12px]"
                  />
                  <Input
                    type="number" step="0.001"
                    value={line.birimFiyat || ''}
                    onChange={e => updateLine(i, 'birimFiyat', Number(e.target.value))}
                    placeholder="0.000"
                    className="h-8 text-[12px]"
                  />
                  <NativeSelect
                    value={line.kdvOrani}
                    onChange={e => updateLine(i, 'kdvOrani', Number(e.target.value))}
                    className="h-8 text-[12px]"
                  >
                    {KDV_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </NativeSelect>
                  <div className="text-right text-[11px] font-semibold text-gray-700 tabular-nums pr-1">
                    {fCurrency(lineTotal(line), currency)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    disabled={lines.length === 1}
                    className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addLine}
              className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-300 rounded-xl text-[12px] font-semibold text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Satır Ekle
            </button>

            {/* Özet */}
            <div className="border-t border-gray-200 pt-3 space-y-1.5 text-[12px]">
              {lines.length > 1 && lines.map((l, i) => lineTotal(l) > 0 && (
                <div key={i} className="flex justify-between text-gray-400">
                  <span className="truncate max-w-[60%]">{l.aciklama || `Kalem ${i + 1}`}</span>
                  <span className="tabular-nums">{fCurrency(lineTotal(l), currency)}</span>
                </div>
              ))}
              <div className="flex justify-between font-extrabold text-gray-900 pt-1 border-t border-gray-200">
                <span>Toplam ({currency})</span>
                <span>{fCurrency(toplamYerel, currency)}</span>
              </div>
              {isNonUsd && dovizKuru > 0 && (
                <div className="flex justify-between text-gray-400 text-[11px]">
                  <span>USD Karşılığı ({kurYon === 'direct' ? `1 ${currency} = ${fN(dovizKuru, 4)} USD` : `1 USD = ${fN(dovizKuru, 4)} ${currency}`})</span>
                  <span className="font-semibold text-gray-600 tabular-nums">{fCurrency(toplamUsd, 'USD')}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Header-level ürün bilgileri ── */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Ek Bilgiler</span>
            <FormRow cols={3}>
              <FormGroup label="Menşei">
                <Input value={mensei} onChange={e => setMensei(e.target.value)} placeholder="FINLAND" />
              </FormGroup>
              <FormGroup label="Brüt Ağırlık (KG)">
                <Input type="number" step="0.001" value={brutAgirlik || ''} onChange={e => setBrutAgirlik(Number(e.target.value))} placeholder="0.000" />
              </FormGroup>
              <FormGroup label="Kap Adeti">
                <Input type="number" step="1" value={kapAdeti || ''} onChange={e => setKapAdeti(Number(e.target.value))} placeholder="0" />
              </FormGroup>
            </FormRow>
          </div>

          {/* ── Ödeme Türü ── */}
          <FormGroup label="Ödeme Türü">
            <div className="grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map(pm => (
                <button key={pm.value} type="button" onClick={() => setPaymentMethod(pm.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl border text-[11px] font-semibold transition-all',
                    paymentMethod === pm.value
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700',
                  )}>
                  {pm.icon}
                  {pm.label}
                </button>
              ))}
            </div>
          </FormGroup>

          {/* ── Masraf ── */}
          <button type="button" onClick={() => setMasrafOpen(v => !v)}
            className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-gray-300 rounded-xl text-[12px] font-semibold text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors">
            {masrafOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            + Masraf / Komisyon Ekle
          </button>

          {masrafOpen && (
            <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
              <FormRow cols={2}>
                <FormGroup label="Masraf Türü">
                  <Input value={masrafTuru} onChange={e => setMasrafTuru(e.target.value)} placeholder="Örn. Banka komisyonu" />
                </FormGroup>
                <FormGroup label="Tutar">
                  <Input type="number" step="0.01" value={masrafTutar || ''} onChange={e => setMasrafTutar(Number(e.target.value))} />
                </FormGroup>
              </FormRow>
              <FormRow cols={2}>
                <FormGroup label="Para Birimi">
                  <NativeSelect value={masrafCurrency} onChange={e => setMasrafCurrency(e.target.value as typeof masrafCurrency)}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="TRY">TRY</option>
                  </NativeSelect>
                </FormGroup>
                {masrafCurrency !== 'USD' && (
                  <FormGroup label="Kur">
                    <Input type="number" step="0.0001" value={masrafRate || ''} onChange={e => setMasrafRate(Number(e.target.value))} />
                  </FormGroup>
                )}
              </FormRow>
            </div>
          )}

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>İptal</Button>
          <Button variant="secondary" onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? 'Kaydediliyor…' : isEdit ? 'Güncelle' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
