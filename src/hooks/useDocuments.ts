import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoiceService } from '@/services/invoiceService';
import { packingListService } from '@/services/packingListService';
import type { InvoiceFormData, PackingListFormData } from '@/types/forms';
import { tradeFileKeys } from './useTradeFiles';
import { toast } from 'sonner';

// ─── Invoices ───────────────────────────────────────────────────────────────

export function useInvoices() {
  return useQuery({
    queryKey: ['invoices'],
    queryFn: () => invoiceService.list(),
  });
}

export function useInvoicesByTradeFile(tradeFileId: string | undefined) {
  return useQuery({
    queryKey: ['invoices', 'by-file', tradeFileId],
    queryFn: () => invoiceService.listByTradeFile(tradeFileId!),
    enabled: !!tradeFileId,
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      tradeFileId: string;
      customerId: string;
      productName: string;
      invoiceNo: string;
      data: InvoiceFormData;
      invoiceType?: 'commercial' | 'sale';
    }) => {
      const inv = await invoiceService.create(
        params.tradeFileId,
        params.customerId,
        params.productName,
        params.invoiceNo,
        params.data,
        params.invoiceType ?? 'commercial',
      );
      // If sale invoice, sync transaction
      if (params.invoiceType === 'sale') {
        await invoiceService.syncSaleInvoiceTransaction(inv, params.customerId, params.tradeFileId);
      }
      return inv;
    },
    onSuccess: (inv) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(`${inv.invoice_type === 'sale' ? 'Sale Invoice' : 'Invoice'} ${inv.invoice_no} created`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data, existingInvoice }: { id: string; data: InvoiceFormData; existingInvoice?: import('@/types/database').Invoice }) => {
      const updated = await invoiceService.update(id, data);
      // If it's a sale invoice, sync the accounting transaction
      if (existingInvoice?.invoice_type === 'sale' && existingInvoice.trade_file_id && existingInvoice.customer_id) {
        await invoiceService.syncSaleInvoiceTransaction(updated, existingInvoice.customer_id, existingInvoice.trade_file_id);
      }
      return updated;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Invoice updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invoiceService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success('Invoice deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSaleInvoices() {
  return useQuery({
    queryKey: ['invoices', 'sale'],
    queryFn: () => invoiceService.listSaleInvoices(),
  });
}

export function useUpsertSaleInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      tradeFileId: string;
      customerId: string;
      productName: string;
      data: import('@/types/forms').InvoiceFormData;
    }) => invoiceService.upsertSaleInvoice(params.tradeFileId, params.customerId, params.productName, params.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Packing Lists ──────────────────────────────────────────────────────────

export function usePackingLists() {
  return useQuery({
    queryKey: ['packing-lists'],
    queryFn: () => packingListService.list(),
  });
}

export function usePackingListsByTradeFile(tradeFileId: string | undefined) {
  return useQuery({
    queryKey: ['packing-lists', 'by-file', tradeFileId],
    queryFn: () => packingListService.listByTradeFile(tradeFileId!),
    enabled: !!tradeFileId,
  });
}

export function useCreatePackingList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      tradeFileId: string;
      customerId: string;
      plNo: string;
      data: PackingListFormData;
    }) =>
      packingListService.create(
        params.tradeFileId,
        params.customerId,
        params.plNo,
        params.data,
      ),
    onSuccess: (pl) => {
      qc.invalidateQueries({ queryKey: ['packing-lists'] });
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success(`Packing list ${pl.packing_list_no} created`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdatePackingList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PackingListFormData }) =>
      packingListService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['packing-lists'] });
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success('Packing list updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeletePackingList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => packingListService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['packing-lists'] });
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success('Packing list deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
