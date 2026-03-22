import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTradeFiles, useDeleteTradeFile } from '@/hooks/useTradeFiles';
import { useAuth } from '@/hooks/useAuth';
import { canWrite } from '@/lib/permissions';
import { fN, fDate } from '@/lib/formatters';
import { TRADE_FILE_STATUS_LABELS } from '@/types/enums';
import type { TradeFileStatus } from '@/types/enums';
import { NewFileModal } from '@/components/trade-files/NewFileModal';
import { PageHeader, LoadingSpinner, EmptyState, Card } from '@/components/ui/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/form-elements';

export function TradeFilesPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const writable = canWrite(profile?.role);
  const [search, setSearch] = useState('');
  const [newFileOpen, setNewFileOpen] = useState(false);
  const { data: files = [], isLoading } = useTradeFiles({ search: search || undefined });
  const deleteFile = useDeleteTradeFile();

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      <PageHeader title="All Files">
        <Input placeholder="Search files…" className="w-full sm:w-[200px]" value={search} onChange={(e) => setSearch(e.target.value)} />
        {writable && <Button onClick={() => setNewFileOpen(true)}>+ New File</Button>}
      </PageHeader>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr>
                {['File No', 'Date', 'Customer', 'Product', 'Tonnage', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-2.5 py-2 text-left text-2xs font-bold uppercase text-muted-foreground border-b-2 border-border bg-gray-50">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {files.length === 0 ? (
                <tr><td colSpan={7}><EmptyState message="No files yet. Click + New File to start." /></td></tr>
              ) : (
                files.map((f) => (
                  <tr key={f.id} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => navigate(`/files/${f.id}`)}>
                    <td className="px-2.5 py-2 text-xs font-bold border-b border-border">{f.file_no}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{fDate(f.file_date)}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{f.customer?.name ?? '—'}</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">{f.product?.name ?? '—'}</td>
                    <td className="px-2.5 py-2 text-xs font-bold text-brand-500 border-b border-border">{fN(f.tonnage_mt, 3)} MT</td>
                    <td className="px-2.5 py-2 text-xs border-b border-border">
                      <Badge variant={f.status as TradeFileStatus}>{TRADE_FILE_STATUS_LABELS[f.status]}</Badge>
                    </td>
                    <td className="px-2.5 py-2 text-xs border-b border-border" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1 flex-wrap">
                        <Button variant="edit" size="xs" onClick={() => navigate(`/files/${f.id}`)}>Detail</Button>
                        {f.status === 'request' && writable && (
                          <Button variant="destructive" size="xs" onClick={() => { if (window.confirm('Delete this file?')) deleteFile.mutate(f.id); }}>Del</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <NewFileModal open={newFileOpen} onOpenChange={setNewFileOpen} />
    </>
  );
}
