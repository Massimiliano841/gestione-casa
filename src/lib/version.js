/* global __APP_VERSION__, __COMMIT__, __BUILD_TIME__ */
// Valori iniettati da Vite (vite.config.js -> define). Il typeof protegge
// eventuali ambienti dove non sono definiti.
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
export const COMMIT = typeof __COMMIT__ !== 'undefined' ? __COMMIT__ : ''
export const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : ''

// Data/ora di build formattata (ora locale)
export function buildDate() {
  if (!BUILD_TIME) return ''
  try {
    return new Date(BUILD_TIME).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

// Etichetta completa: "v0.1.0 · 3106b42 · 04/07/26 15:30"
export function versionLabel() {
  const parts = ['v' + APP_VERSION]
  if (COMMIT) parts.push(COMMIT)
  const d = buildDate()
  if (d) parts.push(d)
  return parts.join(' · ')
}
