import { supabase } from './supabase';
import type { Supplier } from '@/types/database';
import type { SupplierFormData } from '@/types/forms';

export const supplierService = {
  async list(): Promise<Supplier[]> {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw new Error(error.message);
    return (data ?? []) as Supplier[];
  },

  async getById(id: string): Promise<Supplier> {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return data as Supplier;
  },

  async create(input: SupplierFormData): Promise<Supplier> {
    const { count } = await supabase
      .from('suppliers')
      .select('*', { count: 'exact', head: true });

    const code = `S${String((count ?? 0) + 1).padStart(3, '0')}`;

    const { data, error } = await supabase
      .from('suppliers')
      .insert({ ...input, code })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Supplier;
  },

  async update(id: string, input: SupplierFormData): Promise<Supplier> {
    const { data, error } = await supabase
      .from('suppliers')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Supplier;
  },

  async deactivate(id: string): Promise<void> {
    const { error } = await supabase
      .from('suppliers')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw new Error(error.message);
  },
};
