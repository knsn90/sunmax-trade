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

  function handlePasswordConfirm() {
    setShowPasswordDialog(false);
    setStatus.mutate({ id, status: 'approved' });
  }

  if (currentStatus === 'draft') {
    return (
      <>
        <ApproveWithPasswordDialog
          open={showPasswordDialog}
          onClose={() => setShowPasswordDialog(false)}
          onConfirm={handlePasswordConfirm}
          isPending={pending}
        />
        {/* Approve */}
        <button
          onClick={handleApproveClick}
          disabled={pending}
          title="Approve"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold
            bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200
            transition-colors disabled:opacity-50"
        >
          <Check className="h-3 w-3" />
          Approve
        </button>
        {/* Reject */}
        <button
          onClick={() => setStatus.mutate({ id, status: 'rejected' })}
          disabled={pending}
          title="Reject"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold
            bg-red-50 text-red-600 hover:bg-red-100 border border-red-200
            transition-colors disabled:opacity-50"
        >
          <X className="h-3 w-3" />
          Reject
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
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold
          bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200
          transition-colors disabled:opacity-50"
      >
        <RotateCcw className="h-3 w-3" />
        To Draft
      </button>
    );
  }

  // approved — revert
  return (
    <button
      onClick={() => {
        if (window.confirm('Revert to draft? Document will become editable again.'))
          setStatus.mutate({ id, status: 'draft' });
      }}
      disabled={pending}
      title="Revert to Draft"
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold
        bg-gray-100 text-gray-500 hover:bg-gray-200 border border-gray-200
        transition-colors disabled:opacity-50"
    >
      <RotateCcw className="h-3 w-3" />
      Revert
    </button>
  );
}
