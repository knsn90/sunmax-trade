import { useState } from 'react';
import { Check, X, RotateCcw } from 'lucide-react';
import { useSetDocStatus, useCanApprove } from '@/hooks/useApproval';
import { ApproveWithPasswordDialog } from '@/components/ui/ApproveWithPasswordDialog';
import type { DocStatus } from '@/types/database';

type ApprovableTable = 'invoices' | 'proformas' | 'packing_lists' | 'transactions';

const PASSWORD_PROTECTED: ApprovableTable[] = ['invoices', 'proformas', 'packing_lists'];

interface Props {
  table: ApprovableTable;
  id: string;
  currentStatus: DocStatus;
}

export function ApprovalActions({ table, id, currentStatus }: Props) {
  const canApprove = useCanApprove();
  const setStatus = useSetDocStatus(table);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);

  if (!canApprove) return null;

  const needsPassword = PASSWORD_PROTECTED.includes(table);
  const pending = setStatus.isPending;

  function handleApproveClick() {
    if (needsPassword) setShowPasswordDialog(true);
    else setStatus.mutate({ id, status: 'approved' });
  }

  if (currentStatus === 'draft') {
    return (
      <>
        <ApproveWithPasswordDialog
          open={showPasswordDialog}
          onClose={() => setShowPasswordDialog(false)}
          onConfirm={() => { setShowPasswordDialog(false); setStatus.mutate({ id, status: 'approved' }); }}
          isPending={pending}
        />
        <button
          onClick={handleApproveClick}
          disabled={pending}
          title="Approve"
          className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setStatus.mutate({ id, status: 'rejected' })}
          disabled={pending}
          title="Reject"
          className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </>
    );
  }

  if (currentStatus === 'rejected') {
    return (
      <button
        onClick={() => setStatus.mutate({ id, status: 'draft' })}
        disabled={pending}
        title="Reset to Draft"
        className="p-1.5 rounded-lg bg-amber-50 text-amber-500 hover:bg-amber-100 border border-amber-200 transition-colors disabled:opacity-50"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <button
      onClick={() => {
        if (window.confirm('Revert to draft? Document will become editable again.'))
          setStatus.mutate({ id, status: 'draft' });
      }}
      disabled={pending}
      title="Revert to Draft"
      className="p-1.5 rounded-lg bg-gray-100 text-gray-400 hover:bg-gray-200 border border-gray-200 transition-colors disabled:opacity-50"
    >
      <RotateCcw className="h-3.5 w-3.5" />
    </button>
  );
}
