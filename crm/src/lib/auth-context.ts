import { createContext, useContext } from 'react'
import type { Profile } from '../../../shared/types'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'error'; message: string }
  | { status: 'not-foreman' } // вошёл рабочий или выключенный аккаунт
  | { status: 'ready'; profile: Profile }

export type AuthValue = AuthState & { signOut: () => Promise<void> }

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

/** Профиль вошедшего бригадира. Использовать только на экранах после входа. */
export function useProfile(): Profile {
  const auth = useAuth()
  if (auth.status !== 'ready') throw new Error('Not signed in')
  return auth.profile
}
