import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsService } from '@/services/settingsService';
import type { CompanySettingsFormData, BankAccountFormData } from '@/types/forms';
import { useTenant } from '@/contexts/TenantContext';
import { toast } from 'sonner';

export function useSettings() {
  const { currentTenant, isLoading: tenantLoading } = useTenant();
  const query = useQuery({
    // queryKey tenant'a özgü — farklı firmalar farklı cache
    queryKey: ['settings', currentTenant?.id ?? 'global'],
    queryFn: () => settingsService.getSettings(),
    enabled: !!currentTenant,
  });
  // React Query v5: enabled:false → status:'pending' → isLoading:true (spinner forever)
  // Tenant yokken loading false döndür
  return {
    ...query,
    isLoading: tenantLoading || (query.isLoading && !!currentTenant),
  };
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  const { currentTenant } = useTenant();
  return useMutation({
    mutationFn: (data: CompanySettingsFormData) => settingsService.updateSettings(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', currentTenant?.id ?? 'global'] });
      toast.success('Ayarlar kaydedildi');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUploadLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => settingsService.uploadLogo(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Logo uploaded');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRemoveLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => settingsService.removeLogo(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Logo removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useBankAccounts() {
  return useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => settingsService.getBankAccounts(),
  });
}

export function useUpsertBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string | null; data: BankAccountFormData }) =>
      settingsService.upsertBankAccount(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast.success('Bank account saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
