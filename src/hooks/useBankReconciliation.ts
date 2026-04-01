import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bankReconciliationService } from '@/services/bankReconciliationService';
import { toast } from 'sonner';

export function useBankTransactions(status?: string) {
  return useQuery({
    queryKey: ['bank-transactions', status],
    queryFn: () => bankReconciliationService.listBankTransactions(status),
  });
}

export function useBankReconciliationSummary() {
  return useQuery({
    queryKey: ['bank-reconciliation-summary'],
    queryFn: () => bankReconciliationService.getSummary(),
  });
}

export function useCreateBankTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: bankReconciliationService.createBankTransaction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-transactions'] });
      qc.invalidateQueries({ queryKey: ['bank-reconciliation-summary'] });
      toast.success('Bank transaction added');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateBankTxnStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'unmatched' | 'excluded' }) =>
      bankReconciliationService.updateStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-transactions'] });
      qc.invalidateQueries({ queryKey: ['bank-reconciliation-summary'] });
      toast.success('Status updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCreateMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: bankReconciliationService.createMatch,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-transactions'] });
      qc.invalidateQueries({ queryKey: ['bank-reconciliation-summary'] });
      toast.success('Match created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: bankReconciliationService.deleteMatch,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-transactions'] });
      qc.invalidateQueries({ queryKey: ['bank-reconciliation-summary'] });
      toast.success('Match removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
