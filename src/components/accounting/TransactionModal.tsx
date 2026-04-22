import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { transactionSchema, type TransactionFormData } from '@/types/forms';
import type { Transaction } from '@/types/database';
import { useAllTradeFiles } from '@/hooks/useTradeFiles';
import { useCreateTransaction, useUpdateTransaction } from '@/hooks/useTransactions';
import { useKasalar } from '@/hooks/useKasalar';
import { useBankAccounts } from '@/hooks/useSettings';
import { useCurrencies } from '@/hooks/useCurrencies';
import { useCreateTransfer } from '@/hooks/useTransfers';
import { today, toUSD } from '@/lib/formatters';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { PartyCombobox, type SelectedParty, type EntityKind } from './PartyCombobox';
import { NumericInput } from '@/components/ui/form-elements';
import { MonoDatePicker } from '@/components/ui/MonoDatePicker';
import { Banknote, Landmark, CreditCard, HelpCircle, ArrowLeftRight, Plus, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const TxnLbl = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">{children}</div>
);
const TxnFld = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={className}><TxnLbl>{label}</TxnLbl>{children}</div>
);

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
import { Calculator } from '@/components/ui/Calculator';
import type { OcrResult } from '@/lib/openai';

const EXPENSE_CATEGORIES = [
  'Kira',
  'Elektrik / Enerji',
  'Doğalgaz',
  'Su',
  'İnternet / Telefon',
  'Maaş / Personel',
  'SGK',
  'Sigorta',
  'Vergi',
  'Ofis / Kırtasiye',
  'Bakım / Onarım',
  'Ulaşım',
  'Yemek / Temsil',
  'Reklam / Pazarlama',
  'Hukuki / Danışmanlık',
  'Diğer',
];

