// Edge Function "manual-chat" — risponde a domande su un manuale (RAG).
// 1) genera l'embedding della domanda (gte-small, integrato);
// 2) recupera i chunk più pertinenti via match_manual_chunks (rispetta la RLS);
// 3) chiede a Claude di rispondere usando SOLO quel contesto.
// Richiede il secret ANTHROPIC_API_KEY. Modello configurabile via ANTHROPIC_MODEL
// (default claude-opus-4-8; imposta "claude-haiku-4-5" per ridurre i costi).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@0.68.0'

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

const SYSTEM = `Sei l'assistente di "Gestione Casa" e rispondi a domande su un manuale d'uso di un dispositivo.
Regole:
- Usa ESCLUSIVAMENTE le informazioni presenti nel CONTESTO fornito (estratti del manuale).
- Se la risposta non è nel contesto, dillo con onestà (es. "Non ho trovato questa informazione nel manuale.") e non inventare. In questo caso NON citare alcun estratto e non elencare di cosa parlano gli altri estratti.
- Rispondi in italiano, in modo chiaro e conciso; usa elenchi puntati per i passaggi.
- Cita tra parentesi quadre [n] SOLO gli estratti che contengono davvero l'informazione che stai fornendo, es. [2]. Non citare estratti che stai scartando o menzionando come non pertinenti.
- Rispondi solo con la risposta finale, senza descrivere il tuo ragionamento.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) return json({ error: 'Non autenticato' }, 401)

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return json(
        { error: "La chat AI non è ancora configurata: manca il secret ANTHROPIC_API_KEY." },
        400
      )
    }

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const body = await req.json()
    const manualId = String(body.manual_id || '')
    const question = String(body.question || '').trim()
    const history = Array.isArray(body.history) ? body.history.slice(-6) : []
    if (!manualId) return json({ error: 'manual_id mancante' }, 400)
    if (!question) return json({ error: 'Domanda vuota' }, 400)

    // Embedding della domanda
    // @ts-ignore Supabase.ai è disponibile a runtime
    const session = new Supabase.ai.Session('gte-small')
    const queryEmbedding = await session.run(question, { mean_pool: true, normalize: true })

    // Recupero semantico (RLS applicata: solo i chunk dell'utente)
    const { data: matches, error: mErr } = await supa.rpc('match_manual_chunks', {
      query_embedding: queryEmbedding,
      p_manual_id: manualId,
      match_count: 6,
    })
    if (mErr) return json({ error: mErr.message }, 400)

    const chunks = matches || []
    if (chunks.length === 0) {
      return json({
        answer:
          'Non ho trovato contenuti pertinenti nel manuale. Assicurati che il manuale sia stato indicizzato correttamente.',
        sources: [],
      })
    }

    const context = chunks
      .map((c: { chunk_index: number; content: string }, i: number) => `[${i + 1}] ${c.content}`)
      .join('\n\n')

    const anthropic = new Anthropic({ apiKey })
    const model = Deno.env.get('ANTHROPIC_MODEL') || 'claude-opus-4-8'

    const messages = [
      ...history
        .filter((m: { role: string; content: string }) => m && m.content)
        .map((m: { role: string; content: string }) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content),
        })),
      { role: 'user', content: `CONTESTO (estratti del manuale):\n${context}\n\nDOMANDA: ${question}` },
    ]

    const resp = await anthropic.messages.create({
      model,
      max_tokens: 1500,
      system: SYSTEM,
      messages,
    })

    const answer = resp.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n')
      .trim()

    // Estratti effettivamente citati nella risposta ([1], [2], ...): mostriamo
    // come fonti e pagine SOLO questi, così le miniature sono coerenti con la
    // risposta. Se il modello non cita nulla (es. "non ho trovato"), niente immagini.
    const cited = [
      ...new Set(
        [...answer.matchAll(/\[(\d+)\]/g)]
          .map((m: RegExpMatchArray) => Number(m[1]))
          .filter((n: number) => Number.isInteger(n) && n >= 1 && n <= chunks.length)
      ),
    ].sort((a, b) => a - b)

    const sources = cited.map((n: number) => ({
      n,
      chunk_index: chunks[n - 1].chunk_index,
      page: chunks[n - 1].page,
    }))

    // pagine citate, distinte e ordinate
    const pages = [
      ...new Set(
        cited
          .map((n: number) => chunks[n - 1].page)
          .filter((p: number | null) => typeof p === 'number')
      ),
    ].sort((a, b) => a - b)

    return json({
      answer: answer || 'Nessuna risposta generata.',
      sources,
      pages,
    })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
