import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { usernameToEmail } from '../lib/auth'
import { versionLabel } from '../lib/version'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submitLogin(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password,
      })
      if (error) throw error
    } catch (err) {
      setError(traduciErrore(err.message))
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">🏡</div>
        <h1 className="auth-title">Gestione Casa</h1>
        <p className="auth-subtitle">Accedi al tuo spazio personale</p>

        <form
          id="loginForm"
          autoComplete="on"
          className="auth-form"
          onSubmit={submitLogin}
        >
          <label className="field">
            <span>Username</span>
            <input
              id="login-username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="Username..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Password..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <p className="alert alert-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Attendere…' : 'Entra →'}
          </button>
        </form>
        <p className="app-version">{versionLabel()}</p>
      </div>
    </div>
  )
}

function traduciErrore(msg) {
  if (!msg) return 'Si è verificato un errore.'
  if (msg.includes('Invalid login credentials')) return 'Username o password non corretti.'
  if (msg.includes('Email not confirmed')) return 'Account non ancora attivato.'
  return msg
}