interface TransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction | null;
  defaultType?: string;
  defaultTradeFileId?: string;
  /** Satış faturası seçilince çağrılır — AccountingPage InvoiceModal'ı açar */
  onSaleInvRedirect?: () => void;
  /** Satın alma faturası seçilince çağrılır — AccountingPage PurchaseInvoiceModal'ı açar */
  onPurchaseInvRedirect?: () => void;
  /** Hizmet faturası seçilince çağrılır — AccountingPage ServiceInvoiceModal'ı açar */
  onSvcInvRedirect?: () => void;
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
  if (txnType === 'receipt' || txnType === 'sale_inv') return 'customer';
  return 'all'; // advance / payment — any entity type
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
  open, onOpenChange, transaction, defaultType, defaultTradeFileId, onSaleInvRedirect, onPurchaseInvRedirect, onSvcInvRedirect,
}: TransactionModalProps) {
  const { t } = useTranslation('accounting');
  const currencies = useCurrencies();
  const { t: tc } = useTranslation('common');
  const inp = 'bg-[#f2f4f7] rounded-xl px-4 py-3 text-[13px] font-medium text-gray-900 placeholder:text-gray-400 border-0 shadow-none focus:outline-none focus:ring-2 focus:ring-red-500/20 w-full';
  const sel = 'bg-[#f2f4f7] rounded-xl px-4 py-3 text-[13px] font-medium text-gray-900 border-0 shadow-none focus:outline-none w-full appearance-none cursor-pointer';
  const Lbl = TxnLbl;
  const Fld = TxnFld;
  // Reusable exchange-rate + USD columns (only rendered when isNonUSD)
  const RateFields = () => (
    <>
      <div>
        <Lbl>{kurYon === 'direct' ? `1 ${currency} = ? USD` : `1 USD = ? ${currency}`}</Lbl>
        <div className="flex min-h-[46px] rounded-xl overflow-hidden bg-[#f2f4f7]">
          <input type="text" inputMode="decimal" {...register('exchange_rate')}
            placeholder="0.0000"
            className="flex-1 min-w-0 bg-transparent px-3 text-[12px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
            onChange={(e) => { register('exchange_rate').onChange(e); if (!usdFocused.current) setUsdStr(''); }}
          />
          <div className="flex shrink-0 border-l border-gray-200">
            <button type="button" onClick={() => setKurYon('direct')}
              className={cn('px-2 h-full text-[9px] font-bold whitespace-nowrap transition-colors',
                kurYon === 'direct' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700')}>
              {currency}→USD
            </button>
            <button type="button" onClick={() => setKurYon('inverse')}
              className={cn('px-2 h-full text-[9px] font-bold whitespace-nowrap transition-colors border-l border-gray-200',
                kurYon === 'inverse' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700')}>
              USD→{currency}
            </button>
          </div>
        </div>
      </div>
      <Fld label="USD Karşılığı">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400 pointer-events-none">$</span>
          <input type="text" inputMode="decimal" value={usdStr} onChange={handleUsdChange}
            onFocus={() => { usdFocused.current = true; }}
            onBlur={() => { usdFocused.current = false; setUsdStr(usdEquivalent > 0 ? usdEquivalent.toLocaleString('en-US', { maximumFractionDigits: 2 }) : ''); }}
            placeholder="0.00" className={`${inp} pl-6`}
          />
        </div>
      </Fld>
    </>
  );

  const isEdit = !!transaction;
  const createTxn = useCreateTransaction();
  const updateTxn = useUpdateTransaction();
  const createTransfer = useCreateTransfer();
  const [saving, setSaving] = useState(false);
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

  // Kullanıcının tip dropdown'ını aktif olarak değiştirip değiştirmediğini takip et
  const userChangedType = useRef(false);

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      transaction_date: today(),
      transaction_type: 'receipt',
      trade_file_id: '',
      customer_id: '',
      supplier_id: '',
      service_provider_id: '',
      party_name: '',
      description: '',
      reference_no: '',
      currency: 'USD',
      amount: undefined,
      exchange_rate: 1,
      paid_amount: undefined,
      payment_status: 'open',
      payment_method: '',
      bank_name: '',
      bank_account_no: '',
      swift_bic: '',
      card_type: '',
      cash_receiver: '',
      masraf_turu: '',
      masraf_tutar: undefined,
      masraf_currency: 'USD',
      masraf_rate: 1,
      notes: '',
      kasa_id: '',
      bank_account_id: '',
    },
  });

  const { register, handleSubmit, formState: { errors: _errors }, reset, control, setValue, watch } = form;

  // ── Populate form when modal opens ───────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    // Reset states
    setBankSource('havale');
    setMasrafOpen(!!transaction && (transaction.masraf_tutar ?? 0) > 0);
    setItFromType('kasa'); setItFromId('');
    setItToType('bank');   setItToId('');
    userChangedType.current = false;
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
        transaction_type: (defaultType as TransactionFormData['transaction_type']) ?? 'receipt',
        currency: 'USD',
        amount: undefined,
        exchange_rate: 1,
        paid_amount: undefined,
        payment_status: 'open',
        payment_method: '',
        bank_name: '',
        bank_account_no: '',
        swift_bic: '',
        description: '',
        reference_no: '',
        masraf_turu: '',
        masraf_tutar: undefined,
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

  // Kullanıcı dropdown'dan tip DEĞİŞTİRİNCE özel modallara yönlendir
  // (userChangedType.current === false ise modal henüz ilk açıldı, redirect tetikleme)
  useEffect(() => {
    if (!userChangedType.current) return;
    if (!transaction) {
      if (txnType === 'sale_inv' && onSaleInvRedirect) {
        onOpenChange(false); onSaleInvRedirect(); return;
      }
      if (txnType === 'purchase_inv' && onPurchaseInvRedirect) {
        onOpenChange(false); onPurchaseInvRedirect(); return;
      }
      if (txnType === 'svc_inv' && onSvcInvRedirect) {
        onOpenChange(false); onSvcInvRedirect(); return;
      }
    }
  }, [txnType]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const [kurYon, setKurYon] = useState<'direct' | 'inverse'>('inverse');
  // direct: 1 local = rate USD → usd = amount * rate
  // inverse: 1 USD = rate local → usd = amount / rate
  const usdEquivalent = isNonUSD && rate > 0
    ? (kurYon === 'direct' ? amount * rate : amount / rate)
    : amount;

  // ── Bidirectional USD input ──────────────────────────────────────────────
  const [usdStr, setUsdStr] = useState('');
  const usdFocused = useRef(false);

  // When amount/rate/currency/kurYon change externally → update USD display
  useEffect(() => {
    if (usdFocused.current) return;
    setUsdStr(isNonUSD && usdEquivalent > 0 ? usdEquivalent.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '');
  }, [amount, rate, currency, kurYon, isNonUSD, usdEquivalent]);

  function handleUsdChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9.,]/g, '');
    const noComma = raw.replace(/,/g, '');
    const parts = noComma.split('.');
    const formatted = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (parts[1] !== undefined ? '.' + parts[1] : '');
    setUsdStr(formatted);
    const usdVal = parseFloat(noComma);
    if (usdVal > 0 && amount > 0) {
      // back-calculate rate from USD value
      const newRate = kurYon === 'direct'
        ? parseFloat((usdVal / amount).toFixed(6))   // rate = usd / amount
        : parseFloat((amount / usdVal).toFixed(6));  // rate = amount / usd
      setValue('exchange_rate', newRate);
    }
  }

  // Fetch ALL files once (cached) — filter client-side by selected customer.
  // Avoids a new network request on every customer change and eliminates the
  // "empty while loading" flash that the server-side filter approach had.
  const { data: allFiles = [] } = useAllTradeFiles();
  const files = selectedParty?.entityType === 'customer'
    ? allFiles.filter(f => f.customer_id === selectedParty.id)
    : selectedParty?.entityType === 'supplier'
    ? allFiles.filter(f => f.supplier_id === selectedParty.id)
    : allFiles;

  // Grouped for optgroup display
  const txnParentFiles = files.filter(f => !f.parent_file_id);

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
    if (f !== 'all') {
      // svc_inv: hem service_provider hem supplier geçerli
      const valid = selectedParty.entityType === f ||
        (f === 'service_provider' && selectedParty.entityType === 'supplier');
      if (!valid) handlePartyChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txnType]);

  async function onSubmit(data: TransactionFormData) {
    setSaving(true);
    try {
      // ── İç Transfer branch ──────────────────────────────────────────────
      if (data.transaction_type === 'ic_transfer') {
        if (!itFromId || !itToId) return;
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
        return;
      }

      // ── Normal transaction branch ────────────────────────────────────────
      data.paid_amount = data.amount;
      data.payment_status = 'paid';

      const typeToParty: Record<string, TransactionFormData['party_type']> = {
        svc_inv: (selectedParty?.entityType as TransactionFormData['party_type']) ?? 'service_provider',
        purchase_inv: 'supplier',
        receipt: 'customer',
        sale_inv: 'customer',
        advance: (selectedParty?.entityType as TransactionFormData['party_type']) ?? 'customer',
        payment: (selectedParty?.entityType as TransactionFormData['party_type']) ?? 'other',
        expense: 'other',
      };
      data.party_type = typeToParty[data.transaction_type];

      if (isEdit && transaction) {
        await updateTxn.mutateAsync({ id: transaction.id, data });
      } else {
        await createTxn.mutateAsync(data);
      }
      onOpenChange(false);
    } catch {
      // Error shown via onError toast
    } finally {
      setSaving(false);
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
      <DialogContent size="xl">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle className="flex-1">{isEdit
              ? t('transaction.modal.titleEdit')
              : ({
                  receipt:      'Yeni Tahsilat',
                  payment:      'Yeni Ödeme',
                  advance:      'Yeni Ön Ödeme',
                  ic_transfer:  'Yeni İç Transfer',
                  sale_inv:     'Yeni Satış Faturası',
                  purchase_inv: 'Yeni Satın Alma Faturası',
                  svc_inv:      'Yeni Hizmet Faturası',
                  expense:      'Yeni Gider',
                } as Record<string, string>)[txnType] ?? t('transaction.modal.titleNew')
            }</DialogTitle>
            <div className="flex gap-1.5 shrink-0">
              <Calculator variant="form" />
              <SmartFill mode="transaction" onResult={handleOcrResult} formName="Transaction" iconOnly />
              {!isEdit && <OcrButton mode="transaction" onResult={handleOcrResult} iconOnly />}
            </div>
          </div>

          {/* ── İşlem türü pill seçici ── */}
          {!isEdit && (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto scrollbar-none mt-3">
              {(['sale_inv','purchase_inv','svc_inv','receipt','payment','advance','ic_transfer','expense'] as const).map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (k === 'sale_inv' && onSaleInvRedirect) { onOpenChange(false); onSaleInvRedirect(); return; }
                    if (k === 'purchase_inv' && onPurchaseInvRedirect) { onOpenChange(false); onPurchaseInvRedirect(); return; }
                    if (k === 'svc_inv' && onSvcInvRedirect) { onOpenChange(false); onSvcInvRedirect(); return; }
                    userChangedType.current = true;
                    setValue('transaction_type', k);
                  }}
                  className={cn(
                    'shrink-0 px-3 h-7 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap',
                    txnType === k
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {tc('txType.' + k)}
                </button>
              ))}
            </div>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 py-1">

          {/* ── GİDER FORMU ───────────────────────────────────────────────── */}
          {txnType === 'expense' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Fld label={`${tc('form.date')} *`}>
                  <Controller
                    name="transaction_date"
                    control={control}
                    render={({ field }) => (
                      <MonoDatePicker
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        className={inp}
                      />
                    )}
                  />
                </Fld>
                <Fld label="Gider Kategorisi">
                  <select
                    className={sel}
                    defaultValue=""
                    onChange={(e) => {
                      const cat = e.target.value;
                      setValue('notes', cat);
                    }}
                  >
                    <option value="">— Seçin —</option>
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Fld>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Fld label={`${t('transaction.modal.description')} *`}>
                  <input {...register('description')} placeholder="Örn. Ocak 2026 kira ödemesi" className={inp} />
                </Fld>
                <Fld label={t('transaction.modal.referenceNo')}>
                  <input {...register('reference_no')} placeholder="Fatura / dekont no" className={inp} />
                </Fld>
              </div>
              <div className={`grid gap-3 ${isNonUSD ? 'grid-cols-4' : 'grid-cols-2'}`}>
                <Fld label={tc('form.currency')}>
                  <select {...register('currency')} className={sel}>
                    {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Fld>
                <Fld label={`${t('transaction.modal.amount')} *`}>
                  <Controller name="amount" control={control}
                    render={({ field }) => (
                      <NumericInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} className={inp} placeholder="0" />
                    )}
                  />
                </Fld>
                {isNonUSD && RateFields()}
              </div>
              <Fld label="Ödeme Türü">
                <div className="flex gap-2">
                  {([
                    { value: '',               label: 'Belirtilmedi', Icon: HelpCircle },
                    { value: 'nakit',          label: 'Nakit',        Icon: Banknote   },
                    { value: 'banka_havalesi', label: 'Banka',        Icon: Landmark   },
                    { value: 'kredi_karti',    label: 'Kredi Kartı',  Icon: CreditCard },
                  ] as const).map(({ value, label, Icon }) => {
                    const active = paymentMethod === value;
                    return (
                      <button key={value} type="button" onClick={() => setValue('payment_method', value)}
                        className={cn('flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-xl text-[10px] font-semibold transition-all',
                          active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400 hover:text-gray-700 hover:bg-gray-200')}
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.5} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </Fld>
              {paymentMethod === 'banka_havalesi' && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <Lbl>Ödenen Hesap</Lbl>
                  <select {...register('bank_account_id')} className={sel}
                    onChange={(e) => {
                      register('bank_account_id').onChange(e);
                      const acc = bankAccounts.find(a => a.id === e.target.value);
                      if (acc) { setValue('bank_name', acc.bank_name); setValue('bank_account_no', acc.iban_usd || acc.iban_eur || ''); setValue('swift_bic', acc.swift_bic || ''); }
                      else { setValue('bank_name', ''); setValue('bank_account_no', ''); setValue('swift_bic', ''); }
                    }}>
                    <option value="">— Hesap seçin —</option>
                    {bankAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.bank_name}{a.account_name ? ` — ${a.account_name}` : ''}{a.currency ? ` · ${a.currency}` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              {paymentMethod === 'nakit' && kasalar.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <Lbl>Hangi Kasadan Çıktı?</Lbl>
                  <select {...register('kasa_id')} className={sel}>
                    <option value="">— Kasa seçin —</option>
                    {kasalar.map(k => <option key={k.id} value={k.id}>{k.name} ({k.currency})</option>)}
                  </select>
                </div>
              )}
            </>
          ) : txnType === 'ic_transfer' ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Fld label={`${tc('form.date')} *`}>
                  <Controller
                    name="transaction_date"
                    control={control}
                    render={({ field }) => (
                      <MonoDatePicker
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        className={inp}
                      />
                    )}
                  />
                </Fld>
                <Fld label={`${t('transaction.modal.description')} *`}>
                  <input {...register('description')} placeholder="Örn. Kasadan bankaya para yatırma" className={inp} />
                </Fld>
                <Fld label={t('transaction.modal.referenceNo')}>
                  <input {...register('reference_no')} placeholder="Dekont / ref no" className={inp} />
                </Fld>
              </div>

              <div className={`grid gap-3 ${isNonUSD ? 'grid-cols-4' : 'grid-cols-2'}`}>
                <Fld label={tc('form.currency')}>
                  <select {...register('currency')} className={sel}>
                    {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Fld>
                <Fld label={`${t('transaction.modal.amount')} *`}>
                  <Controller name="amount" control={control}
                    render={({ field }) => (
                      <NumericInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} className={inp} placeholder="0" />
                    )}
                  />
                </Fld>
                {isNonUSD && RateFields()}
              </div>

              {/* From → To */}
              <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
                <div className="space-y-1.5">
                  <Lbl>Kaynak Hesap (Çıkış)</Lbl>
                  <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                    {(['kasa', 'bank'] as const).map(tt => (
                      <button key={tt} type="button"
                        onClick={() => { setItFromType(tt); setItFromId(''); }}
                        className={cn('flex-1 h-7 rounded-lg text-[11px] font-semibold transition-all',
                          itFromType === tt ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500')}
                      >{tt === 'kasa' ? 'Kasa' : 'Banka'}</button>
                    ))}
                  </div>
                  <select value={itFromId} onChange={e => setItFromId(e.target.value)} className={sel}>
                    <option value="">— Hesap seçin —</option>
                    {itFromType === 'kasa'
                      ? kasalar.map(k => <option key={k.id} value={k.id}>{k.name} ({k.currency})</option>)
                      : bankAccounts.map(a => <option key={a.id} value={a.id}>{a.bank_name}{a.account_name ? ` — ${a.account_name}` : ''}{a.currency ? ` · ${a.currency}` : ''}</option>)
                    }
                  </select>
                </div>
                <div className="pb-1 text-gray-300"><ArrowLeftRight className="h-5 w-5" /></div>
                <div className="space-y-1.5">
                  <Lbl>Hedef Hesap (Giriş)</Lbl>
                  <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                    {(['kasa', 'bank'] as const).map(tt => (
                      <button key={tt} type="button"
                        onClick={() => { setItToType(tt); setItToId(''); }}
                        className={cn('flex-1 h-7 rounded-lg text-[11px] font-semibold transition-all',
                          itToType === tt ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500')}
                      >{tt === 'kasa' ? 'Kasa' : 'Banka'}</button>
                    ))}
                  </div>
                  <select value={itToId} onChange={e => setItToId(e.target.value)} className={sel}>
                    <option value="">— Hesap seçin —</option>
                    {itToType === 'kasa'
                      ? kasalar.map(k => <option key={k.id} value={k.id}>{k.name} ({k.currency})</option>)
                      : bankAccounts.map(a => <option key={a.id} value={a.id}>{a.bank_name}{a.account_name ? ` — ${a.account_name}` : ''}{a.currency ? ` · ${a.currency}` : ''}</option>)
                    }
                  </select>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Tarih + Taraf */}
              <div className="grid grid-cols-[180px_1fr] gap-3 items-start">
                <Fld label={`${tc('form.date')} *`}>
                  <Controller
                    name="transaction_date"
                    control={control}
                    render={({ field }) => (
                      <MonoDatePicker
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        className={inp}
                      />
                    )}
                  />
                </Fld>
                <Fld label={partyLabel[txnType] ?? t('transaction.modal.party')}>
                  {ocrPartyHint && (
                    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 mb-1.5 text-xs">
                      <span>{t('transaction.modal.ocrDetected')} <strong>{ocrPartyHint}</strong> {t('transaction.modal.ocrInstruction')}</span>
                      <button type="button" onClick={() => setOcrPartyHint(null)} className="text-gray-400 hover:text-gray-700 ml-2">✕</button>
                    </div>
                  )}
                  <PartyCombobox value={selectedParty} onChange={handlePartyChange} filter={partyFilter(txnType)}
                    placeholder={t('transaction.modal.partyPlaceholder', { party: (partyLabel[txnType] ?? t('transaction.modal.party')).toLowerCase() })}
                  />
                </Fld>
              </div>

              {/* Ticaret Dosyası — sadece ana dosyalar */}
              <Fld label={t('transaction.modal.tradeFile')}>
                <select {...register('trade_file_id')} className={sel}>
                  <option value="">{t('transaction.modal.tradeFileSelect')}</option>
                  {txnParentFiles.map(f => (
                    <option key={f.id} value={f.id}>{f.file_no} – {f.customer?.name ?? ''}</option>
                  ))}
                </select>
              </Fld>

              <div className="grid grid-cols-2 gap-3">
                <Fld label={`${t('transaction.modal.description')} *`}>
                  <input {...register('description')} placeholder={t('transaction.modal.descriptionPlaceholder')} className={inp} />
                </Fld>
                <Fld label={t('transaction.modal.referenceNo')}>
                  <input {...register('reference_no')} className={inp} />
                </Fld>
              </div>

              <div className={`grid gap-3 ${isNonUSD ? 'grid-cols-4' : 'grid-cols-2'}`}>
                <Fld label={tc('form.currency')}>
                  <select {...register('currency')} className={sel}>
                    {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Fld>
                <Fld label={`${t('transaction.modal.amount')} *`}>
                  <Controller name="amount" control={control}
                    render={({ field }) => (
                      <NumericInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} className={inp} placeholder="0" />
                    )}
                  />
                </Fld>
                {isNonUSD && RateFields()}
              </div>

              {/* Ödeme Türü */}
              <Fld label="Ödeme Türü">
                <div className="flex gap-2">
                  {([
                    { value: '',               label: 'Belirtilmedi', Icon: HelpCircle },
                    { value: 'nakit',          label: 'Nakit',        Icon: Banknote   },
                    { value: 'banka_havalesi', label: 'Banka',        Icon: Landmark   },
                    { value: 'kredi_karti',    label: 'Kredi Kartı',  Icon: CreditCard },
                  ] as const).map(({ value, label, Icon }) => {
                    const active = paymentMethod === value;
                    return (
                      <button key={value} type="button" onClick={() => setValue('payment_method', value)}
                        className={cn('flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-xl text-[10px] font-semibold transition-all',
                          active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400 hover:text-gray-700 hover:bg-gray-200')}
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.5} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </Fld>

              {/* Banka Havalesi */}
              {paymentMethod === 'banka_havalesi' && (
                <div className="space-y-2">
                  <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                    <button type="button" onClick={() => setBankSource('havale')}
                      className={cn('flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all',
                        bankSource === 'havale' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
                      <Landmark className="h-3.5 w-3.5" />Banka Transferi
                    </button>
                    <button type="button" onClick={() => setBankSource('nakit')}
                      className={cn('flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all',
                        bankSource === 'nakit' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
                      <Banknote className="h-3.5 w-3.5" />Nakit Kaynaklı
                    </button>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <Lbl>{isMoneyIn(txnType, selectedParty?.entityType ?? '') ? 'Para Hangi Hesabımıza Girdi?' : 'Para Hangi Hesabımızdan Çıktı?'}</Lbl>
                    <select {...register('bank_account_id')} className={sel}
                      onChange={(e) => {
                        register('bank_account_id').onChange(e);
                        const acc = bankAccounts.find(a => a.id === e.target.value);
                        if (acc) { setValue('bank_name', acc.bank_name); setValue('bank_account_no', acc.iban_usd || acc.iban_eur || ''); setValue('swift_bic', acc.swift_bic || ''); }
                        else { setValue('bank_name', ''); setValue('bank_account_no', ''); setValue('swift_bic', ''); }
                      }}>
                      <option value="">— Hesap seçin —</option>
                      {bankAccounts.map(a => (
                        <option key={a.id} value={a.id}>{a.bank_name}{a.account_name ? ` — ${a.account_name}` : ''}{a.currency ? ` · ${a.currency}` : ''}</option>
                      ))}
                    </select>
                    {bankAccounts.length === 0 && (
                      <p className="text-[11px] text-gray-400 italic">Henüz banka hesabı eklenmemiş. Muhasebe → Ayarlar'dan ekleyebilirsiniz.</p>
                    )}
                  </div>
                  {bankSource === 'nakit' && kasalar.length > 0 && (
                    <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                      <Lbl>{isMoneyIn(txnType, selectedParty?.entityType ?? '') ? 'Nakit Hangi Kasadan Geldi?' : 'Nakit Hangi Kasaya Gitti?'}</Lbl>
                      <select {...register('kasa_id')} className={sel}>
                        <option value="">— Kasa seçin —</option>
                        {kasalar.map(k => <option key={k.id} value={k.id}>{k.name} ({k.currency})</option>)}
                      </select>
                    </div>
                  )}
                  {bankSource === 'havale' && (
                    <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                      <Lbl>Karşı Taraf Banka Bilgileri</Lbl>
                      <div className="grid grid-cols-2 gap-3">
                        <Fld label="Banka Adı">
                          <select {...register('bank_name')} className={sel}>
                            {TR_BANKS.map(b => <option key={b} value={b === '— Seçin —' ? '' : b}>{b}</option>)}
                          </select>
                        </Fld>
                        <Fld label="Referans No">
                          <input {...register('reference_no')} placeholder="Havale / EFT ref no" className={inp} />
                        </Fld>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Fld label="IBAN / Hesap No">
                          <input {...register('bank_account_no')} placeholder="TR00 0000 0000 0000 0000 00" className={`${inp} font-mono`} />
                        </Fld>
                        <Fld label="Swift / BIC">
                          <input {...register('swift_bic')} placeholder="örn. TCZBTR2A" className={`${inp} font-mono`} />
                        </Fld>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Kredi Kartı */}
              {paymentMethod === 'kredi_karti' && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <Lbl>Kart Bilgileri</Lbl>
                  <div className="grid grid-cols-2 gap-3">
                    <Fld label="Banka">
                      <select {...register('bank_name')} className={sel}>
                        {TR_BANKS.map(b => <option key={b} value={b === '— Seçin —' ? '' : b}>{b}</option>)}
                      </select>
                    </Fld>
                    <Fld label="Kart Türü">
                      <div className="flex gap-1.5">
                        {([
                          { value: 'visa', label: 'Visa' }, { value: 'mastercard', label: 'Mastercard' },
                          { value: 'amex', label: 'Amex' }, { value: 'troy', label: 'Troy' },
                        ] as const).map(({ value, label }) => (
                          <button key={value} type="button" onClick={() => setValue('card_type', value)}
                            className={cn('flex-1 h-8 rounded-lg text-[11px] font-bold transition-all',
                              watch('card_type') === value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
                          >{label}</button>
                        ))}
                      </div>
                    </Fld>
                  </div>
                  <Fld label="Referans No">
                    <input {...register('reference_no')} placeholder="POS slip / işlem no" className={inp} />
                  </Fld>
                </div>
              )}

              {/* Nakit */}
              {paymentMethod === 'nakit' && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <Lbl>Nakit Bilgileri</Lbl>
                  {kasalar.length > 0 && (
                    <Fld label={isMoneyIn(txnType, selectedParty?.entityType ?? '') ? 'Hangi Kasaya Girdi?' : 'Hangi Kasadan Çıktı?'}>
                      <select {...register('kasa_id')} className={sel}>
                        <option value="">— Kasa seçin —</option>
                        {kasalar.map(k => <option key={k.id} value={k.id}>{k.name} ({k.currency})</option>)}
                      </select>
                    </Fld>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Fld label="Teslim Alan Kişi">
                      <input {...register('cash_receiver')} placeholder="Ad Soyad" className={inp} />
                    </Fld>
                    <Fld label="Tahsilat / Referans No">
                      <input {...register('reference_no')} placeholder="Tahsilat no" className={inp} />
                    </Fld>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Masraf / Komisyon */}
          {txnType !== 'ic_transfer' && txnType !== 'expense' && (
            <div>
              {!masrafOpen ? (
                <button type="button" onClick={() => setMasrafOpen(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-gray-200 text-[11px] font-semibold text-gray-400 hover:text-gray-600 hover:border-gray-300 hover:bg-gray-50/60 transition-all">
                  <Plus className="h-3 w-3" />Masraf / Komisyon Ekle
                </button>
              ) : (
                <div className="bg-gray-50 rounded-xl overflow-hidden">
                  <button type="button" onClick={() => { setMasrafOpen(false); setValue('masraf_turu', ''); setValue('masraf_tutar', 0); setValue('masraf_currency', 'USD'); setValue('masraf_rate', 1); }}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-100 transition-colors">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Masraf / Komisyon</span>
                    <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                  </button>
                  <div className="px-3 pb-3 space-y-2 border-t border-gray-100">
                    <div className="pt-2">
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <Fld label="Masraf Türü">
                          <select {...register('masraf_turu')} className={sel}>
                            <option value="">— Seçin —</option>
                            <option value="Havale Masrafı">Havale Masrafı</option>
                            <option value="Banka Komisyonu">Banka Komisyonu</option>
                            <option value="Sarraf Masrafı">Sarraf Masrafı</option>
                            <option value="Swift Masrafı">Swift Masrafı</option>
                            <option value="Diğer">Diğer</option>
                          </select>
                        </Fld>
                        <Fld label="Para Birimi">
                          <select {...register('masraf_currency')} className={sel}>
                            {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </Fld>
                      </div>
                      <div className={`grid gap-3 ${isMasrafNonUSD ? 'grid-cols-3' : 'grid-cols-2'}`}>
                        <Fld label="Tutar">
                          <Controller name="masraf_tutar" control={control}
                            render={({ field }) => (
                              <NumericInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} className={inp} placeholder="0" />
                            )}
                          />
                        </Fld>
                        {isMasrafNonUSD && (
                          <Fld label={`Kur (1 USD = ? ${masrafCurrency})`}>
                            <Controller name="masraf_rate" control={control} render={({ field }) => (
                              <NumericInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} className={inp} placeholder="0.0000" />
                            )} />
                          </Fld>
                        )}
                        <Fld label="USD Karşılığı">
                          <div className="flex items-center h-8 px-3 rounded-lg bg-gray-200 text-[12px] font-bold text-gray-700 tabular-nums">
                            {masrafUsd > 0 ? `$${masrafUsd.toFixed(2)}` : <span className="text-gray-400 font-normal">—</span>}
                          </div>
                        </Fld>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col md:flex-row md:justify-end gap-2 pt-1">
            <button type="button" onClick={() => onOpenChange(false)}
              className="hidden md:flex h-8 px-4 rounded-lg text-[12px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors items-center justify-center">
              {tc('btn.cancel')}
            </button>
            <button type="submit" disabled={saving}
              className="w-full md:w-auto h-12 md:h-9 px-5 rounded-2xl md:rounded-xl text-[14px] md:text-[13px] font-bold text-white disabled:opacity-50 active:scale-[0.98] transition-all shadow-sm"
              style={{ fontFamily: 'Manrope, sans-serif', background: 'linear-gradient(135deg, #b70011 0%, #dc2626 100%)' }}>
              {saving ? '…' : isEdit ? t('transaction.modal.btnUpdate') : t('transaction.modal.btnSave')}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
