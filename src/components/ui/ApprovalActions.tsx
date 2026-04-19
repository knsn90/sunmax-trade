import { useState } from 'react';
import { Check, X, RotateCcw } from 'lucide-react';
import { useSetDocStatus, useCanApprove } from '@/hooks/useApproval';
import type { DocStatus } from '@/types/database';
import { ApproveWithPasswordDialog } from '@/components/ui/ApproveWithPasswordDialog';

type ApprovableTable = 'invoices' | 'proformas' | 'packing_lists' | 'transactions';

interface Props {
  table: ApprovableTable;
  id: string;
  currentStatus: DocStatus;
}

export function ApprovalActions({ table, id, currentStatus }: Props) {
  const canApprove = useCanApprove();
  const setStatus = useSetDocStatus(table);
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | 'revert' | null>(null);

  if (!canApprove) return null;

  const pending = setStatus.isPending;

  function confirm(action: 'approve' | 'reject' | 'revert') {
    const statusMap = { approve: 'approved', reject: 'rejected', revert: 'draft' } as const;
    setStatus.mutate({ id, status: statusMap[action] });
    setPendingAction(null);
  }

  const dialogConfig = {
    approve: {
      title: 'Onayla',
      subtitle: 'Kaydı onaylamak için şifrenizi girin',
      buttonLabel: '✅ Onayla',
      headerClass: 'bg-gradient-to-r from-green-600 to-emerald-500',
    },
    reject: {
      title: 'Reddet',
      subtitle: 'Kaydı reddetmek için şifrenizi girin',
      buttonLabel: '❌ Reddet',
      headerClass: 'bg-gradient-to-r from-amber-500 to-orange-500',
    },
    revert: {
      title: 'Taslağa Döndür',
      subtitle: 'Kaydı taslağa döndürmek için şifrenizi girin',
      buttonLabel: '↩ Taslağa Döndür',
      headerClass: 'bg-gradient-to-r from-gray-500 to-gray-600',
    },
  } as const;

  return (
    <>
      {currentStatus === 'draft' && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setPendingAction('approve'); }}
            disabled={pending}
            title="Onayla"
            className="p-1 rounded-lg text-gray-300 hover:text-emerald-500 hover:bg-emerald-50 transition-colors disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setPendingAction('reject'); }}
            disabled={pending}
            title="Reddet"
            className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      )}

      {(currentStatus === 'rejected' || currentStatus === 'approved') && (
        <button
          onClick={(e) => { e.stopPropagation(); setPendingAction('revert'); }}
          disabled={pending}
          title="Taslağa Döndür"
          className="p-1 rounded-lg text-gray-300 hover:text-amber-500 hover:bg-amber-50 transition-colors disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}

      {pendingAction && (
        <ApproveWithPasswordDialog
          open
          onClose={() => setPendingAction(null)}
          onConfirm={() => confirm(pendingAction)}
          isPending={pending}
          {...dialogConfig[pendingAction]}
        />
      )}
    </>
  );
}
