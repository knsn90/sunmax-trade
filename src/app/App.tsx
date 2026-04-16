import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { toast } from 'sonner';
import { AuthProvider } from '@/hooks/useAuth';
import { TenantProvider } from '@/contexts/TenantContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { router } from './router';
import { applyTheme, getStoredTheme } from '@/lib/theme';
import { supabase } from '@/services/supabase';
import { loadCompanySettings } from '@/services/companySettingsService';
import { useAutoBackupEmail } from '@/hooks/useAutoBackupEmail';
import { UpdatePrompt } from '@/components/ui/UpdatePrompt';

// ─── Global auth-error recovery ───────────────────────────────────────────────
// Single flag prevents multiple concurrent refresh attempts.
let authRecovering = false;

async function handleAuthError(error: unknown) {
  const msg = (error as Error)?.message ?? '';
  const name = (error as Error)?.name ?? '';

  // AbortError = our 15-second data timeout fired. Not an auth issue.
  if (name === 'AbortError' || msg.includes('AbortError')) return;

  const isAuthErr =
    msg.includes('JWT') ||
    msg.includes('expired') ||
    msg.includes('not authenticated') ||
    msg.includes('PGRST301') ||
    msg.includes('invalid claim');

  if (!isAuthErr || authRecovering) return;
  authRecovering = true;

  try {
    const { error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr) {
      // Refresh token da geçersiz → kullanıcıyı login'e gönder
      toast.error('Oturumunuz sona erdi. Lütfen tekrar giriş yapın.');
      await supabase.auth.signOut();
    } else {
      // Yeni token alındı → tüm sorguları yenile
      queryClient.invalidateQueries();
    }
  } catch {
    // Network tamamen down — sessizce geç
  } finally {
    authRecovering = false;
  }
}

// ─── QueryClient — global cache ──────────────────────────────────────────────
const queryClient = new QueryClient({
  // Global query hata yakalayıcı
  queryCache: new QueryCache({
    onError: (error) => { handleAuthError(error); },
  }),
  // Global mutation hata yakalayıcı — form donmalarının asıl çözümü
  mutationCache: new MutationCache({
    onError: (error) => { handleAuthError(error); },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,   // 5 dak — navigate'de refetch yok
      gcTime:    1000 * 60 * 30,  // 30 dak — unmount sonrası cache'de kal
      // Retry politikası: auth/abort hatalarında retry yapma — zaten başarısız olacak
      retry: (failureCount, error: unknown) => {
        const msg  = (error as Error)?.message ?? '';
        const name = (error as Error)?.name   ?? '';
        if (
          name === 'AbortError'      ||
          msg.includes('AbortError') ||
          msg.includes('JWT')        ||
          msg.includes('expired')    ||
          msg.includes('PGRST301')
        ) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});

// ─── App ──────────────────────────────────────────────────────────────────────
export function App() {
  useAutoBackupEmail();

  useEffect(() => {
    applyTheme(getStoredTheme());

    // Remember Me kontrolü: yeni tarayıcı oturumunda oturum kapat
    const rememberMe   = localStorage.getItem('sunmax_remember_me') === 'true';
    const sessionActive = sessionStorage.getItem('authenticated') === 'true';
    if (!rememberMe && !sessionActive) {
      supabase.auth.signOut();
    }

    // Şirket ayarlarını yükle
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) loadCompanySettings();
    });

    // Auth state listener — sign-in/out olaylarını yakala
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN')  loadCompanySettings();
      if (event === 'SIGNED_OUT') queryClient.clear(); // cache'i tamamen temizle
    });

    // ── Proaktif session sağlık kontrolü ─────────────────────────────────────
    //
    // İki senaryo:
    //
    // A) Tab açık kalır, hiç blur olmaz:
    //    1 saatlik JWT sessizce expire olur. autoRefreshToken genellikle halleder
    //    ama network anlık kapalıysa sessizce başarısız olabilir.
    //    4 dakikada bir kontrol bu durumu yakalıyor.
    //
    // B) Cihaz uyku / tab arka plana alınır:
    //    Resume'de focus eventi hemen fırlar → kullanıcı eylem yapmadan önce token yenilenir.
    //
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const remaining = (session.expires_at ?? 0) - Math.floor(Date.now() / 1000);

        if (remaining < 600) { // < 10 dakika kaldıysa şimdi yenile
          const { error } = await supabase.auth.refreshSession();
          if (error) {
            // Refresh token da expired → login'e yönlendir
            toast.error('Oturumunuz sona erdi. Lütfen tekrar giriş yapın.');
            await supabase.auth.signOut();
          } else {
            // Yeni token → stale sorguları yeniden çalıştır
            queryClient.invalidateQueries();
          }
        }
      } catch {
        // Network down — sorgu hata state'inde gösterilir, sessizce geç
      }
    };

    window.addEventListener('focus', checkSession);
    const sessionInterval = setInterval(checkSession, 4 * 60 * 1000); // her 4 dakika

    return () => {
      window.removeEventListener('focus', checkSession);
      clearInterval(sessionInterval);
      authSub.unsubscribe();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TenantProvider>
          <ThemeProvider>
            <RouterProvider router={router} />
            <Toaster
              position="bottom-right"
              toastOptions={{
                style: {
                  background: '#1a2332',
                  color: '#fff',
                  fontSize: '12px',
                  borderRadius: '8px',
                },
              }}
            />
            <UpdatePrompt />
          </ThemeProvider>
        </TenantProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
