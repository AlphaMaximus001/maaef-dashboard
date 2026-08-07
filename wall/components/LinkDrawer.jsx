'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ago, stamp, clock, nameOf } from '@/lib/time'
import VoiceRecorder, { extFor } from './VoiceRecorder'

const SIGNED_FOR = 60 * 60   // an hour is plenty for one sitting

export default function LinkDrawer({ link, me, people, admin, onClose, onRemove, onCount, say }) {
  const supabase = useMemo(() => createClient(), [])
  const [notes, setNotes] = useState([])
  const [media, setMedia] = useState({})       // media_path -> signed url
  const [text, setText] = useState('')
  const [staged, setStaged] = useState(null)   // { kind, blob, url, mime, duration }
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [zoom, setZoom] = useState(null)
  const [shotBroken, setShotBroken] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [armed, setArmed] = useState(false)
  const threadEnd = useRef(null)
  const fileRef = useRef(null)

  const who = people[link.created_by]
  const canRemoveLink = link.created_by === me.id || admin

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('notes').select('*').eq('link_id', link.id).order('created_at')
    if (error) { setErr(error.message); setLoading(false); return }

    const rows = data || []
    setNotes(rows)
    setLoading(false)
    onCount?.(rows.reduce((a, n) => ({ ...a, [n.kind]: (a[n.kind] || 0) + 1 }), { text: 0, voice: 0, shot: 0 }))

    // the bucket is private, so nothing plays or renders without a signed url
    const paths = rows.map(n => n.media_path).filter(Boolean)
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('wall').createSignedUrls(paths, SIGNED_FOR)
      if (signed) {
        setMedia(prev => {
          const next = { ...prev }
          signed.forEach(s => { if (s.signedUrl) next[s.path] = s.signedUrl })
          return next
        })
      }
    }
  }, [supabase, link.id, onCount])

  useEffect(() => { load() }, [load])

  // keep the thread live while two people are looking at the same card
  useEffect(() => {
    const ch = supabase
      .channel('notes:' + link.id)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `link_id=eq.${link.id}` },
        load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase, link.id, load])

  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') { if (zoom) setZoom(null); else onClose() } }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose, zoom])

  useEffect(() => { threadEnd.current?.scrollIntoView({ block: 'end' }) }, [notes.length])

  useEffect(() => () => { if (staged?.url) URL.revokeObjectURL(staged.url) }, [staged])

  function stage(kind, blob, mime, duration) {
    if (blob.size > 25 * 1024 * 1024) return setErr('That file is over the 25 MB limit.')
    setErr('')
    setStaged(prev => {
      if (prev?.url) URL.revokeObjectURL(prev.url)
      return { kind, blob, mime: mime || blob.type, duration, url: URL.createObjectURL(blob) }
    })
  }

  const takeImage = file => {
    if (!file) return
    if (!file.type.startsWith('image/')) return setErr('Screenshots only — pick an image file.')
    stage('shot', file, file.type)
  }

  async function send() {
    if (busy) return
    const body = text.trim()
    if (!staged && !body) return
    setBusy(true); setErr('')
    try {
      let media_path = null
      if (staged) {
        const ext = staged.kind === 'voice'
          ? extFor(staged.mime)
          : (staged.mime.split('/')[1] || 'png').replace('jpeg', 'jpg').split('+')[0]
        // filed under the uploader's id — storage security keys off that folder
        media_path = `${me.id}/${link.id}/${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage
          .from('wall')
          .upload(media_path, staged.blob, { contentType: staged.mime, upsert: false })
        if (error) throw error
      }

      const { error } = await supabase.from('notes').insert({
        link_id: link.id,
        kind: staged ? staged.kind : 'text',
        body: body || null,
        media_path,
        duration_ms: staged?.duration ? Math.round(staged.duration) : null,
        created_by: me.id
      })
      if (error) {
        if (media_path) await supabase.storage.from('wall').remove([media_path])
        throw error
      }

      setText('')
      if (staged?.url) URL.revokeObjectURL(staged.url)
      setStaged(null)
      await load()
    } catch (e) {
      setErr(e.message || 'That did not go up.')
    } finally {
      setBusy(false)
    }
  }

  async function removeNote(note) {
    if (note.media_path) await supabase.storage.from('wall').remove([note.media_path])
    const { error } = await supabase.from('notes').delete().eq('id', note.id)
    if (error) return setErr(error.message)
    setNotes(prev => prev.filter(n => n.id !== note.id))
    say?.('Note removed')
    load()
  }

  const host = link.site_name || safeHost(link.url)

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside
        className="drawer"
        onPaste={e => {
          const img = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'))
          if (img) { e.preventDefault(); takeImage(img.getAsFile()) }
        }}
      >
        <header className="drawer-head">
          <button className="close" onClick={onClose} title="Close (Esc)">✕</button>

          {link.image_url && !shotBroken && (
            <div className="drawer-shot">
              <img src={link.image_url} alt="" referrerPolicy="no-referrer"
                onError={() => setShotBroken(true)} />
            </div>
          )}

          <div className={'drawer-meta' + (link.image_url && !shotBroken ? ' over' : '')}>
            <div className="mono" style={{ color: 'var(--amber-lo)', marginBottom: 6 }}>{host}</div>
            <h2>{link.title || link.url}</h2>
            {link.description && (
              <div className="hint" style={{ marginTop: 6 }}>{link.description}</div>
            )}
            <a className="drawer-url" href={link.url} target="_blank" rel="noreferrer noopener">
              {link.url} ↗
            </a>

            <div className="byline">
              <span className="who">{nameOf(who)}</span>
              <span className="mono">pinned {ago(link.created_at)} · {stamp(link.created_at)}</span>
              <div style={{ flex: 1 }} />
              {canRemoveLink && (
                <button
                  className={'tool' + (armed ? ' rec' : '')}
                  onClick={() => { if (armed) onRemove(); else setArmed(true) }}
                  onBlur={() => setArmed(false)}
                >
                  {armed ? 'Take it down?' : 'Delete'}
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="thread">
          {loading ? (
            <div className="thread-empty"><span className="pulse">Loading</span></div>
          ) : notes.length === 0 ? (
            <div className="thread-empty">
              <div className="mono">Nothing said yet</div>
              <div className="hint" style={{ marginTop: 8 }}>
                Type a note, record your voice, or drop a screenshot in below.
              </div>
            </div>
          ) : notes.map(n => (
            <article className={'note ' + n.kind} key={n.id}>
              {(n.created_by === me.id || admin) && (
                <button className="scrub" title="Remove this note" onClick={() => removeNote(n)}>✕</button>
              )}

              <div className="note-head">
                <span className="note-who">{nameOf(people[n.created_by])}</span>
                <span className="mono" title={stamp(n.created_at)}>{ago(n.created_at)}</span>
                {n.kind === 'voice' && <span className="mono">voice {n.duration_ms ? `· ${clock(n.duration_ms)}` : ''}</span>}
                {n.kind === 'shot' && <span className="mono">screenshot</span>}
              </div>

              {n.kind === 'voice' && (
                media[n.media_path]
                  ? <audio controls preload="none" src={media[n.media_path]} />
                  : <div className="mono">audio unavailable</div>
              )}

              {n.kind === 'shot' && (
                media[n.media_path]
                  ? <img className="evidence" src={media[n.media_path]} alt={n.body || 'screenshot'}
                      onClick={() => setZoom(media[n.media_path])} />
                  : <div className="mono">image unavailable</div>
              )}

              {n.body && (
                <div className="note-body" style={{ marginTop: n.kind === 'text' ? 0 : 10 }}>{n.body}</div>
              )}
            </article>
          ))}
          <div ref={threadEnd} />
        </div>

        <div
          className={'composer' + (dragging ? ' dragging' : '')}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault(); setDragging(false)
            takeImage(e.dataTransfer.files?.[0])
          }}
        >
          {err && <div className="err" style={{ marginBottom: 10 }}>{err}</div>}

          {staged && (
            <div className="staged">
              {staged.kind === 'shot'
                ? <img src={staged.url} alt="" />
                : <audio controls src={staged.url} />}
              <span className="mono">{staged.kind === 'shot' ? 'screenshot ready' : `voice · ${clock(staged.duration)}`}</span>
              <div className="sp" />
              <button className="tool" onClick={() => { URL.revokeObjectURL(staged.url); setStaged(null) }}>
                Discard
              </button>
            </div>
          )}

          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={staged ? 'Say something about it (optional)…' : 'What about this link?'}
            style={{ minHeight: 62 }}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() }
            }}
          />

          <div className="tools">
            {!staged && (
              <VoiceRecorder
                busy={busy}
                onError={setErr}
                onDone={(blob, ms, mime) => stage('voice', blob, mime, ms)}
              />
            )}

            <button className="tool" onClick={() => fileRef.current?.click()} disabled={busy} title="Attach a screenshot">
              ▣ Shot
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={e => { takeImage(e.target.files?.[0]); e.target.value = '' }}
            />

            <div className="sp" />
            <button className="btn" onClick={send} disabled={busy || (!staged && !text.trim())}>
              {busy ? 'Sending…' : 'Add'}
            </button>
          </div>
        </div>
      </aside>

      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" />
        </div>
      )}
    </>
  )
}

function safeHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}
