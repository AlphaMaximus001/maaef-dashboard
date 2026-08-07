'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Chrome from './Chrome'
import LinkBox from './LinkBox'
import LinkDrawer from './LinkDrawer'

export default function Wall({ me }) {
  const supabase = useMemo(() => createClient(), [])
  const [links, setLinks] = useState([])
  const [people, setPeople] = useState({})
  const [counts, setCounts] = useState({})
  const [draft, setDraft] = useState('')
  const [pinning, setPinning] = useState(null)   // the url being unfurled right now
  const [openId, setOpenId] = useState(null)
  const [q, setQ] = useState('')
  const [toast, setToast] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const inputRef = useRef(null)

  const admin = me.role === 'admin' || me.role === 'owner'
  const say = m => { setToast(m); setTimeout(() => setToast(t => (t === m ? '' : t)), 2800) }

  const load = useCallback(async () => {
    const [l, p, n] = await Promise.all([
      supabase.from('links').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email, role'),
      supabase.from('notes').select('link_id, kind')
    ])
    const bad = [l, p, n].find(r => r.error)
    setErr(bad ? bad.error.message : '')
    setLinks(l.data || [])
    setPeople(Object.fromEntries((p.data || []).map(x => [x.id, x])))
    setCounts(tally(n.data || []))
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // someone else's pin should land on your wall without a refresh
  useEffect(() => {
    const ch = supabase
      .channel('wall')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'links' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [supabase, load])

  // and if realtime is not switched on, catch up whenever the tab comes back
  useEffect(() => {
    const back = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [load])

  async function pin(raw) {
    const url = (raw ?? draft).trim()
    if (!url || pinning) return
    setErr('')
    setPinning(url)
    setDraft('')
    try {
      const res = await fetch('/api/unfurl', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url })
      })
      const meta = await res.json()
      if (!res.ok) throw new Error(meta.error || 'Could not read that link.')

      const { data, error } = await supabase
        .from('links')
        .insert({
          url: meta.url,
          title: meta.title,
          description: meta.description,
          site_name: meta.site_name,
          image_url: meta.image_url,
          favicon_url: meta.favicon_url,
          created_by: me.id
        })
        .select()
        .single()
      if (error) throw error

      setLinks(prev => (prev.some(x => x.id === data.id) ? prev : [data, ...prev]))
      say('Pinned')
    } catch (e) {
      setErr(e.message || 'Could not pin that.')
      setDraft(url)
    } finally {
      setPinning(null)
    }
  }

  async function removeLink(link) {
    // clear the attached voice notes and screenshots out of storage first —
    // the rows cascade on their own, the files would not
    const { data: media } = await supabase
      .from('notes').select('media_path').eq('link_id', link.id).not('media_path', 'is', null)
    const paths = (media || []).map(m => m.media_path).filter(Boolean)
    if (paths.length) await supabase.storage.from('wall').remove(paths)

    const { error } = await supabase.from('links').delete().eq('id', link.id)
    if (error) return say(error.message)

    setLinks(prev => prev.filter(x => x.id !== link.id))
    if (openId === link.id) setOpenId(null)
    say('Taken down')
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return links
    return links.filter(l => {
      const who = people[l.created_by]
      return [l.title, l.description, l.url, l.site_name, who?.full_name, who?.email]
        .filter(Boolean).some(s => s.toLowerCase().includes(needle))
    })
  }, [links, q, people])

  const open = links.find(l => l.id === openId) || null

  return (
    <>
      <Chrome me={me} />

      <div className="page">
        <div className="pastebar">
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') pin() }}
            onPaste={e => {
              // a pasted link into an empty box goes straight up
              const text = e.clipboardData.getData('text')?.trim()
              if (text && !draft && /^(https?:\/\/|www\.)\S+$/i.test(text)) {
                e.preventDefault()
                pin(text)
              }
            }}
            placeholder="Paste a link…"
            spellCheck={false}
            disabled={!!pinning}
          />
          <button className="btn" onClick={() => pin()} disabled={!draft.trim() || !!pinning}>
            {pinning ? 'Reading…' : 'Pin it'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Filter the wall"
            style={{ maxWidth: 260, fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.08em', padding: '7px 10px' }}
          />
          <span className="mono">
            {shown.length} {shown.length === 1 ? 'card' : 'cards'}
            {q.trim() && ` of ${links.length}`}
          </span>
        </div>

        {err && <div className="err" style={{ marginTop: 16 }}>{err}</div>}

        <div className="grid">
          {pinning && (
            <div className="box developing">
              <div className="shot"><span className="pulse">Developing</span></div>
              <div className="box-body">
                <div className="mono" style={{ wordBreak: 'break-all' }}>{pinning}</div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="empty"><span className="pulse">Loading</span></div>
          ) : shown.length === 0 && !pinning ? (
            <div className="empty">
              <div className="glyph">Bare</div>
              <div className="hint" style={{ marginTop: 12 }}>
                {q.trim() ? 'Nothing matches that.' : 'Nothing pinned yet. Paste a link above.'}
              </div>
            </div>
          ) : (
            shown.map(l => (
              <LinkBox
                key={l.id}
                link={l}
                who={people[l.created_by]}
                count={counts[l.id]}
                mine={l.created_by === me.id}
                admin={admin}
                onOpen={() => setOpenId(l.id)}
                onRemove={() => removeLink(l)}
              />
            ))
          )}
        </div>
      </div>

      {open && (
        <LinkDrawer
          link={open}
          me={me}
          people={people}
          admin={admin}
          onClose={() => setOpenId(null)}
          onRemove={() => removeLink(open)}
          onCount={c => setCounts(prev => ({ ...prev, [open.id]: c }))}
          say={say}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}

function tally(rows) {
  const out = {}
  for (const r of rows) {
    const c = out[r.link_id] || (out[r.link_id] = { text: 0, voice: 0, shot: 0 })
    if (c[r.kind] !== undefined) c[r.kind] += 1
  }
  return out
}
