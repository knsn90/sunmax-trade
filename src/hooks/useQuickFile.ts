import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { quickFileService, type QuickFileInput } from '@/services/quickFileService';
import { useAuth } from '@/hooks/useAuth';
import { tradeFileKeys } from './useTradeFiles';

export function useCreateQuickFile() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: (data: QuickFileInput) =>
      quickFileService.createQuickFile(data, profile?.tenant_id ?? null),
    onSuccess: (file) => {
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(`Dosya ${file.file_no} oluşturuldu`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
