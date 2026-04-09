import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tradeFileNotesService } from '@/services/tradeFileNotesService';
import { toast } from 'sonner';

export function useTradeFileNotes(tradeFileId: string | undefined) {
  return useQuery({
    queryKey: ['trade-file-notes', tradeFileId],
    queryFn: () => tradeFileNotesService.list(tradeFileId!),
    enabled: !!tradeFileId,
    retry: false,
  });
}

export function useCreateTradeFileNote(tradeFileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => tradeFileNotesService.create(tradeFileId, content),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trade-file-notes', tradeFileId] }); },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteTradeFileNote(tradeFileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tradeFileNotesService.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trade-file-notes', tradeFileId] }); },
    onError: (err: Error) => toast.error(err.message),
  });
}
