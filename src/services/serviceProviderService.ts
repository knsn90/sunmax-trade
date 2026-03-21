import { supabase } from './supabase';
import type { ServiceProvider } from '@/types/database';
import type { ServiceProviderFormData } from '@/types/forms';
import type { ServiceProviderType } from '@/types/enums';

export const serviceProviderService = {
  async list(typeFilter?: ServiceProviderType): Promise<ServiceProvider[]> {
    let query = supabase
      .from('service_providers')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (typeFilter) {
      query = query.eq('service_type', typeFilter);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as ServiceProvider[];
  },

  async getById(id: string): Promise<ServiceProvider> {
    const { data, error } = await supabase
      .from('service_providers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return data as ServiceProvider;
  },

  async create(input: ServiceProviderFormData): Promise<ServiceProvider> {
    const { count } = await supabase
      .from('service_providers')
      .select('*', { count: 'exact', head: true });

    const code = `SV${String((count ?? 0) + 1).padStart(3, '0')}`;

    const { data, error } = await supabase
      .from('service_providers')
      .insert({ ...input, code })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as ServiceProvider;
  },

  async update(id: string, input: ServiceProviderFormData): Promise<ServiceProvider> {
    const { data, error } = await supabase
      .from('service_providers')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as ServiceProvider;
  },

  async deactivate(id: string): Promise<void> {
    const { error } = await supabase
      .from('service_providers')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw new Error(error.message);
  },
};
