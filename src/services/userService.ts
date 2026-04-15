import { supabase } from './supabase';
import type { Profile } from '@/types/database';
import type { UserRole } from '@/types/enums';

export async function saveDashboardPrefs(
  userId: string,
  prefs: { order: string[]; sizes: Record<string, 'full' | 'half'> },
): Promise<void> {
  await supabase.from('profiles').update({ dashboard_prefs: prefs }).eq('id', userId);
}

export const userService = {
  async listUsers(): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Profile[];
  },

  async createUser(
    email: string,
    password: string,
    fullName: string,
    role: UserRole,
    tenantId?: string,
  ): Promise<void> {
    // SECURITY DEFINER RPC — admin session'ına hiç dokunmaz, session lock yok
    const { error } = await supabase.rpc('admin_create_user', {
      p_email:     email,
      p_password:  password,
      p_full_name: fullName,
      p_role:      role,
      p_tenant_id: tenantId ?? null,
    });
    if (error) throw new Error(error.message);
  },

  async updateRole(id: string, role: UserRole): Promise<void> {
    // Use SECURITY DEFINER RPC to bypass any RLS issues
    const { error } = await supabase.rpc('admin_update_user_role', {
      target_id: id,
      new_role: role,
    });
    if (error) throw new Error(error.message);
  },

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase.rpc('admin_toggle_user_active', {
      target_id: id,
      new_active: isActive,
    });
    if (error) throw new Error(error.message);
  },

  async updatePermissions(id: string, permissions: string[] | null): Promise<void> {
    const { error } = await supabase.rpc('admin_update_permissions', {
      target_id: id,
      new_permissions: permissions,
    });
    if (error) throw new Error(error.message);
  },

  async deleteUser(id: string): Promise<void> {
    const { error } = await supabase.rpc('admin_delete_user', {
      target_id: id,
    });
    if (error) throw new Error(error.message);
  },
};
