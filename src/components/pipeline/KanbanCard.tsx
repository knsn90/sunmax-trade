import type { TradeFile } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/form-elements';
import { fN, fDate } from '@/lib/formatters';

interface KanbanCardProps {
  file: TradeFile;
  onDetail: (id: string) => void;
  onToSale?: (id: string) => void;
  onDelivery?: (id: string) => void;
  onDelete?: (id: string) => void;
  onInvoice?: (id: string) => void;
  onPackingList?: (id: string) => void;
  onProforma?: (id: string) => void;
  onPnl?: (id: string) => void;
}

export function KanbanCard({
  file,
  onDetail,
  onToSale,
  onDelivery,
  onDelete,
  onInvoice,
  onPackingList,
  onProforma,
  onPnl,
}: KanbanCardProps) {
  const isSaleOrDel = file.status === 'sale' || file.status === 'delivery';

  return (
    <div
      className="bg-white rounded-lg border border-border p-3 mb-2 cursor-pointer transition hover:shadow-md hover:border-brand-500"
      onClick={() => onDetail(file.id)}
    >
      <div className="text-[11px] font-bold text-brand-500">{file.file_no}</div>
      <div className="font-semibold text-xs mt-0.5">
        {file.customer?.name ?? 'Unknown'}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {file.product?.name ?? 'Unknown'}
      </div>
      {file.tonnage_mt > 0 && (
        <div className="text-xs font-bold text-blue-700 mt-1">
          {fN(file.tonnage_mt, 3)} MT
        </div>
      )}
      <div className="text-[10px] text-gray-400 mt-0.5">{fDate(file.file_date)}</div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
        <Button variant="outline" size="xs" onClick={() => onDetail(file.id)}>
          Detail
        </Button>

        {file.status === 'request' && (
          <>
            {onToSale && (
              <Button size="xs" onClick={() => onToSale(file.id)}>
                → Sale
              </Button>
            )}
            {onDelete && (
              <Button variant="destructive" size="xs" onClick={() => onDelete(file.id)}>
                Del
              </Button>
            )}
          </>
        )}

        {isSaleOrDel && (
          <>
            {file.status === 'sale' && onDelivery && (
              <Button variant="purple" size="xs" onClick={() => onDelivery(file.id)}>
                {file.delivered_admt ? 'Edit Del' : '+ Delivery'}
              </Button>
            )}
            {onProforma && (
              <Button size="xs" onClick={() => onProforma(file.id)}>
                Proforma
              </Button>
            )}
            {onInvoice && (
              <Button variant="secondary" size="xs" onClick={() => onInvoice(file.id)}>
                Invoice
              </Button>
            )}
            {onPackingList && (
              <Button variant="edit" size="xs" onClick={() => onPackingList(file.id)}>
                Packing
              </Button>
            )}
            {onPnl && (
              <Button variant="purple" size="xs" onClick={() => onPnl(file.id)}>
                P&L
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Kanban Column ──────────────────────────────────────────────────────────

interface KanbanColumnProps {
  title: string;
  emoji: string;
  count: number;
  variant: 'request' | 'sale' | 'delivery';
  children: React.ReactNode;
}

export function KanbanColumn({ title, emoji, count, variant, children }: KanbanColumnProps) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 min-h-[300px]">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {emoji} {title}
        </span>
        <Badge variant={variant}>{count}</Badge>
      </div>
      {children}
    </div>
  );
}
