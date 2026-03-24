import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transportService } from '@/services/transportService';
import type { TransportPlate } from '@/services/transportService';
import { toast } from 'sonner';

const KEY = (fileId?: string) => ['transport_plan', fileId];

export function useTransportPlan(tradeFileId?: string) {
  return useQuery({
    queryKey: KEY(tradeFileId),
    queryFn: () => transportService.getPlanByFile(tradeFileId!),
    enabled: !!tradeFileId,
  });
}

export function useUpsertPlan(tradeFileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Parameters<typeof transportService.upsertPlan>[1]) =>
      transportService.upsertPlan(tradeFileId, values),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY(tradeFileId) }); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateChecklist(tradeFileId: string, planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (flags: Parameters<typeof transportService.updateChecklist>[1]) =>
      transportService.updateChecklist(planId, flags),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY(tradeFileId) }); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAddPlates(tradeFileId: string, planId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (plateNos: string[]) => transportService.addPlates(planId, plateNos),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY(tradeFileId) });
      toast.success('Plakalar eklendi');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdatePlate(tradeFileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: Partial<TransportPlate> }) =>
      transportService.updatePlate(id, values),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY(tradeFileId) }); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeletePlate(tradeFileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => transportService.deletePlate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY(tradeFileId) }); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpsertNotification(tradeFileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, group, text }: { planId: string; group: string; text: string }) =>
      transportService.upsertNotification(planId, group, text),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY(tradeFileId) }); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useMarkNotifSent(tradeFileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, group, userId }: { planId: string; group: string; userId: string }) =>
      transportService.markSent(planId, group, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY(tradeFileId) });
      toast.success('Gönderildi olarak işaretlendi');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
