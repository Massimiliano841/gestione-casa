# 🏡 Gestione Casa

App personale per gestire tutte le attività di casa in un unico posto:

- 🔐 **Password e credenziali** — cifrate end-to-end nel browser
- 📄 **Informazioni importanti** — note e dati riservati, cifrati
- 📅 **Scadenze** — bollette, revisioni, rinnovi (con ricorrenze e avvisi)
- 💡 **Domotica** — registro manuale di accensioni e spegnimenti

Frontend **React + Vite**, backend **Supabase** (database + login), hosting gratuito su **GitHub Pages**.

---

## 🔒 Come funziona la sicurezza

Ci sono **due password diverse**, tienile a mente:

1. **Password di accesso (login)** — email + password, gestita da Supabase. Serve per entrare.
2. **Master password** — la scegli al primo accesso. Con questa vengono **cifrate** le tue password e note *dentro il browser*, prima di essere inviate al database.

Questo significa che nel database Supabase le password sono salvate **illeggibili**: nemmeno chi avesse accesso al database potrebbe leggerle senza la master password.

> ⚠️ **La master password NON è recuperabile.** Se la dimentichi, i dati cifrati (password e informazioni) sono persi per sempre. Annotala in un posto sicuro. Scadenze e domotica non sono cifrate e restano leggibili.

---

## 🚀 Avvio in locale

Requisiti: [Node.js](https://nodejs.org) 20+.

```bash
npm install
npm run dev
```

Apri http://localhost:5173

Le credenziali di connessione a Supabase sono nel file `.env` (già configurato per il tuo progetto). Il file non viene mai caricato su GitHub perché è in `.gitignore`.

---

## ☁️ Pubblicazione su GitHub Pages

### 1. Crea il repository e carica il codice

```bash
git init
git add .
git commit -m "Prima versione Gestione Casa"
git branch -M main
git remote add origin https://github.com/TUO-UTENTE/gestione-casa.git
git push -u origin main
```

### 2. Aggiungi le chiavi Supabase come "secret"

Il file `.env` non viene caricato su GitHub, quindi la build in cloud ha bisogno delle chiavi come *secret*.

Vai su **GitHub → il tuo repo → Settings → Secrets and variables → Actions → New repository secret** e crea questi due secret (i valori sono nel tuo file `.env`):

| Nome | Valore |
|------|--------|
| `VITE_SUPABASE_URL` | `https://qhrrbyapdhljyitfgnsk.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | la tua chiave `sb_publishable_...` |

> Nota: la chiave "publishable/anon" è pensata per stare nel browser ed è protetta dalle regole RLS del database, quindi non è un segreto critico. La teniamo comunque nei secret per pulizia.

### 3. Attiva GitHub Pages

Vai su **Settings → Pages → Build and deployment → Source** e scegli **GitHub Actions**.

Ad ogni `git push` sul ramo `main`, l'app viene ricostruita e pubblicata automaticamente su:

```
https://TUO-UTENTE.github.io/gestione-casa/
```

### 4. Autorizza il dominio su Supabase

Perché il login funzioni dal sito pubblico, aggiungi l'URL di GitHub Pages tra i redirect consentiti:

**Supabase Dashboard → Authentication → URL Configuration → Redirect URLs** → aggiungi
`https://TUO-UTENTE.github.io/gestione-casa/`

---

## 👤 Primo accesso

1. Apri l'app → **Registrati** con la tua email e una password.
2. **Conferma l'email** (Supabase ti invia un link).
   - _In alternativa_, per un'app di uso personale puoi disattivare la conferma email in **Supabase → Authentication → Sign In / Providers → Email → "Confirm email" OFF**, così entri subito.
3. Accedi → crea la tua **master password**.
4. Inizia ad aggiungere password, informazioni, scadenze e attività di domotica.

---

## 🗄️ Struttura del database

Tutte le tabelle hanno **Row Level Security**: ogni utente vede solo i propri dati.

| Tabella | Contenuto | Campi cifrati |
|---------|-----------|---------------|
| `credentials` | Password e credenziali | `password_enc`, `notes_enc` |
| `secure_notes` | Informazioni importanti | `content_enc` |
| `deadlines` | Scadenze | — |
| `automation_log` | Registro domotica | — |
| `vault_meta` | Sale + verificatore master password | — |

---

## 🧩 Tecnologie

- React 19 + Vite 8 + React Router (HashRouter)
- Supabase (PostgreSQL, Auth, RLS)
- Crittografia: Web Crypto API — PBKDF2 (SHA-256, 210.000 iterazioni) + AES-GCM 256 bit

## 📁 Struttura del progetto

```
src/
  lib/
    supabase.js       Client Supabase
    crypto.js         Cifratura/decifratura (master password)
  context/
    AuthProvider.jsx  Stato login
    VaultProvider.jsx Stato cassaforte cifrata
  components/         Layout, Modal, Spinner, PageHeader
  pages/
    Login.jsx         Accesso / registrazione
    VaultGate.jsx     Crea / sblocca master password
    Dashboard.jsx     Riepilogo
    Credentials.jsx   🔐 Password
    SecureNotes.jsx   📄 Informazioni
    Deadlines.jsx     📅 Scadenze
    Automation.jsx    💡 Domotica
```
