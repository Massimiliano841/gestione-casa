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

// Durata di una fascia [start, end) espressa in ore/minuti, es. "1h 30m"
function durationLabel(startSlot, endSlot) {
  const mins = (endSlot - startSlot) * 30
  if (mins <= 0) return ''
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return [h ? h + 'h' : '', m ? m + 'm' : ''].filter(Boolean).join(' ')
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
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState([])
  const [startSlot, setStartSlot] = useState(14) // 07:00
  const [endSlot, setEndSlot] = useState(16) // 08:00
  const [active, setActive] = useState(true)
  const [msg, setMsg] = useState('')

  function toggleDay(di) {
    setDays((d) => (d.includes(di) ? d.filter((x) => x !== di) : [...d, di]))
  }

  const canApply = days.length > 0 && endSlot > startSlot
  const weekActive = device.schedule.reduce(
    (sum, col) => sum + col.filter(Boolean).length,
    0
  )
  const sortedDays = days.slice().sort((a, b) => a - b)

  function apply() {
    if (!canApply) return
    onApplyRange(device.id, days, startSlot, endSlot, active)
    setMsg(
      `${active ? 'Attivata' : 'Disattivata'} fascia ${slotLabel(startSlot)}–${slotLabel(
        endSlot
      )} su ${days.length} ${days.length > 1 ? 'giorni' : 'giorno'}.`
    )
  }

  function closeModal() {
    setOpen(false)
    setMsg('')
  }

  return (
    <div className="sched-card">
      <div className="sched-card-head">
        <div className="sched-card-title">
          <span className="sched-device">{device.device_name}</span>
          {device.room && <span className="sched-room-chip">📍 {device.room}</span>}
        </div>
        <div className="card-actions">
          <button className="icon-btn" onClick={() => onEdit(device)} title="Rinomina">
            ✏️
          </button>
          <button className="icon-btn" onClick={() => onDelete(device)} title="Elimina">
            🗑
          </button>
        </div>
      </div>

      <div className="sched-toolbar">
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          ⚡ Programma
        </button>
        {dirty && (
          <button
            className="btn btn-sm btn-save"
            onClick={() => onSave(device)}
            disabled={saving}
          >
            {saving ? 'Salvataggio…' : '💾 Salva'}
          </button>
        )}
        <span className="sched-total">
          {weekActive > 0 ? `${formatHours(weekActive)} / settimana` : 'Nessuna fascia'}
        </span>
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

      {open && (
        <Modal
          title={`⚡ Programma · ${device.device_name}`}
          onClose={closeModal}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm prog-clear"
                onClick={() => {
                  onClear(device.id)
                  setMsg('Griglia svuotata.')
                }}
              >
                🧹 Svuota tutto
              </button>
              <button className="btn btn-ghost" onClick={closeModal}>
                Chiudi
              </button>
              <button
                className="btn btn-primary"
                onClick={apply}
                disabled={!canApply}
              >
                Applica
              </button>
            </>
          }
        >
          <div className="prog-form">
            <div className="prog-section">
              <div className="prog-label">Giorni</div>
              <div className="day-grid">
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
              <div className="preset-row">
                {Object.entries(PRESETS).map(([name, list]) => (
                  <button
                    key={name}
                    type="button"
                    className="preset-chip"
                    onClick={() => setDays(list)}
                  >
                    {name}
                  </button>
                ))}
                <button
                  type="button"
                  className="preset-chip"
                  onClick={() => setDays([])}
                >
                  Nessuno
                </button>
              </div>
            </div>

            <div className="prog-section">
              <div className="prog-label">Orario</div>
              <div className="time-range">
                <select
                  className="time-select"
                  value={startSlot}
                  onChange={(e) => setStartSlot(Number(e.target.value))}
                >
                  {START_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {slotLabel(s)}
                    </option>
                  ))}
                </select>
                <span className="time-arrow">→</span>
                <select
                  className="time-select"
                  value={endSlot}
                  onChange={(e) => setEndSlot(Number(e.target.value))}
                >
                  {END_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {slotLabel(s)}
                    </option>
                  ))}
                </select>
                {endSlot > startSlot && (
                  <span className="time-dur">{durationLabel(startSlot, endSlot)}</span>
                )}
              </div>
            </div>

            <div className="prog-section">
              <div className="prog-label">Stato</div>
              <div className="segmented">
                <button
                  type="button"
                  className={active ? 'seg seg-on' : 'seg'}
                  onClick={() => setActive(true)}
                >
                  Attiva
                </button>
                <button
                  type="button"
                  className={!active ? 'seg seg-off' : 'seg'}
                  onClick={() => setActive(false)}
                >
                  Disattiva
                </button>
              </div>
            </div>

            <div className={canApply ? 'prog-preview' : 'prog-preview muted-preview'}>
              {canApply ? (
                <>
                  <span className={active ? 'prog-dot on' : 'prog-dot off'} />
                  <span>
                    {sortedDays.map((i) => DAYS[i]).join(', ')} ·{' '}
                    {slotLabel(startSlot)}–{slotLabel(endSlot)} ·{' '}
                    {active ? 'accesa' : 'spenta'}
                  </span>
                </>
              ) : (
                'Scegli i giorni e la fascia oraria'
              )}
            </div>

            {msg && <div className="prog-msg">✓ {msg}</div>}
          </div>
        </Modal>
      )}
    </div>
  )
}
