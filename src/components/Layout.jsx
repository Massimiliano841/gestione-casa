import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'
import { useTheme } from '../context/ThemeProvider'

const NAV = [
  { to: '/', label: 'Riepilogo', icon: '🏠', end: true },
  { to: '/password', label: 'Password', icon: '🔐' },
  { to: '/informazioni', label: 'Informazioni', icon: '📄' },
  { to: '/scadenze', label: 'Scadenze', icon: '📅' },
  { to: '/domotica', label: 'Domotica', icon: '💡' },
]

const NAV_ADMIN = { to: '/utenti', label: 'Utenti', icon: '👥' }

function ThemeToggle({ className = 'btn btn-ghost btn-sm', compact = false }) {
  const { theme, toggleTheme } = useTheme()
  const dark = theme === 'dark'
  const label = dark ? 'Passa al tema chiaro' : 'Passa al tema scuro'
  return (
    <button
      className={className}
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      {compact ? (dark ? '☀️' : '🌙') : dark ? '☀️ Tema chiaro' : '🌙 Tema scuro'}
    </button>
  )
}

export default function Layout() {
  const { username, isAdmin, signOut } = useAuth()
  const nav = isAdmin ? [...NAV, NAV_ADMIN] : NAV

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">🏡</span>
          <span className="brand-text">Gestione Casa</span>
        </div>

        <nav className="nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p className="user-email" title={username}>
            {isAdmin && '👑 '}
            {username}
          </p>
          <ThemeToggle />
          <button className="btn btn-ghost btn-sm" onClick={signOut}>
            🚪 Esci
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <span className="topbar-title">
            <span className="brand-icon">🏡</span> Gestione Casa
          </span>
          <div className="topbar-actions">
            <ThemeToggle className="icon-btn topbar-btn" compact />
            <button
              className="icon-btn topbar-btn"
              onClick={signOut}
              aria-label="Esci"
              title="Esci"
            >
              🚪
            </button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>

        <nav className="bottom-nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive ? 'bottom-link active' : 'bottom-link'
              }
            >
              <span className="bottom-icon">{item.icon}</span>
              <span className="bottom-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
