import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'

const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const HOURS = Array.from({ length: 24 }, (_, h) => h)

// Griglia vuota: 7 giorni (0=Lun..6=Dom) x 24 ore, tutte spente
function emptyGrid() {
  return DAYS.map(() => HOURS.map(() => false))
}

// Normalizza uno schedule arrivato dal DB in una matrice 7x24 di booleani
function normalizeSchedule(raw) {
  const grid = emptyGrid()
  if (!Array.isArray(raw)) return grid
  for (let d = 0; d < 7; d++) {
    const col = raw[d]
    if (!Array.isArray(col)) continue
    for (let h = 0; h < 24; h++) grid[d][h] = Boolean(col[h])
  }
  return grid
}

export default function Automation() {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState({})
  const [saving, setSaving] = useState({})
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ device_name: '', room: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('automation_schedule')
      .select('*')
      .order('device_name', { ascending: true })
    if (error) console.error(error)
    setDevices(
      (data || []).map((d) => ({
        id: d.id,
        device_name: d.device_name,
        room: d.room,
        schedule: normalizeSchedule(d.schedule),
      }))
    )
    setDirty({})
    setLoading(false)
  }

  // Aggiorna lo schedule di un dispositivo in locale e lo marca "da salvare"
  function updateSchedule(id, updater) {
    setDevices((devs) =>
      devs.map((d) => (d.id === id ? { ...d, schedule: updater(d.schedule) } : d))
    )
    setDirty((s) => ({ ...s, [id]: true }))
  }

  function toggleCell(id, day, hour) {
    updateSchedule(id, (sched) =>
      sched.map((col, di) =>
        di === day ? col.map((v, hi) => (hi === hour ? !v : v)) : col
      )
    )
  }

  // Tap sull'etichetta dell'ora: accende/spegne quell'ora su tutti i giorni
  function toggleHour(id, hour) {
    updateSchedule(id, (sched) => {
      const anyOff = sched.some((col) => !col[hour])
      return sched.map((col) => col.map((v, hi) => (hi === hour ? anyOff : v)))
    })
  }

  // Copia la colonna "from" sui giorni "targets"
  function copyDay(id, from, targets) {
    updateSchedule(id, (sched) => {
      const source = sched[from]
      return sched.map((col, di) =>
        targets.includes(di) && di !== from ? [...source] : col
      )
    })
  }

  function clearDevice(id) {
    updateSchedule(id, () => emptyGrid())
  }

  async function saveDevice(device) {
    setSaving((s) => ({ ...s, [device.id]: true }))
    const { error } = await supabase
      .from('automation_schedule')
      .update({ schedule: device.schedule, updated_at: new Date().toISOString() })
      .eq('id', device.id)
    setSaving((s) => ({ ...s, [device.id]: false }))
    if (error) return alert('Errore nel salvataggio: ' + error.message)
    setDirty((s) => {
      const next = { ...s }
      delete next[device.id]
      return next
    })
  }

  function openNew() {
    setEditing(null)
    setForm({ device_name: '', room: '' })
    setModalOpen(true)
  }

  function openEdit(device) {
    setEditing(device)
    setForm({ device_name: device.device_name || '', room: device.room || '' })
    setModalOpen(true)
  }

  async function handleSaveDevice(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const row = {
        device_name: form.device_name.trim(),
        room: form.room.trim() || null,
      }
      if (editing) {
        const { error } = await supabase
          .from('automation_schedule')
          .update(row)
          .eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('automation_schedule')
          .insert({ ...row, schedule: emptyGrid() })
        if (error) throw error
      }
      setModalOpen(false)
      await load()
    } catch (err) {
      alert('Errore: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteDevice(device) {
    if (!confirm(`Eliminare "${device.device_name}" e la sua pianificazione?`)) return
    const { error } = await supabase
      .from('automation_schedule')
      .delete()
      .eq('id', device.id)
    if (error) return alert('Errore: ' + error.message)
    await load()
  }

  return (
    <div>
      <PageHeader
        icon="💡"
        title="Domotica"
        subtitle="Pianificazione settimanale dei dispositivi"
        action={
          <button className="btn btn-primary" onClick={openNew}>
            + Dispositivo
          </button>
        }
      />

      {loading ? (
        <Spinner label="Caricamento…" />
      ) : devices.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">💡</div>
          <p>Nessun dispositivo pianificato.</p>
          <button className="btn btn-primary" onClick={openNew}>
            + Aggiungi il primo
          </button>
        </div>
      ) : (
        <div className="sched-list">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              dirty={!!dirty[device.id]}
              saving={!!saving[device.id]}
              onToggleCell={toggleCell}
              onToggleHour={toggleHour}
              onCopyDay={copyDay}
              onClear={clearDevice}
              onSave={saveDevice}
              onEdit={openEdit}
              onDelete={deleteDevice}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal
          title={editing ? 'Modifica dispositivo' : 'Nuovo dispositivo'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                Annulla
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveDevice}
                disabled={busy || !form.device_name.trim()}
              >
                {busy ? 'Salvataggio…' : 'Salva'}
              </button>
            </>
          }
        >
          <form className="form-grid" onSubmit={handleSaveDevice}>
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
          </form>
        </Modal>
      )}
    </div>
  )
}

