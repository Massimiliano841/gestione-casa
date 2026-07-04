import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'

function emptyForm() {
  return {
    device_name: '',
    room: '',
    action: 'on',
    occurred_at: toLocalInput(new Date()),
    notes: '',
  }
}

export default function Automation() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('automation_log')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(200)
    if (error) console.error(error)
    setItems(data || [])
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  function openEdit(item) {
    setEditing(item)
    setForm({
      device_name: item.device_name || '',
      room: item.room || '',
      action: item.action || 'on',
      occurred_at: toLocalInput(new Date(item.occurred_at)),
      notes: item.notes || '',
    })
    setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const row = {
        device_name: form.device_name.trim(),
        room: form.room.trim() || null,
        action: form.action,
        occurred_at: new Date(form.occurred_at).toISOString(),
        notes: form.notes.trim() || null,
      }
      if (editing) {
        const { error } = await supabase
          .from('automation_log')
          .update(row)
          .eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('automation_log').insert(row)
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

  // Registrazione rapida on/off di un dispositivo gia noto
  async function quickLog(device_name, room, action) {
    const { error } = await supabase.from('automation_log').insert({
      device_name,
      room: room || null,
      action,
    })
    if (error) return alert('Errore: ' + error.message)
    await load()
  }

  async function handleDelete(item) {
    if (!confirm('Eliminare questa registrazione?')) return
    const { error } = await supabase.from('automation_log').delete().eq('id', item.id)
    if (error) return alert('Errore: ' + error.message)
    await load()
  }

  // Dispositivi distinti per le scorciatoie rapide
  const devices = [...new Map(items.map((i) => [i.device_name + '|' + (i.room || ''), i])).values()].slice(
    0,
    8
  )

  return (
    <div>
      <PageHeader
        icon="💡"
        title="Domotica"
        subtitle="Registro accensioni e spegnimenti"
        action={
          <button className="btn btn-primary" onClick={openNew}>
            + Registra
          </button>
        }
      />

      {devices.length > 0 && (
        <div className="quick-devices">
          <span className="quick-label">Rapido:</span>
          {devices.map((d) => (
            <span className="quick-device" key={d.id}>
              <span className="quick-name">
                {d.device_name}
                {d.room ? ` · ${d.room}` : ''}
              </span>
              <button
                className="chip chip-on"
                onClick={() => quickLog(d.device_name, d.room, 'on')}
              >
                ON
              </button>
              <button
                className="chip chip-off"
                onClick={() => quickLog(d.device_name, d.room, 'off')}
              >
                OFF
              </button>
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <Spinner label="Caricamento…" />
      ) : items.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">💡</div>
          <p>Nessuna registrazione.</p>
          <button className="btn btn-primary" onClick={openNew}>
            + Registra la prima
          </button>
        </div>
      ) : (
        <div className="log-list">
          {items.map((item) => (
            <div className="log-row" key={item.id}>
              <span className={item.action === 'on' ? 'dot dot-on' : 'dot dot-off'} />
              <div className="log-main">
                <div className="log-title">
                  {item.device_name}
                  {item.room && <span className="log-room"> · {item.room}</span>}
                </div>
                <div className="log-time">{formatDateTime(item.occurred_at)}</div>
                {item.notes && <div className="log-notes">{item.notes}</div>}
              </div>
              <span className={`action-badge action-${item.action}`}>
                {item.action.toUpperCase()}
              </span>
              <div className="card-actions">
                <button className="icon-btn" onClick={() => openEdit(item)} title="Modifica">
                  ✏️
                </button>
                <button className="icon-btn" onClick={() => handleDelete(item)} title="Elimina">
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal
          title={editing ? 'Modifica registrazione' : 'Nuova registrazione'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                Annulla
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={busy || !form.device_name.trim()}
              >
                {busy ? 'Salvataggio…' : 'Salva'}
              </button>
            </>
          }
        >
          <form className="form-grid" onSubmit={handleSave}>
            <label className="field">
              <span>Dispositivo *</span>
              <input
                value={form.device_name}
                onChange={(e) => setForm({ ...form, device_name: e.target.value })}
                placeholder="es. Caldaia, Luci giardino, Termostato…"
                autoFocus
                required
              />
            </label>
            <label className="field">
              <span>Stanza / Zona</span>
              <input
                value={form.room}
                onChange={(e) => setForm({ ...form, room: e.target.value })}
                placeholder="es. Salotto, Esterno…"
              />
            </label>
            <label className="field">
              <span>Azione</span>
              <select
                value={form.action}
                onChange={(e) => setForm({ ...form, action: e.target.value })}
              >
                <option value="on">Accensione (ON)</option>
                <option value="off">Spegnimento (OFF)</option>
                <option value="altro">Altro</option>
              </select>
            </label>
            <label className="field">
              <span>Data e ora</span>
              <input
                type="datetime-local"
                value={form.occurred_at}
                onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Note</span>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
          </form>
        </Modal>
      )}
    </div>
  )
}

// Converte una Date in stringa per <input type="datetime-local"> in ora locale
function toLocalInput(date) {
  const off = date.getTimezoneOffset()
  const local = new Date(date.getTime() - off * 60000)
  return local.toISOString().slice(0, 16)
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
