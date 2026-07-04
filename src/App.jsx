import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthProvider'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Credentials from './pages/Credentials'
import SecureNotes from './pages/SecureNotes'
import Deadlines from './pages/Deadlines'
import Automation from './pages/Automation'
import Users from './pages/Users'
import Spinner from './components/Spinner'

export default function App() {
  const { session, loading, profileLoading, profile, isAdmin } = useAuth()

  // Sto ancora recuperando la sessione salvata
  if (loading) return <Spinner full label="Caricamento…" />

  // Non autenticato -> schermata di login
  if (!session) return <Login />

  // Autenticato ma sto ancora caricando il profilo (ruolo/username)
  if (profileLoading && !profile) return <Spinner full label="Caricamento…" />

  // Autenticato -> applicazione
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="password" element={<Credentials />} />
        <Route path="informazioni" element={<SecureNotes />} />
        <Route path="scadenze" element={<Deadlines />} />
        <Route path="domotica" element={<Automation />} />
        <Route
          path="utenti"
          element={isAdmin ? <Users /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
