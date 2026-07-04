import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'

const NAV = [
  { to: '/', label: 'Riepilogo', icon: '🏠', end: true },
  { to: '/password', label: 'Password', icon: '🔐' },
  { to: '/informazioni', label: 'Informazioni', icon: '📄' },
  { to: '/scadenze', label: 'Scadenze', icon: '📅' },
  { to: '/domotica', label: 'Domotica', icon: '💡' },
]

const NAV_ADMIN = { to: '/utenti', label: 'Utenti', icon: '👥' }

export default function Layout() {
  const { username, isAdmin, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const nav = isAdmin ? [...NAV, NAV_ADMIN] : NAV

  return (
    <div className="app-shell">
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
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
              onClick={() => setMenuOpen(false)}
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
          <button className="btn btn-ghost btn-sm" onClick={signOut}>
            🚪 Esci
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button
            className="menu-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
          >
            ☰
          </button>
          <span className="topbar-title">Gestione Casa</span>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>

      {menuOpen && <div className="backdrop" onClick={() => setMenuOpen(false)} />}
    </div>
  )
}
