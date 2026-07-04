import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' -> percorsi relativi, funziona sia in locale sia su GitHub Pages
// (utente.github.io/nome-repo/). Con HashRouter non servono riscritture server.
// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
})
