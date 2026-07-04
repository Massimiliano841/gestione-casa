import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        // Se la conferma email e' attiva, non c'e' sessione immediata
        if (!data.session) {
          setInfo(
            'Account creato! Controlla la tua email per confermarlo, poi torna qui ed accedi.'
          )
          setMode('signin')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setError(traduciErrore(err.message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">🏡</div>
        <h1 className="auth-title">Gestione Casa</h1>
        <p className="auth-subtitle">
          {mode === 'signin'
            ? 'Accedi al tuo spazio personale'
            : 'Crea il tuo account'}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </label>

          {error && <p className="alert alert-error">{error}</p>}
          {info && <p className="alert alert-info">{info}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Attendere…' : mode === 'signin' ? 'Accedi' : 'Registrati'}
          </button>
        </form>

        <button
          className="link-button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError('')
            setInfo('')
          }}
        >
          {mode === 'signin'
            ? 'Non hai un account? Registrati'
            : 'Hai gia un account? Accedi'}
        </button>
      </div>
    </div>
  )
}

function traduciErrore(msg) {
  if (!msg) return 'Si e verificato un errore.'
  if (msg.includes('Invalid login credentials')) return 'Email o password non corretti.'
  if (msg.includes('already registered')) return 'Questa email e gia registrata.'
  if (msg.includes('Email not confirmed'))
    return 'Devi prima confermare la tua email (controlla la posta).'
  return msg
}
