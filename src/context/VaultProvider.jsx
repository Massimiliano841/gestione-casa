import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  deriveKey,
  generateSalt,
  encryptText,
  verifyKey,
  VERIFIER_PLAINTEXT,
} from '../lib/crypto'
import { useAuth } from './AuthProvider'

const VaultContext = createContext(null)

// Stati possibili della cassaforte:
//  'checking'    -> sto leggendo vault_meta
//  'needs-setup' -> primo accesso, va creata la master password
//  'locked'      -> esiste la cassaforte ma va sbloccata
//  'unlocked'    -> chiave in memoria, si puo leggere/scrivere
export function VaultProvider({ children }) {
  const { user } = useAuth()
  const [status, setStatus] = useState('checking')
  const [vaultKey, setVaultKey] = useState(null)
  const [meta, setMeta] = useState(null) // { kdf_salt, verifier }

  // Quando cambia l'utente, ricontrolla lo stato della cassaforte
  useEffect(() => {
    let active = true
    setVaultKey(null)

    if (!user) {
      setStatus('checking')
      return
    }

    setStatus('checking')
    supabase
      .from('vault_meta')
      .select('kdf_salt, verifier')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          console.error('Errore lettura vault_meta:', error)
          setStatus('needs-setup')
          return
        }
        if (!data) {
          setStatus('needs-setup')
        } else {
          setMeta(data)
          setStatus('locked')
        }
      })

    return () => {
      active = false
    }
  }, [user])

  // Primo accesso: crea salt + verifier cifrato e salva su DB
  const setupVault = useCallback(
    async (masterPassword) => {
      const salt = generateSalt()
      const key = await deriveKey(masterPassword, salt)
      const verifier = await encryptText(key, VERIFIER_PLAINTEXT)

      const { error } = await supabase.from('vault_meta').insert({
        user_id: user.id,
        kdf_salt: salt,
        verifier,
      })
      if (error) throw error

      setMeta({ kdf_salt: salt, verifier })
      setVaultKey(key)
      setStatus('unlocked')
    },
    [user]
  )

  // Sblocco: deriva la chiave e la valida contro il verifier
  const unlockVault = useCallback(
    async (masterPassword) => {
      if (!meta) throw new Error('Cassaforte non inizializzata')
      const key = await deriveKey(masterPassword, meta.kdf_salt)
      const ok = await verifyKey(key, meta.verifier)
      if (!ok) throw new Error('Master password errata')
      setVaultKey(key)
      setStatus('unlocked')
    },
    [meta]
  )

  // Blocca (dimentica la chiave in memoria)
  const lockVault = useCallback(() => {
    setVaultKey(null)
    if (meta) setStatus('locked')
  }, [meta])

  const value = {
    status,
    vaultKey,
    setupVault,
    unlockVault,
    lockVault,
  }

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useVault() {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error('useVault deve essere usato dentro <VaultProvider>')
  return ctx
}
