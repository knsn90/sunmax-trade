import { supabase } from './supabase';
import type { ProductCategory } from '@/types/database';

export const productCategoryService = {
  async list(): Promise<ProductCategory[]> {
    const { data, error } = await supabase
      .from('product_categories')
      .select('*')
      .order('sort_order')
      .order('name');
    if (error) throw new Error(error.message);
    if (data === null) throw new Error('Request aborted or timed out — please refresh');
    return data as ProductCategory[];
  },

  async create(input: { name: string; color: string }): Promise<ProductCategory> {
    const { data, error } = await supabase
      .from('product_categories')
      .insert(input)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ProductCategory;
  },

  async update(id: string, input: { name: string; color: string }): Promise<ProductCategory> {
    const { data, error } = await supabase
      .from('product_categories')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ProductCategory;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('product_categories')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
  },
};
