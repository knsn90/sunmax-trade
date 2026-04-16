import { supabase } from './supabase';
import type { Kasa } from '@/types/database';

export const kasaService = {
  async list(): Promise<Kasa[]> {
    const { data, error } = await supabase
      .from('kasalar')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) throw new Error(error.message);
    if (data === null) throw new Error('Request aborted or timed out — please refresh');
    return data as Kasa[];
  },
  async create(input: Partial<Kasa>): Promise<Kasa> {
    const { data, error } = await supabase
      .from('kasalar')
      .insert(input)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as Kasa;
  },
  async update(id: string, input: Partial<Kasa>): Promise<Kasa> {
    const { data, error } = await supabase
      .from('kasalar')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as Kasa;
  },
  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('kasalar').update({ is_active: false }).eq('id', id);
    if (error) throw new Error(error.message);
  },
};
