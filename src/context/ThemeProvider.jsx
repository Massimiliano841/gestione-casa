import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const ThemeContext = createContext(null)

const STORAGE_KEY = 'gestione-casa-theme'
// Colore della barra di stato (iOS/Android) per ciascun tema
const THEME_COLOR = { dark: '#0f1420', light: '#f4f6fb' }

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  // Prima visita: rispetta la preferenza di sistema
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[theme])
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme deve essere usato dentro <ThemeProvider>')
  return ctx
}
