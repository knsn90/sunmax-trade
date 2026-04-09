import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { transactionSchema, type TransactionFormData } from '@/types/forms';
import type { Transaction } from '@/types/database';
import { useTradeFiles } from '@/hooks/useTradeFiles';
import { useCreateTransaction, useUpdateTransaction } from '@/hooks/useTransactions';
import { useKasalar } from '@/hooks/useKasalar';
import { useBankAccounts } from '@/hooks/useSettings';
import { useCreateTransfer } from '@/hooks/useTransfers';
import { today, toUSD } from '@/lib/formatters';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, Textarea } from '@/components/ui/form-elements';
import { FormRow, FormGroup } from '@/components/ui/shared';
import { PartyCombobox, type SelectedParty, type EntityKind } from './PartyCombobox';
import { Banknote, Landmark, CreditCard, HelpCircle, ArrowLeftRight, Plus, ChevronUp } from 'lucide-react';

const TR_BANKS = [
  '— Seçin —',
  // Kamu Bankaları
  'Ziraat Bankası',
  'Halkbank',
  'Vakıfbank',
  'Ziraat Katılım',
  'Vakıf Katılım',
  'Halk Katılım',
  // Özel Bankalar
  'Akbank',
  'Garanti BBVA',
  'İş Bankası',
  'Yapı Kredi',
  'Denizbank',
  'QNB Finansbank',
  'TEB',
  'ING Bank',
  'Şekerbank',
  'Anadolubank',
  'Odeabank',
  'Fibabanka',
  'Alternatif Bank',
  'Burgan Bank',
  // Katılım Bankaları
  'Kuveyt Türk',
  'Türkiye Finans',
  'Albaraka Türk',
  // Yabancı Bankalar
  'HSBC',
  'ICBC Turkey',
  'Citibank',
];
import { OcrButton } from '@/components/ui/OcrButton';
import { SmartFill } from '@/components/ui/SmartFill';
import type { OcrResult } from '@/lib/openai';

interface TransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction | null;
  defaultType?: string;
  defaultTradeFileId?: string;
}

/** Para bize geliyor mu? (etiket metni için)
 *  - receipt, sale_inv → giriş
 *  - advance + customer → giriş; advance + supplier/service_provider → çıkış
 *  - purchase_inv, svc_inv, payment → çıkış
 */
function isMoneyIn(txnType: string, partyType: string): boolean {
  if (txnType === 'receipt' || txnType === 'sale_inv') return true;
  if (txnType === 'advance') return partyType === 'customer';
  return false;
}

/** Derive the EntityKind filter for a given transaction type */
function partyFilter(txnType: string): EntityKind | 'all' {
  if (txnType === 'svc_inv') return 'service_provider';
  if (txnType === 'purchase_inv') return 'supplier';
  if (txnType === 'receipt') return 'customer';
  return 'all'; // payment — any entity type
}

/** Build SelectedParty from an existing Transaction's joined data */
function partyFromTransaction(t: Transaction): SelectedParty | null {
  if (t.customer_id && t.customer) {
    return { id: t.customer_id, name: t.customer.name, entityType: 'customer' };
  }
  if (t.supplier_id && t.supplier) {
    return { id: t.supplier_id, name: t.supplier.name, entityType: 'supplier' };
  }
  if (t.service_provider_id && t.service_provider) {
    return { id: t.service_provider_id, name: t.service_provider.name, entityType: 'service_provider' };
  }
  return null;
}

