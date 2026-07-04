import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { extractPdfText, chunkText, ingestManual, askManual } from '../lib/manuals'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'

const STATUS = {
  processing: { label: 'In elaborazione…', cls: 'tag-soft' },
  ready: { label: 'Pronto', cls: 'tag-ok' },
  error: { label: 'Errore', cls: 'tag-err' },
}

export default function Manuals() {
  const { user } = useAuth()
  const location = useLocation()
  const [manuals, setManuals] = useState([])
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [chatManual, setChatManual] = useState(null)

  useEffect(() => {
    load()
  }, [])

  // Se si arriva dalla Domotica con un manuale da aprire, apri la chat
  useEffect(() => {
    const id = location.state?.openManualId
    if (id && manuals.length) {
      const m = manuals.find((x) => x.id === id)
      if (m && m.status === 'ready') setChatManual(m)
    }
  }, [location.state, manuals])

  async function load() {
    setLoading(true)
    const [{ data: m }, { data: d }] = await Promise.all([
      supabase
        .from('manuals')
        .select('*, automation_schedule(device_name, room)')
        .order('created_at', { ascending: false }),
      supabase.from('automation_schedule').select('id, device_name, room').order('device_name'),
    ])
    setManuals(m || [])
    setDevices(d || [])
    setLoading(false)
  }

  async function handleDelete(man) {
    if (!confirm(`Eliminare il manuale "${man.title}"?`)) return
    // rimuovi il PDF dallo storage (best effort) poi la riga (i chunk cascano)
    if (man.storage_path) {
      await supabase.storage.from('manuals').remove([man.storage_path])
    }
    const { error } = await supabase.from('manuals').delete().eq('id', man.id)
    if (error) return alert('Errore: ' + error.message)
    await load()
  }

  return (
    <div>
      <PageHeader
        icon="📖"
        title="Manuali"
        subtitle="Archivio PDF con assistente AI"
        action={
          <button className="btn btn-primary" onClick={() => setUploadOpen(true)}>
            + Manuale
          </button>
        }
      />

      {loading ? (
        <Spinner label="Caricamento…" />
      ) : manuals.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📖</div>
          <p>Nessun manuale caricato.</p>
          <button className="btn btn-primary" onClick={() => setUploadOpen(true)}>
            + Carica il primo
          </button>
        </div>
      ) : (
        <div className="card-list">
          {manuals.map((man) => {
            const st = STATUS[man.status] || STATUS.processing
            const dev = man.automation_schedule
            return (
              <div className="card" key={man.id}>
                <div className="card-main">
                  <div className="card-title">📄 {man.title}</div>
                  <div className="tag-row">
                    <span className={`tag ${st.cls}`}>{st.label}</span>
                    {man.status === 'ready' && (
                      <span className="tag">{man.n_chunks} sezioni</span>
                    )}
                    {dev && (
                      <span className="tag tag-soft">
                        💡 {dev.device_name}
                        {dev.room ? ` · ${dev.room}` : ''}
                      </span>
                    )}
                  </div>
                  {man.filename && <div className="card-sub">{man.filename}</div>}
                </div>
                <div className="card-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setChatManual(man)}
                    disabled={man.status !== 'ready'}
                    title={man.status === 'ready' ? 'Chiedi all’AI' : 'Manuale non pronto'}
                  >
                    💬 Chiedi
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => handleDelete(man)}
                    title="Elimina"
                  >
                    🗑
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {uploadOpen && (
        <UploadModal
          userId={user?.id}
          devices={devices}
          onClose={() => setUploadOpen(false)}
          onDone={async () => {
            setUploadOpen(false)
            await load()
          }}
        />
      )}

      {chatManual && (
        <ChatModal manual={chatManual} onClose={() => setChatManual(null)} />
      )}
    </div>
  )
}

function UploadModal({ userId, devices, onClose, onDone }) {
  const [title, setTitle] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('')
  const [error, setError] = useState('')

  function pickFile(f) {
    setFile(f || null)
    if (f && !title) setTitle(f.name.replace(/\.pdf$/i, ''))
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!file) return setError('Seleziona un file PDF.')
    if (file.type !== 'application/pdf') return setError('Il file deve essere un PDF.')
    setError('')
    setBusy(true)
    let manualId = null
    try {
      // 1) crea la riga del manuale
      setStep('Creo il manuale…')
      const { data: created, error: insErr } = await supabase
        .from('manuals')
        .insert({
          title: title.trim() || file.name,
          filename: file.name,
          device_id: deviceId || null,
          status: 'processing',
        })
        .select('id')
        .single()
      if (insErr) throw insErr
      manualId = created.id

      // 2) carica il PDF nello storage privato
      setStep('Carico il PDF…')
      const path = `${userId}/${manualId}.pdf`
      const { error: upErr } = await supabase.storage
        .from('manuals')
        .upload(path, file, { contentType: 'application/pdf', upsert: true })
      if (upErr) throw upErr
      await supabase.from('manuals').update({ storage_path: path }).eq('id', manualId)

      // 3) estrai il testo e spezzalo in blocchi
      setStep('Estraggo il testo…')
      const text = await extractPdfText(file)
      const chunks = chunkText(text)
      if (chunks.length === 0) {
        throw new Error('Non sono riuscito a estrarre testo dal PDF (forse è solo immagini/scansione).')
      }

      // 4) indicizza (embedding + salvataggio), a lotti con avanzamento
      setStep(`Indicizzo 0 / ${chunks.length} sezioni…`)
      await ingestManual(manualId, chunks, (done, tot) =>
        setStep(`Indicizzo ${done} / ${tot} sezioni…`)
      )

      await onDone()
    } catch (err) {
      setError(err.message || String(err))
      if (manualId) await supabase.from('manuals').update({ status: 'error' }).eq('id', manualId)
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Nuovo manuale"
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={busy || !file}
          >
            {busy ? 'Attendere…' : 'Carica e indicizza'}
          </button>
        </>
      }
    >
      <form className="form-grid" onSubmit={handleUpload}>
        <label className="field">
          <span>File PDF *</span>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => pickFile(e.target.files?.[0])}
            disabled={busy}
          />
        </label>
        <label className="field">
          <span>Titolo</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="es. Caldaia Vaillant — istruzioni"
            disabled={busy}
          />
        </label>
        <label className="field">
          <span>Collega a un dispositivo Domotica (opzionale)</span>
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            disabled={busy}
          >
            <option value="">— Nessuno —</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.device_name}
                {d.room ? ` · ${d.room}` : ''}
              </option>
            ))}
          </select>
        </label>
        {busy && (
          <p className="alert alert-info">
            {step} L’elaborazione avviene nel browser, non chiudere la finestra.
          </p>
        )}
        {error && <p className="alert alert-error">{error}</p>}
      </form>
    </Modal>
  )
}

