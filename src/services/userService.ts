import { supabase } from './supabase';
import type { Profile } from '@/types/database';
import type { UserRole } from '@/types/enums';

export const userService = {
  async listUsers(): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
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
    // Create auth user (triggers DB profile creation via Supabase trigger)
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    const userId = data.user?.id;
    if (!userId) throw new Error('User creation failed');

    // Update profile with name and role
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ full_name: fullName, role })
      .eq('id', userId);
    if (profileError) throw new Error(profileError.message);
  },

  async updateRole(id: string, role: UserRole): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
};
