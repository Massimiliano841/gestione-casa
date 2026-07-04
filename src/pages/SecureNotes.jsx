import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useVault } from '../context/VaultProvider'
import { encryptText, decryptText } from '../lib/crypto'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'

const EMPTY = { title: '', content: '', category: '' }

export default function SecureNotes() {
  const { vaultKey } = useVault()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [decrypted, setDecrypted] = useState({}) // id -> contenuto in chiaro

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('secure_notes')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) console.error(error)
    setItems(data || [])
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm(EMPTY)
    setModalOpen(true)
  }

  async function openEdit(item) {
    let content = ''
    try {
      content = await decryptText(vaultKey, item.content_enc)
    } catch {
      alert('Impossibile decifrare questa nota.')
    }
    setEditing(item)
    setForm({ title: item.title || '', content, category: item.category || '' })
    setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const content_enc = await encryptText(vaultKey, form.content)
      const row = {
        title: form.title.trim(),
        category: form.category.trim() || null,
        content_enc,
      }
      if (editing) {
        const { error } = await supabase
          .from('secure_notes')
          .update(row)
          .eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('secure_notes').insert(row)
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
    const { error } = await supabase.from('secure_notes').delete().eq('id', item.id)
    if (error) return alert('Errore: ' + error.message)
    await load()
  }

  async function toggleOpen(item) {
    if (openId === item.id) {
      setOpenId(null)
      return
    }
    if (!decrypted[item.id]) {
      try {
        const text = await decryptText(vaultKey, item.content_enc)
        setDecrypted((d) => ({ ...d, [item.id]: text }))
      } catch {
        alert('Impossibile decifrare questa nota.')
        return
      }
    }
    setOpenId(item.id)
  }

  const filtered = items.filter((i) => {
    const q = query.toLowerCase()
    return !q || i.title?.toLowerCase().includes(q) || i.category?.toLowerCase().includes(q)
  })

  return (
    <div>
      <PageHeader
        icon="📄"
        title="Informazioni"
        subtitle="Note e dati importanti, cifrati"
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
        <div className="empty">
          <div className="empty-icon">📄</div>
          <p>Nessuna informazione salvata.</p>
          <button className="btn btn-primary" onClick={openNew}>
            + Aggiungi la prima
          </button>
        </div>
      ) : (
        <div className="card-list">
          {filtered.map((item) => (
            <div className="card" key={item.id}>
              <div className="card-main">
                <div className="card-title">{item.title}</div>
                {item.category && <span className="tag">{item.category}</span>}
                {openId === item.id && (
                  <pre className="note-content">{decrypted[item.id]}</pre>
                )}
                <button className="chip" onClick={() => toggleOpen(item)}>
                  {openId === item.id ? '🙈 Nascondi' : '👁 Mostra contenuto'}
                </button>
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
          title={editing ? 'Modifica informazione' : 'Nuova informazione'}
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
            <label className="field">
              <span>Titolo *</span>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                autoFocus
                required
              />
            </label>
            <label className="field">
              <span>Categoria</span>
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="es. Documenti, Contatti, Codici…"
              />
            </label>
            <label className="field">
              <span>Contenuto (cifrato)</span>
              <textarea
                rows={8}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Numeri, codici, indirizzi, note…"
              />
            </label>
          </form>
        </Modal>
      )}
    </div>
  )
}
