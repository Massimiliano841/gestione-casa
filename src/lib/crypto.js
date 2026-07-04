// ============================================================
// Crittografia lato client (zero-knowledge)
// ------------------------------------------------------------
// Le password / note sensibili vengono cifrate NEL BROWSER con una
// chiave derivata dalla "master password". Sul database Supabase
// arriva solo testo cifrato: nessuno (nemmeno chi accede al DB) puo
// leggerlo senza la master password.
//
// Algoritmi: PBKDF2 (SHA-256) per derivare la chiave, AES-GCM 256 bit
// per cifrare. Usiamo solo Web Crypto API, nativa nel browser.
// ============================================================

const PBKDF2_ITERATIONS = 210_000
const enc = new TextEncoder()
const dec = new TextDecoder()

// Stringa nota usata per validare la master password all'unlock.
export const VERIFIER_PLAINTEXT = 'gestione-casa::vault::ok'

// --- helper base64 <-> bytes ---
function bytesToBase64(bytes) {
  let bin = ''
  const arr = new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return btoa(bin)
}

function base64ToBytes(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** Genera un sale casuale (16 byte) in base64. */
export function generateSalt() {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return bytesToBase64(salt)
}

/**
 * Deriva una CryptoKey AES-GCM dalla master password + sale.
 * La chiave resta solo in memoria, non viene mai salvata.
 */
export async function deriveKey(masterPassword, saltB64) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(masterPassword),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64ToBytes(saltB64),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Cifra una stringa. Ritorna base64( iv[12] || ciphertext ).
 * Stringhe vuote / null non vengono cifrate (ritorna null).
 */
export async function encryptText(key, plaintext) {
  if (plaintext == null || plaintext === '') return null
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  )
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return bytesToBase64(combined)
}

/**
 * Decifra il testo prodotto da encryptText. Ritorna la stringa in chiaro.
 * Lancia un'eccezione se la chiave e' sbagliata o i dati sono corrotti.
 */
export async function decryptText(key, payloadB64) {
  if (payloadB64 == null || payloadB64 === '') return ''
  const combined = base64ToBytes(payloadB64)
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  return dec.decode(plaintext)
}

/**
 * Verifica che la chiave derivata corrisponda al verifier salvato.
 * Ritorna true/false senza lanciare eccezioni.
 */
export async function verifyKey(key, verifierB64) {
  try {
    const value = await decryptText(key, verifierB64)
    return value === VERIFIER_PLAINTEXT
  } catch {
    return false
  }
}
