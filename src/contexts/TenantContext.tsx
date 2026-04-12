/**
 * TenantContext
 *
 * - Normal kullanıcı: profile.tenant_id'si hangi firma ise onu görür.
 * - Süper admin:      tüm firmaları görebilir; istediği firmaya geçiş yapar.
 *   Geçiş yapılınca profile.tenant_id DB'de güncellenir ve tüm RLS
 *   politikaları yeni tenant için çalışır.
 */

import {
  createContext, useContext, useState, useEffect, useCallback, useRef,
  type ReactNode,
} from 'react';
import { supabase } from '@/services/supabase';
import type { Tenant } from '@/types/database';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface TenantContextType {
  /** Aktif tenant nesnesi (null → henüz yüklenmiyor / süper admin tüm firma görünümü) */
  currentTenant: Tenant | null;
  /** Tüm tenant listesi — yalnızca süper admin için dolu */
  allTenants: Tenant[];
  /** Tenant yükleniyor mu? */
  isLoading: boolean;
  /** Süper admin başka firmaya geçiş yapar */
  switchTenant: (tenantId: string) => Promise<void>;
  /** Süper admin kendi "tüm firmalar" görünümüne döner */
  resetToSuperAdmin: () => Promise<void>;
  /** Tenant bilgisini yenile */
  refetch: () => void;
}

const TenantContext = createContext<TenantContextType>({
  currentTenant: null,
  allTenants: [],
  isLoading: true,
  switchTenant: async () => {},
  resetToSuperAdmin: async () => {},
  refetch: () => {},
});

const TENANT_CACHE_KEY = 'sunmax_current_tenant';

function writeTenantCache(t: Tenant | null) {
  try {
    if (t) localStorage.setItem(TENANT_CACHE_KEY, JSON.stringify(t));
    else localStorage.removeItem(TENANT_CACHE_KEY);
  } catch { /* ignore */ }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Race condition koruması: her çağrıya benzersiz ID ver, eski çağrı sonuçları yok say
  const callIdRef = useRef(0);

  const loadTenant = useCallback(async () => {
    const myCallId = ++callIdRef.current;

    if (!profile) {
      if (myCallId !== callIdRef.current) return;
      setCurrentTenant(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Login sonrası hedef firma sessionStorage'da varsa → switch yap (reload yok!)
      const loginTarget = sessionStorage.getItem('login_target_tenant');
      sessionStorage.removeItem('login_target_tenant');

      let effectiveTenantId = profile.tenant_id;

      if (loginTarget && profile.tenant_id !== loginTarget) {
        // Süper admin → super_admin_switch_tenant (her zaman mevcut)
        // Normal kullanıcı → switch_my_tenant (user_tenants tablosu gerektirir)
        const rpcName = profile.is_super_admin
          ? 'super_admin_switch_tenant'
          : 'switch_my_tenant';
        const { error } = await supabase.rpc(rpcName, { p_tenant_id: loginTarget });
        if (!error) {
          effectiveTenantId = loginTarget;
        }
      }

      // Süper admin'in tenant_id'si null ise (önceden "Tüm Firmalar"a dönülmüş veya ilk giriş)
      // → localStorage cache'den son firmayı geri yükle
      if (!effectiveTenantId && profile.is_super_admin) {
        try {
          const cached = localStorage.getItem(TENANT_CACHE_KEY);
          if (cached) {
            const cachedTenant = JSON.parse(cached) as Tenant;
            if (cachedTenant?.id) {
              const { error } = await supabase.rpc('super_admin_switch_tenant', {
                p_tenant_id: cachedTenant.id,
              });
              if (!error) effectiveTenantId = cachedTenant.id;
            }
          }
        } catch { /* ignore */ }
      }

      // Aktif tenant'ı yükle
      const tenantId = effectiveTenantId;
      let tenant: Tenant | null = null;
      if (tenantId) {
        const { data } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', tenantId)
          .single();
        tenant = data ?? null;
      }

      // Tüm async işlemler bitti; bu çağrı hâlâ en güncel mi?
      if (myCallId !== callIdRef.current) return;

      setCurrentTenant(tenant);
      writeTenantCache(tenant);

      // Süper admin → tüm tenant listesini yükle
      if (profile.is_super_admin) {
        const { data } = await supabase
          .from('tenants')
          .select('*')
          .order('name');
        if (myCallId !== callIdRef.current) return;
        setAllTenants(data ?? []);
      } else {
        setAllTenants([]);
      }
    } catch (err) {
      console.error('TenantContext load error:', err);
    } finally {
      if (myCallId === callIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [profile?.id, profile?.tenant_id, profile?.is_super_admin]);

  useEffect(() => {
    loadTenant();
  }, [loadTenant]);

  /** Süper admin → belirtilen firmaya geçiş yapar */
  const switchTenant = useCallback(async (tenantId: string) => {
    if (!profile?.is_super_admin) return;
    try {
      const { error } = await supabase.rpc('super_admin_switch_tenant', {
        p_tenant_id: tenantId,
      });
      if (error) throw error;
      // Seçilen tenant'ı hemen göster
      const found = allTenants.find(t => t.id === tenantId) ?? null;
      setCurrentTenant(found);
      writeTenantCache(found);
      toast.success(`"${found?.name}" firmasına geçildi`);
      // Sayfayı yenile ki RLS filtresi çalışsın
      window.location.reload();
    } catch (err) {
      toast.error('Firma geçişi başarısız');
      console.error(err);
    }
  }, [profile?.is_super_admin, allTenants]);

  /** Süper admin → tüm firma görünümüne döner */
  const resetToSuperAdmin = useCallback(async () => {
    if (!profile?.is_super_admin) return;
    try {
      const { error } = await supabase.rpc('super_admin_switch_tenant', {
        p_tenant_id: null,
      });
      if (error) throw error;
      setCurrentTenant(null);
      writeTenantCache(null);
      toast.success('Süper admin görünümüne dönüldü');
      window.location.reload();
    } catch (err) {
      toast.error('Geri dönüş başarısız');
      console.error(err);
    }
  }, [profile?.is_super_admin]);

  return (
    <TenantContext.Provider value={{
      currentTenant,
      allTenants,
      isLoading,
      switchTenant,
      resetToSuperAdmin,
      refetch: loadTenant,
    }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
