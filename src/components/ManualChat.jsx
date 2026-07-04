import { useEffect, useRef, useState } from 'react'
import { askManual, pageImageUrls } from '../lib/manuals'
import Modal from './Modal'

// Chat AI su un manuale (RAG). Usato sia dalla pagina Manuali sia dalla Domotica,
// così il manuale si apre nel contesto da cui è stato richiamato.
export default function ManualChat({ manual, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [lightbox, setLightbox] = useState(null)
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
      // recupera le immagini delle pagine citate (URL firmati temporanei)
      let pageImgs = []
      if (res.pages && res.pages.length) {
        const map = await pageImageUrls(manual.user_id, manual.id, res.pages)
        pageImgs = res.pages
          .filter((p) => map[p])
          .map((p) => ({ page: p, url: map[p] }))
      }
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: res.answer, sources: res.sources, pageImgs },
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
              Le risposte usano solo il contenuto del PDF e mostrano le pagine di riferimento.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={m.role === 'user' ? 'chat-msg chat-user' : 'chat-msg chat-bot'}
            >
              <div className="chat-bubble">{m.content}</div>
              {m.pageImgs && m.pageImgs.length > 0 && (
                <div className="chat-pages">
                  {m.pageImgs.map((pg) => (
                    <button
                      key={pg.page}
                      className="chat-page"
                      onClick={() => setLightbox(pg)}
                      title={`Pagina ${pg.page} — clicca per ingrandire`}
                    >
                      <img src={pg.url} alt={`Pagina ${pg.page}`} loading="lazy" />
                      <span className="chat-page-label">Pag. {pg.page}</span>
                    </button>
                  ))}
                </div>
              )}
              {m.sources && m.sources.length > 0 && (
                <div className="chat-sources">
                  Fonti: {m.sources.map((s) => `[${s.n}]`).join(' ')}
                </div>
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

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox.url} alt={`Pagina ${lightbox.page}`} />
          <div className="lightbox-label">Pagina {lightbox.page} — tocca per chiudere</div>
        </div>
      )}
    </Modal>
  )
}
