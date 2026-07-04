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
  let msg = error?.message || fallback
  try {
    const j = await error?.context?.json()
    if (j?.error) msg = j.error
  } catch {
    // ignora: non era JSON
  }
  return msg
}

// Invia i chunk all'edge function che crea gli embedding e li salva
export async function ingestManual(manualId, chunks) {
  const { data, error } = await supabase.functions.invoke('manual-ingest', {
    body: {
      manual_id: manualId,
      chunks: chunks.map((content, index) => ({ index, content })),
    },
  })
  if (error) throw new Error(await fnError(error, 'Errore di indicizzazione'))
  return data
}

// Pone una domanda sul manuale (RAG + Claude)
export async function askManual(manualId, question, history = []) {
  const { data, error } = await supabase.functions.invoke('manual-chat', {
    body: { manual_id: manualId, question, history },
  })
  if (error) throw new Error(await fnError(error, 'Errore della chat'))
  return data
}
