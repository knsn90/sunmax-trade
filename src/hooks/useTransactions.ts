import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transactionService, type TransactionFilters, PAGE_SIZE } from '@/services/transactionService';
import { supabase } from '@/services/supabase';
import type { TransactionFormData } from '@/types/forms';
import { toast } from 'sonner';

/** Infinite / paginated hook — use for buy / svc / cash / sale tabs */
export function useInfiniteTransactions(filters: TransactionFilters) {
  return useInfiniteQuery({
    queryKey: ['transactions', 'infinite', filters],
    queryFn: ({ pageParam }) =>
      transactionService.listPage(filters, pageParam as number, PAGE_SIZE),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + p.data.length, 0);
      return loaded < lastPage.count ? allPages.length : undefined;
    },
    initialPageParam: 0,
  });
}

export function useTransactions(filters?: TransactionFilters) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => transactionService.list(filters),
    retry: false,
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
  approvedOnly = false,
) {
  return useQuery({
    queryKey: ['transactions', 'entity-enhanced', entityType, entityId, approvedOnly],
    queryFn: () => transactionService.listByEntityEnhanced(entityType, entityId!, approvedOnly),
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

export function useFlagTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, flagged, flag_note }: { id: string; flagged: boolean; flag_note: string }) => {
      const { error } = await supabase
        .from('transactions')
        .update({ flagged, flag_note: flag_note || null })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(vars.flagged ? 'Sorunlu olarak işaretlendi' : 'İşaret kaldırıldı');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
