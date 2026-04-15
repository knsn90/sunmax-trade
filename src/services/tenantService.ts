import { supabase } from '@/services/supabase';
import type { Tenant } from '@/types/database';

export interface TenantFormData {
  name: string;
  tax_id: string;
  address: string;
  phone: string;
  email: string;
  primary_color: string;
  custom_domain: string;
  logo_url: string;
  login_bg_url: string;
  favicon_url: string;
}

export const tenantService = {
  /** Tüm tenant listesi — yalnızca süper admin için */
  async getAll(): Promise<Tenant[]> {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .order('name');
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  /** Tek tenant — ID ile */
  async getById(id: string): Promise<Tenant | null> {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  },

  /** Yeni tenant oluştur */
  async create(form: TenantFormData): Promise<Tenant> {
    const { data, error } = await supabase
      .from('tenants')
      .insert([{ ...form, is_active: true }])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /** Tenant güncelle */
  async update(id: string, form: Partial<TenantFormData>): Promise<Tenant> {
    const { data, error } = await supabase
      .from('tenants')
      .update(form)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /** Tenant aktif/pasif yap */
  async setActive(id: string, is_active: boolean): Promise<void> {
    const { error } = await supabase
      .from('tenants')
      .update({ is_active })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  /** Kullanıcıyı bir tenant'a ata (süper admin) */
  async assignUserToTenant(userId: string, tenantId: string | null): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ tenant_id: tenantId })
      .eq('id', userId);
    if (error) throw new Error(error.message);
  },

  /** Logo yükle — Storage: tenant-assets/{tenantId}/logo.{ext} */
  async uploadLogo(tenantId: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'png';
    const path = `${tenantId}/logo.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('tenant-assets')
      .upload(path, file, { upsert: true });
    if (uploadErr) throw new Error(uploadErr.message);

    const { data } = supabase.storage.from('tenant-assets').getPublicUrl(path);
    return data.publicUrl;
  },

  /** Login arka plan görseli yükle */
  async uploadLoginBg(tenantId: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${tenantId}/login-bg.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('tenant-assets')
      .upload(path, file, { upsert: true });
    if (uploadErr) throw new Error(uploadErr.message);

    const { data } = supabase.storage.from('tenant-assets').getPublicUrl(path);
    return data.publicUrl;
  },

  /** Favicon yükle */
  async uploadFavicon(tenantId: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'png';
    const path = `${tenantId}/favicon.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('tenant-assets')
      .upload(path, file, { upsert: true });
    if (uploadErr) throw new Error(uploadErr.message);

    const { data } = supabase.storage.from('tenant-assets').getPublicUrl(path);
    return data.publicUrl;
  },

  /** Tüm aktif tenant'ların public listesi (firma seçici için) */
  async getPublicList(): Promise<Array<{ id: string; name: string; primary_color: string; logo_url: string }>> {
    const { data } = await supabase.rpc('get_public_tenants');
    return data ?? [];
  },

  /** Domain'e göre tenant public bilgisi (login sayfası için, auth gerektirmez) */
  async resolveByDomain(domain: string) {
    const { data } = await supabase.rpc('resolve_tenant_by_domain', { p_domain: domain });
    return data?.[0] ?? null;
  },

  /** ID'ye göre tenant public bilgisi (login sayfası ?tenant= için) */
  async getPublicInfo(tenantId: string) {
    const { data } = await supabase.rpc('get_tenant_public_info', { p_tenant_id: tenantId });
    return data?.[0] ?? null;
  },
};
