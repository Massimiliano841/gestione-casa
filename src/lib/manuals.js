import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from './supabase'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// Estrae tutto il testo da un PDF nel browser
export async function extractPdfText(file) {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  let text = ''
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const line = content.items.map((it) => (it && it.str) || '').join(' ')
    text += line + '\n\n'
  }
  return text
}

// Spezza il testo in blocchi ~1000 caratteri con un po' di sovrapposizione,
// tagliando dove possibile a fine frase/riga
export function chunkText(text, size = 1000, overlap = 150) {
  const clean = text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  const chunks = []
  let i = 0
  while (i < clean.length) {
    const end = Math.min(i + size, clean.length)
    let cut = end
    if (end < clean.length) {
      const slice = clean.slice(i, end)
      const lastBreak = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('\n'))
      if (lastBreak > size * 0.5) cut = i + lastBreak + 1
    }
    const piece = clean.slice(i, cut).trim()
    if (piece) chunks.push(piece)
    if (cut >= clean.length) break
    i = Math.max(cut - overlap, i + 1)
  }
  return chunks
}

// Legge il messaggio d'errore JSON restituito da un'edge function
async function fnError(error, fallback = 'Errore') {
  const ctx = error?.context
  try {
    const text = await ctx?.clone?.().text?.()
    if (text) {
      try {
        const j = JSON.parse(text)
        if (j?.error) return j.error
      } catch {
        // non era JSON: usa il testo grezzo (max 200 caratteri)
        return text.slice(0, 200)
      }
    }
  } catch {
    // context non leggibile
  }
  return error?.message || fallback
}

// Invia un lotto di chunk all'edge function. Se supera il limite di CPU
// (manuale con testo denso), dimezza il lotto e riprova ricorsivamente.
async function sendBatch(manualId, items, first, last, done, total, onProgress) {
  const { error } = await supabase.functions.invoke('manual-ingest', {
    body: { manual_id: manualId, chunks: items, first, last },
  })
  if (error) {
    if (items.length > 1) {
      const mid = Math.ceil(items.length / 2)
      let d = await sendBatch(manualId, items.slice(0, mid), first, false, done, total, onProgress)
      d = await sendBatch(manualId, items.slice(mid), false, last, d, total, onProgress)
      return d
    }
    throw new Error(await fnError(error, 'Errore di indicizzazione'))
  }
  const d = done + items.length
  onProgress?.(d, total)
  return d
}

// Indicizza tutti i chunk A LOTTI (piccoli, per restare sotto il limite di CPU
// dell'edge function). onProgress(done, total) aggiorna la UI.
export async function ingestManual(manualId, chunks, onProgress) {
  const BATCH = 4
  const total = chunks.length
  const items = chunks.map((content, index) => ({ index, content }))
  let done = 0
  for (let i = 0; i < total; i += BATCH) {
    done = await sendBatch(
      manualId,
      items.slice(i, i + BATCH),
      i === 0,
      i + BATCH >= total,
      done,
      total,
      onProgress
    )
  }
  return { ok: true, n_chunks: total }
}

// Pone una domanda sul manuale (RAG + Claude)
export async function askManual(manualId, question, history = []) {
  const { data, error } = await supabase.functions.invoke('manual-chat', {
    body: { manual_id: manualId, question, history },
  })
  if (error) throw new Error(await fnError(error, 'Errore della chat'))
  return data
}
