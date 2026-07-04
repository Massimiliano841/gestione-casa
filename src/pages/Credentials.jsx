import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'

const EMPTY = { title: '', username: '', url: '', password: '', notes: '', category: '' }

export default function Credentials() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [revealed, setRevealed] = useState({}) // id -> true se password visibile

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('credentials').select('*').order('title')
    if (error) console.error(error)
    setItems(data || [])
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm(EMPTY)
    setModalOpen(true)
  }

  function openEdit(item) {
    setEditing(item)
    setForm({
      title: item.title || '',
      username: item.username || '',
      url: item.url || '',
      password: item.password || '',
      notes: item.notes || '',
      category: item.category || '',
    })
    setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const row = {
        title: form.title.trim(),
        username: form.username.trim() || null,
        url: form.url.trim() || null,
        category: form.category.trim() || null,
        password: form.password || null,
        notes: form.notes || null,
      }
      if (editing) {
        const { error } = await supabase
          .from('credentials')
          .update(row)
          .eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('credentials').insert(row)
        if (error) throw error
      }
      setModalOpen(false)
      await load()
    } catch (err) {
      alert('Errore nel salvataggio: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(item) {
    if (!confirm(`Eliminare "${item.title}"?`)) return
    const { error } = await supabase.from('credentials').delete().eq('id', item.id)
    if (error) return alert('Errore: ' + error.message)
    await load()
  }

  function toggleReveal(id) {
    setRevealed((r) => ({ ...r, [id]: !r[id] }))
  }

  async function copyPassword(item) {
    try {
      await navigator.clipboard.writeText(item.password || '')
    } catch {
      alert('Impossibile copiare la password.')
    }
  }

  const filtered = items.filter((i) => {
    const q = query.toLowerCase()
    return (
      !q ||
      i.title?.toLowerCase().includes(q) ||
      i.username?.toLowerCase().includes(q) ||
      i.category?.toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <PageHeader
        icon="🔐"
        title="Password"
        subtitle="Le tue credenziali, protette dal login"
        action={
          <button className="btn btn-primary" onClick={openNew}>
            + Aggiungi
          </button>
        }
      />

      <input
        className="search"
        placeholder="Cerca…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {loading ? (
        <Spinner label="Caricamento…" />
      ) : filtered.length === 0 ? (
        <EmptyState onAdd={openNew} />
      ) : (
        <div className="card-list">
          {filtered.map((item) => (
            <div className="card" key={item.id}>
              <div className="card-main">
                <div className="card-title">{item.title}</div>
                {item.username && <div className="card-sub">{item.username}</div>}
                {item.url && (
                  <a
                    className="card-link"
                    href={ensureHttp(item.url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.url}
                  </a>
                )}
                {item.password && (
                  <div className="pw-row">
                    <code className="pw-value">
                      {revealed[item.id] ? item.password : '••••••••••'}
                    </code>
                    <button className="chip" onClick={() => toggleReveal(item.id)}>
                      {revealed[item.id] ? '🙈 Nascondi' : '👁 Mostra'}
                    </button>
                    <button className="chip" onClick={() => copyPassword(item)}>
                      📋 Copia
                    </button>
                  </div>
                )}
                {item.notes && <div className="card-desc">{item.notes}</div>}
                {item.category && <span className="tag">{item.category}</span>}
              </div>
              <div className="card-actions">
                <button className="icon-btn" onClick={() => openEdit(item)} title="Modifica">
                  ✏️
                </button>
                <button
                  className="icon-btn"
                  onClick={() => handleDelete(item)}
                  title="Elimina"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal
          title={editing ? 'Modifica credenziale' : 'Nuova credenziale'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                Annulla
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={busy || !form.title.trim()}
              >
                {busy ? 'Salvataggio…' : 'Salva'}
              </button>
            </>
          }
        >
          <form className="form-grid" onSubmit={handleSave}>
            <Field label="Titolo *">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                autoFocus
                required
              />
            </Field>
            <Field label="Username / Email">
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </Field>
            <Field label="Password">
              <input
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            <Field label="Sito web (URL)">
              <input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="es. https://…"
              />
            </Field>
            <Field label="Categoria">
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="es. Banca, Email, Utenze…"
              />
            </Field>
            <Field label="Note">
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
          </form>
        </Modal>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function EmptyState({ onAdd }) {
  return (
    <div className="empty">
      <div className="empty-icon">🔐</div>
      <p>Nessuna credenziale salvata.</p>
      <button className="btn btn-primary" onClick={onAdd}>
        + Aggiungi la prima
      </button>
    </div>
  )
}

function ensureHttp(url) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}
