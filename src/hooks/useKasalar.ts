import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kasaService } from '@/services/kasaService';
import { toast } from 'sonner';

export const kasaKeys = {
  all: ['kasalar'] as const,
  list: () => [...kasaKeys.all, 'list'] as const,
};

export function useKasalar() {
  return useQuery({ queryKey: kasaKeys.list(), queryFn: kasaService.list, retry: false });
}

export function useCreateKasa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => kasaService.create(input as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kasaKeys.all });
      toast.success('Kasa oluşturuldu');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateKasa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; [k: string]: unknown }) =>
      kasaService.update(id, input as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kasaKeys.all });
      toast.success('Kasa güncellendi');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteKasa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => kasaService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kasaKeys.all });
      toast.success('Kasa silindi');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
