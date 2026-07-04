import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import {
  processPdf,
  buildChunks,
  uploadPages,
  ingestManual,
  deleteManualFiles,
  deletePageImages,
} from '../lib/manuals'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'
import ManualChat from '../components/ManualChat'

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
  const [updateManual, setUpdateManual] = useState(null)
  const [linkManual, setLinkManual] = useState(null)
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
    // rimuovi PDF + immagini pagine (best effort), poi la riga (i chunk cascano)
    await deleteManualFiles(man.user_id, man.id, man.storage_path)
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
                    {man.status === 'ready' && man.n_pages > 0 && (
                      <span className="tag">📄 {man.n_pages} pagine</span>
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
                    onClick={() => setLinkManual(man)}
                    title={dev ? 'Cambia dispositivo collegato' : 'Collega a un dispositivo'}
                  >
                    🔗
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => setUpdateManual(man)}
                    title="Aggiorna il PDF (nuova versione)"
                  >
                    ⬆️
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

      {updateManual && (
        <UploadModal
          userId={user?.id}
          devices={devices}
          manual={updateManual}
          onClose={() => setUpdateManual(null)}
          onDone={async () => {
            setUpdateManual(null)
            await load()
          }}
        />
      )}

      {linkManual && (
        <LinkModal
          manual={linkManual}
          devices={devices}
          onClose={() => setLinkManual(null)}
          onDone={async () => {
            setLinkManual(null)
            await load()
          }}
        />
      )}

      {chatManual && (
        <ManualChat manual={chatManual} onClose={() => setChatManual(null)} />
      )}
    </div>
  )
}

function UploadModal({ userId, devices, manual, onClose, onDone }) {
  const isUpdate = !!manual
  const [title, setTitle] = useState(manual?.title || '')
  const [deviceId, setDeviceId] = useState(manual?.device_id || '')
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
    let manualId = manual?.id || null
    try {
      if (isUpdate) {
        // 1) rimetti il manuale in elaborazione con i nuovi metadati
        setStep('Preparo l’aggiornamento…')
        const { error: updErr } = await supabase
          .from('manuals')
          .update({
            title: title.trim() || file.name,
            filename: file.name,
            device_id: deviceId || null,
            status: 'processing',
            n_pages: 0,
          })
          .eq('id', manualId)
        if (updErr) throw updErr
      } else {
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
      }

      // 2) carica il PDF nello storage privato (sovrascrive la versione precedente)
      setStep('Carico il PDF…')
      const path = `${userId}/${manualId}.pdf`
      const { error: upErr } = await supabase.storage
        .from('manuals')
        .upload(path, file, { contentType: 'application/pdf', upsert: true })
      if (upErr) throw upErr
      await supabase.from('manuals').update({ storage_path: path }).eq('id', manualId)

      // 3) elabora il PDF: testo + immagini delle pagine
      setStep('Elaboro il PDF…')
      const { pages, nPages } = await processPdf(file, (done, tot) =>
        setStep(`Elaboro pagina ${done} / ${tot}…`)
      )
      const chunks = buildChunks(pages)
      if (chunks.length === 0) {
        throw new Error('Non sono riuscito a estrarre testo dal PDF (forse è solo immagini/scansione).')
      }

      // 3b) in aggiornamento, rimuovi le immagini della vecchia versione
      if (isUpdate) {
        setStep('Rimuovo la versione precedente…')
        await deletePageImages(userId, manualId)
      }

      // 4) carica le immagini delle pagine
      setStep(`Carico immagini 0 / ${nPages}…`)
      await uploadPages(userId, manualId, pages, (done, tot) =>
        setStep(`Carico immagini ${done} / ${tot}…`)
      )
      await supabase.from('manuals').update({ n_pages: nPages }).eq('id', manualId)

      // 5) indicizza (embedding + salvataggio), a lotti con avanzamento.
      //    Il primo lotto azzera i chunk precedenti: reindicizzazione idempotente.
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
      title={isUpdate ? 'Aggiorna manuale' : 'Nuovo manuale'}
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
            {busy ? 'Attendere…' : isUpdate ? 'Aggiorna e reindicizza' : 'Carica e indicizza'}
          </button>
        </>
      }
    >
      <form className="form-grid" onSubmit={handleUpload}>
        {isUpdate && (
          <p className="alert alert-info">
            Carica la nuova versione del PDF. Sostituisce il file, le pagine e l’indice
            AI del manuale «{manual.title}»; il collegamento resta modificabile qui sotto.
          </p>
        )}
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

function LinkModal({ manual, devices, onClose, onDone }) {
  const [deviceId, setDeviceId] = useState(manual.device_id || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setBusy(true)
    setError('')
    const { error: err } = await supabase
      .from('manuals')
      .update({ device_id: deviceId || null })
      .eq('id', manual.id)
    if (err) {
      setBusy(false)
      return setError(err.message)
    }
    await onDone()
  }

  return (
    <Modal
      title="Collega a Domotica"
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Salvataggio…' : 'Salva'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>Dispositivo Domotica</span>
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
        {error && <p className="alert alert-error">{error}</p>}
      </div>
    </Modal>
  )
}