function DeviceCard({
  device,
  dirty,
  saving,
  onToggleCell,
  onToggleHour,
  onCopyDay,
  onClear,
  onSave,
  onEdit,
  onDelete,
}) {
  const [copyFrom, setCopyFrom] = useState(0)
  const [copyTo, setCopyTo] = useState('all')

  function applyCopy() {
    let targets
    if (copyTo === 'all') targets = [0, 1, 2, 3, 4, 5, 6]
    else if (copyTo === 'weekdays') targets = [0, 1, 2, 3, 4]
    else if (copyTo === 'weekend') targets = [5, 6]
    else targets = [Number(copyTo.slice(1))] // "d3" -> giorno 3
    onCopyDay(device.id, copyFrom, targets)
  }

  return (
    <div className="sched-card">
      <div className="sched-card-head">
        <div className="sched-card-title">
          <span className="sched-device">{device.device_name}</span>
          {device.room && <span className="sched-room">· {device.room}</span>}
        </div>
        <div className="card-actions">
          {dirty && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => onSave(device)}
              disabled={saving}
            >
              {saving ? 'Salvataggio…' : '💾 Salva'}
            </button>
          )}
          <button className="icon-btn" onClick={() => onEdit(device)} title="Rinomina">
            ✏️
          </button>
          <button className="icon-btn" onClick={() => onDelete(device)} title="Elimina">
            🗑
          </button>
        </div>
      </div>

      <div className="sched-scroll">
        <div className="sched-grid">
          <div className="sched-row sched-head-row">
            <div className="sched-hour-label sched-corner">Ora</div>
            {DAYS.map((d, di) => {
              const count = device.schedule[di].filter(Boolean).length
              return (
                <div className="sched-day" key={d}>
                  <span>{d}</span>
                  <span className="sched-day-count">{count}h</span>
                </div>
              )
            })}
          </div>

          {HOURS.map((h) => (
            <div className="sched-row" key={h}>
              <button
                className="sched-hour-label"
                onClick={() => onToggleHour(device.id, h)}
                title="Accendi/spegni quest'ora su tutti i giorni"
              >
                {String(h).padStart(2, '0')}
              </button>
              {DAYS.map((d, di) => (
                <button
                  key={d}
                  className={
                    device.schedule[di][h] ? 'sched-cell on' : 'sched-cell'
                  }
                  onClick={() => onToggleCell(device.id, di, h)}
                  aria-label={`${d} ore ${h}: ${device.schedule[di][h] ? 'attivo' : 'spento'}`}
                  aria-pressed={device.schedule[di][h]}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="sched-copy">
        <span className="sched-copy-label">Copia</span>
        <select value={copyFrom} onChange={(e) => setCopyFrom(Number(e.target.value))}>
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
        <span className="sched-copy-label">su</span>
        <select value={copyTo} onChange={(e) => setCopyTo(e.target.value)}>
          <option value="all">Tutti i giorni</option>
          <option value="weekdays">Feriali (Lun–Ven)</option>
          <option value="weekend">Weekend (Sab–Dom)</option>
          <optgroup label="Un solo giorno">
            {DAYS.map((d, i) => (
              <option key={d} value={'d' + i}>
                {d}
              </option>
            ))}
          </optgroup>
        </select>
        <button className="btn btn-sm" onClick={applyCopy}>
          Applica
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onClear(device.id)}>
          Svuota
        </button>
      </div>
    </div>
  )
}
