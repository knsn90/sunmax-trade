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
    mutationFn: (params: {
      tradeFileId: string;
      customerId: string;
      productName: string;
      invoiceNo: string;
      data: InvoiceFormData;
    }) =>
      invoiceService.create(
        params.tradeFileId,
        params.customerId,
        params.productName,
        params.invoiceNo,
        params.data,
      ),
    onSuccess: (inv) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
      toast.success(`Invoice ${inv.invoice_no} created`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: InvoiceFormData }) =>
      invoiceService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: tradeFileKeys.all });
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