export function TransactionModal({
  open, onOpenChange, transaction, defaultType, defaultTradeFileId,
}: TransactionModalProps) {
  const { t } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');

  const isEdit = !!transaction;
  const createTxn = useCreateTransaction();
  const updateTxn = useUpdateTransaction();
  const createTransfer = useCreateTransfer();
  const { data: kasalar = [] } = useKasalar();
  const { data: bankAccounts = [] } = useBankAccounts();

  // ── Selected party state (drives customer_id / supplier_id / service_provider_id) ──
  const [selectedParty, setSelectedParty] = useState<SelectedParty | null>(null);
  const [ocrPartyHint, setOcrPartyHint] = useState<string | null>(null);

  // ── Banka Havalesi: kaynak tipi (havale mi, nakit kaynaklı mı?) ──────────
  const [bankSource, setBankSource] = useState<'havale' | 'nakit'>('havale');
  const [masrafOpen, setMasrafOpen] = useState(false);

  // ── İç Transfer: from / to account selectors ─────────────────────────────
  const [itFromType, setItFromType] = useState<'kasa' | 'bank'>('kasa');
  const [itFromId,   setItFromId]   = useState('');
  const [itToType,   setItToType]   = useState<'kasa' | 'bank'>('bank');
  const [itToId,     setItToId]     = useState('');

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      transaction_date: today(),
      transaction_type: 'svc_inv',
      trade_file_id: '',
      customer_id: '',
      supplier_id: '',
      service_provider_id: '',
      party_name: '',
      description: '',
      reference_no: '',
      currency: 'USD',
      amount: 0,
      exchange_rate: 1,
      paid_amount: 0,
      payment_status: 'open',
      payment_method: '',
      bank_name: '',
      bank_account_no: '',
      swift_bic: '',
      card_type: '',
      cash_receiver: '',
      masraf_turu: '',
      masraf_tutar: 0,
      masraf_currency: 'USD',
      masraf_rate: 1,
      notes: '',
      kasa_id: '',
      bank_account_id: '',
    },
  });

  const { register, handleSubmit, formState: { errors }, reset, control, setValue, watch } = form;

  // ── Populate form when modal opens ───────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    // Reset states
    setBankSource('havale');
    setMasrafOpen(!!transaction && (transaction.masraf_tutar ?? 0) > 0);
    setItFromType('kasa'); setItFromId('');
    setItToType('bank');   setItToId('');
    if (transaction) {
      reset({
        transaction_date: transaction.transaction_date,
        transaction_type: transaction.transaction_type,
        trade_file_id: transaction.trade_file_id ?? '',
        customer_id: transaction.customer_id ?? '',
        supplier_id: transaction.supplier_id ?? '',
        service_provider_id: transaction.service_provider_id ?? '',
        party_name: transaction.party_name ?? '',
        description: transaction.description,
        reference_no: transaction.reference_no,
        currency: transaction.currency,
        amount: transaction.amount,
        exchange_rate: transaction.exchange_rate,
        paid_amount: transaction.paid_amount,
        payment_status: transaction.payment_status,
        payment_method: (transaction.payment_method ?? '') as TransactionFormData['payment_method'],
        bank_name: transaction.bank_name ?? '',
        bank_account_no: transaction.bank_account_no ?? '',
        swift_bic: transaction.swift_bic ?? '',
        card_type: (transaction.card_type ?? '') as TransactionFormData['card_type'],
        cash_receiver: transaction.cash_receiver ?? '',
        masraf_turu: transaction.masraf_turu ?? '',
        masraf_tutar: transaction.masraf_tutar ?? 0,
        masraf_currency: (transaction.masraf_currency ?? 'USD') as TransactionFormData['masraf_currency'],
        masraf_rate: transaction.masraf_rate ?? 1,
        notes: transaction.notes,
        kasa_id: transaction.kasa_id ?? '',
        bank_account_id: transaction.bank_account_id ?? '',
      });
      setSelectedParty(partyFromTransaction(transaction));
    } else {
      reset({
        transaction_date: today(),
        transaction_type: (defaultType as TransactionFormData['transaction_type']) ?? 'svc_inv',
        currency: 'USD',
        amount: 0,
        exchange_rate: 1,
        paid_amount: 0,
        payment_status: 'open',
        payment_method: '',
        bank_name: '',
        bank_account_no: '',
        swift_bic: '',
        description: '',
        reference_no: '',
        masraf_turu: '',
        masraf_tutar: 0,
        masraf_currency: 'USD',
        masraf_rate: 1,
        notes: '',
        trade_file_id: defaultTradeFileId ?? '',
        customer_id: '',
        supplier_id: '',
        service_provider_id: '',
        party_name: '',
        kasa_id: '',
        bank_account_id: '',
      });
      setSelectedParty(null);
    }
  }, [open, transaction, defaultType, defaultTradeFileId, reset]);

  const txnType       = useWatch({ control, name: 'transaction_type' });
  const currency      = useWatch({ control, name: 'currency' });
  const amount        = useWatch({ control, name: 'amount' }) ?? 0;
  const rate          = useWatch({ control, name: 'exchange_rate' }) ?? 1;
  const paymentMethod = useWatch({ control, name: 'payment_method' });
  const masrafTutar   = useWatch({ control, name: 'masraf_tutar' }) ?? 0;
  const masrafCurrency = useWatch({ control, name: 'masraf_currency' });
  const masrafRate    = useWatch({ control, name: 'masraf_rate' }) ?? 1;

  // Show exchange rate for all non-USD currencies
  const isNonUSD = currency !== 'USD';
  const isMasrafNonUSD = masrafCurrency !== 'USD';
  const masrafUsd = masrafTutar > 0 ? toUSD(masrafTutar, masrafCurrency as 'USD', masrafRate) : 0;
  const usdEquivalent = toUSD(amount, currency as 'USD', rate);

  // ── Bidirectional USD input ──────────────────────────────────────────────
  const [usdStr, setUsdStr] = useState('');
  const usdFocused = useRef(false);

  // When amount/rate/currency change externally → update USD display
  useEffect(() => {
    if (usdFocused.current) return;
    setUsdStr(isNonUSD && usdEquivalent > 0 ? usdEquivalent.toFixed(2) : '');
  }, [amount, rate, currency, isNonUSD, usdEquivalent]);

  function handleUsdChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setUsdStr(val);
    const usdVal = parseFloat(val);
    if (usdVal > 0 && amount > 0) {
      // rate = amount / usdEquivalent
      setValue('exchange_rate', parseFloat((amount / usdVal).toFixed(6)));
    }
  }

  // Fetch ALL files once (cached) — filter client-side by selected customer.
  // Avoids a new network request on every customer change and eliminates the
  // "empty while loading" flash that the server-side filter approach had.
  const { data: allFiles = [] } = useTradeFiles();
  const files = selectedParty?.entityType === 'customer'
    ? allFiles.filter(f => f.customer_id === selectedParty.id)
    : selectedParty?.entityType === 'supplier'
    ? allFiles.filter(f => f.supplier_id === selectedParty.id)
    : allFiles;

  // ── Handle party selection ────────────────────────────────────────────────
  function handlePartyChange(party: SelectedParty | null) {
    setSelectedParty(party);
    // Clear all FK fields first
    setValue('customer_id', '');
    setValue('supplier_id', '');
    setValue('service_provider_id', '');
    setValue('party_name', '');
    // Clear trade file — it will be re-filtered for the new party
    setValue('trade_file_id', '');
    if (!party) return;
    // Set the relevant FK
    if (party.entityType === 'customer') setValue('customer_id', party.id);
    else if (party.entityType === 'supplier') setValue('supplier_id', party.id);
    else setValue('service_provider_id', party.id);
    setValue('party_name', party.name);
  }

  // ── Reset party when transaction type changes ─────────────────────────────
  useEffect(() => {
    // Only reset on type change if the current party doesn't match the new filter
    if (!selectedParty) return;
    const f = partyFilter(txnType);
    if (f !== 'all' && selectedParty.entityType !== f) {
      handlePartyChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txnType]);

  async function onSubmit(data: TransactionFormData) {
    // ── İç Transfer branch ──────────────────────────────────────────────
    if (data.transaction_type === 'ic_transfer') {
      if (!itFromId || !itToId) return;
      try {
        await createTransfer.mutateAsync({
          transfer_date: data.transaction_date,
          description: data.description,
          amount: data.amount,
          currency: data.currency,
          exchange_rate: data.exchange_rate,
          amount_usd: toUSD(data.amount, data.currency as 'USD', data.exchange_rate),
          from_type: itFromType,
          from_id: itFromId,
          to_type: itToType,
          to_id: itToId,
          reference_no: data.reference_no,
          notes: data.notes,
        });
        onOpenChange(false);
      } catch {
        // Error already shown via toast
      }
      return;
    }

    // ── Normal transaction branch ────────────────────────────────────────
    // Yazılan tutar tamamen ödenmiş sayılır
    data.paid_amount = data.amount;
    data.payment_status = 'paid';

    const typeToParty: Record<string, TransactionFormData['party_type']> = {
      svc_inv: 'service_provider',
      purchase_inv: 'supplier',
      receipt: 'customer',
      payment: (selectedParty?.entityType as TransactionFormData['party_type']) ?? 'other',
    };
    data.party_type = typeToParty[data.transaction_type];

    try {
      if (isEdit && transaction) {
        await updateTxn.mutateAsync({ id: transaction.id, data });
      } else {
        await createTxn.mutateAsync(data);
      }
      onOpenChange(false);
    } catch {
      // Error already shown via toast — prevent UI freeze
    }
  }

  function handleOcrResult(result: OcrResult) {
    const currencies = ['USD', 'EUR', 'TRY', 'AED'];
    if (result.date) setValue('transaction_date', result.date);
    if (result.amount) setValue('amount', result.amount);
    if (result.currency && currencies.includes(result.currency)) {
      setValue('currency', result.currency as TransactionFormData['currency']);
    }
    if (result.description) setValue('description', result.description);
    if (result.reference_no) setValue('reference_no', result.reference_no);
    if (result.party_name) setOcrPartyHint(result.party_name);
  }

  const partyLabel: Record<string, string> = {
    svc_inv: t('transaction.modal.serviceProvider'),
    purchase_inv: t('transaction.modal.supplier'),
    receipt: t('transaction.modal.customer'),
    payment: t('transaction.modal.payee'),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DialogTitle>{isEdit ? t('transaction.modal.titleEdit') : t('transaction.modal.titleNew')}</DialogTitle>
            <div className="flex gap-1.5 flex-shrink-0">
              <SmartFill mode="transaction" onResult={handleOcrResult} formName="Transaction" />
              {!isEdit && <OcrButton mode="transaction" onResult={handleOcrResult} />}
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <FormRow>
            <FormGroup label={`${t('transaction.modal.type')} *`} error={errors.transaction_type?.message}>
              <NativeSelect {...register('transaction_type')}>
                {(['svc_inv','purchase_inv','receipt','payment','sale_inv','advance','ic_transfer'] as const).map(k => (
                  <option key={k} value={k}>{tc('txType.' + k)}</option>
                ))}
              </NativeSelect>
            </FormGroup>
            <FormGroup label={`${tc('form.date')} *`} error={errors.transaction_date?.message}>
              <Input type="date" {...register('transaction_date')} />
            </FormGroup>
          </FormRow>

          {/* ── İÇ TRANSFER FORMU (txnType === 'ic_transfer') ─────────────────── */}
          {txnType === 'ic_transfer' ? (
            <>
              {/* Tarih + Açıklama */}
              <FormRow>
                <FormGroup label={`${t('transaction.modal.description')} *`} error={errors.description?.message}>
                  <Input {...register('description')} placeholder="Örn. Kasadan bankaya para yatırma" />
                </FormGroup>
                <FormGroup label={t('transaction.modal.referenceNo')}>
                  <Input {...register('reference_no')} placeholder="Dekont / ref no" />
                </FormGroup>
              </FormRow>

              {/* Tutar */}
              <FormRow cols={isNonUSD ? 4 : 2}>
                <FormGroup label={tc('form.currency')}>
                  <NativeSelect {...register('currency')}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="AED">AED</option>
                    <option value="TRY">TRY</option>
                  </NativeSelect>
                </FormGroup>
                <FormGroup label={`${t('transaction.modal.amount')} *`} error={errors.amount?.message}>
                  <Input type="number" step="0.01" {...register('amount')} />
                </FormGroup>
                {isNonUSD && (
                  <FormGroup label={t('transaction.modal.exchangeRate')}>
                    <Input
                      type="number"
                      step="0.0001"
                      {...register('exchange_rate')}
                      placeholder={t('transaction.modal.exchangeRatePlaceholder')}
                      onChange={(e) => {
                        register('exchange_rate').onChange(e);
                        if (!usdFocused.current) setUsdStr('');
                      }}
                    />
                  </FormGroup>
                )}
                {isNonUSD && (
                  <FormGroup label="USD Karşılığı">
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-gray-400 pointer-events-none">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={usdStr}
                        onChange={handleUsdChange}
                        onFocus={() => { usdFocused.current = true; }}
                        onBlur={() => {
                          usdFocused.current = false;
                          const usd = toUSD(amount, currency as 'USD', rate);
                          setUsdStr(usd > 0 ? usd.toFixed(2) : '');
                        }}
                        placeholder="0.00"
                        className="pl-6 bg-blue-50 border-blue-100 focus:bg-white"
                      />
                    </div>
                  </FormGroup>
                )}
              </FormRow>

              {/* From → To */}
              <div className="mb-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                    <ArrowLeftRight className="h-3 w-3 text-white" />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
                    Kaynak ve Hedef Hesap
                  </p>
                </div>

                {/* Nereden */}
                <div>
                  <p className="text-[10px] font-semibold text-amber-600 mb-1.5 uppercase tracking-wide">Nereden</p>
                  <div className="flex gap-1.5 bg-amber-100/60 p-1 rounded-lg mb-2">
                    <button type="button"
                      onClick={() => { setItFromType('kasa'); setItFromId(''); }}
                      className={`flex-1 py-1 rounded-md text-[11px] font-semibold transition-all ${itFromType === 'kasa' ? 'bg-white shadow-sm text-gray-900' : 'text-amber-700'}`}
                    >Kasa</button>
                    <button type="button"
                      onClick={() => { setItFromType('bank'); setItFromId(''); }}
                      className={`flex-1 py-1 rounded-md text-[11px] font-semibold transition-all ${itFromType === 'bank' ? 'bg-white shadow-sm text-gray-900' : 'text-amber-700'}`}
                    >Banka</button>
                  </div>
                  <NativeSelect value={itFromId} onChange={e => setItFromId(e.target.value)}>
                    <option value="">— Seçin —</option>
                    {itFromType === 'kasa'
                      ? kasalar.map(k => <option key={k.id} value={k.id}>{k.name} ({k.currency})</option>)
                      : bankAccounts.map(a => <option key={a.id} value={a.id}>{a.bank_name}{a.account_name ? ` — ${a.account_name}` : ''}{a.currency ? ` · ${a.currency}` : ''}</option>)
                    }
                  </NativeSelect>
                </div>

                {/* Separator arrow */}
                <div className="flex justify-center">
                  <div className="w-7 h-7 rounded-full bg-amber-200 flex items-center justify-center">
                    <ArrowLeftRight className="h-3.5 w-3.5 text-amber-700" />
                  </div>
                </div>

                {/* Nereye */}
                <div>
                  <p className="text-[10px] font-semibold text-amber-600 mb-1.5 uppercase tracking-wide">Nereye</p>
                  <div className="flex gap-1.5 bg-amber-100/60 p-1 rounded-lg mb-2">
                    <button type="button"
                      onClick={() => { setItToType('kasa'); setItToId(''); }}
                      className={`flex-1 py-1 rounded-md text-[11px] font-semibold transition-all ${itToType === 'kasa' ? 'bg-white shadow-sm text-gray-900' : 'text-amber-700'}`}
                    >Kasa</button>
                    <button type="button"
                      onClick={() => { setItToType('bank'); setItToId(''); }}
                      className={`flex-1 py-1 rounded-md text-[11px] font-semibold transition-all ${itToType === 'bank' ? 'bg-white shadow-sm text-gray-900' : 'text-amber-700'}`}
                    >Banka</button>
                  </div>
                  <NativeSelect value={itToId} onChange={e => setItToId(e.target.value)}>
                    <option value="">— Seçin —</option>
                    {itToType === 'kasa'
                      ? kasalar.map(k => <option key={k.id} value={k.id}>{k.name} ({k.currency})</option>)
                      : bankAccounts.map(a => <option key={a.id} value={a.id}>{a.bank_name}{a.account_name ? ` — ${a.account_name}` : ''}{a.currency ? ` · ${a.currency}` : ''}</option>)
                    }
                  </NativeSelect>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* 1) TARAF — party picker */}
              <FormGroup label={partyLabel[txnType] ?? t('transaction.modal.party')} className="mb-2.5">
                {ocrPartyHint && (
                  <div className="flex items-center justify-between bg-brand-50 border border-brand-200 rounded-lg px-2.5 py-1.5 mb-1.5 text-xs">
                    <span>{t('transaction.modal.ocrDetected')} <strong>{ocrPartyHint}</strong> {t('transaction.modal.ocrInstruction')}</span>
                    <button type="button" onClick={() => setOcrPartyHint(null)} className="text-muted-foreground hover:text-foreground ml-2">✕</button>
                  </div>
                )}
                <PartyCombobox
                  value={selectedParty}
                  onChange={handlePartyChange}
                  filter={partyFilter(txnType)}
                  placeholder={t('transaction.modal.partyPlaceholder', { party: (partyLabel[txnType] ?? t('transaction.modal.party')).toLowerCase() })}
                />
              </FormGroup>

              {/* 2) TİCARET DOSYASI */}
              <FormGroup label={t('transaction.modal.tradeFile')} className="mb-2.5">
                <NativeSelect {...register('trade_file_id')}>
                  <option value="">{t('transaction.modal.tradeFileSelect')}</option>
                  {files.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.file_no} – {f.customer?.name ?? ''}
                    </option>
                  ))}
                </NativeSelect>
              </FormGroup>

              <FormRow>
                <FormGroup label={`${t('transaction.modal.description')} *`} error={errors.description?.message}>
                  <Input {...register('description')} placeholder={t('transaction.modal.descriptionPlaceholder')} />
                </FormGroup>
                <FormGroup label={t('transaction.modal.referenceNo')}>
                  <Input {...register('reference_no')} />
                </FormGroup>
              </FormRow>

              <FormRow cols={isNonUSD ? 4 : 2}>
                <FormGroup label={tc('form.currency')}>
                  <NativeSelect {...register('currency')}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="AED">AED</option>
                    <option value="TRY">TRY</option>
                  </NativeSelect>
                </FormGroup>
                <FormGroup label={`${t('transaction.modal.amount')} *`} error={errors.amount?.message}>
                  <Input type="number" step="0.01" {...register('amount')} />
                </FormGroup>
                {isNonUSD && (
                  <FormGroup label={t('transaction.modal.exchangeRate')}>
                    <Input
                      type="number"
                      step="0.0001"
                      {...register('exchange_rate')}
                      placeholder={t('transaction.modal.exchangeRatePlaceholder')}
                      onChange={(e) => {
                        register('exchange_rate').onChange(e);
                        if (!usdFocused.current) setUsdStr('');
                      }}
                    />
                  </FormGroup>
                )}
                {isNonUSD && (
                  <FormGroup label="USD Karşılığı">
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-gray-400 pointer-events-none">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={usdStr}
                        onChange={handleUsdChange}
                        onFocus={() => { usdFocused.current = true; }}
                        onBlur={() => {
                          usdFocused.current = false;
                          const usd = toUSD(amount, currency as 'USD', rate);
                          setUsdStr(usd > 0 ? usd.toFixed(2) : '');
                        }}
                        placeholder="0.00"
                        className="pl-6 bg-blue-50 border-blue-100 focus:bg-white"
                      />
                    </div>
                  </FormGroup>
                )}
              </FormRow>

              {/* ── Ödeme Türü ─────────────────────────────────────────────── */}
              <FormGroup label="Ödeme Türü" className="mb-2.5">
                <div className="flex gap-2">
                  {([
                    { value: '',               label: 'Belirtilmedi',   Icon: HelpCircle },
                    { value: 'nakit',          label: 'Nakit',          Icon: Banknote   },
                    { value: 'banka_havalesi', label: 'Banka Havalesi', Icon: Landmark   },
                    { value: 'kredi_karti',    label: 'Kredi Kartı',    Icon: CreditCard },
                  ] as const).map(({ value, label, Icon }) => {
                    const active = paymentMethod === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setValue('payment_method', value)}
                        className={`flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-xl text-[10px] font-semibold border transition-all ${
                          active
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-700'
                        }`}
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.5} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </FormGroup>

              {/* Banka Havalesi detayları */}
              {paymentMethod === 'banka_havalesi' && (
                <div className="mb-2.5 space-y-2">
                  {/* Kaynak tipi toggle */}
                  <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setBankSource('havale')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${bankSource === 'havale' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <Landmark className="h-3.5 w-3.5" />
                      Banka Transferi
                    </button>
                    <button
                      type="button"
                      onClick={() => setBankSource('nakit')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${bankSource === 'nakit' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <Banknote className="h-3.5 w-3.5" />
                      Nakit Kaynaklı
                    </button>
                  </div>
                  {/* Bizim banka hesabımız */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                        <Landmark className="h-3 w-3 text-white" />
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">
                        {isMoneyIn(txnType, selectedParty?.entityType ?? '') ? 'Para Hangi Hesabımıza Girdi?' : 'Para Hangi Hesabımızdan Çıktı?'}
                      </p>
                    </div>
                    <NativeSelect
                      {...register('bank_account_id')}
                      onChange={(e) => {
                        register('bank_account_id').onChange(e);
                        const acc = bankAccounts.find(a => a.id === e.target.value);
                        if (acc) {
                          setValue('bank_name', acc.bank_name);
                          setValue('bank_account_no', acc.iban_usd || acc.iban_eur || '');
                          setValue('swift_bic', acc.swift_bic || '');
                        } else {
                          setValue('bank_name', ''); setValue('bank_account_no', ''); setValue('swift_bic', '');
                        }
                      }}
                    >
                      <option value="">— Hesap seçin —</option>
                      {bankAccounts.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.bank_name}{a.account_name ? ` — ${a.account_name}` : ''}{a.currency ? ` · ${a.currency}` : ''}
                        </option>
                      ))}
                    </NativeSelect>
                    {bankAccounts.length === 0 && (
                      <p className="text-[11px] text-blue-500 italic">Henüz banka hesabı eklenmemiş. Muhasebe → Ayarlar'dan ekleyebilirsiniz.</p>
                    )}
                  </div>
                  {/* Nakit kaynaklı: kasa seçici */}
                  {bankSource === 'nakit' && kasalar.length > 0 && (
                    <div className="bg-green-50/60 border border-green-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center shrink-0">
                          <Banknote className="h-3 w-3 text-white" />
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-green-700">
                          {isMoneyIn(txnType, selectedParty?.entityType ?? '') ? 'Nakit Hangi Kasadan Geldi?' : 'Nakit Hangi Kasaya Gitti?'}
                        </p>
                      </div>
                      <NativeSelect {...register('kasa_id')}>
                        <option value="">— Kasa seçin —</option>
                        {kasalar.map(k => <option key={k.id} value={k.id}>{k.name} ({k.currency})</option>)}
                      </NativeSelect>
                    </div>
                  )}
                  {/* Havale modunda: karşı taraf banka bilgileri */}
                  {bankSource === 'havale' && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-5 h-5 rounded-full bg-gray-400 flex items-center justify-center shrink-0">
                          <Landmark className="h-3 w-3 text-white" />
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Karşı Taraf Banka Bilgileri</p>
                      </div>
                      <FormRow cols={2}>
                        <FormGroup label="Banka Adı">
                          <NativeSelect {...register('bank_name')}>
                            {TR_BANKS.map(b => <option key={b} value={b === '— Seçin —' ? '' : b}>{b}</option>)}
                          </NativeSelect>
                        </FormGroup>
                        <FormGroup label="Referans No">
                          <Input {...register('reference_no')} placeholder="Havale / EFT ref no" />
                        </FormGroup>
                      </FormRow>
                      <FormRow cols={2}>
                        <FormGroup label="IBAN / Hesap No">
                          <Input {...register('bank_account_no')} placeholder="TR00 0000 0000 0000 0000 00" className="font-mono text-[12px]" />
                        </FormGroup>
                        <FormGroup label="Swift / BIC">
                          <Input {...register('swift_bic')} placeholder="örn. TCZBTR2A" className="font-mono text-[12px]" />
                        </FormGroup>
                      </FormRow>
                    </div>
                  )}
                </div>
              )}

              {/* Kredi Kartı detayları */}
              {paymentMethod === 'kredi_karti' && (
                <div className="bg-violet-50/60 border border-violet-100 rounded-xl p-3 mb-2.5 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500 mb-2">💳 Kart Bilgileri</p>
                  <FormRow cols={2}>
                    <FormGroup label="Banka">
                      <NativeSelect {...register('bank_name')}>
                        {TR_BANKS.map(b => <option key={b} value={b === '— Seçin —' ? '' : b}>{b}</option>)}
                      </NativeSelect>
                    </FormGroup>
                    <FormGroup label="Kart Türü">
                      <div className="flex gap-1.5">
                        {([
                          { value: 'visa',       label: 'Visa'       },
                          { value: 'mastercard', label: 'Mastercard' },
                          { value: 'amex',       label: 'Amex'       },
                          { value: 'troy',       label: 'Troy'       },
                        ] as const).map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setValue('card_type', value)}
                            className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                              watch('card_type') === value
                                ? 'bg-violet-600 text-white border-violet-600'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-violet-300 hover:text-violet-600'
                            }`}
                          >{label}</button>
                        ))}
                      </div>
                    </FormGroup>
                  </FormRow>
                  <FormGroup label="Referans No">
                    <Input {...register('reference_no')} placeholder="POS slip / işlem no" />
                  </FormGroup>
                </div>
              )}

              {/* Nakit detayları + Kasa seçimi */}
              {paymentMethod === 'nakit' && (
                <div className="bg-green-50/60 border border-green-100 rounded-xl p-3 mb-2.5 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-green-600 mb-2">💵 Nakit Bilgileri</p>
                  {kasalar.length > 0 && (
                    <FormGroup label={isMoneyIn(txnType, selectedParty?.entityType ?? '') ? 'Hangi Kasaya Girdi?' : 'Hangi Kasadan Çıktı?'}>
                      <NativeSelect {...register('kasa_id')}>
                        <option value="">— Kasa seçin —</option>
                        {kasalar.map(k => <option key={k.id} value={k.id}>{k.name} ({k.currency})</option>)}
                      </NativeSelect>
                    </FormGroup>
                  )}
                  <FormRow cols={2}>
                    <FormGroup label="Teslim Alan Kişi">
                      <Input {...register('cash_receiver')} placeholder="Ad Soyad" />
                    </FormGroup>
                    <FormGroup label="Makbuz / Referans No">
                      <Input {...register('reference_no')} placeholder="Makbuz no" />
                    </FormGroup>
                  </FormRow>
                </div>
              )}
            </>
          )}

          {/* ── Masraf / Komisyon (collapsible) ──────────────────────────── */}
          {txnType !== 'ic_transfer' && (
            <div className="mb-2.5">
              {!masrafOpen ? (
                /* Kapalı: küçük "+ Masraf / Komisyon Ekle" butonu */
                <button
                  type="button"
                  onClick={() => setMasrafOpen(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-gray-200 text-[11px] font-semibold text-gray-400 hover:text-gray-600 hover:border-gray-300 hover:bg-gray-50/60 transition-all"
                >
                  <Plus className="h-3 w-3" />
                  Masraf / Komisyon Ekle
                </button>
              ) : (
                /* Açık: tam masraf formu */
                <div className="border border-orange-200 rounded-xl bg-orange-50/30 overflow-hidden">
                  {/* Header / kapat */}
                  <button
                    type="button"
                    onClick={() => {
                      setMasrafOpen(false);
                      setValue('masraf_turu', '');
                      setValue('masraf_tutar', 0);
                      setValue('masraf_currency', 'USD');
                      setValue('masraf_rate', 1);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-orange-50 transition-colors"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest text-orange-600">
                      Masraf / Komisyon
                    </span>
                    <ChevronUp className="h-3.5 w-3.5 text-orange-400" />
                  </button>
                  <div className="px-3 pb-3 space-y-2 border-t border-orange-100">
                    <div className="pt-2">
                      <FormRow cols={2}>
                        <FormGroup label="Masraf Türü">
                          <NativeSelect {...register('masraf_turu')}>
                            <option value="">— Seçin —</option>
                            <option value="Havale Masrafı">Havale Masrafı</option>
                            <option value="Banka Komisyonu">Banka Komisyonu</option>
                            <option value="Sarraf Masrafı">Sarraf Masrafı</option>
                            <option value="Swift Masrafı">Swift Masrafı</option>
                            <option value="Diğer">Diğer</option>
                          </NativeSelect>
                        </FormGroup>
                        <FormGroup label="Para Birimi">
                          <NativeSelect {...register('masraf_currency')}>
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                            <option value="TRY">TRY</option>
                            <option value="AED">AED</option>
                            <option value="GBP">GBP</option>
                          </NativeSelect>
                        </FormGroup>
                      </FormRow>
                      <FormRow cols={isMasrafNonUSD ? 3 : 2}>
                        <FormGroup label="Tutar">
                          <Input type="number" step="0.01" min="0" {...register('masraf_tutar')} placeholder="0.00" />
                        </FormGroup>
                        {isMasrafNonUSD && (
                          <FormGroup label={`Kur (1 USD = ? ${masrafCurrency})`}>
                            <Input type="number" step="0.0001" min="0" {...register('masraf_rate')} placeholder="örn. 32.50" />
                          </FormGroup>
                        )}
                        <FormGroup label="USD Karşılığı">
                          <div className="flex items-center h-9 px-3 rounded-xl bg-orange-100 border border-orange-200 text-[12px] font-bold text-orange-700 tabular-nums">
                            {masrafUsd > 0 ? `$${masrafUsd.toFixed(2)}` : <span className="text-gray-400 font-normal">—</span>}
                          </div>
                        </FormGroup>
                      </FormRow>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <FormGroup label={tc('form.notes')} className="mb-2">
            <Textarea rows={2} {...register('notes')} />
          </FormGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc('btn.cancel')}
            </Button>
            <Button type="submit" disabled={createTxn.isPending || updateTxn.isPending || createTransfer.isPending}>
              {isEdit ? t('transaction.modal.btnUpdate') : t('transaction.modal.btnSave')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
