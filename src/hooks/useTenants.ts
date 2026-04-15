import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantService, type TenantFormData } from '@/services/tenantService';
import { toast } from 'sonner';

export function useTenants() {
  return useQuery({
    queryKey: ['tenants'],
    queryFn: () => tenantService.getAll(),
  });
}

export function useTenant(id: string | undefined) {
  return useQuery({
    queryKey: ['tenant', id],
    queryFn: () => tenantService.getById(id!),
    enabled: !!id,
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TenantFormData) => tenantService.create(data),
    onSuccess: (tenant) => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      toast.success(`"${tenant.name}" firması oluşturuldu`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TenantFormData> }) =>
      tenantService.update(id, data),
    onSuccess: (tenant) => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['tenant', tenant.id] });
      toast.success('Firma bilgileri güncellendi');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSetTenantActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      tenantService.setActive(id, is_active),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      toast.success('Firma durumu güncellendi');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUploadTenantLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, file }: { tenantId: string; file: File }) =>
      tenantService.uploadLogo(tenantId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      toast.success('Logo yüklendi');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUploadTenantLoginBg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, file }: { tenantId: string; file: File }) =>
      tenantService.uploadLoginBg(tenantId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      toast.success('Login görseli yüklendi');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUploadTenantFavicon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, file }: { tenantId: string; file: File }) =>
      tenantService.uploadFavicon(tenantId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] });
      toast.success('Favicon yüklendi');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAssignUserToTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, tenantId }: { userId: string; tenantId: string | null }) =>
      tenantService.assignUserToTenant(userId, tenantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] });
      toast.success('Kullanıcı firmaya atandı');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
