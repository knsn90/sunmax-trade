import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/hooks/useAuth';
import { router } from './router';
import { applyTheme, getStoredTheme } from '@/lib/theme';
import { supabase } from '@/services/supabase';
import { loadCompanySettings } from '@/services/companySettingsService';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

export function App() {
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
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
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
      </AuthProvider>
    </QueryClientProvider>
  );
}
