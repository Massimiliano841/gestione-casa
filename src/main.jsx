import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { ThemeProvider } from './context/ThemeProvider'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <HashRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </HashRouter>
    </ThemeProvider>
  </StrictMode>
)
