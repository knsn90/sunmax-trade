import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { tradeFileService } from '@/services/tradeFileService';
import type { TradeFile } from '@/types/database';
import type { TradeFileStatus } from '@/types/enums';
import type { NewTradeFileFormData, SaleConversionFormData, DeliveryFormData } from '@/types/forms';
import type { PnlData } from '@/types/database';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

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
}, enabled = true) {
  return useQuery({
    queryKey: tradeFileKeys.list(filters),
    queryFn: () => tradeFileService.list(filters),
    enabled,
    staleTime: 1000 * 60 * 2,
  });
}

const PAGE_SIZE_DEFAULT = 25;

/**
 * Sayfalı + filtrelenmiş dosya listesi — TradeFilesPage için.
 * Her sayfa bağımsız cache'lenir; sayfa değişince önceki veri korunur (keepPreviousData).
 */
export function useTradeFilesPaginated(
  filters?: { status?: TradeFileStatus; customerId?: string; search?: string },
  page = 1,
  pageSize = PAGE_SIZE_DEFAULT,
) {
  return useQuery({
    queryKey: [...tradeFileKeys.lists(), 'paginated', filters, page, pageSize],
    queryFn: () => tradeFileService.listPaginated({ ...filters, page, pageSize }),
    staleTime: 1000 * 60 * 2,
    placeholderData: keepPreviousData,
  });
}

/** Tüm dosyalar — alt partiler (batch) dahil. Fatura modallarında dosya seçimi için. */
export function useAllTradeFiles(statuses?: TradeFileStatus[]) {
  return useQuery({
    queryKey: ['trade-files', 'all-with-batches', statuses],
    queryFn: () => tradeFileService.listAll(statuses),
    staleTime: 1000 * 60 * 2,
  });
}

export function useTradeFile(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: tradeFileKeys.detail(id!),
    queryFn: () => tradeFileService.getById(id!),
    enabled: !!id,
    staleTime: 1000 * 60 * 2,
    // Show list-cache data instantly while full detail loads in background
    initialData: (): TradeFile | undefined => {
      const lists = qc.getQueriesData<TradeFile[] | { data: TradeFile[]; count: number }>({ queryKey: tradeFileKeys.lists() });
      for (const [, data] of lists) {
        // listPaginated { data, count } veya düz dizi olabilir
        const arr = Array.isArray(data) ? data : (data as { data: TradeFile[] } | undefined)?.data;
        const found = arr?.find(f => f.id === id);
        if (found) return found;
      }
      return undefined;
    },
    initialDataUpdatedAt: () => 0,
  });
}

export function useCreateTradeFile() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: (data: NewTradeFileFormData & { file_no: string; parent_file_id?: string | null; batch_no?: number | null; initialStatus?: import('@/types/enums').TradeFileStatus }) =>
      tradeFileService.create({ ...data, tenantId: profile?.tenant_id ?? null }),
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

export function useDeleteTradeFileWithChoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, keepDocuments }: { id: string; keepDocuments: boolean }) =>
      tradeFileService.deleteWithChoice(id, keepDocuments),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success('Dosya silindi');
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
    mutationFn: ({ id, status, cancelReason }: { id: string; status: TradeFileStatus; cancelReason?: string }) =>
      tradeFileService.changeStatus(id, status, cancelReason),
    onSuccess: (file) => {
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success(`Durum değiştirildi: ${file.status}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Durum güncellenemedi');
    },
  });
}
