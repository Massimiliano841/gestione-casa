import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState({ credentials: 0, notes: 0, deadlines: 0 })
  const [upcoming, setUpcoming] = useState([])
  const [recentLogs, setRecentLogs] = useState([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)

    const [cred, notes, deadlinesOpen, up, logs] = await Promise.all([
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
        .from('automation_log')
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(5),
    ])

    setCounts({
      credentials: cred.count || 0,
      notes: notes.count || 0,
      deadlines: deadlinesOpen.count || 0,
    })
    setUpcoming(up.data || [])
    setRecentLogs(logs.data || [])
    setLoading(false)
  }

  if (loading) return <Spinner label="Caricamento…" />

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
          <h2 className="panel-title">💡 Ultima attività domotica</h2>
          {recentLogs.length === 0 ? (
            <p className="muted">Nessuna registrazione.</p>
          ) : (
            <ul className="mini-list">
              {recentLogs.map((l) => (
                <li key={l.id}>
                  <span>
                    <span className={l.action === 'on' ? 'dot dot-on' : 'dot dot-off'} />
                    {l.device_name}
                  </span>
                  <span className="mini-date">{formatDateTime(l.occurred_at)}</span>
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

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
