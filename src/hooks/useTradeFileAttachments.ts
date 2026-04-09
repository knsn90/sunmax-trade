import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tradeFileAttachmentsService } from '@/services/tradeFileAttachmentsService';
import { toast } from 'sonner';
import type { TradeFileAttachment } from '@/types/database';

export function useTradeFileAttachments(tradeFileId: string | undefined) {
  return useQuery({
    queryKey: ['trade-file-attachments', tradeFileId],
    queryFn: () => tradeFileAttachmentsService.list(tradeFileId!),
    enabled: !!tradeFileId,
    retry: false,
  });
}

export function useCreateTradeFileAttachment(tradeFileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<TradeFileAttachment, 'id' | 'created_at' | 'created_by'>) =>
      tradeFileAttachmentsService.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trade-file-attachments', tradeFileId] }); },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteTradeFileAttachment(tradeFileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tradeFileAttachmentsService.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trade-file-attachments', tradeFileId] }); },
    onError: (err: Error) => toast.error(err.message),
  });
}
