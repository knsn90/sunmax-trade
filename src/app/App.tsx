import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/hooks/useAuth';
import { TenantProvider } from '@/contexts/TenantContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { router } from './router';
import { applyTheme, getStoredTheme } from '@/lib/theme';
import { supabase } from '@/services/supabase';
import { loadCompanySettings } from '@/services/companySettingsService';
import { useAutoBackupEmail } from '@/hooks/useAutoBackupEmail';
import { UpdatePrompt } from '@/components/ui/UpdatePrompt';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,  // 5 minutes — fresh, no refetch on navigate
      gcTime: 1000 * 60 * 30,    // 30 minutes — keep cache alive after unmount
      // Smart retry: don't retry on JWT/auth errors — Supabase handles refresh,
      // retrying immediately with the same expired token always fails.
      retry: (failureCount, error: unknown) => {
        const msg = (error as Error)?.message ?? '';
        if (msg.includes('JWT') || msg.includes('expired') || msg.includes('PGRST301')) {
          return false;
        }
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  useAutoBackupEmail();

  useEffect(() => {
    applyTheme(getStoredTheme());

    // If "Remember Me" was not checked, sign out on new browser session
    const rememberMe = localStorage.getItem('sunmax_remember_me') === 'true';
    const sessionActive = sessionStorage.getItem('authenticated') === 'true';
    if (!rememberMe && !sessionActive) {
      supabase.auth.signOut();
    }

    // Load company settings (API keys, etc.) from Supabase into memory cache
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        loadCompanySettings();
      }
    });

    // Also reload when user logs in
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        loadCompanySettings();
      }
    });

    // ── Idle token refresh ────────────────────────────────────────────────────
    // After idle (device sleep / tab background), the Supabase JWT may have
    // expired. autoRefreshToken only fires on a 401, but if the network was
    // offline the request never even reached the server, so no 401 is returned
    // and the token is never refreshed → all queries fail silently on resume.
    // Solution: on window focus check the token age and proactively refresh.
    const handleFocus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const expiresAt = session.expires_at ?? 0;         // Unix seconds
        const nowSec    = Math.floor(Date.now() / 1000);
        const remaining = expiresAt - nowSec;
        if (remaining < 600) {                             // < 10 min left
          const { error } = await supabase.auth.refreshSession();
          if (error) {
            // Refresh token is invalid/expired → force sign-out so user sees login
            await supabase.auth.signOut();
            return;
          }
          // Invalidate all stale queries so they re-run with the fresh token
          queryClient.invalidateQueries();
        }
      } catch {
        // Network offline — queries will show error state normally
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* AuthProvider en dışta — TenantContext useAuth'a bağımlı */}
      <AuthProvider>
        {/* TenantProvider: profil yüklendikten sonra tenant bilgisini çeker */}
        <TenantProvider>
          {/* ThemeProvider: tenant primary_color'ını accent olarak kullanır */}
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
