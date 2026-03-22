import type { DocStatus } from '@/types/database';

interface Props {
  status: DocStatus;
  size?: 'xs' | 'sm';
}

const CONFIG: Record<DocStatus, { label: string; cls: string }> = {
  draft:    { label: 'DRAFT',    cls: 'bg-amber-100 text-amber-700 border border-amber-300' },
  approved: { label: 'Approved', cls: 'bg-green-100 text-green-700 border border-green-300' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700 border border-red-300' },
};

export function DocStatusBadge({ status, size = 'xs' }: Props) {
  const { label, cls } = CONFIG[status] ?? CONFIG.draft;
  const sz = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';
  return (
    <span className={`inline-flex items-center rounded font-semibold ${sz} ${cls}`}>
      {label}
    </span>
  );
}
