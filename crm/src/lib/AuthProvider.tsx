import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Profile } from '../../../shared/types'
import { AuthContext, type AuthState } from './auth-context'
import { supabase } from './supabase'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let alive = true

    async function loadProfile(userId: string) {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
      if (!alive) return
      if (error) {
        setState({ status: 'error', message: error.message })
        return
      }
      const profile = data as Profile | null
      setState(
        profile?.role === 'foreman' && profile.active
          ? { status: 'ready', profile }
          : { status: 'not-foreman' },
      )
    }

    // Срабатывает сразу (INITIAL_SESSION), затем на вход и выход
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return
      if (!session) {
        setState({ status: 'signed-out' })
        return
      }
      // Запросы к базе прямо в этом колбэке могут зависнуть — выносим из него
      const userId = session.user.id
      setTimeout(() => void loadProfile(userId), 0)
    })

    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(
    () => ({
      ...state,
      signOut: async () => {
        await supabase.auth.signOut()
      },
    }),
    [state],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
