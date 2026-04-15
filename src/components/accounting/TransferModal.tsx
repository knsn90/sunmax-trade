import { useEffect } from 'react';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useKasalar } from '@/hooks/useKasalar';
import { useBankAccounts } from '@/hooks/useSettings';
import { useCreateTransfer } from '@/hooks/useTransfers';
import { useTheme } from '@/contexts/ThemeContext';
import { today } from '@/lib/formatters';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SmartFill } from '@/components/ui/SmartFill';
import { OcrButton } from '@/components/ui/OcrButton';
import { Calculator } from '@/components/ui/Calculator';
import type { OcrResult } from '@/lib/openai';
import { Input } from '@/components/ui/input';
import { NativeSelect, Textarea, DateInput, NumericInput } from '@/components/ui/form-elements';
import { FormRow, FormGroup } from '@/components/ui/shared';
import { ArrowRight, ArrowLeftRight, Banknote, Landmark } from 'lucide-react';
import { cn } from '@/lib/utils';

const schema = z.object({
  transfer_date: z.string().min(1),
  description: z.string().default(''),
  amount: z.coerce.number().positive('Tutar 0\'dan büyük olmalı'),
  currency: z.string().default('USD'),
  exchange_rate: z.coerce.number().positive().default(1),
  from_type: z.enum(['kasa', 'bank']),
  from_id: z.string().min(1, 'Kaynak hesap seçin'),
  to_type: z.enum(['kasa', 'bank']),
  to_id: z.string().min(1, 'Hedef hesap seçin'),
  reference_no: z.string().default(''),
  notes: z.string().default(''),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const mo = 'bg-gray-100 border-0 focus:ring-0';

export function TransferModal({ open, onOpenChange }: Props) {
  const { accent } = useTheme();
  const { data: kasalar = [] } = useKasalar();
  const { data: bankAccounts = [] } = useBankAccounts();
  const createTransfer = useCreateTransfer();

  const { register, handleSubmit, control, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      transfer_date: today(),
      currency: 'USD',
      exchange_rate: 1,
      from_type: 'kasa',
      to_type: 'bank',
      from_id: '',
      to_id: '',
      description: '',
      reference_no: '',
      notes: '',
    },
  });

  const fromType = useWatch({ control, name: 'from_type' });
  const toType   = useWatch({ control, name: 'to_type' });
  const currency = useWatch({ control, name: 'currency' });
  const amount   = useWatch({ control, name: 'amount' }) ?? 0;
  const rate     = useWatch({ control, name: 'exchange_rate' }) ?? 1;

  useEffect(() => {
    if (open) reset({
      transfer_date: today(),
      currency: 'USD',
      exchange_rate: 1,
      from_type: 'kasa',
      to_type: 'bank',
      from_id: '',
      to_id: '',
      description: '',
      reference_no: '',
      notes: '',
    });
  }, [open, reset]);

  // from_type değişince from_id sıfırla
  useEffect(() => { setValue('from_id', ''); }, [fromType, setValue]);
  useEffect(() => { setValue('to_id', ''); }, [toType, setValue]);

  async function onSubmit(data: FormData) {
    const amount_usd = currency === 'USD'
      ? data.amount
      : rate > 0 ? data.amount / rate : data.amount;
    try {
      await createTransfer.mutateAsync({ ...data, amount_usd });
      onOpenChange(false);
    } catch { /* toast shows error */ }
  }

  const isNonUSD = currency !== 'USD';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle className="flex items-center gap-2 flex-1">
              <ArrowLeftRight className="h-4 w-4" style={{ color: accent }} />
              İç Transfer
            </DialogTitle>
            <div className="flex gap-1.5 shrink-0">
              <Calculator variant="form" />
              <SmartFill mode="transaction" onResult={(_r: OcrResult) => {}} formName="Transfer" iconOnly />
              <OcrButton mode="transaction" onResult={(_r: OcrResult) => {}} iconOnly />
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 py-1">

          {/* Kaynak → Hedef */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
            {/* Kaynak Hesap */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Kaynak Hesap (Çıkış)</div>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                {([
                  { value: 'kasa' as const, label: 'Kasa', Icon: Banknote },
                  { value: 'bank' as const, label: 'Banka', Icon: Landmark },
                ]).map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setValue('from_type', value)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 h-7 rounded-lg text-[11px] font-semibold transition-all',
                      fromType === value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              <NativeSelect {...register('from_id')} className={mo}>
                <option value="">— Hesap seçin —</option>
                {fromType === 'kasa'
                  ? kasalar.map(k => <option key={k.id} value={k.id}>{k.name} ({k.currency})</option>)
                  : bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name}{b.account_name ? ` — ${b.account_name}` : ''}{b.currency ? ` · ${b.currency}` : ''}
                      </option>
                    ))
                }
              </NativeSelect>
              {errors.from_id && (
                <p className="text-[11px] text-red-500">{errors.from_id.message}</p>
              )}
            </div>

            {/* Arrow divider */}
            <div className="pb-2 text-gray-300">
              <ArrowRight className="h-5 w-5" />
            </div>

            {/* Hedef Hesap */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Hedef Hesap (Giriş)</div>
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                {([
                  { value: 'kasa' as const, label: 'Kasa', Icon: Banknote },
                  { value: 'bank' as const, label: 'Banka', Icon: Landmark },
                ]).map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setValue('to_type', value)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 h-7 rounded-lg text-[11px] font-semibold transition-all',
                      toType === value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              <NativeSelect {...register('to_id')} className={mo}>
                <option value="">— Hesap seçin —</option>
                {toType === 'kasa'
                  ? kasalar.map(k => <option key={k.id} value={k.id}>{k.name} ({k.currency})</option>)
                  : bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name}{b.account_name ? ` — ${b.account_name}` : ''}{b.currency ? ` · ${b.currency}` : ''}
                      </option>
                    ))
                }
              </NativeSelect>
              {errors.to_id && (
                <p className="text-[11px] text-red-500">{errors.to_id.message}</p>
              )}
            </div>
          </div>

          {/* Tutar & Para Birimi */}
          <FormRow cols={isNonUSD ? 3 : 2}>
            <FormGroup label="Para Birimi">
              <NativeSelect {...register('currency')} className={mo}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="AED">AED</option>
                <option value="TRY">TRY</option>
                <option value="GBP">GBP</option>
              </NativeSelect>
            </FormGroup>
            <FormGroup label="Tutar *" error={errors.amount?.message}>
              <Controller name="amount" control={control} render={({ field }) => (
                <NumericInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} className={mo} />
              )} />
            </FormGroup>
            {isNonUSD && (
              <FormGroup label="USD Karşılığı">
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-gray-400 pointer-events-none">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={rate > 0 && amount > 0 ? (amount / rate).toFixed(2) : ''}
                    readOnly
                    placeholder="0.00"
                    className="pl-6 bg-blue-50 border-0 focus:ring-0"
                  />
                </div>
              </FormGroup>
            )}
          </FormRow>

          {isNonUSD && (
            <FormGroup label="Kur (yerel/USD)">
              <Controller name="exchange_rate" control={control} render={({ field }) => (
                <NumericInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} className={mo} />
              )} />
            </FormGroup>
          )}

          {/* Tarih & Referans No */}
          <FormRow cols={2}>
            <FormGroup label="Tarih *">
              <Controller
                name="transfer_date"
                control={control}
                render={({ field }) => (
                  <DateInput value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} className={mo} />
                )}
              />
            </FormGroup>
            <FormGroup label="Referans No">
              <Input {...register('reference_no')} placeholder="Tahsilat, dekont no" className={mo} />
            </FormGroup>
          </FormRow>

          <FormGroup label="Açıklama">
            <Input {...register('description')} placeholder="örn. Kasadan Garanti'ye nakit yatırma" className={mo} />
          </FormGroup>

          <FormGroup label="Not">
            <Textarea rows={2} {...register('notes')} className={mo} />
          </FormGroup>

          <div className="flex flex-col md:flex-row md:justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="hidden md:flex h-8 px-4 rounded-lg text-[12px] font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors items-center justify-center"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={createTransfer.isPending}
              className="w-full md:w-auto h-12 md:h-8 px-4 rounded-2xl md:rounded-lg text-[14px] md:text-[12px] font-bold text-white disabled:opacity-50 active:scale-[0.98] transition-all"
              style={{ background: 'linear-gradient(135deg, #b70011 0%, #dc2626 100%)' }}
            >
              {createTransfer.isPending ? 'Kaydediliyor…' : 'Transferi Kaydet'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
