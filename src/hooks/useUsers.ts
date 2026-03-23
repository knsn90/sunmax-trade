import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '@/services/userService';
import type { UserRole } from '@/types/enums';
import { toast } from 'sonner';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => userService.listUsers(),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { email: string; password: string; fullName: string; role: UserRole }) =>
      userService.createUser(params.email, params.password, params.fullName, params.role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('User created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      userService.updateRole(id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('Role updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useToggleUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      userService.toggleActive(id, isActive),
    onSuccess: (_d, { isActive }) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success(isActive ? 'User activated' : 'User deactivated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdatePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: string[] | null }) =>
      userService.updatePermissions(id, permissions),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('Permissions updated'); },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => userService.deleteUser(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User deleted'); },
    onError: (err: Error) => toast.error(err.message),
  });
}
