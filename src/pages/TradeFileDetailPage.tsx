import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTradeFile, useChangeStatus } from '@/hooks/useTradeFiles';
import { useAuth } from '@/hooks/useAuth';
import { canWrite } from '@/lib/permissions';
import { fN, fDate, fCurrency, fUSD } from '@/lib/formatters';
import { TRADE_FILE_STATUS_LABELS, TRANSACTION_TYPE_LABELS } from '@/types/enums';
import type { Invoice, PackingList, Proforma } from '@/types/database';
import type { TradeFileStatus } from '@/types/enums';
import { ToSaleModal } from '@/components/trade-files/ToSaleModal';
import { DeliveryModal } from '@/components/trade-files/DeliveryModal';
import { NewFileModal } from '@/components/trade-files/NewFileModal';
import { InvoiceModal } from '@/components/documents/InvoiceModal';
import { ProformaModal } from '@/components/documents/ProformaModal';
import { PackingListModal } from '@/components/documents/PackingListModal';
import { TransactionModal } from '@/components/accounting/TransactionModal';
import { useDeleteInvoice, useDeletePackingList } from '@/hooks/useDocuments';
import { useDeleteProforma } from '@/hooks/useProformas';
import { useSettings, useBankAccounts } from '@/hooks/useSettings';
import { useTransactions } from '@/hooks/useTransactions';
import { printInvoice, printPackingList, printProforma } from '@/lib/printDocument';
import { Button } from '@/components/ui/button';
import { Badge, NativeSelect } from '@/components/ui/form-elements';
import { Card, CardContent, LoadingSpinner, PageHeader } from '@/components/ui/shared';
import { ArrowLeft, FileText, Package, Receipt, RotateCcw } from 'lucide-react';

