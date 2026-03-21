import { supabase } from './supabase';
import type { Customer } from '@/types/database';
import type { CustomerFormData } from '@/types/forms';

export const customerService = {
  async list(): Promise<Customer[]> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw new Error(error.message);
    return (data ?? []) as Customer[];
  },

  async getById(id: string): Promise<Customer> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return data as Customer;
  },

  async create(input: CustomerFormData): Promise<Customer> {
    // Generate next code
    const { count } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true });

    const code = `C${String((count ?? 0) + 1).padStart(3, '0')}`;

    const { data, error } = await supabase
      .from('customers')
      .insert({ ...input, code })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Customer;
  },

  async update(id: string, input: CustomerFormData): Promise<Customer> {
    const { data, error } = await supabase
      .from('customers')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Customer;
  },

  async deactivate(id: string): Promise<void> {
    const { error } = await supabase
      .from('customers')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw new Error(error.message);
  },
};
