import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transferService, type TransferInput } from '@/services/transferService';
import { toast } from 'sonner';

export function useTransfers() {
  return useQuery({
    queryKey: ['transfers'],
    queryFn: transferService.list,
    retry: false,
  });
}

export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TransferInput) => transferService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      toast.success('Transfer kaydedildi');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => transferService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      toast.success('Transfer silindi');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
