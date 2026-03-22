import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { approvalService } from '@/services/approvalService';
import { useAuth } from '@/hooks/useAuth';
import type { DocStatus } from '@/types/database';

type ApprovableTable = 'invoices' | 'proformas' | 'packing_lists';

const QUERY_KEY_MAP: Record<ApprovableTable, string[]> = {
  invoices: ['invoices', 'sale-invoices'],
  proformas: ['proformas'],
  packing_lists: ['packing-lists'],
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

/** Returns true if current user can approve/reject documents */
export function useCanApprove(): boolean {
  const { profile } = useAuth();
  return profile?.role === 'admin' || profile?.role === 'manager';
}
