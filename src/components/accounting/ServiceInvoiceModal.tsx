import { useEffect, useState } from 'react';
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
import { PartyCombobox, type SelectedParty } from '@/components/accounting/PartyCombobox';
import { cn } from '@/lib/utils';
import {
  HelpCircle, Banknote, Building2, CreditCard,
  ChevronDown, ChevronUp, Wrench, DollarSign,
} from 'lucide-react';

const PAYMENT_METHODS = [
  { value: '' as const,               label: 'Belirtilmedi',   icon: <HelpCircle className="h-4 w-4" /> },
  { value: 'nakit' as const,          label: 'Nakit',          icon: <Banknote className="h-4 w-4" /> },
  { value: 'banka_havalesi' as const, label: 'Banka',          icon: <Building2 className="h-4 w-4" /> },
  { value: 'kredi_karti' as const,    label: 'Kredi Kartı',    icon: <CreditCard className="h-4 w-4" /> },
] as const;

const UNITS = ['Adet', 'KG', 'Ton', 'MT', 'LT', 'M²', 'M³', 'Set', 'Paket', 'Sefer', 'Gün', 'Saat', 'Diğer'] as const;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Mevcut işlem — varsa düzenleme modu */
  transaction?: Transaction | null;
  /** Dosya detayından açıldıysa bu dosyayı ön seçili yap */
  defaultTradeFileId?: string;
}

