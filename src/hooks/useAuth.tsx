import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { supabase } from '@/services/supabase';
import type { Profile } from '@/types/database';
import type { Session, User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Failed to fetch profile:', error.message);
        setProfile(null);
      } else {
        const p = data as Profile | null;
        // Auto sign-out deactivated users
        if (p && p.is_active === false) {
          await supabase.auth.signOut();
          setProfile(null);
          alert('Hesabınız devre dışı bırakıldı. Lütfen yöneticinizle iletişime geçin.');
          return;
        }
        setProfile(p);
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const timeout = new Promise<{ data: { session: null }; error: null }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null }, error: null }), 8000)
        );
        const { data: { session: s } } = await Promise.race([
          supabase.auth.getSession(),
          timeout,
        ]);

        if (!mounted) return;

        setSession(s);
        setUser(s?.user ?? null);

        if (s?.user) {
          await fetchProfile(s.user.id);
        }
      } catch (err) {
        console.error('Auth init error:', err);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    init();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        if (!mounted) return;

        setSession(s);
        setUser(s?.user ?? null);

        if (s?.user) {
          await fetchProfile(s.user.id);
        } else {
          setProfile(null);
        }
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, session, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
