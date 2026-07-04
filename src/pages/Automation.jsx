import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'

const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const SLOTS_PER_DAY = 48 // 48 slot da 30 minuti
const SLOTS = Array.from({ length: SLOTS_PER_DAY }, (_, s) => s)

// Palette per le zone
const COLORS = [
  '#4f8cff', '#38c793', '#f0b429', '#ef5b6f',
  '#a06bff', '#12b5cb', '#ff8a3d', '#e05fae',
]

function slotLabel(s) {
  const h = Math.floor(s / 2)
  const m = s % 2 ? '30' : '00'
  return String(h).padStart(2, '0') + ':' + m
}

const START_OPTIONS = SLOTS
const END_OPTIONS = Array.from({ length: SLOTS_PER_DAY }, (_, i) => i + 1)

function durationLabel(startSlot, endSlot) {
  const mins = (endSlot - startSlot) * 30
  if (mins <= 0) return ''
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return [h ? h + 'h' : '', m ? m + 'm' : ''].filter(Boolean).join(' ')
}

function formatHours(slotCount) {
  const h = slotCount / 2
  return (Number.isInteger(h) ? h : h.toFixed(1)) + 'h'
}

function emptyGrid() {
  return DAYS.map(() => SLOTS.map(() => false))
}

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

// Conta gli slot attivi per giorno considerando l'unione delle zone
function unionDayCount(zones, day) {
  let c = 0
  for (const s of SLOTS) {
    if (zones.some((z) => z.schedule[day][s])) c++
  }
  return c
}

