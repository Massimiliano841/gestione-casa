import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'

const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const SLOTS_PER_DAY = 48 // 48 slot da 30 minuti
const SLOTS = Array.from({ length: SLOTS_PER_DAY }, (_, s) => s)

// Etichetta oraria di uno slot: 0->"00:00", 1->"00:30" ... 48->"24:00"
function slotLabel(s) {
  const h = Math.floor(s / 2)
  const m = s % 2 ? '30' : '00'
  return String(h).padStart(2, '0') + ':' + m
}

// Opzioni per il menu "dalle" (0..47) e "alle" (1..48)
const START_OPTIONS = SLOTS
const END_OPTIONS = Array.from({ length: SLOTS_PER_DAY }, (_, i) => i + 1)

// Ore attive di un giorno formattate (ogni slot = mezz'ora)
function formatHours(slotCount) {
  const h = slotCount / 2
  return (Number.isInteger(h) ? h : h.toFixed(1)) + 'h'
}

// Griglia vuota: 7 giorni (0=Lun..6=Dom) x 48 slot, tutti spenti
function emptyGrid() {
  return DAYS.map(() => SLOTS.map(() => false))
}

// Normalizza uno schedule dal DB in una matrice 7x48 di booleani
function normalizeSchedule(raw) {
  const grid = emptyGrid()
  if (!Array.isArray(raw)) return grid
  for (let d = 0; d < 7; d++) {
    const col = raw[d]
    if (!Array.isArray(col)) continue
    for (let s = 0; s < SLOTS_PER_DAY; s++) grid[d][s] = Boolean(col[s])
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

  function updateSchedule(id, updater) {
    setDevices((devs) =>
      devs.map((d) => (d.id === id ? { ...d, schedule: updater(d.schedule) } : d))
    )
    setDirty((s) => ({ ...s, [id]: true }))
  }

  // Applica una fascia oraria [startSlot, endSlot) sui giorni scelti
  function applyRange(id, days, startSlot, endSlot, active) {
    updateSchedule(id, (sched) =>
      sched.map((col, di) =>
        days.includes(di)
          ? col.map((v, s) => (s >= startSlot && s < endSlot ? active : v))
          : col
      )
    )
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
        subtitle="Pianificazione settimanale (fasce da 30 minuti)"
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
              onApplyRange={applyRange}
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

const PRESETS = {
  Feriali: [0, 1, 2, 3, 4],
  Weekend: [5, 6],
  Tutti: [0, 1, 2, 3, 4, 5, 6],
}

function DeviceCard({
  device,
  dirty,
  saving,
  onApplyRange,
  onClear,
  onSave,
  onEdit,
  onDelete,
}) {
  const [days, setDays] = useState([])
  const [startSlot, setStartSlot] = useState(14) // 07:00
  const [endSlot, setEndSlot] = useState(16) // 08:00
  const [active, setActive] = useState(true)
  const [msg, setMsg] = useState('')

  function toggleDay(di) {
    setDays((d) => (d.includes(di) ? d.filter((x) => x !== di) : [...d, di]))
  }

  function apply() {
    if (days.length === 0) {
      setMsg('Seleziona almeno un giorno.')
      return
    }
    if (endSlot <= startSlot) {
      setMsg('L’orario di fine deve essere dopo l’inizio.')
      return
    }
    onApplyRange(device.id, days, startSlot, endSlot, active)
    setMsg(
      `${active ? 'Attivato' : 'Disattivato'} ${slotLabel(startSlot)}–${slotLabel(
        endSlot
      )} su ${days.length} ${days.length > 1 ? 'giorni' : 'giorno'}.`
    )
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

      {/* Scheda di input */}
      <div className="sched-input">
        <div className="sched-input-row">
          <span className="sched-input-label">Giorni</span>
          <div className="day-chips">
            {DAYS.map((d, di) => (
              <button
                key={d}
                type="button"
                className={days.includes(di) ? 'day-chip on' : 'day-chip'}
                onClick={() => toggleDay(di)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="sched-input-row">
          <span className="sched-input-label">Rapido</span>
          <div className="day-chips">
            {Object.entries(PRESETS).map(([name, list]) => (
              <button
                key={name}
                type="button"
                className="day-chip preset"
                onClick={() => setDays(list)}
              >
                {name}
              </button>
            ))}
            <button type="button" className="day-chip preset" onClick={() => setDays([])}>
              Nessuno
            </button>
          </div>
        </div>

        <div className="sched-input-row time-row">
          <label className="mini-field">
            <span>Dalle</span>
            <select
              value={startSlot}
              onChange={(e) => setStartSlot(Number(e.target.value))}
            >
              {START_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {slotLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="mini-field">
            <span>Alle</span>
            <select value={endSlot} onChange={(e) => setEndSlot(Number(e.target.value))}>
              {END_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {slotLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="mini-field">
            <span>Stato</span>
            <select
              value={active ? 'on' : 'off'}
              onChange={(e) => setActive(e.target.value === 'on')}
            >
              <option value="on">Attiva</option>
              <option value="off">Disattiva</option>
            </select>
          </label>
        </div>

        <div className="sched-input-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={apply}>
            Applica alla griglia
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onClear(device.id)}
          >
            Svuota tutto
          </button>
          {msg && <span className="sched-msg">{msg}</span>}
        </div>
      </div>

      {/* Griglia solo visiva */}
      <div className="sched-scroll">
        <div className="sched-grid">
          <div className="sched-row sched-head-row">
            <div className="sched-hour-label sched-corner">Ora</div>
            {DAYS.map((d, di) => {
              const count = device.schedule[di].filter(Boolean).length
              return (
                <div className="sched-day" key={d}>
                  <span>{d}</span>
                  <span className="sched-day-count">{formatHours(count)}</span>
                </div>
              )
            })}
          </div>

          {SLOTS.map((s) => (
            <div
              className={s % 2 === 0 ? 'sched-row hour-start' : 'sched-row'}
              key={s}
            >
              <div
                className={s % 2 === 0 ? 'sched-hour-label' : 'sched-hour-label half'}
              >
                {slotLabel(s)}
              </div>
              {DAYS.map((d, di) => (
                <div
                  key={d}
                  className={device.schedule[di][s] ? 'sched-cell on' : 'sched-cell'}
                  title={`${d} ${slotLabel(s)}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
