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
  refreshProfile: () => Promise<void>;
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
          alert('Your account has been deactivated. Please contact your administrator.');
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

    // 1) getSession() reads from localStorage — near-instant, no network.
    //    Sets the initial auth state and clears the loading spinner.
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) await fetchProfile(s.user.id);
      if (mounted) setIsLoading(false);
    }).catch(() => {
      if (mounted) setIsLoading(false);
    });

    // 2) onAuthStateChange handles all subsequent auth events.
    //    INITIAL_SESSION is skipped because getSession() above already handles it.
    //    All other events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED)
    //    are processed immediately — no initialDone flag needed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (!mounted) return;

        // Skip INITIAL_SESSION — getSession() above already handles the initial state.
        // Processing it here would cause a duplicate profile fetch on every page load.
        if (event === 'INITIAL_SESSION') return;

        setSession(s);
        setUser(s?.user ?? null);

        if (s?.user) {
          await fetchProfile(s.user.id);
        } else {
          // SIGNED_OUT or session expired → clear user data
          setProfile(null);
          if (mounted) setIsLoading(false);
        }
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  async function logEvent(userId: string, event: 'login' | 'logout') {
    try {
      await supabase.from('user_logins').insert({ user_id: userId, event });
    } catch { /* silent */ }
  }

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // Delay logEvent so the Supabase client session is fully propagated before the insert
    if (data.user) setTimeout(() => logEvent(data.user!.id, 'login'), 100);
  }, []);

  const signOut = useCallback(async () => {
    if (user) await logEvent(user.id, 'logout');
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, profile, session, isLoading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