export default function Automation() {
  const navigate = useNavigate()
  const [devices, setDevices] = useState([])
  const [manualByDevice, setManualByDevice] = useState({})
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState({}) // per zona
  const [saving, setSaving] = useState({}) // per dispositivo
  const [openIds, setOpenIds] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ device_name: '', room: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [{ data: devs }, { data: zones }, { data: mans }] = await Promise.all([
      supabase.from('automation_schedule').select('id, device_name, room').order('device_name'),
      supabase.from('automation_zones').select('*').order('sort_order'),
      supabase.from('manuals').select('id, title, status, device_id').not('device_id', 'is', null),
    ])
    const zonesByDevice = {}
    for (const z of zones || []) {
      ;(zonesByDevice[z.device_id] ||= []).push({
        id: z.id,
        name: z.name,
        color: z.color,
        sort_order: z.sort_order,
        schedule: normalizeSchedule(z.schedule),
      })
    }
    const list = (devs || []).map((d) => ({
      id: d.id,
      device_name: d.device_name,
      room: d.room,
      zones: zonesByDevice[d.id] || [],
    }))
    setDevices(list)
    setOpenIds((prev) => {
      const existing = prev.filter((id) => list.some((d) => d.id === id))
      if (existing.length) return existing
      return list.length === 1 ? [list[0].id] : []
    })
    const byDev = {}
    for (const m of mans || []) {
      if (!byDev[m.device_id] || m.status === 'ready') byDev[m.device_id] = m
    }
    setManualByDevice(byDev)
    setDirty({})
    setLoading(false)
  }

  function toggleOpen(id) {
    setOpenIds((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]))
  }

  // Aggiorna la pianificazione di una zona in locale
  function updateZone(deviceId, zoneId, updater) {
    setDevices((devs) =>
      devs.map((d) =>
        d.id !== deviceId
          ? d
          : {
              ...d,
              zones: d.zones.map((z) =>
                z.id === zoneId ? { ...z, schedule: updater(z.schedule) } : z
              ),
            }
      )
    )
    setDirty((s) => ({ ...s, [zoneId]: true }))
  }

  function applyRange(deviceId, zoneId, days, startSlot, endSlot, active) {
    updateZone(deviceId, zoneId, (sched) =>
      sched.map((col, di) =>
        days.includes(di)
          ? col.map((v, s) => (s >= startSlot && s < endSlot ? active : v))
          : col
      )
    )
  }

  function clearZone(deviceId, zoneId) {
    updateZone(deviceId, zoneId, () => emptyGrid())
  }

  async function saveDevice(device) {
    const toSave = device.zones.filter((z) => dirty[z.id])
    if (toSave.length === 0) return
    setSaving((s) => ({ ...s, [device.id]: true }))
    for (const z of toSave) {
      const { error } = await supabase
        .from('automation_zones')
        .update({ schedule: z.schedule, updated_at: new Date().toISOString() })
        .eq('id', z.id)
      if (error) {
        setSaving((s) => ({ ...s, [device.id]: false }))
        return alert('Errore nel salvataggio: ' + error.message)
      }
    }
    setSaving((s) => ({ ...s, [device.id]: false }))
    setDirty((s) => {
      const next = { ...s }
      for (const z of toSave) delete next[z.id]
      return next
    })
  }

  // ---- gestione zone (metadati salvati subito su DB) ----
  async function addZone(device) {
    const used = new Set(device.zones.map((z) => z.color))
    const color = COLORS.find((c) => !used.has(c)) || COLORS[device.zones.length % COLORS.length]
    const sort_order = device.zones.reduce((m, z) => Math.max(m, z.sort_order), -1) + 1
    const name = `Zona ${device.zones.length + 1}`
    const { data, error } = await supabase
      .from('automation_zones')
      .insert({ device_id: device.id, name, color, sort_order, schedule: emptyGrid() })
      .select('*')
      .single()
    if (error) return alert('Errore: ' + error.message)
    setDevices((devs) =>
      devs.map((d) =>
        d.id !== device.id
          ? d
          : {
              ...d,
              zones: [
                ...d.zones,
                { id: data.id, name: data.name, color: data.color, sort_order: data.sort_order, schedule: emptyGrid() },
              ],
            }
      )
    )
    return data.id
  }

  async function updateZoneMeta(deviceId, zoneId, patch) {
    setDevices((devs) =>
      devs.map((d) =>
        d.id !== deviceId
          ? d
          : { ...d, zones: d.zones.map((z) => (z.id === zoneId ? { ...z, ...patch } : z)) }
      )
    )
    const { error } = await supabase.from('automation_zones').update(patch).eq('id', zoneId)
    if (error) alert('Errore: ' + error.message)
  }

  async function deleteZone(device, zoneId) {
    if (device.zones.length <= 1) return alert('Un dispositivo deve avere almeno una zona.')
    if (!confirm('Eliminare questa zona e la sua pianificazione?')) return
    const { error } = await supabase.from('automation_zones').delete().eq('id', zoneId)
    if (error) return alert('Errore: ' + error.message)
    setDevices((devs) =>
      devs.map((d) =>
        d.id !== device.id ? d : { ...d, zones: d.zones.filter((z) => z.id !== zoneId) }
      )
    )
    setDirty((s) => {
      const next = { ...s }
      delete next[zoneId]
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
    let newId = null
    try {
      const row = { device_name: form.device_name.trim(), room: form.room.trim() || null }
      if (editing) {
        const { error } = await supabase
          .from('automation_schedule')
          .update(row)
          .eq('id', editing.id)
        if (error) throw error
      } else {
        const { data: created, error } = await supabase
          .from('automation_schedule')
          .insert({ ...row, schedule: emptyGrid() })
          .select('id')
          .single()
        if (error) throw error
        newId = created?.id
        // ogni nuovo dispositivo nasce con una zona "Principale"
        await supabase.from('automation_zones').insert({
          device_id: newId,
          name: 'Principale',
          color: COLORS[0],
          sort_order: 0,
          schedule: emptyGrid(),
        })
      }
      setModalOpen(false)
      await load()
      if (newId) setOpenIds((prev) => (prev.includes(newId) ? prev : [...prev, newId]))
    } catch (err) {
      alert('Errore: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteDevice(device) {
    if (!confirm(`Eliminare "${device.device_name}" e tutte le sue zone?`)) return
    const { error } = await supabase.from('automation_schedule').delete().eq('id', device.id)
    if (error) return alert('Errore: ' + error.message)
    await load()
  }

  return (
    <div>
      <PageHeader
        icon="💡"
        title="Domotica"
        subtitle="Pianificazione settimanale · zone multiple"
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
              dirty={device.zones.some((z) => dirty[z.id])}
              saving={!!saving[device.id]}
              open={openIds.includes(device.id)}
              manual={manualByDevice[device.id]}
              onToggle={() => toggleOpen(device.id)}
              onOpenManual={(m) => navigate('/manuali', { state: { openManualId: m.id } })}
              onApplyRange={applyRange}
              onClear={clearZone}
              onSave={saveDevice}
              onEdit={openEdit}
              onDelete={deleteDevice}
              onAddZone={addZone}
              onUpdateZoneMeta={updateZoneMeta}
              onDeleteZone={deleteZone}
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
                placeholder="es. Irrigazione, Caldaia, Luci giardino…"
                autoFocus
                required
              />
            </label>
            <label className="field">
              <span>Stanza / Zona</span>
              <input
                value={form.room}
                onChange={(e) => setForm({ ...form, room: e.target.value })}
                placeholder="es. Giardino, Salotto…"
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
  open,
  manual,
  onToggle,
  onOpenManual,
  onApplyRange,
  onClear,
  onSave,
  onEdit,
  onDelete,
  onAddZone,
  onUpdateZoneMeta,
  onDeleteZone,
}) {
  const [progOpen, setProgOpen] = useState(false)
  const [view, setView] = useState('all') // 'all' oppure zoneId
  const [editZone, setEditZone] = useState(null)

  const zones = device.zones
  // se la zona filtrata non esiste più, torna a "Tutte"
  const activeView = view !== 'all' && zones.some((z) => z.id === view) ? view : 'all'
  const weekActive = DAYS.reduce((sum, _, di) => sum + unionDayCount(zones, di), 0)

  async function handleAddZone() {
    const id = await onAddZone(device)
    if (id) setView(id)
  }

  return (
    <div className={open ? 'sched-card acc-open' : 'sched-card'}>
      <div className="acc-header">
        <button
          className="acc-main"
          onClick={onToggle}
          aria-expanded={open}
          title={open ? 'Comprimi' : 'Espandi'}
        >
          <span className="acc-chevron">{open ? '▾' : '▸'}</span>
          <span className="acc-titlewrap">
            <span className="sched-device">{device.device_name}</span>
            {device.room && <span className="acc-room">📍 {device.room}</span>}
          </span>
          {!open && (
            <span className="acc-mini" title="Ore attive per giorno (Lun→Dom)">
              {DAYS.map((d, di) => {
                const pct = Math.round((unionDayCount(zones, di) / SLOTS_PER_DAY) * 100)
                return (
                  <span className="acc-bar-track" key={d}>
                    <span className="acc-bar" style={{ height: pct + '%' }} />
                  </span>
                )
              })}
            </span>
          )}
          <span className="acc-total">{weekActive > 0 ? formatHours(weekActive) : '—'}</span>
        </button>
        {dirty && !open && (
          <button
            className="btn btn-sm btn-save"
            onClick={() => onSave(device)}
            disabled={saving}
            title="Salva"
          >
            💾
          </button>
        )}
      </div>

      {open && (
        <div className="acc-body">
          <div className="sched-toolbar">
            <button className="btn btn-primary btn-sm" onClick={() => setProgOpen(true)}>
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
            <button className="icon-btn" onClick={() => onEdit(device)} title="Rinomina">
              ✏️
            </button>
            <button className="icon-btn" onClick={() => onDelete(device)} title="Elimina">
              🗑
            </button>
            {manual && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => onOpenManual(manual)}
                disabled={manual.status !== 'ready'}
                title={
                  manual.status === 'ready'
                    ? `Apri il manuale: ${manual.title}`
                    : 'Manuale in elaborazione'
                }
              >
                📖 Manuale
              </button>
            )}
            <span className="sched-total">
              {weekActive > 0 ? `${formatHours(weekActive)} / settimana` : 'Nessuna fascia'}
            </span>
          </div>

          {/* Barra delle zone: filtro + gestione */}
          <div className="zone-bar">
            <button
              className={activeView === 'all' ? 'zone-chip on' : 'zone-chip'}
              onClick={() => setView('all')}
            >
              Tutte
            </button>
            {zones.map((z) => (
              <button
                key={z.id}
                className={activeView === z.id ? 'zone-chip on' : 'zone-chip'}
                onClick={() => setView(z.id)}
                onDoubleClick={() => setEditZone(z)}
                title="Doppio click per rinominare/colore"
              >
                <span className="zone-dot" style={{ background: z.color }} />
                {z.name}
              </button>
            ))}
            {activeView !== 'all' && (
              <button
                className="zone-chip zone-edit"
                onClick={() => setEditZone(zones.find((z) => z.id === activeView))}
                title="Modifica zona"
              >
                ✎
              </button>
            )}
            <button className="zone-chip zone-add" onClick={handleAddZone} title="Aggiungi zona">
              +
            </button>
          </div>

          {/* Griglia visiva (bande colorate per zona) */}
          <div className="sched-scroll">
            <div className="sched-grid">
              <div className="sched-row sched-head-row">
                <div className="sched-hour-label sched-corner">Ora</div>
                {DAYS.map((d, di) => {
                  const count =
                    activeView === 'all'
                      ? unionDayCount(zones, di)
                      : (zones.find((z) => z.id === activeView)?.schedule[di].filter(Boolean).length || 0)
                  return (
                    <div className="sched-day" key={d}>
                      <span>{d}</span>
                      <span className="sched-day-count">{formatHours(count)}</span>
                    </div>
                  )
                })}
              </div>

              {SLOTS.map((s) => (
                <div className={s % 2 === 0 ? 'sched-row hour-start' : 'sched-row'} key={s}>
                  <div className={s % 2 === 0 ? 'sched-hour-label' : 'sched-hour-label half'}>
                    {slotLabel(s)}
                  </div>
                  {DAYS.map((d, di) => (
                    <Cell
                      key={d}
                      zones={zones}
                      view={activeView}
                      day={di}
                      slot={s}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {progOpen && (
        <ProgramModal
          device={device}
          defaultZone={activeView !== 'all' ? activeView : zones[0]?.id}
          onClose={() => setProgOpen(false)}
          onApplyRange={onApplyRange}
          onClear={onClear}
        />
      )}

      {editZone && (
        <ZoneEditModal
          device={device}
          zone={editZone}
          onClose={() => setEditZone(null)}
          onUpdateMeta={onUpdateZoneMeta}
          onDelete={onDeleteZone}
        />
      )}
    </div>
  )
}

function Cell({ zones, view, day, slot }) {
  if (view === 'all') {
    return (
      <div className="sched-cell multi">
        {zones.map((z) => (
          <span
            key={z.id}
            className="zone-seg"
            style={{ background: z.schedule[day][slot] ? z.color : 'transparent' }}
          />
        ))}
      </div>
    )
  }
  const z = zones.find((x) => x.id === view)
  const on = z && z.schedule[day][slot]
  return (
    <div
      className={on ? 'sched-cell on' : 'sched-cell'}
      style={on ? { background: z.color, borderColor: z.color } : undefined}
    />
  )
}

function ProgramModal({ device, defaultZone, onClose, onApplyRange, onClear }) {
  const [zoneId, setZoneId] = useState(defaultZone || device.zones[0]?.id)
  const [days, setDays] = useState([])
  const [startSlot, setStartSlot] = useState(14)
  const [endSlot, setEndSlot] = useState(16)
  const [active, setActive] = useState(true)
  const [msg, setMsg] = useState('')

  const zone = device.zones.find((z) => z.id === zoneId) || device.zones[0]
  const canApply = !!zone && days.length > 0 && endSlot > startSlot
  const sortedDays = days.slice().sort((a, b) => a - b)

  function toggleDay(di) {
    setDays((d) => (d.includes(di) ? d.filter((x) => x !== di) : [...d, di]))
  }

  function apply() {
    if (!canApply) return
    onApplyRange(device.id, zone.id, days, startSlot, endSlot, active)
    setMsg(
      `${active ? 'Attivata' : 'Disattivata'} fascia ${slotLabel(startSlot)}–${slotLabel(
        endSlot
      )} su ${days.length} ${days.length > 1 ? 'giorni' : 'giorno'} (${zone.name}).`
    )
  }

  return (
    <Modal
      title={`⚡ Programma · ${device.device_name}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost btn-sm prog-clear"
            onClick={() => {
              onClear(device.id, zone.id)
              setMsg(`Svuotata la zona ${zone.name}.`)
            }}
          >
            🧹 Svuota zona
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Chiudi
          </button>
          <button className="btn btn-primary" onClick={apply} disabled={!canApply}>
            Applica
          </button>
        </>
      }
    >
      <div className="prog-form">
        {device.zones.length > 1 && (
          <div className="prog-section">
            <div className="prog-label">Zona</div>
            <div className="preset-row">
              {device.zones.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  className={z.id === zoneId ? 'zone-chip on' : 'zone-chip'}
                  onClick={() => setZoneId(z.id)}
                >
                  <span className="zone-dot" style={{ background: z.color }} />
                  {z.name}
                </button>
              ))}
            </div>
          </div>
        )}

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
              <button key={name} type="button" className="preset-chip" onClick={() => setDays(list)}>
                {name}
              </button>
            ))}
            <button type="button" className="preset-chip" onClick={() => setDays([])}>
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
              <span className="prog-dot" style={{ background: zone.color }} />
              <span>
                {zone.name} · {sortedDays.map((i) => DAYS[i]).join(', ')} ·{' '}
                {slotLabel(startSlot)}–{slotLabel(endSlot)} · {active ? 'accesa' : 'spenta'}
              </span>
            </>
          ) : (
            'Scegli zona, giorni e fascia oraria'
          )}
        </div>

        {msg && <div className="prog-msg">✓ {msg}</div>}
      </div>
    </Modal>
  )
}

function ZoneEditModal({ device, zone, onClose, onUpdateMeta, onDelete }) {
  const [name, setName] = useState(zone.name)
  const [color, setColor] = useState(zone.color)

  function save() {
    const patch = {}
    if (name.trim() && name.trim() !== zone.name) patch.name = name.trim()
    if (color !== zone.color) patch.color = color
    if (Object.keys(patch).length) onUpdateMeta(device.id, zone.id, patch)
    onClose()
  }

  return (
    <Modal
      title="Zona"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn-ghost btn-sm prog-clear"
            onClick={() => {
              onDelete(device, zone.id)
              onClose()
            }}
          >
            🗑 Elimina zona
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Annulla
          </button>
          <button className="btn btn-primary" onClick={save}>
            Salva
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>Nome zona</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <div className="field">
          <span>Colore</span>
          <div className="color-row">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={c === color ? 'color-swatch on' : 'color-swatch'}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={c}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
