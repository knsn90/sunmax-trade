import { supabase } from './supabase';
import type { PriceList } from '@/types/database';
import type { PriceListFormData } from '@/types/forms';

export const priceListService = {
  async list(): Promise<PriceList[]> {
    const { data, error } = await supabase
      .from('price_list')
      .select('*, product:products(*), supplier:suppliers(*)')
      .order('price_date', { ascending: false });

    if (error) throw new Error(error.message);
    if (data === null) throw new Error('Request aborted or timed out — please refresh');
    return data as PriceList[];
  },

  async listByProduct(productId: string): Promise<PriceList[]> {
    const { data, error } = await supabase
      .from('price_list')
      .select('*, product:products(*), supplier:suppliers(*)')
      .eq('product_id', productId)
      .order('price_date', { ascending: false });

    if (error) throw new Error(error.message);
    if (data === null) throw new Error('Request aborted or timed out — please refresh');
    return data as PriceList[];
  },

  async create(input: PriceListFormData): Promise<PriceList> {
    // Fetch tenant_id required by RLS policy
    const { data: { user } } = await supabase.auth.getUser();
    let tenantId: string | null = null;
    if (user) {
      const { data: prof } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
      tenantId = (prof as { tenant_id?: string | null } | null)?.tenant_id ?? null;
    }

    const { data, error } = await supabase
      .from('price_list')
      .insert({
        tenant_id:   tenantId,
        product_id:  input.product_id,
        supplier_id: input.supplier_id,
        price:       Number(input.price),
        currency:    input.currency,
        price_date:  input.price_date,
        valid_until: input.valid_until || null,
        notes:       input.notes,
      })
      .select('*, product:products(*), supplier:suppliers(*)')
      .single();

    if (error) throw new Error(error.message);
    return data as PriceList;
  },

  async update(id: string, input: PriceListFormData): Promise<PriceList> {
    const { data, error } = await supabase
      .from('price_list')
      .update({
        product_id:  input.product_id,
        supplier_id: input.supplier_id,
        price:       Number(input.price),
        currency:    input.currency,
        price_date:  input.price_date,
        valid_until: input.valid_until || null,
        notes:       input.notes,
      })
      .eq('id', id)
      .select('*, product:products(*), supplier:suppliers(*)')
      .single();

    if (error) throw new Error(error.message);
    return data as PriceList;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('price_list')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  },
};
