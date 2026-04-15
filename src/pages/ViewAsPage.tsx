/**
 * ViewAsPage — Süper admin bir firmanın panelini yeni sekmede görüntüler.
 * URL: /view-as?tenant=TENANT_ID
 *
 * 1. Tenant switch yapar (super_admin_switch_tenant RPC)
 * 2. sessionStorage'a impersonation flag yazar
 * 3. /dashboard'a yönlendirir
 */

import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/services/supabase';
import { useAuth } from '@/hooks/useAuth';

export const IMPERSONATION_KEY = 'sunmax_impersonating_tenant';

export function ViewAsPage() {
  const [searchParams] = useSearchParams();
  const { profile, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const tenantId = searchParams.get('tenant');

  useEffect(() => {
    if (authLoading) return;

    if (!profile?.is_super_admin) {
      setError('Bu sayfaya erişim için süper admin yetkisi gereklidir.');
      return;
    }

    if (!tenantId) {
      setError('Firma ID\'si belirtilmedi.');
      return;
    }

    (async () => {
      // Mevcut tenant'ı "dönüş noktası" olarak kaydet
      const { data: current } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', profile.id)
        .single();

      sessionStorage.setItem(IMPERSONATION_KEY, JSON.stringify({
        tenantId,
        originTenantId: current?.tenant_id ?? null,
      }));

      // Firmaya geçiş yap
      const { error: rpcErr } = await supabase.rpc('super_admin_switch_tenant', {
        p_tenant_id: tenantId,
      });

      if (rpcErr) {
        setError('Firma geçişi başarısız: ' + rpcErr.message);
        return;
      }

      // Dashboard'a yönlendir (tam sayfa — yeni context ile)
      window.location.href = '/dashboard';
    })();
  }, [authLoading, profile, tenantId]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
        <p className="text-sm text-red-600 font-medium">{error}</p>
        <button
          onClick={() => navigate('/admin/tenants')}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Firma Yönetimine Dön
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-gray-200 border-t-gray-600 rounded-full animate-spin"
          style={{ borderTopColor: '#374151', borderWidth: 3 }} />
        <p className="text-sm text-gray-500">Firma paneline geçiliyor…</p>
      </div>
    </div>
  );
}
