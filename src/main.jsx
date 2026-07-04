import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { VaultProvider } from './context/VaultProvider'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <VaultProvider>
          <App />
        </VaultProvider>
      </AuthProvider>
    </HashRouter>
  </StrictMode>
)
