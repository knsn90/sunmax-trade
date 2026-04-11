import { useState } from 'react';
import { Check, X, RotateCcw } from 'lucide-react';
import { useSetDocStatus, useCanApprove } from '@/hooks/useApproval';
import { ApproveWithPasswordDialog } from '@/components/ui/ApproveWithPasswordDialog';
import type { DocStatus } from '@/types/database';

type ApprovableTable = 'invoices' | 'proformas' | 'packing_lists' | 'transactions';

const PASSWORD_PROTECTED: ApprovableTable[] = ['invoices', 'proformas', 'packing_lists', 'transactions'];

interface Props {
  table: ApprovableTable;
  id: string;
  currentStatus: DocStatus;
}

export function ApprovalActions({ table, id, currentStatus }: Props) {
  const canApprove = useCanApprove();
  const setStatus = useSetDocStatus(table);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  if (!canApprove) return null;

  const needsPassword = PASSWORD_PROTECTED.includes(table);
  const pending = setStatus.isPending;

  function handleApproveClick() {
    if (needsPassword) setShowApproveDialog(true);
    else setStatus.mutate({ id, status: 'approved' });
  }

  function handleRejectClick() {
    if (needsPassword) setShowRejectDialog(true);
    else setStatus.mutate({ id, status: 'rejected' });
  }

  if (currentStatus === 'draft') {
    return (
      <>
        <ApproveWithPasswordDialog
          open={showApproveDialog}
          onClose={() => setShowApproveDialog(false)}
          onConfirm={() => { setShowApproveDialog(false); setStatus.mutate({ id, status: 'approved' }); }}
          isPending={pending}
          title="Onay Şifresi"
          subtitle="Belgeyi onaylamak için şifrenizi girin"
          buttonLabel="✅ Onayla"
          headerClass="bg-gradient-to-r from-green-600 to-emerald-500"
        />
        <ApproveWithPasswordDialog
          open={showRejectDialog}
          onClose={() => setShowRejectDialog(false)}
          onConfirm={() => { setShowRejectDialog(false); setStatus.mutate({ id, status: 'rejected' }); }}
          isPending={pending}
          title="Red Şifresi"
          subtitle="Belgeyi reddetmek için şifrenizi girin"
          buttonLabel="❌ Reddet"
          headerClass="bg-gradient-to-r from-red-600 to-rose-500"
        />
        <button
          onClick={handleApproveClick}
          disabled={pending}
          title="Onayla"
          className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleRejectClick}
          disabled={pending}
          title="Reddet"
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
