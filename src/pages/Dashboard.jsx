import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState({ credentials: 0, notes: 0, deadlines: 0 })
  const [upcoming, setUpcoming] = useState([])
  const [devices, setDevices] = useState([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)

    const [cred, notes, deadlinesOpen, up, sched] = await Promise.all([
      supabase.from('credentials').select('id', { count: 'exact', head: true }),
      supabase.from('secure_notes').select('id', { count: 'exact', head: true }),
      supabase
        .from('deadlines')
        .select('id', { count: 'exact', head: true })
        .eq('is_completed', false),
      supabase
        .from('deadlines')
        .select('*')
        .eq('is_completed', false)
        .gte('due_date', today)
        .order('due_date', { ascending: true })
        .limit(5),
      supabase
        .from('automation_schedule')
        .select('id, device_name, room, automation_zones(schedule)')
        .order('device_name', { ascending: true }),
    ])

    setCounts({
      credentials: cred.count || 0,
      notes: notes.count || 0,
      deadlines: deadlinesOpen.count || 0,
    })
    setUpcoming(up.data || [])
    setDevices(sched.data || [])
    setLoading(false)
  }

  if (loading) return <Spinner label="Caricamento…" />

  // Stato "adesso" dei dispositivi: attivo se una qualsiasi zona è attiva ora
  const now = new Date()
  const dayIdx = (now.getDay() + 6) % 7 // JS: Dom=0 -> nostro Lun=0..Dom=6
  const slot = now.getHours() * 2 + (now.getMinutes() >= 30 ? 1 : 0) // slot da 30 min
  const deviceStatus = devices.map((d) => {
    const zones = Array.isArray(d.automation_zones) ? d.automation_zones : []
    const active = zones.some((z) => {
      const col = Array.isArray(z.schedule?.[dayIdx]) ? z.schedule[dayIdx] : []
      return Boolean(col[slot])
    })
    return { name: d.device_name, room: d.room, active }
  })

  return (
    <div>
      <PageHeader icon="🏠" title="Riepilogo" subtitle="La tua casa a colpo d'occhio" />

      <div className="stat-grid">
        <StatCard to="/password" icon="🔐" value={counts.credentials} label="Password" />
        <StatCard to="/informazioni" icon="📄" value={counts.notes} label="Informazioni" />
        <StatCard to="/scadenze" icon="📅" value={counts.deadlines} label="Scadenze aperte" />
      </div>

      <div className="dash-cols">
        <section className="panel">
          <h2 className="panel-title">📅 Prossime scadenze</h2>
          {upcoming.length === 0 ? (
            <p className="muted">Nessuna scadenza in arrivo.</p>
          ) : (
            <ul className="mini-list">
              {upcoming.map((d) => (
                <li key={d.id}>
                  <span>{d.title}</span>
                  <span className="mini-date">{formatDate(d.due_date)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link className="panel-link" to="/scadenze">
            Vedi tutte →
          </Link>
        </section>

        <section className="panel">
          <h2 className="panel-title">💡 Domotica adesso</h2>
          {deviceStatus.length === 0 ? (
            <p className="muted">Nessun dispositivo pianificato.</p>
          ) : (
            <ul className="mini-list">
              {deviceStatus.map((d) => (
                <li key={d.name + (d.room || '')}>
                  <span>
                    <span className={d.active ? 'dot dot-on' : 'dot dot-off'} />
                    {d.name}
                    {d.room && <span className="log-room"> · {d.room}</span>}
                  </span>
                  <span className="mini-date">{d.active ? 'Attivo' : 'Spento'}</span>
                </li>
              ))}
            </ul>
          )}
          <Link className="panel-link" to="/domotica">
            Vedi tutto →
          </Link>
        </section>
      </div>
    </div>
  )
}

function StatCard({ to, icon, value, label }) {
  return (
    <Link to={to} className="stat-card">
      <span className="stat-icon">{icon}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </Link>
  )
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
  })
}
