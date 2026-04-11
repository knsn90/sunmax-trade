import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { approvalService } from '@/services/approvalService';
import { useAuth } from '@/hooks/useAuth';
import type { DocStatus } from '@/types/database';

type ApprovableTable = 'invoices' | 'proformas' | 'packing_lists' | 'transactions';

const QUERY_KEY_MAP: Record<ApprovableTable, string[]> = {
  invoices: ['invoices', 'sale-invoices'],
  proformas: ['proformas'],
  packing_lists: ['packing-lists'],
  transactions: ['transactions'],
};

export function useSetDocStatus(table: ApprovableTable) {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: DocStatus }) =>
      approvalService.setStatus(table, id, status, profile?.id),
    onSuccess: (_, { status }) => {
      QUERY_KEY_MAP[table].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
      qc.invalidateQueries({ queryKey: ['trade-files'] });
      const label =
        status === 'approved' ? '✅ Approved' :
        status === 'rejected' ? '❌ Rejected' :
        '🔄 Reverted to Draft';
      toast.success(label);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useBulkSetDocStatus(table: ApprovableTable) {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: DocStatus }) =>
      approvalService.bulkSetStatus(table, ids, status, profile?.id),
    onSuccess: (_, { ids, status }) => {
      QUERY_KEY_MAP[table].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
      qc.invalidateQueries({ queryKey: ['trade-files'] });
      const label =
        status === 'approved' ? `✅ ${ids.length} kayıt onaylandı` :
        status === 'rejected' ? `❌ ${ids.length} kayıt reddedildi` :
        `🔄 ${ids.length} kayıt taslağa döndürüldü`;
      toast.success(label);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/** Returns true if current user can approve/reject documents */
export function useCanApprove(): boolean {
  const { profile } = useAuth();
  return profile?.role === 'admin' || profile?.role === 'manager';
}
