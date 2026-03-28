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
  ): Promise<void> {
    // Save current admin session before signUp replaces it
    const { data: { session: adminSession } } = await supabase.auth.getSession();

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    const userId = data.user?.id;
    if (!userId) throw new Error('User creation failed');

    // Restore admin session immediately (signUp creates a new session for the new user)
    if (adminSession) {
      await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      });
    }

    // Update profile with name and role via RPC (bypasses RLS)
    const { error: roleError } = await supabase.rpc('admin_update_user_role', {
      target_id: userId,
      new_role: role,
    });
    if (roleError) throw new Error(roleError.message);

    const { error: nameError } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', userId);
    if (nameError) throw new Error(nameError.message);
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
