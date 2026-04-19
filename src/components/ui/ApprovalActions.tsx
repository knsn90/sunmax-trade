import { useState } from 'react';
import { Check, X, RotateCcw } from 'lucide-react';
import { useSetDocStatus, useCanApprove } from '@/hooks/useApproval';
import type { DocStatus } from '@/types/database';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

type ApprovableTable = 'invoices' | 'proformas' | 'packing_lists' | 'transactions';

interface Props {
  table: ApprovableTable;
  id: string;
  currentStatus: DocStatus;
}

const CONFIRM_META = {
  approve: {
    title: 'Kaydı Onayla',
    message: 'Bu kaydı onaylamak istediğinizden emin misiniz?',
    buttonLabel: 'Onayla',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
  reject: {
    title: 'Kaydı Reddet',
    message: 'Bu kaydı reddetmek istediğinizden emin misiniz?',
    buttonLabel: 'Reddet',
    buttonClass: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  revert: {
    title: 'Taslağa Döndür',
    message: 'Bu kaydı taslağa döndürmek istediğinizden emin misiniz? Kayıt tekrar düzenlenebilir hale gelecek.',
    buttonLabel: 'Taslağa Döndür',
    buttonClass: 'bg-gray-700 hover:bg-gray-800 text-white',
  },
} as const;

export function ApprovalActions({ table, id, currentStatus }: Props) {
  const canApprove = useCanApprove();
  const setStatus = useSetDocStatus(table);
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | 'revert' | null>(null);

  if (!canApprove) return null;

  const pending = setStatus.isPending;

  function handleConfirm() {
    if (!pendingAction) return;
    const statusMap = { approve: 'approved', reject: 'rejected', revert: 'draft' } as const;
    setStatus.mutate({ id, status: statusMap[pendingAction] });
    setPendingAction(null);
  }

  const meta = pendingAction ? CONFIRM_META[pendingAction] : null;

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

      <Dialog open={!!pendingAction} onOpenChange={(o) => { if (!o) setPendingAction(null); }}>
        <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="text-[15px] font-bold">{meta?.title}</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-gray-500">{meta?.message}</p>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setPendingAction(null)}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              İptal
            </button>
            <button
              onClick={handleConfirm}
              disabled={pending}
              className={`px-4 py-2 rounded-xl text-[12px] font-semibold transition-colors disabled:opacity-50 ${meta?.buttonClass}`}
            >
              {pending ? '…' : meta?.buttonLabel}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
