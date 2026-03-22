import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { transactionSchema, type TransactionFormData } from '@/types/forms';
import type { Transaction } from '@/types/database';
import { useTradeFiles } from '@/hooks/useTradeFiles';
import { useCreateTransaction, useUpdateTransaction } from '@/hooks/useTransactions';
import { today, fUSD, toUSD } from '@/lib/formatters';
import { TRANSACTION_TYPE_LABELS } from '@/types/enums';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, Textarea } from '@/components/ui/form-elements';
import { FormRow, FormGroup } from '@/components/ui/shared';
import { PartyCombobox, type SelectedParty, type EntityKind } from './PartyCombobox';
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
  const isEdit = !!transaction;
  const { data: files = [] } = useTradeFiles();
  const createTxn = useCreateTransaction();
  const updateTxn = useUpdateTransaction();

  // ── Selected party state (drives customer_id / supplier_id / service_provider_id) ──
  const [selectedParty, setSelectedParty] = useState<SelectedParty | null>(null);
  const [ocrPartyHint, setOcrPartyHint] = useState<string | null>(null);

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
      notes: '',
    },
  });

  const { register, handleSubmit, formState: { errors }, reset, control, setValue } = form;

  // ── Populate form when modal opens ───────────────────────────────────────
  useEffect(() => {
    if (!open) return;
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
        notes: transaction.notes,
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
        description: '',
        reference_no: '',
        notes: '',
        trade_file_id: defaultTradeFileId ?? '',
        customer_id: '',
        supplier_id: '',
        service_provider_id: '',
        party_name: '',
      });
      setSelectedParty(null);
    }
  }, [open, transaction, defaultType, defaultTradeFileId, reset]);

  const txnType = useWatch({ control, name: 'transaction_type' });
  const currency = useWatch({ control, name: 'currency' });
  const amount = useWatch({ control, name: 'amount' }) ?? 0;
  const rate = useWatch({ control, name: 'exchange_rate' }) ?? 1;
  const paidAmount = useWatch({ control, name: 'paid_amount' }) ?? 0;

  const isTRY = currency === 'TRY';
  const usdEquivalent = toUSD(amount, currency as 'USD', rate);

  // Auto payment status
  useEffect(() => {
    if (paidAmount <= 0) setValue('payment_status', 'open');
    else if (paidAmount >= amount) setValue('payment_status', 'paid');
    else setValue('payment_status', 'partial');
  }, [paidAmount, amount, setValue]);

  // ── Handle party selection ────────────────────────────────────────────────
  function handlePartyChange(party: SelectedParty | null) {
    setSelectedParty(party);
    // Clear all FK fields first
    setValue('customer_id', '');
    setValue('supplier_id', '');
    setValue('service_provider_id', '');
    setValue('party_name', '');
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
    // Derive party_type from selected party
    const typeToParty: Record<string, TransactionFormData['party_type']> = {
      svc_inv: 'service_provider',
      purchase_inv: 'supplier',
      receipt: 'customer',
      payment: (selectedParty?.entityType as TransactionFormData['party_type']) ?? 'other',
    };
    data.party_type = typeToParty[data.transaction_type];

    if (isEdit && transaction) {
      await updateTxn.mutateAsync({ id: transaction.id, data });
    } else {
      await createTxn.mutateAsync(data);
    }
    onOpenChange(false);
  }

  function handleOcrResult(result: OcrResult) {
    const currencies = ['USD', 'EUR', 'TRY'];
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
    svc_inv: 'Service Provider',
    purchase_inv: 'Supplier',
    receipt: 'Customer',
    payment: 'Payee',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{isEdit ? 'Edit Transaction' : 'New Transaction'}</DialogTitle>
            <div className="flex gap-1.5">
              <SmartFill mode="transaction" onResult={handleOcrResult} formName="Transaction" />
              {!isEdit && <OcrButton mode="transaction" onResult={handleOcrResult} />}
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <FormRow>
            <FormGroup label="Transaction Type *" error={errors.transaction_type?.message}>
              <NativeSelect {...register('transaction_type')}>
                {Object.entries(TRANSACTION_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </NativeSelect>
            </FormGroup>
            <FormGroup label="Date *" error={errors.transaction_date?.message}>
              <Input type="date" {...register('transaction_date')} />
            </FormGroup>
          </FormRow>

          <FormGroup label="Trade File (optional)" className="mb-2.5">
            <NativeSelect {...register('trade_file_id')}>
              <option value="">— Select file —</option>
              {files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.file_no} – {f.customer?.name ?? ''}
                </option>
              ))}
            </NativeSelect>
          </FormGroup>

          {/* Unified party picker for all transaction types */}
          <FormGroup label={partyLabel[txnType] ?? 'Party'} className="mb-2.5">
            {ocrPartyHint && (
              <div className="flex items-center justify-between bg-brand-50 border border-brand-200 rounded-lg px-2.5 py-1.5 mb-1.5 text-xs">
                <span>OCR detected: <strong>{ocrPartyHint}</strong> — please select below</span>
                <button type="button" onClick={() => setOcrPartyHint(null)} className="text-muted-foreground hover:text-foreground ml-2">✕</button>
              </div>
            )}
            <PartyCombobox
              value={selectedParty}
              onChange={handlePartyChange}
              filter={partyFilter(txnType)}
              placeholder={`Search ${(partyLabel[txnType] ?? 'party').toLowerCase()}…`}
            />
          </FormGroup>

          <FormRow>
            <FormGroup label="Description *" error={errors.description?.message}>
              <Input {...register('description')} placeholder="e.g. Mersin customs fee" />
            </FormGroup>
            <FormGroup label="Reference No.">
              <Input {...register('reference_no')} />
            </FormGroup>
          </FormRow>

          <FormRow cols={isTRY ? 3 : 2}>
            <FormGroup label="Currency">
              <NativeSelect {...register('currency')}>
                <option value="USD">USD</option>
                <option value="TRY">TRY</option>
              </NativeSelect>
            </FormGroup>
            <FormGroup label="Amount *" error={errors.amount?.message}>
              <Input type="number" step="0.01" {...register('amount')} />
            </FormGroup>
            {isTRY && (
              <FormGroup label="USD/TRY Rate">
                <Input type="number" step="0.01" {...register('exchange_rate')} placeholder="e.g. 32.5" />
              </FormGroup>
            )}
          </FormRow>

          {isTRY && (
            <div className="bg-brand-50 rounded-lg px-3 py-2 mb-2.5 text-xs">
              USD equivalent: <strong className="text-brand-600">{fUSD(usdEquivalent)}</strong>
            </div>
          )}

          <FormRow>
            <FormGroup label="Paid Amount">
              <Input type="number" step="0.01" {...register('paid_amount')} />
            </FormGroup>
            <FormGroup label="Payment Status">
              <NativeSelect {...register('payment_status')}>
                <option value="open">Open</option>
                <option value="partial">Partially Paid</option>
                <option value="paid">Fully Paid</option>
              </NativeSelect>
            </FormGroup>
          </FormRow>

          <FormGroup label="Notes" className="mb-2">
            <Textarea rows={2} {...register('notes')} />
          </FormGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTxn.isPending || updateTxn.isPending}>
              {isEdit ? 'Update' : 'Save Transaction'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
