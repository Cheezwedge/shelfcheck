import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getDeviceId } from './identity';
import { fetchProfile } from './api';
import { clearFavorites } from './stores';
import { clearAllLists } from './groceryList';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isGuest: boolean;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  claimGuestPoints: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadAdminFlag(uid: string) {
    const { data } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', uid)
      .maybeSingle();
    setIsAdmin(data?.is_admin === true);
  }

  useEffect(() => {
    // Restore existing session from localStorage on mount
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user.id) loadAdminFlag(data.session.user.id);
      setLoading(false);
    });

    // Keep session state in sync
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (newSession?.user.id) loadAdminFlag(newSession.user.id);
      else {
        setIsAdmin(false);
        if (event === 'SIGNED_OUT') { clearFavorites(); clearAllLists(); }
      }
    });

    return () => { listener.subscription.unsubscribe(); };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: 'https://shelfcheckapp.com' },
    });
    if (error) throw error;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  /**
   * Merges the current device's guest points into the signed-in auth profile.
   * Returns true if there were points to claim, false if the guest profile was empty.
   */
  async function claimGuestPoints(): Promise<boolean> {
    const currentSession = (await supabase.auth.getSession()).data.session;
    if (!currentSession) return false;

    const guestId = getDeviceId();
    const guestProfile = await fetchProfile(guestId);
    if (!guestProfile || guestProfile.points === 0) return false;

    const { error } = await supabase.rpc('merge_guest_profile', {
      guest_id: guestId,
      auth_id: currentSession.user.id,
    });
    if (error) throw error;
    return true;
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    isGuest: session === null,
    isAdmin,
    loading,
    signIn,
    signUp,
    signOut,
    claimGuestPoints,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Returns auth.uid() when signed in, device UUID when guest. */
export function getReportingUserId(session: Session | null): string {
  return session?.user.id ?? getDeviceId();
}
