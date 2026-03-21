import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/hooks/useAuth';
import { router } from './router';
import { applyTheme, getStoredTheme } from '@/lib/theme';

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
