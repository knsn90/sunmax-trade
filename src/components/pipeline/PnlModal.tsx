import { useMemo } from 'react';
import { useTradeFile } from '@/hooks/useTradeFiles';
import { useTransactions } from '@/hooks/useTransactions';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { fUSD, fN } from '@/lib/formatters';

interface PnlModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string | null;
}

export function PnlModal({ open, onOpenChange, fileId }: PnlModalProps) {
  const { data: file } = useTradeFile(fileId ?? undefined);
  const { data: txns = [] } = useTransactions(
    fileId ? { tradeFileId: fileId } : undefined,
  );

  const pnl = useMemo(() => {
    if (!file) return null;
    const qty = file.delivered_admt ?? file.tonnage_mt ?? 0;
    const revenue = (file.selling_price ?? 0) * qty;
    const cogs = (file.purchase_price ?? 0) * qty;

    const costs = txns
      .filter((t) => ['purchase_inv', 'svc_inv'].includes(t.transaction_type))
      .reduce((s, t) => s + (t.amount_usd ?? t.amount ?? 0), 0);

    const grossProfit = revenue - cogs;
    const netProfit = revenue - costs;
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return { qty, revenue, cogs, costs, grossProfit, netProfit, margin };
  }, [file, txns]);

  function handlePrint() {
    if (!file || !pnl) return;
    const costRows = txns
      .filter((t) => ['purchase_inv', 'svc_inv'].includes(t.transaction_type))
      .map((t) => `
        <tr>
          <td>${t.transaction_date}</td>
          <td>${t.description}</td>
          <td>${t.transaction_type === 'purchase_inv' ? 'Purchase' : 'Service'}</td>
          <td style="text-align:right">${fUSD(t.amount_usd ?? t.amount)}</td>
        </tr>`).join('');

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>P&L — ${file.file_no}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; font-size: 13px; }
      h2 { margin-bottom: 4px; }
      .cards { display: flex; gap: 16px; margin: 16px 0; }
      .card { border: 1px solid #ddd; border-radius: 6px; padding: 12px 20px; min-width: 140px; text-align: center; }
      .card .val { font-size: 20px; font-weight: bold; }
      .card .lbl { font-size: 11px; color: #666; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #ddd; padding: 6px 10px; }
      th { background: #f5f5f5; }
      .green { color: #16a34a; }
      .red { color: #dc2626; }
      @media print { .np { display: none; } }
    </style></head><body>
    <div class="np" style="margin-bottom:12px">
      <button onclick="window.print()">🖨 Print / PDF</button>
      <button onclick="window.close()" style="margin-left:8px">✕ Close</button>
    </div>
    <h2>P&L — ${file.file_no}</h2>
    <div style="color:#666">${file.customer?.name ?? ''} | ${file.product?.name ?? ''} | ${fN(pnl.qty, 3)} MT</div>
    <div class="cards">
      <div class="card"><div class="val">${fUSD(pnl.revenue)}</div><div class="lbl">Revenue</div></div>
      <div class="card"><div class="val">${fUSD(pnl.costs)}</div><div class="lbl">Total Cost</div></div>
      <div class="card ${pnl.netProfit >= 0 ? 'green' : 'red'}">
        <div class="val">${fUSD(pnl.netProfit)}</div><div class="lbl">Net Profit</div>
      </div>
      <div class="card ${pnl.margin >= 0 ? 'green' : 'red'}">
        <div class="val">${pnl.margin.toFixed(1)}%</div><div class="lbl">Margin</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Amount (USD)</th></tr></thead>
      <tbody>${costRows || '<tr><td colspan="4" style="text-align:center;color:#999">No cost transactions</td></tr>'}</tbody>
    </table>
    </body></html>`);
    win.document.close();
  }

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>P&L — {file?.file_no ?? '…'}</DialogTitle>
          <DialogDescription>
            {file?.customer?.name} | {file?.product?.name}
          </DialogDescription>
        </DialogHeader>

        {!file || !pnl ? (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryCard label="Revenue" value={fUSD(pnl.revenue)} />
              <SummaryCard label="Total Cost" value={fUSD(pnl.costs)} />
              <SummaryCard
                label="Net Profit"
                value={fUSD(pnl.netProfit)}
                positive={pnl.netProfit >= 0}
              />
              <SummaryCard
                label="Margin"
                value={`${pnl.margin.toFixed(1)}%`}
                positive={pnl.margin >= 0}
              />
            </div>

            {/* Key Metrics */}
            <div className="rounded border bg-muted/30 p-3 text-sm grid grid-cols-3 gap-2">
              <div><span className="text-muted-foreground">Qty:</span> {fN(pnl.qty, 3)} MT</div>
              <div><span className="text-muted-foreground">Buy Price:</span> {fUSD(file.purchase_price)}/MT</div>
              <div><span className="text-muted-foreground">Sell Price:</span> {fUSD(file.selling_price)}/MT</div>
            </div>

            {/* Cost Breakdown */}
            <div>
              <div className="text-sm font-medium mb-2">Cost Transactions</div>
              {txns.filter((t) => ['purchase_inv', 'svc_inv'].includes(t.transaction_type)).length === 0 ? (
                <div className="text-sm text-muted-foreground py-2 text-center">No cost transactions recorded</div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 pr-2">Date</th>
                      <th className="text-left py-1 pr-2">Description</th>
                      <th className="text-left py-1 pr-2">Type</th>
                      <th className="text-right py-1">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns
                      .filter((t) => ['purchase_inv', 'svc_inv'].includes(t.transaction_type))
                      .map((t) => (
                        <tr key={t.id} className="border-b border-border/50">
                          <td className="py-1 pr-2 text-muted-foreground">{t.transaction_date}</td>
                          <td className="py-1 pr-2">{t.description}</td>
                          <td className="py-1 pr-2 text-muted-foreground">
                            {t.transaction_type === 'purchase_inv' ? 'Purchase' : 'Service'}
                          </td>
                          <td className="py-1 text-right">{fUSD(t.amount_usd ?? t.amount)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={handlePrint}
                className="text-sm text-muted-foreground hover:text-foreground underline"
              >
                🖨 Print / PDF
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  const colorClass =
    positive === undefined
      ? ''
      : positive
      ? 'text-green-600'
      : 'text-red-600';

  return (
    <div className="rounded border p-3 text-center">
      <div className={`text-lg font-semibold ${colorClass}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
