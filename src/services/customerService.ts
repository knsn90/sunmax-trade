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
    if (data === null) throw new Error('Request aborted or timed out — please refresh');
    return data as Customer[];
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
    // Use user-provided code if given, otherwise fall back to auto-generated C001 style
    let code = input.code?.trim().toUpperCase() || '';
    if (!code) {
      const { count } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });
      code = `C${String((count ?? 0) + 1).padStart(3, '0')}`;
    }

    const { data, error } = await supabase
      .from('customers')
      .insert({ ...input, code, parent_customer_id: input.parent_customer_id || null })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Customer;
  },

  async update(id: string, input: CustomerFormData): Promise<Customer> {
    const patch: Record<string, unknown> = { ...input };
    // Normalize code: uppercase, skip empty string (don't overwrite with empty)
    if (input.code !== undefined && input.code !== '') {
      patch.code = input.code.trim().toUpperCase();
    } else {
      delete patch.code; // don't send empty string to DB
    }
    // Normalize parent_customer_id: empty string → null
    patch.parent_customer_id = input.parent_customer_id || null;

    const { data, error } = await supabase
      .from('customers')
      .update(patch)
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

  async patchLogo(id: string, logoUrl: string | null): Promise<void> {
    const { error } = await supabase
      .from('customers')
      .update({ logo_url: logoUrl })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
};
