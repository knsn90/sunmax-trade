import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tradeFileService } from '@/services/tradeFileService';
import type { TradeFileStatus } from '@/types/enums';
import type { NewTradeFileFormData, SaleConversionFormData, DeliveryFormData } from '@/types/forms';
import type { PnlData } from '@/types/database';
import { toast } from 'sonner';

export const tradeFileKeys = {
  all: ['trade-files'] as const,
  lists: () => [...tradeFileKeys.all, 'list'] as const,
  list: (filters?: { status?: TradeFileStatus; search?: string }) =>
    [...tradeFileKeys.lists(), filters] as const,
  details: () => [...tradeFileKeys.all, 'detail'] as const,
  detail: (id: string) => [...tradeFileKeys.details(), id] as const,
};

export function useTradeFiles(filters?: {
  status?: TradeFileStatus;
  customerId?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: tradeFileKeys.list(filters),
    queryFn: () => tradeFileService.list(filters),
  });
}

export function useTradeFile(id: string | undefined) {
  return useQuery({
    queryKey: tradeFileKeys.detail(id!),
    queryFn: () => tradeFileService.getById(id!),
    enabled: !!id,
  });
}

export function useCreateTradeFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: NewTradeFileFormData & { file_no: string }) =>
      tradeFileService.create(data),
    onSuccess: (file) => {
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success(`File ${file.file_no} created`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useConvertToSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SaleConversionFormData }) =>
      tradeFileService.convertToSale(id, data),
    onSuccess: (file) => {
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success(`${file.file_no} converted to sale`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useConvertToDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DeliveryFormData }) =>
      tradeFileService.convertToDelivery(id, data),
    onSuccess: (file) => {
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success(`${file.file_no} delivery recorded`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSavePnl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PnlData }) =>
      tradeFileService.updatePnl(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success('P&L saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteTradeFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tradeFileService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success('File deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateSaleDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SaleConversionFormData }) =>
      tradeFileService.updateSaleDetails(id, data),
    onSuccess: (file) => {
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success(`${file.file_no} sale details updated`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateFileInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: NewTradeFileFormData }) =>
      tradeFileService.updateFileInfo(id, data),
    onSuccess: (file) => {
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success(`${file.file_no} updated`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useNoteDelay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, revised_eta, delay_notes }: { id: string; revised_eta: string; delay_notes?: string }) =>
      tradeFileService.noteDelay(id, { revised_eta, delay_notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success('Delay noted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useChangeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TradeFileStatus }) =>
      tradeFileService.changeStatus(id, status),
    onSuccess: (file) => {
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success(`Status changed to ${file.status}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
