import { supabase } from './supabase';
import type { Product } from '@/types/database';
import type { ProductFormData } from '@/types/forms';

export const productService = {
  async list(): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*, category:product_categories(*)')
      .eq('is_active', true)
      .order('name');

    // If the join fails (e.g. migration not yet run), fall back to plain select
    if (error) {
      const { data: plain, error: plainErr } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (plainErr) throw new Error(plainErr.message);
      return (plain ?? []) as Product[];
    }
    return (data ?? []) as Product[];
  },

  async getById(id: string): Promise<Product> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return data as Product;
  },

  async create(input: ProductFormData): Promise<Product> {
    const { count } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    const code = `P${String((count ?? 0) + 1).padStart(3, '0')}`;

    const { data, error } = await supabase
      .from('products')
      .insert({ ...input, code })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Product;
  },

  async update(id: string, input: ProductFormData): Promise<Product> {
    const { data, error } = await supabase
      .from('products')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Product;
  },

  async deactivate(id: string): Promise<void> {
    const { error } = await supabase
      .from('products')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw new Error(error.message);
  },
};
