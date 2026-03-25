import type { DocStatus } from '@/types/database';

interface Props {
  status: DocStatus;
  size?: 'xs' | 'sm';
}

const CONFIG: Record<DocStatus, { label: string; dot: string; cls: string }> = {
  draft:    { label: 'Draft',    dot: 'bg-amber-400',  cls: 'bg-amber-50  text-amber-600  border border-amber-200' },
  approved: { label: 'Approved', dot: 'bg-emerald-500', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  rejected: { label: 'Rejected', dot: 'bg-red-500',    cls: 'bg-red-50    text-red-600    border border-red-200' },
};

export function DocStatusBadge({ status, size = 'xs' }: Props) {
  const { label, dot, cls } = CONFIG[status] ?? CONFIG.draft;
  const sz = size === 'xs' ? 'text-[10px] px-1.5 py-0.5 gap-1' : 'text-xs px-2 py-1 gap-1.5';
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${sz} ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {label}
    </span>
  );
}
