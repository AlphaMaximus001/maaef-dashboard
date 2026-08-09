'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { LEVELS, lbl, officeName, pathStrIn } from '@/lib/directory'
import { runSearch } from '@/lib/search'
import TopBar from './TopBar'

const KINDS = [
  ['all', 'Everything'],
  ['people', 'People'],
  ['posts', 'Positions'],
  ['offices', 'Offices']
]

export default function SearchApp({ role, email, initialQ }) {
  const supabase = useMemo(() => createClient(), [])
  const [db, setDb] = useState({ offices: [], posts: [], employees: [] })
  const [q, setQ] = useState(initialQ || '')
  const [kind, setKind] = useState('all')
  const [scope, setScope] = useState('')
  const [vacantOnly, setVacantOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    let off = false
    ;(async () => {
      const [o, p, e] = await Promise.all([
        supabase.from('offices').select('*'),
        supabase.from('posts').select('*'),
        supabase.from('employees').select('*')
      ])
      if (off) return
      const bad = [o, p, e].find(r => r.error)
      setErr(bad ? bad.error.message : '')
      setDb({ offices: o.data || [], posts: p.data || [], employees: e.data || [] })
      setLoading(false)
    })()
    return () => { off = true }
  }, [supabase])

  // keep the address bar in step so a search can be bookmarked or passed on
  useEffect(() => {
    const u = new URL(window.location.href)
    if (q) u.searchParams.set('q', q); else u.searchParams.delete('q')
    window.history.replaceState(null, '', u)
  }, [q])

  const officeMap = useMemo(() => Object.fromEntries(db.offices.map(o => [o.id, o])), [db.offices])
  const pathStr = useCallback(id => pathStrIn(officeMap, id), [officeMap])

  const officeChoices = useMemo(
    () => db.offices.slice().sort((a, b) => pathStr(a.id).localeCompare(pathStr(b.id))),
    [db.offices, pathStr]
  )

  const found = useMemo(
    () => runSearch(db, { q, scope, vacantOnly }), [db, q, scope, vacantOnly])

  const show = k => kind === 'all' || kind === k
  const total = found ? found.peopleCount + found.posts.length + found.offices.length : 0

  return (
    <>
      <TopBar role={role} email={email} />
      <div className="wide-page">
        <h1 className="title" style={{ marginBottom: 4 }}>Search</h1>
        <div className="hint" style={{ marginBottom: 16 }}>
          Looks through names, positions, both kinds of phone number, office names and notes at once.
          Phone numbers match on digits alone, so spaces and dashes make no difference.
        </div>

        <input className="sr-q" value={q} onChange={e => setQ(e.target.value)} autoFocus
          placeholder="A name, a position, a phone number, an office…" />

        <div className="sr-filters">
          <select value={kind} onChange={e => setKind(e.target.value)}>
            {KINDS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={scope} onChange={e => setScope(e.target.value)}>
            <option value="">Anywhere</option>
            {officeChoices.map(o => <option key={o.id} value={o.id}>{pathStr(o.id)}</option>)}
          </select>
          {show('posts') && (
            <label className="sr-chk">
              <input type="checkbox" checked={vacantOnly} onChange={e => setVacantOnly(e.target.checked)} />
              Vacant positions only
            </label>
          )}
        </div>

        {err && <div className="warn">{err}</div>}

        {loading ? <div className="hint">Loading…</div>
          : !found ? (
            <div className="blank">
              <p>Type at least two characters.</p>
              <div className="sub">
                Try a surname, a post like “Executive Engineer”, or any part of a phone number.
              </div>
            </div>
          ) : total === 0 ? (
            <div className="blank">
              <p>Nothing matches “{q}”.</p>
              <div className="sub">
                {scope ? 'No match inside that office — try setting the location back to Anywhere.'
                  : 'Check the spelling, or try a shorter fragment.'}
              </div>
            </div>
          ) : (
            <>
              <div className="sr-count">
                {found.peopleCount} {found.peopleCount === 1 ? 'person' : 'people'} ·{' '}
                {found.posts.length} position{found.posts.length === 1 ? '' : 's'} ·{' '}
                {found.offices.length} office{found.offices.length === 1 ? '' : 's'}
                {scope && <> · inside <b>{officeName(officeMap[scope])}</b></>}
              </div>

              {show('people') && found.people.length > 0 && (
                <section className="sr-sec">
                  <h2 className="sr-h">People</h2>
                  {found.people.map(g => (
                    <div className="sr-grp" key={g.key}>
                      {g.rows.length > 1 && (
                        <div className="sr-dup">{g.rows.length} people named {g.name}</div>
                      )}
                      {g.rows.map(({ e, post, why }) => (
                        <div className="sr-row" key={e.id}>
                          <div className="sr-main">
                            <div className="sr-t">{lbl(e.name, 'Unnamed person')}</div>
                            <div className="sr-sub">
                              {post
                                ? <>{lbl(post.title, 'Untitled post')} <span className="sr-at">at</span> {pathStr(post.office_id)}</>
                                : <span className="sr-bench">On bench — holds no post</span>}
                            </div>
                            <div className="sr-nums">
                              <span>personal <b>{lbl(e.phone, '—')}</b></span>
                              {post && <span>office <b>{lbl(post.phone, '—')}</b></span>}
                            </div>
                          </div>
                          <div className="sr-side">
                            <div className="sr-why">{why.map(w => <span key={w.label}>{w.label}</span>)}</div>
                            {post && <Link className="btn gh sm" href={'/dashboard?office=' + post.office_id}>Open office</Link>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </section>
              )}

              {show('posts') && found.posts.length > 0 && (
                <section className="sr-sec">
                  <h2 className="sr-h">Positions</h2>
                  {found.posts.map(({ p, occ, why }) => (
                    <div className="sr-row" key={p.id}>
                      <div className="sr-main">
                        <div className="sr-t">{lbl(p.title, 'Untitled post')}</div>
                        <div className="sr-sub">{pathStr(p.office_id)}</div>
                        <div className="sr-nums">
                          <span>office <b>{lbl(p.phone, '—')}</b></span>
                          {occ.length === 0
                            ? <span className="sr-vac">Vacant</span>
                            : <span>held by <b>{occ.map(e => lbl(e.name, 'Unnamed')).join(', ')}</b></span>}
                        </div>
                      </div>
                      <div className="sr-side">
                        <div className="sr-why">{why.map(w => <span key={w.label}>{w.label}</span>)}</div>
                        <Link className="btn gh sm" href={'/dashboard?office=' + p.office_id}>Open office</Link>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {show('offices') && found.offices.length > 0 && (
                <section className="sr-sec">
                  <h2 className="sr-h">Offices</h2>
                  {found.offices.map(({ o, why }) => (
                    <div className="sr-row" key={o.id}>
                      <div className="sr-main">
                        <div className="sr-t">
                          <span className="lvl" style={{ background: LEVELS[o.type].color, marginRight: 7 }}>
                            {LEVELS[o.type].abbr}
                          </span>
                          {officeName(o)}
                        </div>
                        <div className="sr-sub">{pathStr(o.id)}</div>
                      </div>
                      <div className="sr-side">
                        <div className="sr-why">{why.map(w => <span key={w.label}>{w.label}</span>)}</div>
                        <Link className="btn gh sm" href={'/dashboard?office=' + o.id}>Open office</Link>
                      </div>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
      </div>
    </>
  )
}
