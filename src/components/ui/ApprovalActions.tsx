import { Check, X, RotateCcw } from 'lucide-react';
import { useSetDocStatus, useCanApprove } from '@/hooks/useApproval';
import type { DocStatus } from '@/types/database';

type ApprovableTable = 'invoices' | 'proformas' | 'packing_lists' | 'transactions';

interface Props {
  table: ApprovableTable;
  id: string;
  currentStatus: DocStatus;
}

export function ApprovalActions({ table, id, currentStatus }: Props) {
  const canApprove = useCanApprove();
  const setStatus = useSetDocStatus(table);

  if (!canApprove) return null;

  const pending = setStatus.isPending;

  if (currentStatus === 'draft') {
    return (
      <>
        <button
          onClick={(e) => { e.stopPropagation(); setStatus.mutate({ id, status: 'approved' }); }}
          disabled={pending}
          title="Onayla"
          className="p-1 rounded-lg text-gray-300 hover:text-emerald-500 hover:bg-emerald-50 transition-colors disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setStatus.mutate({ id, status: 'rejected' }); }}
          disabled={pending}
          title="Reddet"
          className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </>
    );
  }

  if (currentStatus === 'rejected') {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setStatus.mutate({ id, status: 'draft' }); }}
        disabled={pending}
        title="Taslağa Döndür"
        className="p-1 rounded-lg text-gray-300 hover:text-amber-500 hover:bg-amber-50 transition-colors disabled:opacity-50"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (window.confirm('Revert to draft? Document will become editable again.'))
          setStatus.mutate({ id, status: 'draft' });
      }}
      disabled={pending}
      title="Taslağa Döndür"
      className="p-1 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50"
    >
      <RotateCcw className="h-3.5 w-3.5" />
    </button>
  );
}
