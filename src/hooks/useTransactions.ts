import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transactionService, type TransactionFilters } from '@/services/transactionService';
import type { TransactionFormData } from '@/types/forms';
import { toast } from 'sonner';

export function useTransactions(filters?: TransactionFilters) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => transactionService.list(filters),
  });
}

export function useTransactionsByEntity(
  entityType: 'customer' | 'supplier' | 'service_provider',
  entityId: string | undefined,
) {
  return useQuery({
    queryKey: ['transactions', 'entity', entityType, entityId],
    queryFn: () => transactionService.listByEntity(entityType, entityId!),
    enabled: !!entityId,
  });
}

export function useTransactionsByEntityEnhanced(
  entityType: 'customer' | 'supplier' | 'service_provider',
  entityId: string | undefined,
) {
  return useQuery({
    queryKey: ['transactions', 'entity-enhanced', entityType, entityId],
    queryFn: () => transactionService.listByEntityEnhanced(entityType, entityId!),
    enabled: !!entityId,
  });
}

export function useTransactionSummary() {
  return useQuery({
    queryKey: ['transactions', 'summary'],
    queryFn: () => transactionService.getSummary(),
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TransactionFormData) => transactionService.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Transaction saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TransactionFormData }) =>
      transactionService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Transaction updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; amount: number; date: string }) =>
      transactionService.recordPayment(params.id, params.amount, params.date),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Payment recorded');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => transactionService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Transaction deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
