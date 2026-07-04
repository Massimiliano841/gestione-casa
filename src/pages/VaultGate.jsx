import { useState } from 'react'
import { useVault } from '../context/VaultProvider'
import { useAuth } from '../context/AuthProvider'
import Spinner from '../components/Spinner'

export default function VaultGate() {
  const { status, setupVault, unlockVault } = useVault()
  const { signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (status === 'checking') return <Spinner full label="Apertura cassaforte…" />

  const isSetup = status === 'needs-setup'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (isSetup) {
      if (password.length < 8) {
        setError('Usa almeno 8 caratteri per la master password.')
        return
      }
      if (password !== confirm) {
        setError('Le due password non coincidono.')
        return
      }
    }

    setBusy(true)
    try {
      if (isSetup) await setupVault(password)
      else await unlockVault(password)
    } catch (err) {
      setError(err.message || 'Errore imprevisto.')
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">{isSetup ? '🛡️' : '🔓'}</div>
        <h1 className="auth-title">
          {isSetup ? 'Crea la master password' : 'Sblocca la cassaforte'}
        </h1>
        <p className="auth-subtitle">
          {isSetup
            ? 'Protegge le tue password e informazioni con la crittografia.'
            : 'Inserisci la master password per accedere ai dati cifrati.'}
        </p>

        {isSetup && (
          <p className="alert alert-warning">
            ⚠️ <strong>Importante:</strong> questa password cifra i tuoi dati e{' '}
            <strong>non è recuperabile</strong>. Se la dimentichi, i dati cifrati
            saranno persi per sempre. Annotala in un posto sicuro.
          </p>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="field">
            <span>Master password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSetup ? 'new-password' : 'current-password'}
              autoFocus
              required
            />
          </label>

          {isSetup && (
            <label className="field">
              <span>Conferma master password</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
          )}

          {error && <p className="alert alert-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Attendere…' : isSetup ? 'Crea e continua' : 'Sblocca'}
          </button>
        </form>

        <button className="link-button" onClick={signOut}>
          Esci dall'account
        </button>
      </div>
    </div>
  )
}
