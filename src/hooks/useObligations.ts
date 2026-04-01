import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { obligationService, type RecordPaymentInput } from '@/services/obligationService';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export function useTradeObligations(tradeFileId: string | undefined) {
  return useQuery({
    queryKey: ['trade-obligations', tradeFileId],
    queryFn: () => obligationService.getByTradeFile(tradeFileId!),
    enabled: !!tradeFileId,
  });
}

export function useRecordObligationPayment() {
  const qc = useQueryClient();
  const { t } = useTranslation('tradeFiles');
  return useMutation({
    mutationFn: (input: RecordPaymentInput) => obligationService.recordPayment(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trade-obligations'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(t('obligations.paymentRecorded'));
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
