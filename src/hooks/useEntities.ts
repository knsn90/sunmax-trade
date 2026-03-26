import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerService } from '@/services/customerService';
import { supplierService } from '@/services/supplierService';
import { productService } from '@/services/productService';
import { productCategoryService } from '@/services/productCategoryService';
import { serviceProviderService } from '@/services/serviceProviderService';
import type { CustomerFormData, SupplierFormData, ProductFormData, ServiceProviderFormData, ProductCategoryFormData } from '@/types/forms';
import type { ServiceProviderType } from '@/types/enums';
import { toast } from 'sonner';

// ─── Customers ──────────────────────────────────────────────────────────────

export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: () => customerService.list(),
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CustomerFormData) => customerService.create(data),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success(`Customer "${c.name}" created`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CustomerFormData }) =>
      customerService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customerService.deactivate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Suppliers ──────────────────────────────────────────────────────────────

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: () => supplierService.list(),
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SupplierFormData) => supplierService.create(data),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(`Supplier "${s.name}" created`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SupplierFormData }) =>
      supplierService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Supplier updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => supplierService.deactivate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Supplier removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Products ───────────────────────────────────────────────────────────────

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: () => productService.list(),
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProductFormData) => productService.create(data),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(`Product "${p.name}" created`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProductFormData }) =>
      productService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => productService.deactivate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Service Providers ──────────────────────────────────────────────────────

export function useServiceProviders(typeFilter?: ServiceProviderType) {
  return useQuery({
    queryKey: ['service-providers', typeFilter],
    queryFn: () => serviceProviderService.list(typeFilter),
  });
}

export function useCreateServiceProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ServiceProviderFormData) => serviceProviderService.create(data),
    onSuccess: (sp) => {
      qc.invalidateQueries({ queryKey: ['service-providers'] });
      toast.success(`Service provider "${sp.name}" created`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateServiceProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ServiceProviderFormData }) =>
      serviceProviderService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-providers'] });
      toast.success('Service provider updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteServiceProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => serviceProviderService.deactivate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-providers'] });
      toast.success('Service provider removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ─── Product Categories ──────────────────────────────────────────────────────

export function useProductCategories() {
  return useQuery({
    queryKey: ['product-categories'],
    queryFn: () => productCategoryService.list(),
  });
}

export function useCreateProductCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProductCategoryFormData) => productCategoryService.create(data),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['product-categories'] });
      toast.success(`"${c.name}" kategorisi eklendi`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateProductCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProductCategoryFormData }) =>
      productCategoryService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-categories'] });
      toast.success('Category updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteProductCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => productCategoryService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-categories'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Kategori silindi');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
