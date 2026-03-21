import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTradeFiles, useDeleteTradeFile } from '@/hooks/useTradeFiles';
import { useAuth } from '@/hooks/useAuth';
import { canWrite } from '@/lib/permissions';
import { KanbanCard, KanbanColumn } from '@/components/pipeline/KanbanCard';
import { PnlModal } from '@/components/pipeline/PnlModal';
import { NewFileModal } from '@/components/trade-files/NewFileModal';
import { ToSaleModal } from '@/components/trade-files/ToSaleModal';
import { DeliveryModal } from '@/components/trade-files/DeliveryModal';
import { InvoiceModal } from '@/components/documents/InvoiceModal';
import { ProformaModal } from '@/components/documents/ProformaModal';
import { PackingListModal } from '@/components/documents/PackingListModal';
import { PageHeader, LoadingSpinner } from '@/components/ui/shared';
import { Button } from '@/components/ui/button';
import type { TradeFile } from '@/types/database';

export function PipelinePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: files = [], isLoading } = useTradeFiles();
  const deleteFile = useDeleteTradeFile();
  const writable = canWrite(profile?.role);

  const [newFileOpen, setNewFileOpen] = useState(false);
  const [saleFile, setSaleFile] = useState<TradeFile | null>(null);
  const [deliveryFile, setDeliveryFile] = useState<TradeFile | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<TradeFile | null>(null);
  const [proformaFile, setProformaFile] = useState<TradeFile | null>(null);
  const [packingFile, setPackingFile] = useState<TradeFile | null>(null);
  const [pnlFileId, setPnlFileId] = useState<string | null>(null);

  const columns = useMemo(() => ({
    request: files.filter((f) => f.status === 'request'),
    sale: files.filter((f) => f.status === 'sale'),
    delivery: files.filter((f) => f.status === 'delivery'),
  }), [files]);

  const findFile = (id: string) => files.find((x) => x.id === id) ?? null;

  function handleDelete(id: string) {
    if (window.confirm('Delete this file?')) deleteFile.mutate(id);
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      <PageHeader title="Pipeline">
        <div className="text-xs text-muted-foreground mr-3">Use buttons to progress files</div>
        {writable && <Button onClick={() => setNewFileOpen(true)}>+ New File</Button>}
      </PageHeader>

      <div className="grid grid-cols-3 gap-4">
        <KanbanColumn title="Request" emoji="📋" count={columns.request.length} variant="request">
          {columns.request.map((f) => (
            <KanbanCard key={f.id} file={f}
              onDetail={(id) => navigate(`/files/${id}`)}
              onToSale={writable ? (id) => setSaleFile(findFile(id)) : undefined}
              onDelete={writable ? handleDelete : undefined}
            />
          ))}
        </KanbanColumn>

        <KanbanColumn title="Sale" emoji="🤝" count={columns.sale.length} variant="sale">
          {columns.sale.map((f) => (
            <KanbanCard key={f.id} file={f}
              onDetail={(id) => navigate(`/files/${id}`)}
              onDelivery={writable ? (id) => setDeliveryFile(findFile(id)) : undefined}
              onInvoice={writable ? (id) => setInvoiceFile(findFile(id)) : undefined}
              onProforma={writable ? (id) => setProformaFile(findFile(id)) : undefined}
              onPackingList={writable ? (id) => setPackingFile(findFile(id)) : undefined}
              onPnl={(id) => setPnlFileId(id)}
            />
          ))}
        </KanbanColumn>

        <KanbanColumn title="Delivery" emoji="🚚" count={columns.delivery.length} variant="delivery">
          {columns.delivery.map((f) => (
            <KanbanCard key={f.id} file={f}
              onDetail={(id) => navigate(`/files/${id}`)}
              onInvoice={writable ? (id) => setInvoiceFile(findFile(id)) : undefined}
              onProforma={writable ? (id) => setProformaFile(findFile(id)) : undefined}
              onPackingList={writable ? (id) => setPackingFile(findFile(id)) : undefined}
              onPnl={(id) => setPnlFileId(id)}
            />
          ))}
        </KanbanColumn>
      </div>

      <NewFileModal open={newFileOpen} onOpenChange={setNewFileOpen} />
      <ToSaleModal open={!!saleFile} onOpenChange={() => setSaleFile(null)} file={saleFile} />
      <DeliveryModal open={!!deliveryFile} onOpenChange={() => setDeliveryFile(null)} file={deliveryFile} />
      <InvoiceModal open={!!invoiceFile} onOpenChange={() => setInvoiceFile(null)} file={invoiceFile} />
      <ProformaModal open={!!proformaFile} onOpenChange={() => setProformaFile(null)} file={proformaFile} />
      <PackingListModal open={!!packingFile} onOpenChange={() => setPackingFile(null)} file={packingFile} />
      <PnlModal open={!!pnlFileId} onOpenChange={(v) => { if (!v) setPnlFileId(null); }} fileId={pnlFileId} />
    </>
  );
}
