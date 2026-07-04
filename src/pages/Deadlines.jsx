import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'

const EMPTY = {
  title: '',
  description: '',
  due_date: '',
  recurrence: 'none',
  category: '',
}

const RECURRENCE_LABEL = {
  none: 'Nessuna',
  monthly: 'Mensile',
  yearly: 'Annuale',
}

export default function Deadlines() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('deadlines')
      .select('*')
      .order('due_date', { ascending: true })
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
      description: item.description || '',
      due_date: item.due_date || '',
      recurrence: item.recurrence || 'none',
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
        description: form.description.trim() || null,
        due_date: form.due_date,
        recurrence: form.recurrence,
        category: form.category.trim() || null,
      }
      if (editing) {
        const { error } = await supabase.from('deadlines').update(row).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('deadlines').insert(row)
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

  async function toggleDone(item) {
    // Se ricorrente e la sto completando, sposto la data al periodo successivo
    if (!item.is_completed && item.recurrence !== 'none') {
      const next = nextDate(item.due_date, item.recurrence)
      const { error } = await supabase
        .from('deadlines')
        .update({ due_date: next })
        .eq('id', item.id)
      if (error) return alert('Errore: ' + error.message)
    } else {
      const { error } = await supabase
        .from('deadlines')
        .update({ is_completed: !item.is_completed })
        .eq('id', item.id)
      if (error) return alert('Errore: ' + error.message)
    }
    await load()
  }

  async function handleDelete(item) {
    if (!confirm(`Eliminare "${item.title}"?`)) return
    const { error } = await supabase.from('deadlines').delete().eq('id', item.id)
    if (error) return alert('Errore: ' + error.message)
    await load()
  }

  const visible = items.filter((i) => showDone || !i.is_completed)

  return (
    <div>
      <PageHeader
        icon="📅"
        title="Scadenze"
        subtitle="Bollette, revisioni, rinnovi…"
        action={
          <button className="btn btn-primary" onClick={openNew}>
            + Aggiungi
          </button>
        }
      />

      <label className="checkbox-inline">
        <input
          type="checkbox"
          checked={showDone}
          onChange={(e) => setShowDone(e.target.checked)}
        />
        Mostra completate
      </label>

      {loading ? (
        <Spinner label="Caricamento…" />
      ) : visible.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📅</div>
          <p>Nessuna scadenza in programma.</p>
          <button className="btn btn-primary" onClick={openNew}>
            + Aggiungi la prima
          </button>
        </div>
      ) : (
        <div className="card-list">
          {visible.map((item) => {
            const status = dueStatus(item.due_date, item.is_completed)
            return (
              <div className={`card deadline ${status.cls}`} key={item.id}>
                <button
                  className={item.is_completed ? 'check checked' : 'check'}
                  onClick={() => toggleDone(item)}
                  title={item.is_completed ? 'Segna da fare' : 'Segna fatto'}
                >
                  {item.is_completed ? '✓' : ''}
                </button>
                <div className="card-main">
                  <div className={item.is_completed ? 'card-title done' : 'card-title'}>
                    {item.title}
                  </div>
                  <div className="card-sub">
                    {formatDate(item.due_date)} · <span className={status.cls}>{status.label}</span>
                  </div>
                  {item.description && <div className="card-desc">{item.description}</div>}
                  <div className="tag-row">
                    {item.category && <span className="tag">{item.category}</span>}
                    {item.recurrence !== 'none' && (
                      <span className="tag tag-soft">🔁 {RECURRENCE_LABEL[item.recurrence]}</span>
                    )}
                  </div>
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
            )
          })}
        </div>
      )}

      {modalOpen && (
        <Modal
          title={editing ? 'Modifica scadenza' : 'Nuova scadenza'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                Annulla
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={busy || !form.title.trim() || !form.due_date}
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
              <span>Data scadenza *</span>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Ricorrenza</span>
              <select
                value={form.recurrence}
                onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
              >
                <option value="none">Nessuna</option>
                <option value="monthly">Mensile</option>
                <option value="yearly">Annuale</option>
              </select>
            </label>
            <label className="field">
              <span>Categoria</span>
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="es. Auto, Casa, Utenze…"
              />
            </label>
            <label className="field">
              <span>Descrizione</span>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
          </form>
        </Modal>
      )}
    </div>
  )
}

// --- utility date ---
function todayISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function dueStatus(dateStr, done) {
  if (done) return { cls: 'done', label: 'Completata' }
  const due = new Date(dateStr + 'T00:00:00')
  const today = todayISO()
  const diff = Math.round((due - today) / 86400000)
  if (diff < 0) return { cls: 'overdue', label: `Scaduta da ${-diff} g` }
  if (diff === 0) return { cls: 'soon', label: 'Oggi' }
  if (diff === 1) return { cls: 'soon', label: 'Domani' }
  if (diff <= 7) return { cls: 'soon', label: `Tra ${diff} giorni` }
  return { cls: 'ok', label: `Tra ${diff} giorni` }
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function nextDate(dateStr, recurrence) {
  const d = new Date(dateStr + 'T00:00:00')
  if (recurrence === 'monthly') d.setMonth(d.getMonth() + 1)
  else if (recurrence === 'yearly') d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}