export function TradeFileDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const writable = canWrite(profile?.role);
  const { data: file, isLoading } = useTradeFile(id);
  const { data: settings } = useSettings();
  const { data: bankAccounts } = useBankAccounts();
  const changeStatus = useChangeStatus();
  const deleteInv = useDeleteInvoice();
  const deletePL = useDeletePackingList();
  const deletePI = useDeleteProforma();
  const defaultBank = bankAccounts?.find(b => b.is_default) ?? bankAccounts?.[0] ?? null;

  const { data: fileTxns = [] } = useTransactions({ tradeFileId: id });

  const [saleOpen, setSaleOpen] = useState(false);
  const [editSaleOpen, setEditSaleOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [editFileOpen, setEditFileOpen] = useState(false);
  const [txnModal, setTxnModal] = useState<{ open: boolean; type: 'purchase_inv' | 'svc_inv' }>({ open: false, type: 'purchase_inv' });
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [proformaOpen, setProformaOpen] = useState(false);
  const [packingOpen, setPackingOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [editSaleInvoice, setEditSaleInvoice] = useState<Invoice | null>(null);
  const [saleInvoiceOpen, setSaleInvoiceOpen] = useState(false);
  const [editPL, setEditPL] = useState<PackingList | null>(null);
  const [editPI, setEditPI] = useState<Proforma | null>(null);
  // After delivery saved, auto-open packing list
  const [autoPackingAfterDelivery, setAutoPackingAfterDelivery] = useState(false);

  if (isLoading) return <LoadingSpinner />;
  if (!file) return <div className="text-center py-12 text-muted-foreground text-xs">File not found</div>;

  const isSaleOrDel = file.status === 'sale' || file.status === 'delivery';

  function handleStatusChange(newStatus: string) {
    if (!newStatus || newStatus === file!.status) return;
    if (window.confirm(`Change status to "${TRADE_FILE_STATUS_LABELS[newStatus as TradeFileStatus]}"?`)) {
      changeStatus.mutate({ id: file!.id, status: newStatus as TradeFileStatus });
    }
  }

  function handleDeliveryClose() {
    setDeliveryOpen(false);
    // #7: After delivery form closes, open packing list
    if (autoPackingAfterDelivery) {
      setAutoPackingAfterDelivery(false);
      setTimeout(() => setPackingOpen(true), 300);
    }
  }

  function openDeliveryWithPacking() {
    setAutoPackingAfterDelivery(true);
    setDeliveryOpen(true);
  }

  return (
    <>
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
        </Button>
      </div>

      <PageHeader title={file.file_no}>
        <Badge variant={file.status as TradeFileStatus} className="text-xs px-3 py-1">
          {TRADE_FILE_STATUS_LABELS[file.status]}
        </Badge>
        {/* #10: Status change dropdown */}
        {writable && (
          <div className="flex items-center gap-1.5 ml-3">
            <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
            <NativeSelect
              className="w-[140px]"
              value={file.status}
              onChange={(e) => handleStatusChange(e.target.value)}
            >
              <option value="request">Request</option>
              <option value="sale">Sale</option>
              <option value="delivery">Delivery</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </NativeSelect>
          </div>
        )}
      </PageHeader>

      <div className="text-xs text-muted-foreground mb-4">
        {file.customer?.name} — {file.product?.name} — {fN(file.tonnage_mt, 3)} MT
      </div>

      {/* Action buttons */}
      {writable && (
        <div className="flex flex-wrap gap-2 mb-6">
          {file.status === 'request' && (
            <Button onClick={() => setSaleOpen(true)}>→ Convert to Sale</Button>
          )}
          {file.status === 'sale' && (
            <Button variant="purple" onClick={openDeliveryWithPacking}>
              {file.delivered_admt ? 'Edit Delivery' : '+ Delivery'}
            </Button>
          )}
          {isSaleOrDel && (
            <>
              <Button variant="secondary" onClick={() => {
                const existing = file.invoices?.find(inv => inv.invoice_type === 'sale') ?? null;
                setEditSaleInvoice(existing);
                setSaleInvoiceOpen(true);
              }}>
                <Receipt className="h-3.5 w-3.5" /> Sale Invoice
              </Button>
              <Button variant="outline" onClick={() => { setEditInvoice(null); setInvoiceOpen(true); }}>
                <Receipt className="h-3.5 w-3.5" /> Com-Invoice
              </Button>
              <Button variant="outline" onClick={() => { setEditPL(null); setPackingOpen(true); }}>
                <Package className="h-3.5 w-3.5" /> Packing List
              </Button>
              <Button variant="outline" onClick={() => { setEditPI(null); setProformaOpen(true); }}>
                <FileText className="h-3.5 w-3.5" /> Proforma
              </Button>
            </>
          )}
        </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <div className="text-2xs font-bold uppercase text-muted-foreground">File Info</div>
              {writable && <Button variant="edit" size="xs" onClick={() => setEditFileOpen(true)}>Edit</Button>}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Status</dt>
              <dd><Badge variant={file.status as TradeFileStatus}>{TRADE_FILE_STATUS_LABELS[file.status]}</Badge></dd>
              <dt className="text-muted-foreground">Date</dt><dd>{fDate(file.file_date)}</dd>
              <dt className="text-muted-foreground">Customer</dt><dd className="font-bold">{file.customer?.name}</dd>
              <dt className="text-muted-foreground">Product</dt><dd>{file.product?.name}</dd>
              <dt className="text-muted-foreground">Tonnage</dt><dd className="font-bold text-brand-500">{fN(file.tonnage_mt, 3)} MT</dd>
              {file.customer_ref && (<><dt className="text-muted-foreground">Ref</dt><dd>{file.customer_ref}</dd></>)}
            </dl>
          </CardContent>
        </Card>

        {file.selling_price ? (
          <Card className="border-brand-200 bg-brand-50/30">
            <CardContent>
              <div className="flex items-center justify-between mb-2">
                <div className="text-2xs font-bold uppercase text-brand-700">Sale Details</div>
                {writable && <Button variant="edit" size="xs" onClick={() => setEditSaleOpen(true)}>Edit</Button>}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Sale Price</dt><dd className="font-bold text-brand-600">{fCurrency(file.selling_price)}/MT</dd>
                <dt className="text-muted-foreground">Purchase</dt><dd>{fCurrency(file.purchase_price)}/MT</dd>
                <dt className="text-muted-foreground">Supplier</dt><dd>{file.supplier?.name ?? '—'}</dd>
                <dt className="text-muted-foreground">Incoterms</dt><dd>{file.incoterms} {file.port_of_discharge ?? ''}</dd>
                <dt className="text-muted-foreground">ETA</dt><dd>{fDate(file.eta)}</dd>
                {file.vessel_name && (<><dt className="text-muted-foreground">Vessel</dt><dd>{file.vessel_name}</dd></>)}
                {file.register_no && (<><dt className="text-muted-foreground">Register</dt><dd>{file.register_no}</dd></>)}
              </dl>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-amber-50 border-amber-200 flex items-center justify-center">
            <span className="text-xs text-amber-700">No sale details yet</span>
          </Card>
        )}
      </div>

      {/* Delivery */}
      {file.delivered_admt && (
        <Card className="mb-4 bg-purple-50/30 border-purple-200">
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <div className="text-2xs font-bold uppercase text-purple-700">Delivery</div>
              {writable && <Button variant="edit" size="xs" onClick={() => setDeliveryOpen(true)}>Edit</Button>}
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div><span className="text-2xs text-muted-foreground block">ADMT</span><span className="font-bold">{fN(file.delivered_admt, 3)}</span></div>
              <div><span className="text-2xs text-muted-foreground block">Gross (KG)</span><span>{fN(file.gross_weight_kg)}</span></div>
              <div><span className="text-2xs text-muted-foreground block">Packages</span><span>{file.packages}</span></div>
              <div><span className="text-2xs text-muted-foreground block">Arrival</span><span>{fDate(file.arrival_date)}</span></div>
              <div><span className="text-2xs text-muted-foreground block">B/L No</span><span>{file.bl_number || '—'}</span></div>
              <div><span className="text-2xs text-muted-foreground block">SEPTI</span><span>{file.septi_ref || '—'}</span></div>
              <div><span className="text-2xs text-muted-foreground block">Ins.TR</span><span className="text-2xs">{file.insurance_tr || '—'}</span></div>
              <div><span className="text-2xs text-muted-foreground block">Ins.IR</span><span className="text-2xs">{file.insurance_ir || '—'}</span></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Proformas */}
      {file.proformas && file.proformas.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-bold mb-2">Proformas</div>
          {file.proformas.map((pi) => (
            <div key={pi.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 mb-1.5">
              <span className="font-bold text-xs flex-1">{pi.proforma_no}</span>
              <span className="text-[11px] text-muted-foreground">{fDate(pi.proforma_date)}</span>
              <span className="font-bold text-brand-500 text-xs">{fCurrency(pi.total)}</span>
              {writable && <Button variant="edit" size="xs" onClick={() => { setEditPI(pi); setProformaOpen(true); }}>Edit</Button>}
              {settings && <Button variant="outline" size="xs" onClick={() => printProforma(pi, settings, defaultBank, file)}>🖨 Print</Button>}
              {writable && <Button variant="destructive" size="xs" onClick={() => { if (window.confirm('Delete proforma?')) deletePI.mutate(pi.id); }}>Del</Button>}
            </div>
          ))}
        </div>
      )}

      {/* Sale Invoice - auto-generated on delivery */}
      {file.invoices && file.invoices.some(inv => inv.invoice_type === 'sale') && (
        <div className="mb-4">
          <div className="text-xs font-bold mb-2 text-green-700">Sale Invoice</div>
          {file.invoices.filter(inv => inv.invoice_type === 'sale').map((inv) => (
            <div key={inv.id} className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-1.5">
              <span className="font-bold text-xs flex-1">{inv.invoice_no}</span>
              <span className="text-[11px] text-muted-foreground">{fDate(inv.invoice_date)}</span>
              <span className="text-[11px] text-muted-foreground">{fN(inv.quantity_admt, 3)} ADMT × {fCurrency(inv.unit_price)}</span>
              <span className="font-bold text-green-700 text-xs">{fCurrency(inv.total)}</span>
              {writable && <Button variant="edit" size="xs" onClick={() => { setEditSaleInvoice(inv); setSaleInvoiceOpen(true); }}>Edit</Button>}
              {settings && <Button variant="outline" size="xs" onClick={() => printInvoice(inv, settings, defaultBank)}>🖨 Print</Button>}
              {writable && <Button variant="destructive" size="xs" onClick={() => { if (window.confirm('Delete sale invoice?')) deleteInv.mutate(inv.id); }}>Del</Button>}
            </div>
          ))}
        </div>
      )}

      {/* Com-Invoices */}
      {file.invoices && file.invoices.some(inv => inv.invoice_type === 'commercial') && (
        <div className="mb-4">
          <div className="text-xs font-bold mb-2">Com-Invoices</div>
          {file.invoices.filter(inv => inv.invoice_type === 'commercial').map((inv) => (
            <div key={inv.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 mb-1.5">
              <span className="font-bold text-xs flex-1">{inv.invoice_no}</span>
              <span className="text-[11px] text-muted-foreground">{fDate(inv.invoice_date)}</span>
              <span className="font-bold text-brand-500 text-xs">{fCurrency(inv.total)}</span>
              {writable && <Button variant="edit" size="xs" onClick={() => { setEditInvoice(inv); setInvoiceOpen(true); }}>Edit</Button>}
              {settings && <Button variant="outline" size="xs" onClick={() => printInvoice(inv, settings, defaultBank)}>🖨 Print</Button>}
              {writable && <Button variant="destructive" size="xs" onClick={() => { if (window.confirm('Delete com-invoice?')) deleteInv.mutate(inv.id); }}>Del</Button>}
            </div>
          ))}
        </div>
      )}

      {/* Packing Lists */}
      {file.packing_lists && file.packing_lists.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-bold mb-2">Packing Lists</div>
          {file.packing_lists.map((pl) => (
            <div key={pl.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 mb-1.5">
              <span className="font-bold text-xs flex-1">{pl.packing_list_no}</span>
              <span className="text-[11px] text-muted-foreground">{pl.packing_list_items?.length ?? 0} vehicles</span>
              <span className="text-xs">{fN(pl.total_admt, 3)} ADMT</span>
              {writable && <Button variant="edit" size="xs" onClick={() => { setEditPL(pl); setPackingOpen(true); }}>Edit</Button>}
              {settings && <Button variant="outline" size="xs" onClick={() => printPackingList(pl, settings)}>🖨 Print</Button>}
              {writable && <Button variant="destructive" size="xs" onClick={() => { if (window.confirm('Delete packing list?')) deletePL.mutate(pl.id); }}>Del</Button>}
            </div>
          ))}
        </div>
      )}

      {/* Expenses */}
      <Card className="mb-4">
        <CardContent>
          <div className="flex items-center justify-between mb-3">
            <div className="text-2xs font-bold uppercase text-muted-foreground">Expenses</div>
            {writable && (
              <div className="flex gap-2">
                <Button variant="outline" size="xs" onClick={() => setTxnModal({ open: true, type: 'purchase_inv' })}>
                  + Purchase Invoice
                </Button>
                <Button variant="outline" size="xs" onClick={() => setTxnModal({ open: true, type: 'svc_inv' })}>
                  + Service Invoice
                </Button>
              </div>
            )}
          </div>
          {fileTxns.filter(t => ['purchase_inv', 'svc_inv'].includes(t.transaction_type)).length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-3">No expense transactions yet</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-1 pr-2 font-medium">Date</th>
                  <th className="text-left py-1 pr-2 font-medium">Description</th>
                  <th className="text-left py-1 pr-2 font-medium">Type</th>
                  <th className="text-right py-1 font-medium">Amount</th>
                  <th className="text-right py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {fileTxns
                  .filter(t => ['purchase_inv', 'svc_inv'].includes(t.transaction_type))
                  .map(t => (
                    <tr key={t.id} className="border-b border-border/40">
                      <td className="py-1 pr-2 text-muted-foreground">{t.transaction_date}</td>
                      <td className="py-1 pr-2">{t.description}</td>
                      <td className="py-1 pr-2 text-muted-foreground">{TRANSACTION_TYPE_LABELS[t.transaction_type]}</td>
                      <td className="py-1 text-right font-medium">{fUSD(t.amount_usd ?? t.amount)}</td>
                      <td className="py-1 text-right">
                        <span className={`text-2xs px-1.5 py-0.5 rounded ${
                          t.payment_status === 'paid' ? 'bg-green-100 text-green-700'
                          : t.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                        }`}>{t.payment_status}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <NewFileModal open={editFileOpen} onOpenChange={setEditFileOpen} editMode fileToEdit={file} />
      <ToSaleModal open={saleOpen} onOpenChange={setSaleOpen} file={file} />
      <ToSaleModal open={editSaleOpen} onOpenChange={setEditSaleOpen} file={file} editMode />
      <DeliveryModal open={deliveryOpen} onOpenChange={handleDeliveryClose} file={file} />
      <InvoiceModal open={invoiceOpen} onOpenChange={setInvoiceOpen} file={file} invoice={editInvoice} />
      <InvoiceModal open={saleInvoiceOpen} onOpenChange={setSaleInvoiceOpen} file={file} invoice={editSaleInvoice} invoiceType="sale" />
      <ProformaModal open={proformaOpen} onOpenChange={setProformaOpen} file={file} proforma={editPI} />
      <PackingListModal open={packingOpen} onOpenChange={setPackingOpen} file={file} packingList={editPL} />
      <TransactionModal
        open={txnModal.open}
        onOpenChange={(v) => setTxnModal(m => ({ ...m, open: v }))}
        defaultType={txnModal.type}
        defaultTradeFileId={file.id}
      />
    </>
  );
}