export function ServiceInvoiceModal({ open, onOpenChange, transaction, defaultTradeFileId }: Props) {
  const { data: allFiles = [] } = useTradeFiles();
  const createTxn = useCreateTransaction();
  const updateTxn = useUpdateTransaction();
  const isEdit = !!transaction;

  // ── Temel Bilgiler ────────────────────────────────────────────────────
  const [faturaNo,     setFaturaNo]     = useState('');
  const [faturaTarihi, setFaturaTarihi] = useState(today());
  const [party,        setParty]        = useState<SelectedParty | null>(null);
  const [fileId,       setFileId]       = useState(defaultTradeFileId ?? '');

  // ── Hizmet Detayları ──────────────────────────────────────────────────
  const [aciklama,    setAciklama]    = useState('');
  const [miktar,      setMiktar]      = useState(0);
  const [birim,       setBirim]       = useState<string>('Adet');
  const [birimFiyat,  setBirimFiyat]  = useState(0);
  const [kdvOrani,    setKdvOrani]    = useState(0);

  // ── Para Birimi & Kur ─────────────────────────────────────────────────
  const [currency,      setCurrency]      = useState<'USD' | 'EUR' | 'TRY' | 'AED' | 'GBP'>('USD');
  const [dovizKuru,     setDovizKuru]     = useState(1);
  // 'direct'  → 1 EUR = X USD  (toplamYerel × kur)
  // 'inverse' → 1 USD = X EUR  (toplamYerel / kur)
  const [kurYon, setKurYon] = useState<'direct' | 'inverse'>('direct');

  // ── Ödeme ─────────────────────────────────────────────────────────────
  const [paymentMethod,  setPaymentMethod]  = useState<'' | 'nakit' | 'banka_havalesi' | 'kredi_karti'>('');
  const [masrafOpen,     setMasrafOpen]     = useState(false);
  const [masrafTuru,     setMasrafTuru]     = useState('');
  const [masrafTutar,    setMasrafTutar]    = useState(0);
  const [masrafCurrency, setMasrafCurrency] = useState<'USD' | 'EUR' | 'TRY'>('USD');
  const [masrafRate,     setMasrafRate]     = useState(1);

  // ── Hesaplamalar ──────────────────────────────────────────────────────
  const araToplam    = miktar * birimFiyat;
  const kdvTutari    = araToplam * kdvOrani / 100;
  const toplamYerel  = araToplam + kdvTutari;           // seçili dövizde toplam
  const isNonUsd     = currency !== 'USD';
  const toplamUsd    = !isNonUsd
    ? toplamYerel
    : kurYon === 'direct'
      ? toplamYerel * dovizKuru                         // 1 EUR = X USD
      : dovizKuru > 0 ? toplamYerel / dovizKuru : 0;   // 1 USD = X EUR

  // ── Reset / Pre-fill ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    if (transaction) {
      // Düzenleme modu
      setFaturaTarihi(transaction.transaction_date);
      setFaturaNo(transaction.reference_no ?? '');
      setFileId(transaction.trade_file_id ?? '');
      setAciklama(transaction.description ?? '');
      setPaymentMethod((transaction.payment_method ?? '') as typeof paymentMethod);
      setMasrafTuru(transaction.masraf_turu ?? '');
      setMasrafTutar(transaction.masraf_tutar ?? 0);
      setMasrafCurrency((transaction.masraf_currency ?? 'USD') as 'USD' | 'EUR' | 'TRY');
      setMasrafRate(transaction.masraf_rate ?? 1);
      setMasrafOpen((transaction.masraf_tutar ?? 0) > 0);

      // Party
      if (transaction.supplier_id && transaction.supplier) {
        setParty({ id: transaction.supplier_id, name: transaction.supplier.name, entityType: 'supplier' });
      } else if (transaction.service_provider_id && transaction.service_provider) {
        setParty({ id: transaction.service_provider_id, name: transaction.service_provider.name, entityType: 'service_provider' });
      } else {
        setParty(null);
      }

      // Notes
      let notesObj: Record<string, number | string> = {};
      try { notesObj = JSON.parse(transaction.notes ?? '{}'); } catch { /* ignore */ }

      const bp = Number(notesObj.birim_fiyat ?? 0);
      const kv = Number(notesObj.kdv_orani ?? 0);
      setBirimFiyat(bp);
      setKdvOrani(kv);
      setBirim(String(notesObj.birim ?? 'Adet'));

      // Orijinal döviz bilgisi (yeni format)
      if (notesObj.original_currency) {
        setCurrency(notesObj.original_currency as typeof currency);
        setDovizKuru(Number(notesObj.usd_rate ?? 1));
        setKurYon((notesObj.kur_yon as 'direct' | 'inverse') ?? 'direct');
      } else {
        setCurrency('USD');
        setDovizKuru(transaction.exchange_rate ?? 1);
        setKurYon('direct');
      }

      if (notesObj.miktar) {
        setMiktar(Number(notesObj.miktar));
      } else if (bp > 0) {
        const divisor = bp * (1 + kv / 100);
        setMiktar(divisor > 0 ? parseFloat((transaction.amount / divisor).toFixed(3)) : 0);
      } else {
        setMiktar(0);
      }
    } else {
      // Yeni kayıt
      setFaturaNo(''); setFaturaTarihi(today());
      setParty(null); setFileId(defaultTradeFileId ?? '');
      setAciklama(''); setMiktar(0); setBirim('Adet'); setBirimFiyat(0); setKdvOrani(0);
      setCurrency('USD'); setDovizKuru(1); setKurYon('direct');
      setPaymentMethod(''); setMasrafOpen(false); setMasrafTuru('');
      setMasrafTutar(0); setMasrafCurrency('USD'); setMasrafRate(1);
    }
  }, [open, transaction, defaultTradeFileId]);

  // ── Submit ────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!party)        { toast.error('Lütfen hizmet sağlayıcı seçin'); return; }
    if (toplamUsd <= 0) { toast.error('Tutar sıfırdan büyük olmalı'); return; }

    const notesObj = {
      miktar:           miktar       || undefined,
      birim:            birim        || undefined,
      birim_fiyat:      birimFiyat   || undefined,
      kdv_orani:        kdvOrani,
      kdv_tutari:       kdvTutari    || undefined,
      original_currency: isNonUsd ? currency : undefined,
      original_amount:   isNonUsd ? toplamYerel : undefined,
      usd_rate:          isNonUsd ? dovizKuru : undefined,
      kur_yon:           isNonUsd ? kurYon : undefined,
    };

    const payload = {
      transaction_date:    faturaTarihi,
      transaction_type:    'svc_inv' as const,
      trade_file_id:       fileId || undefined,
      party_type:          party.entityType as 'service_provider' | 'supplier',
      customer_id:         '',
      supplier_id:         party.entityType === 'supplier' ? party.id : '',
      service_provider_id: party.entityType === 'service_provider' ? party.id : '',
      party_name:          party.name,
      description:         aciklama || 'Hizmet Faturası',
      reference_no:        faturaNo,
      currency:            'USD' as const,   // muhasebe her zaman USD
      amount:              toplamUsd,         // USD karşılığı
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
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Hizmet Faturasını Düzenle' : 'Hizmet Faturası'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* ── Fatura No + Tarih ── */}
          <FormRow cols={2}>
            <FormGroup label="Fatura No / Dosya No">
              <Input
                value={faturaNo}
                onChange={e => setFaturaNo(e.target.value)}
                placeholder="ÖRN: GÜM-2026-001"
              />
            </FormGroup>
            <FormGroup label="Fatura Tarihi *">
              <Input type="date" value={faturaTarihi} onChange={e => setFaturaTarihi(e.target.value)} />
            </FormGroup>
          </FormRow>

          {/* ── Hizmet Sağlayıcı + Ticaret Dosyası ── */}
          <FormRow cols={2}>
            <FormGroup label="Hizmet Sağlayıcı *">
              <PartyCombobox
                value={party}
                onChange={setParty}
                filter="service_provider"
                placeholder="Hizmet sağlayıcı / tedarikçi ara…"
              />
            </FormGroup>
            <FormGroup label="Ticaret Dosyası">
              <NativeSelect value={fileId} onChange={e => setFileId(e.target.value)}>
                <option value="">— Opsiyonel —</option>
                {allFiles.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.file_no}{f.customer?.name ? ` – ${f.customer.name}` : ''}
                  </option>
                ))}
              </NativeSelect>
            </FormGroup>
          </FormRow>

          {/* ── Hizmet Detayları ── */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Hizmet Detayları</span>
            </div>

            <FormGroup label="Malzeme / Hizmet Açıklaması *">
              <Input
                value={aciklama}
                onChange={e => setAciklama(e.target.value)}
                placeholder="Örn. Mersin Gümrük Hizmeti, Sigorta Primi…"
              />
            </FormGroup>

            <FormRow cols={3}>
              <FormGroup label="Miktar">
                <Input
                  type="number" step="0.001"
                  value={miktar || ''}
                  onChange={e => setMiktar(Number(e.target.value))}
                  placeholder="0"
                />
              </FormGroup>
              <FormGroup label="Miktar Birimi">
                <NativeSelect value={birim} onChange={e => setBirim(e.target.value)}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
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
              {isNonUsd ? (
                <FormGroup label="Kur">
                  {/* Yön toggle */}
                  <div className="flex gap-1 mb-1.5">
                    <button type="button"
                      onClick={() => setKurYon('direct')}
                      className={cn('flex-1 py-1 rounded-lg text-[10px] font-bold transition-all border',
                        kurYon === 'direct'
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-400 border-gray-200 hover:text-gray-600')}
                    >1 {currency} = ? USD</button>
                    <button type="button"
                      onClick={() => setKurYon('inverse')}
                      className={cn('flex-1 py-1 rounded-lg text-[10px] font-bold transition-all border',
                        kurYon === 'inverse'
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-400 border-gray-200 hover:text-gray-600')}
                    >1 USD = ? {currency}</button>
                  </div>
                  <Input
                    type="number" step="0.0001"
                    value={dovizKuru || ''}
                    onChange={e => setDovizKuru(Number(e.target.value))}
                    placeholder={kurYon === 'direct' ? `1 ${currency} = kaç USD` : `1 USD = kaç ${currency}`}
                  />
                </FormGroup>
              ) : <div />}
            </FormRow>

            {/* Özet */}
            <div className="border-t border-gray-200 pt-3 space-y-1.5 text-[12px]">
              {miktar > 0 && birimFiyat > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>{miktar} {birim} × {fCurrency(birimFiyat, currency)}</span>
                  <span className="font-semibold">{fCurrency(araToplam, currency)}</span>
                </div>
              )}
              {kdvOrani > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>KDV (%{kdvOrani})</span>
                  <span className="font-semibold">{fCurrency(kdvTutari, currency)}</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-gray-900 pt-1 border-t border-gray-200">
                <span>Toplam ({currency})</span>
                <span>{fCurrency(toplamYerel, currency)}</span>
              </div>
              {isNonUsd && dovizKuru > 0 && (
                <div className="flex justify-between text-gray-400 text-[11px]">
                  <span>USD Karşılığı ({kurYon === 'direct' ? `1 ${currency} = ${fN(dovizKuru,4)} USD` : `1 USD = ${fN(dovizKuru,4)} ${currency}`})</span>
                  <span className="font-semibold text-gray-600">{fCurrency(toplamUsd, 'USD')}</span>
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
          <Button variant="secondary" onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? 'Kaydediliyor…' : isEdit ? 'Güncelle' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
