import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

// Info di versione iniettate a build time (per verificare cosa è online)
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
let commit = process.env.GITHUB_SHA || ''
if (!commit) {
  try {
    commit = execSync('git rev-parse HEAD').toString().trim()
  } catch {
    commit = ''
  }
}

// base './' -> percorsi relativi, funziona sia in locale sia su GitHub Pages
// (utente.github.io/nome-repo/). Con HashRouter non servono riscritture server.
// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT__: JSON.stringify(commit.slice(0, 7)),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})
