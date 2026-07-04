import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null)
      return
    }
    setProfileLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('username, role')
      .eq('user_id', userId)
      .maybeSingle()
    setProfile(data || null)
    setProfileLoading(false)
  }, [userId])

  // Carica il profilo (username + ruolo) quando cambia l'utente
  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    profile,
    profileLoading,
    username: profile?.username ?? null,
    isAdmin: profile?.role === 'admin',
    reloadProfile: loadProfile,
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve essere usato dentro <AuthProvider>')
  return ctx
}
