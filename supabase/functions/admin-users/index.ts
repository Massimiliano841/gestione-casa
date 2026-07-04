// Edge Function "admin-users" — gestione utenti riservata agli admin.
// Usa la chiave service_role (solo lato server) per creare/eliminare utenti
// e verifica che chi chiama sia un admin (profiles.role = 'admin').
// Deployata sul progetto Supabase; questo file è la copia versionata.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Dominio interno per le email sintetiche: username -> username@DOMAIN.
const DOMAIN = 'gestionecasa.app'

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

function normalizeUsername(u: string) {
  return String(u || '').trim().toLowerCase()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // --- Identifica il chiamante dal JWT ---
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData.user) return json({ error: 'Non autenticato' }, 401)
    const caller = userData.user

    // --- Verifica che il chiamante sia admin ---
    const { data: prof } = await admin
      .from('profiles')
      .select('role')
      .eq('user_id', caller.id)
      .maybeSingle()
    if (!prof || prof.role !== 'admin') return json({ error: 'Permesso negato: solo admin' }, 403)

    const body = await req.json()
    const action = body.action as string

    // ================= CREATE =================
    if (action === 'create') {
      const username = normalizeUsername(body.username)
      const password = String(body.password || '')
      const role = body.role === 'admin' ? 'admin' : 'user'

      if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
        return json({ error: 'Username non valido (3-32 caratteri: lettere, numeri, . _ -)' }, 400)
      }
      if (password.length < 6) {
        return json({ error: 'La password deve avere almeno 6 caratteri' }, 400)
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: `${username}@${DOMAIN}`,
        password,
        email_confirm: true,
      })
      if (createErr) {
        const msg = createErr.message.includes('already') ? 'Username gia esistente' : createErr.message
        return json({ error: msg }, 400)
      }

      const { error: profErr } = await admin
        .from('profiles')
        .insert({ user_id: created.user.id, username, role })
      if (profErr) {
        await admin.auth.admin.deleteUser(created.user.id)
        const msg = profErr.message.includes('duplicate') ? 'Username gia esistente' : profErr.message
        return json({ error: msg }, 400)
      }

      return json({ ok: true, user_id: created.user.id, username, role })
    }

    // ================= DELETE =================
    if (action === 'delete') {
      const targetId = String(body.user_id || '')
      if (!targetId) return json({ error: 'user_id mancante' }, 400)
      if (targetId === caller.id) return json({ error: 'Non puoi eliminare te stesso' }, 400)

      const { error: delErr } = await admin.auth.admin.deleteUser(targetId)
      if (delErr) return json({ error: delErr.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Azione non riconosciuta' }, 400)
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500)
  }
})
