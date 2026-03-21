import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { proformaService } from '@/services/proformaService';
import type { ProformaFormData } from '@/types/forms';
import { tradeFileKeys } from './useTradeFiles';
import { toast } from 'sonner';

export function useProformas() {
  return useQuery({
    queryKey: ['proformas'],
    queryFn: () => proformaService.list(),
  });
}

export function useProformasByTradeFile(tradeFileId: string | undefined) {
  return useQuery({
    queryKey: ['proformas', 'by-file', tradeFileId],
    queryFn: () => proformaService.listByTradeFile(tradeFileId!),
    enabled: !!tradeFileId,
  });
}

export function useCreateProforma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { tradeFileId: string; proformaNo: string; data: ProformaFormData }) =>
      proformaService.create(params.tradeFileId, params.proformaNo, params.data),
    onSuccess: (pi) => {
      qc.invalidateQueries({ queryKey: ['proformas'] });
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success(`Proforma ${pi.proforma_no} created`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateProforma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProformaFormData }) =>
      proformaService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proformas'] });
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success('Proforma updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteProforma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => proformaService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proformas'] });
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success('Proforma deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
