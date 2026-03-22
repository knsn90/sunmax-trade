import { Check, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  if (currentStatus === 'draft') {
    return (
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="xs"
          className="text-green-700 border-green-300 hover:bg-green-50"
          onClick={() => setStatus.mutate({ id, status: 'approved' })}
          disabled={setStatus.isPending}
        >
          <Check className="h-3 w-3 mr-0.5" /> Approve
        </Button>
        <Button
          variant="outline"
          size="xs"
          className="text-red-600 border-red-300 hover:bg-red-50"
          onClick={() => setStatus.mutate({ id, status: 'rejected' })}
          disabled={setStatus.isPending}
        >
          <X className="h-3 w-3 mr-0.5" /> Reject
        </Button>
      </div>
    );
  }

  if (currentStatus === 'rejected') {
    return (
      <Button
        variant="outline"
        size="xs"
        className="text-amber-600 border-amber-300 hover:bg-amber-50"
        onClick={() => setStatus.mutate({ id, status: 'draft' })}
        disabled={setStatus.isPending}
      >
        <RotateCcw className="h-3 w-3 mr-0.5" /> To Draft
      </Button>
    );
  }

  // approved — admin can revert
  return (
    <Button
      variant="outline"
      size="xs"
      className="text-muted-foreground"
      onClick={() => {
        if (window.confirm('Revert to draft? Document will become editable again.')) {
          setStatus.mutate({ id, status: 'draft' });
        }
      }}
      disabled={setStatus.isPending}
    >
      <RotateCcw className="h-3 w-3 mr-0.5" /> Revert
    </Button>
  );
}
