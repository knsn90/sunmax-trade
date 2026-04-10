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
  ChevronDown, ChevronUp, Package, DollarSign,
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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Mevcut işlem — varsa düzenleme modu */
  transaction?: Transaction | null;
  onSwitchToTransaction?: (type: string) => void;
}

export function PurchaseInvoiceModal({ open, onOpenChange, transaction, onSwitchToTransaction }: Props) {
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

  // ── Ürün Bilgileri ────────────────────────────────────────────────────
  const [aciklama,    setAciklama]    = useState('');
  const [netAgirlik,  setNetAgirlik]  = useState(0);
  const [brutAgirlik, setBrutAgirlik] = useState(0);
  const [kapAdeti,    setKapAdeti]    = useState(0);
  const [mensei,      setMensei]      = useState('');

  // ── Fiyat ve Döviz ────────────────────────────────────────────────────
  const [currency,   setCurrency]   = useState<'USD' | 'EUR' | 'TRY' | 'AED' | 'GBP'>('USD');
  const [birimFiyat, setBirimFiyat] = useState(0);
  const [dovizKuru,  setDovizKuru]  = useState(1);

  // ── Vergi ─────────────────────────────────────────────────────────────
  const [kdvOrani, setKdvOrani] = useState(0);

  // ── Ödeme ─────────────────────────────────────────────────────────────
  const [paymentMethod,  setPaymentMethod]  = useState<'' | 'nakit' | 'banka_havalesi' | 'kredi_karti'>('');
  const [masrafOpen,     setMasrafOpen]     = useState(false);
  const [masrafTuru,     setMasrafTuru]     = useState('');
  const [masrafTutar,    setMasrafTutar]    = useState(0);
  const [masrafCurrency, setMasrafCurrency] = useState<'USD' | 'EUR' | 'TRY'>('USD');
  const [masrafRate,     setMasrafRate]     = useState(1);

  // ── Hesaplamalar ──────────────────────────────────────────────────────
  const malHizmetTutari = netAgirlik * birimFiyat;
  const kdvTutari       = malHizmetTutari * kdvOrani / 100;
  const toplamUsd       = malHizmetTutari + kdvTutari;
  const toplamTry       = toplamUsd * dovizKuru;

  // ── Reset / Pre-fill ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    if (transaction) {
      // Düzenleme modu: mevcut veriyi doldur
      setFaturaTarihi(transaction.transaction_date);
      setFaturaNo(transaction.reference_no ?? '');
      setSupplierId(transaction.supplier_id ?? '');
      setFileId(transaction.trade_file_id ?? '');
      setAciklama(transaction.description ?? '');
      setCurrency((transaction.currency ?? 'USD') as typeof currency);
      setDovizKuru(transaction.exchange_rate ?? 1);
      setPaymentMethod((transaction.payment_method ?? '') as typeof paymentMethod);
      setMasrafTuru(transaction.masraf_turu ?? '');
      setMasrafTutar(transaction.masraf_tutar ?? 0);
      setMasrafCurrency((transaction.masraf_currency ?? 'USD') as 'USD' | 'EUR' | 'TRY');
      setMasrafRate(transaction.masraf_rate ?? 1);
      setMasrafOpen((transaction.masraf_tutar ?? 0) > 0);

      // notes alanından ek bilgileri çıkar
      let notesObj: Record<string, number | string> = {};
      try { notesObj = JSON.parse(transaction.notes ?? '{}'); } catch { /* ignore */ }

      const bp = Number(notesObj.birim_fiyat ?? 0);
      const kv = Number(notesObj.kdv_orani ?? 0);
      setBirimFiyat(bp);
      setKdvOrani(kv);
      setBrutAgirlik(Number(notesObj.brut_agirlik_kg ?? 0));
      setKapAdeti(Number(notesObj.kap_adeti ?? 0));
      setMensei(String(notesObj.mensei ?? ''));

      // net_agirlik: önce notes'tan al, yoksa amount'tan hesapla
      if (notesObj.net_agirlik) {
        setNetAgirlik(Number(notesObj.net_agirlik));
      } else if (bp > 0) {
        const divisor = bp * (1 + kv / 100);
        setNetAgirlik(divisor > 0 ? parseFloat((transaction.amount / divisor).toFixed(3)) : 0);
      } else {
        setNetAgirlik(0);
      }
    } else {
      // Yeni kayıt: formu sıfırla
      setFaturaNo(''); setFaturaTarihi(today());
      setSupplierId(''); setFileId('');
      setAciklama(''); setNetAgirlik(0); setBrutAgirlik(0); setKapAdeti(0); setMensei('');
      setCurrency('USD'); setBirimFiyat(0); setDovizKuru(1);
      setKdvOrani(0);
      setPaymentMethod(''); setMasrafOpen(false); setMasrafTuru('');
      setMasrafTutar(0); setMasrafCurrency('USD'); setMasrafRate(1);
    }
  }, [open, transaction]);

  useEffect(() => {
    // Yeni kayıt modunda tedarikçi değişince dosyayı sıfırla
    if (!transaction) setFileId('');
  }, [supplierId, transaction]);

  useEffect(() => {
    // Dosya seçilince ürün bilgilerini otomatik doldur (sadece yeni kayıt modunda)
    if (!pickedFile || transaction) return;
    setAciklama(pickedFile.product?.name ?? '');
    setNetAgirlik(pickedFile.delivered_admt ?? pickedFile.tonnage_mt ?? 0);
    setBrutAgirlik(pickedFile.gross_weight_kg ?? 0);
    setKapAdeti(pickedFile.packages ?? 0);
    setBirimFiyat(pickedFile.purchase_price ?? 0);
    setCurrency((pickedFile.purchase_currency as typeof currency) ?? 'USD');
  }, [pickedFile, transaction]);

  // ── Submit ────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!supplierId)    { toast.error('Lütfen tedarikçi seçin'); return; }
    if (!faturaNo)      { toast.error('Fatura numarası zorunlu'); return; }
    if (toplamUsd <= 0) { toast.error('Tutar sıfırdan büyük olmalı'); return; }

    const supplier = suppliers.find(s => s.id === supplierId);
    const notesObj = {
      net_agirlik:     netAgirlik   || undefined,
      brut_agirlik_kg: brutAgirlik  || undefined,
      kap_adeti:       kapAdeti     || undefined,
      mensei:          mensei       || undefined,
      birim_fiyat:     birimFiyat,
      kdv_orani:       kdvOrani,
      kdv_tutari:      kdvTutari,
      toplam_try:      toplamTry    || undefined,
    };

    const payload = {
      transaction_date:    faturaTarihi,
      transaction_type:    'purchase_inv' as const,
      trade_file_id:       fileId || undefined,
      party_type:          'supplier' as const,
      customer_id:         '',
      supplier_id:         supplierId,
      service_provider_id: '',
      party_name:          supplier?.name ?? '',
      description:         aciklama || 'Satın Alma Faturası',
      reference_no:        faturaNo,
      currency,
      amount:              toplamUsd,
      exchange_rate:       dovizKuru,
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
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Satın Alma Faturasını Düzenle' : 'Satın Alma Faturası'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* ── İşlem Türü (sadece yeni kayıt modunda, tür değiştirme için) ── */}
          {!isEdit && onSwitchToTransaction && (
            <FormRow cols={2}>
              <FormGroup label="İşlem Türü">
                <NativeSelect
                  value="purchase_inv"
                  onChange={e => {
                    if (e.target.value !== 'purchase_inv') {
                      onOpenChange(false);
                      onSwitchToTransaction(e.target.value);
                    }
                  }}
                >
                  {TXN_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </NativeSelect>
              </FormGroup>
            </FormRow>
          )}

          {/* ── Fatura No + Tarih ── */}
          <FormRow cols={2}>
            <FormGroup label="Fatura No *">
              <Input
                value={faturaNo}
                onChange={e => setFaturaNo(e.target.value)}
                placeholder="AKS2026000000192"
              />
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

          {/* ── Ürün Bilgileri ── */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Ürün Bilgileri</span>
            </div>

            <FormRow cols={2}>
              <FormGroup label="Malzeme / Açıklama">
                <Input
                  value={aciklama}
                  onChange={e => setAciklama(e.target.value)}
                  placeholder="SELÜLOZ - ODUN HAMURU"
                />
              </FormGroup>
              <FormGroup label="Menşei">
                <Input
                  value={mensei}
                  onChange={e => setMensei(e.target.value)}
                  placeholder="FINLAND"
                />
              </FormGroup>
            </FormRow>

            <FormRow cols={3}>
              <FormGroup label="Net Ağırlık / ADMT">
                <Input
                  type="number" step="0.001"
                  value={netAgirlik || ''}
                  onChange={e => setNetAgirlik(Number(e.target.value))}
                  placeholder="0.000"
                />
              </FormGroup>
              <FormGroup label="Brüt Ağırlık (KG)">
                <Input
                  type="number" step="0.001"
                  value={brutAgirlik || ''}
                  onChange={e => setBrutAgirlik(Number(e.target.value))}
                  placeholder="0.000"
                />
              </FormGroup>
              <FormGroup label="Kap Adeti">
                <Input
                  type="number" step="1"
                  value={kapAdeti || ''}
                  onChange={e => setKapAdeti(Number(e.target.value))}
                  placeholder="0"
                />
              </FormGroup>
            </FormRow>
          </div>

          {/* ── Fiyat & Döviz ── */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Fiyat & Döviz</span>
            </div>

            <FormRow cols={3}>
              <FormGroup label="Birim Fiyatı *">
                <Input
                  type="number" step="0.001"
                  value={birimFiyat || ''}
                  onChange={e => setBirimFiyat(Number(e.target.value))}
                  placeholder="0.000"
                />
              </FormGroup>
              <FormGroup label="Para Birimi">
                <NativeSelect value={currency} onChange={e => setCurrency(e.target.value as typeof currency)}>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="AED">AED</option>
                  <option value="GBP">GBP</option>
                  <option value="TRY">TRY</option>
                </NativeSelect>
              </FormGroup>
              <FormGroup label="KDV Oranı">
                <NativeSelect value={kdvOrani} onChange={e => setKdvOrani(Number(e.target.value))}>
                  <option value={0}>%0 (İstisna)</option>
                  <option value={1}>%1</option>
                  <option value={10}>%10</option>
                  <option value={20}>%20</option>
                </NativeSelect>
              </FormGroup>
            </FormRow>

            {currency !== 'TRY' && (
              <FormRow cols={2}>
                <FormGroup label={`Döviz Kuru (${currency} → TRY)`}>
                  <Input
                    type="number" step="0.0001"
                    value={dovizKuru || ''}
                    onChange={e => setDovizKuru(Number(e.target.value))}
                    placeholder="1.0000"
                  />
                </FormGroup>
              </FormRow>
            )}

            {/* Özet satırları */}
            <div className="border-t border-gray-200 pt-3 space-y-1.5 text-[12px]">
              <div className="flex justify-between text-gray-500">
                <span>Net Ağırlık × Birim Fiyat</span>
                <span className="font-semibold">{fCurrency(malHizmetTutari, currency)}</span>
              </div>
              {kdvOrani > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>KDV (%{kdvOrani})</span>
                  <span className="font-semibold">{fCurrency(kdvTutari, currency)}</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-gray-900 pt-1 border-t border-gray-200">
                <span>Toplam ({currency})</span>
                <span>{fCurrency(toplamUsd, currency)}</span>
              </div>
              {currency !== 'TRY' && dovizKuru > 1 && (
                <div className="flex justify-between text-gray-400 text-[11px]">
                  <span>TL Karşılığı (Kur: {fN(dovizKuru, 4)})</span>
                  <span>{fCurrency(toplamTry, 'TRY')}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Ödeme Türü ── */}
          <FormGroup label="Ödeme Türü">
            <div className="grid grid-cols-4 gap-2">
              {PAYMENT_METHODS.map(pm => (
                <button
                  key={pm.value}
                  type="button"
                  onClick={() => setPaymentMethod(pm.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl border text-[11px] font-semibold transition-all',
                    paymentMethod === pm.value
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700',
                  )}
                >
                  {pm.icon}
                  {pm.label}
                </button>
              ))}
            </div>
          </FormGroup>

          {/* ── Masraf ── */}
          <button
            type="button"
            onClick={() => setMasrafOpen(v => !v)}
            className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-gray-300 rounded-xl text-[12px] font-semibold text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
          >
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
          <Button
            variant="secondary"
            onClick={handleSubmit}
            disabled={isSaving}
          >
            {isSaving ? 'Kaydediliyor…' : isEdit ? 'Güncelle' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
