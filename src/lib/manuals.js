import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from './supabase'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// Elabora il PDF nel browser: per ogni pagina estrae il testo e la renderizza
// come immagine JPEG. onProgress(done, total).
export async function processPdf(file, onProgress) {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  const nPages = pdf.numPages
  const pages = []
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  for (let p = 1; p <= nPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const text = content.items.map((it) => (it && it.str) || '').join(' ')

    const vp1 = page.getViewport({ scale: 1 })
    const scale = Math.min(1400 / vp1.width, 2) // larghezza ~1400px, max 2x
    const viewport = page.getViewport({ scale })
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.72))

    pages.push({ page: p, text, blob })
    onProgress?.(p, nPages)
  }
  return { pages, nPages }
}

// Spezza il testo in blocchi ~1000 caratteri con un po' di sovrapposizione
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

// Costruisce i chunk taggati con la pagina di provenienza
export function buildChunks(pages) {
  const chunks = []
  for (const pg of pages) {
    for (const c of chunkText(pg.text)) chunks.push({ content: c, page: pg.page })
  }
  return chunks
}

// Carica le immagini delle pagine nello storage privato. onProgress(done, total).
export async function uploadPages(userId, manualId, pages, onProgress) {
  let done = 0
  for (const pg of pages) {
    if (pg.blob) {
      const path = `${userId}/${manualId}/p${pg.page}.jpg`
      const { error } = await supabase.storage
        .from('manuals')
        .upload(path, pg.blob, { contentType: 'image/jpeg', upsert: true })
      if (error) throw new Error(`Caricamento pagina ${pg.page}: ${error.message}`)
    }
    done++
    onProgress?.(done, pages.length)
  }
}

// URL firmati (temporanei) per le immagini di alcune pagine
export async function pageImageUrls(userId, manualId, pageNumbers) {
  const nums = [...new Set((pageNumbers || []).filter((p) => typeof p === 'number'))]
  if (nums.length === 0) return {}
  const paths = nums.map((p) => `${userId}/${manualId}/p${p}.jpg`)
  const { data } = await supabase.storage.from('manuals').createSignedUrls(paths, 3600)
  const map = {}
  ;(data || []).forEach((d, i) => {
    if (d && d.signedUrl && !d.error) map[nums[i]] = d.signedUrl
  })
  return map
}

// Rimuove dal bucket il PDF e tutte le immagini delle pagine di un manuale
export async function deleteManualFiles(userId, manualId, storagePath) {
  const paths = []
  if (storagePath) paths.push(storagePath)
  const { data } = await supabase.storage.from('manuals').list(`${userId}/${manualId}`)
  for (const f of data || []) paths.push(`${userId}/${manualId}/${f.name}`)
  if (paths.length) await supabase.storage.from('manuals').remove(paths)
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
        return text.slice(0, 200)
      }
    }
  } catch {
    // context non leggibile
  }
  return error?.message || fallback
}

// Invia un lotto di chunk (con pagina) all'edge function. Se supera il limite
// di CPU, dimezza il lotto e riprova ricorsivamente.
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

// Indicizza i chunk (con pagina) a lotti piccoli. onProgress(done, total).
export async function ingestManual(manualId, chunks, onProgress) {
  const BATCH = 4
  const total = chunks.length
  const items = chunks.map((c, index) => ({ index, content: c.content, page: c.page }))
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
