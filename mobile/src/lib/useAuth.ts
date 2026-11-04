import { useCallback, useEffect, useState } from 'react';
import type { Profile } from '../../../shared/types';
import { supabase } from './supabase';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'error'; message: string; userId: string }
  | { status: 'foreman' } // бригадир работает в веб-CRM
  | { status: 'disabled' } // бригадир выключил аккаунт
  | { status: 'ready'; profile: Profile };

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) {
      setState({ status: 'error', message: error.message, userId });
      return;
    }
    const profile = data as Profile | null;
    if (!profile || !profile.active) setState({ status: 'disabled' });
    else if (profile.role === 'foreman') setState({ status: 'foreman' });
    else setState({ status: 'ready', profile });
  }, []);

  useEffect(() => {
    // Срабатывает сразу (INITIAL_SESSION), затем на вход и выход
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
      if (!session) {
        setState({ status: 'signed-out' });
        return;
      }
      // Запросы к базе прямо в этом колбэке могут зависнуть — выносим из него
      const userId = session.user.id;
      setTimeout(() => void loadProfile(userId), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [loadProfile]);

  return { state, retry: loadProfile };
}
