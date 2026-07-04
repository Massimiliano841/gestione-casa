// Edge Function "manual-ingest" — genera gli embedding dei chunk di un manuale
// e li salva in manual_chunks. Gli embedding usano il modello integrato di
// Supabase (gte-small, 384 dim): nessuna API key esterna necessaria.
// L'autenticazione avviene con il JWT dell'utente: la RLS scopa i dati per utente.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) return json({ error: 'Non autenticato' }, 401)

    // Client con il JWT dell'utente -> tutte le query rispettano la RLS
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const body = await req.json()
    const manualId = String(body.manual_id || '')
    const chunks = Array.isArray(body.chunks) ? body.chunks : []
    if (!manualId) return json({ error: 'manual_id mancante' }, 400)
    if (chunks.length === 0) return json({ error: 'Nessun contenuto da indicizzare' }, 400)

    // Verifica che il manuale appartenga all'utente (RLS)
    const { data: manual, error: mErr } = await supa
      .from('manuals')
      .select('id')
      .eq('id', manualId)
      .maybeSingle()
    if (mErr) return json({ error: mErr.message }, 400)
    if (!manual) return json({ error: 'Manuale non trovato' }, 404)

    // Modello di embedding integrato nell'edge runtime
    // @ts-ignore Supabase.ai è disponibile a runtime
    const session = new Supabase.ai.Session('gte-small')

    const rows = []
    for (let i = 0; i < chunks.length; i++) {
      const content = String(chunks[i].content || '').trim()
      if (!content) continue
      const embedding = await session.run(content, { mean_pool: true, normalize: true })
      rows.push({
        manual_id: manualId,
        chunk_index: typeof chunks[i].index === 'number' ? chunks[i].index : i,
        content,
        embedding,
      })
    }

    // Reindicizzazione idempotente: elimina i chunk precedenti di questo manuale
    await supa.from('manual_chunks').delete().eq('manual_id', manualId)

    const { error: insErr } = await supa.from('manual_chunks').insert(rows)
    if (insErr) {
      await supa.from('manuals').update({ status: 'error' }).eq('id', manualId)
      return json({ error: insErr.message }, 400)
    }

    await supa
      .from('manuals')
      .update({ status: 'ready', n_chunks: rows.length, updated_at: new Date().toISOString() })
      .eq('id', manualId)

    return json({ ok: true, n_chunks: rows.length })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
