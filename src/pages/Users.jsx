import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'

const EMPTY = { username: '', password: '', role: 'user' }

export default function Users() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, username, role, created_at')
      .order('created_at', { ascending: true })
    if (error) console.error(error)
    setItems(data || [])
    setLoading(false)
  }

  function openNew() {
    setForm(EMPTY)
    setError('')
    setModalOpen(true)
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'create',
          username: form.username,
          password: form.password,
          role: form.role,
        },
      })
      if (error) throw new Error(await estraiErrore(error))
      if (data?.error) throw new Error(data.error)
      setModalOpen(false)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(item) {
    if (!confirm(`Eliminare l'utente "${item.username}"? Verranno cancellati anche tutti i suoi dati.`))
      return
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'delete', user_id: item.user_id },
      })
      if (error) throw new Error(await estraiErrore(error))
      if (data?.error) throw new Error(data.error)
      await load()
    } catch (err) {
      alert('Errore: ' + err.message)
    }
  }

  return (
    <div>
      <PageHeader
        icon="👥"
        title="Utenti"
        subtitle="Gestisci gli accessi all'app"
        action={
          <button className="btn btn-primary" onClick={openNew}>
            + Nuovo utente
          </button>
        }
      />

      {loading ? (
        <Spinner label="Caricamento…" />
      ) : (
        <div className="card-list">
          {items.map((item) => (
            <div className="card" key={item.user_id}>
              <div className="card-main">
                <div className="card-title">
                  {item.username}
                  {item.user_id === user?.id && <span className="tag tag-soft"> tu</span>}
                </div>
                <div className="tag-row">
                  <span className={item.role === 'admin' ? 'tag tag-admin' : 'tag'}>
                    {item.role === 'admin' ? '👑 Admin' : 'Utente'}
                  </span>
                </div>
              </div>
              <div className="card-actions">
                {item.user_id !== user?.id && (
                  <button
                    className="icon-btn"
                    onClick={() => handleDelete(item)}
                    title="Elimina utente"
                  >
                    🗑
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal
          title="Nuovo utente"
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                Annulla
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={busy || !form.username.trim() || form.password.length < 6}
              >
                {busy ? 'Creazione…' : 'Crea utente'}
              </button>
            </>
          }
        >
          <form className="form-grid" onSubmit={handleCreate}>
            <label className="field">
              <span>Username *</span>
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="es. mario (3-32 caratteri)"
                autoFocus
                required
              />
            </label>
            <label className="field">
              <span>Password * (min. 6 caratteri)</span>
              <input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Password iniziale"
                required
              />
            </label>
            <label className="field">
              <span>Ruolo</span>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="user">Utente</option>
                <option value="admin">Admin (può gestire altri utenti)</option>
              </select>
            </label>
            {error && <p className="alert alert-error">{error}</p>}
          </form>
        </Modal>
      )}
    </div>
  )
}

// La Edge Function, in caso di errore HTTP, mette il messaggio nel corpo JSON
async function estraiErrore(error) {
  try {
    const ctx = error?.context
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json()
      if (body?.error) return body.error
    }
  } catch {
    /* ignora */
  }
  return error?.message || 'Errore imprevisto'
}