function ChatModal({ manual, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, busy])

  async function send(e) {
    e?.preventDefault()
    const q = input.trim()
    if (!q || busy) return
    setInput('')
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    setMessages((m) => [...m, { role: 'user', content: q }])
    setBusy(true)
    try {
      const res = await askManual(manual.id, q, history)
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: res.answer, sources: res.sources },
      ])
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: '⚠️ ' + (err.message || String(err)), error: true },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`💬 ${manual.title}`} onClose={onClose}>
      <div className="chat">
        <div className="chat-messages" ref={listRef}>
          {messages.length === 0 && (
            <p className="chat-hint">
              Fai una domanda sul manuale, ad esempio “come imposto la temperatura?”.
              Le risposte usano solo il contenuto del PDF.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === 'user' ? 'chat-msg chat-user' : 'chat-msg chat-bot'
              }
            >
              <div className="chat-bubble">{m.content}</div>
              {m.sources && m.sources.length > 0 && (
                <div className="chat-sources">Fonti: {m.sources.map((s) => `[${s.n}]`).join(' ')}</div>
              )}
            </div>
          ))}
          {busy && (
            <div className="chat-msg chat-bot">
              <div className="chat-bubble chat-typing">…</div>
            </div>
          )}
        </div>
        <form className="chat-input" onSubmit={send}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Scrivi una domanda…"
            autoFocus
          />
          <button className="btn btn-primary" disabled={busy || !input.trim()}>
            Invia
          </button>
        </form>
      </div>
    </Modal>
  )
}
