'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import TopBar from './TopBar'

const LEVELS = {
  head:        { next: 'zone',        label: 'Head Office',        abbr: 'HO',     color: '#8B0000' },
  zone:        { next: 'circle',      label: 'Zone',               abbr: 'ZONE',   color: '#2E5D62' },
  circle:      { next: 'district',    label: 'Circle',             abbr: 'CIRCLE', color: '#4A7A6E' },
  district:    { next: 'subdistrict', label: 'District',           abbr: 'DIST',   color: '#7C7A4A' },
  subdistrict: { next: null,          label: 'Sub-district office', abbr: 'SUB',   color: '#9A8B6B' }
}
const DESIGS = ['Engineer-in-Chief', 'Chief Engineer', 'Superintending Engineer', 'Executive Engineer',
  'Assistant Engineer', 'Assistant Engineer (E&M)', 'Junior Engineer', 'Junior Engineer (E&M)',
  'Electrical & Mechanical Supervisor', 'Head Clerk', 'Accountant', 'Stenographer', 'Computer Operator',
  'Tubewell Operator', 'Beldar', 'Driver', 'Jiledar', 'Sinchpal', 'Sinch Paryavekshak']
const SWATCH = ['#2E5D62', '#4A4A8A', '#7C7A4A', '#8B0000', '#9A6B14', '#4A7A6E', '#6B4A6B', '#3A5A8A']

const lbl = (s, f) => (String(s == null ? '' : s).trim() || f)
const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
const today = () => new Date().toISOString().slice(0, 10)
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmt = d => { if (!d) return '—'; const p = String(d).slice(0, 10).split('-'); return `${+p[2]} ${MON[+p[1] - 1]} ${p[0]}` }

export default function DirectoryApp({ mode, role, email }) {
  const supabase = useMemo(() => createClient(), [])
  const editor = mode === 'entry' && (role === 'admin' || role === 'superadmin')

  const [db, setDb] = useState({ offices: [], wings: [], posts: [], employees: [], postings: [] })
  const [sel, setSel] = useState(null)
  const [open, setOpen] = useState({})
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const say = m => { setToast(m); setTimeout(() => setToast(''), 2600) }

  const load = useCallback(async () => {
    const [o, w, p, e, h] = await Promise.all([
      supabase.from('offices').select('*'),
      supabase.from('wings').select('*').order('sort_order'),
      supabase.from('posts').select('*'),
      supabase.from('employees').select('*'),
      supabase.from('postings').select('*').order('from_date', { ascending: true })
    ])
    const firstErr = [o, w, p, e, h].find(r => r.error)
    if (firstErr) setErr(firstErr.error.message); else setErr('')
    setDb({
      offices: o.data || [], wings: w.data || [], posts: p.data || [],
      employees: e.data || [], postings: h.data || []
    })
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // ---------- derived ----------
  const officeMap = useMemo(() => Object.fromEntries(db.offices.map(o => [o.id, o])), [db.offices])
  const wingMap = useMemo(() => Object.fromEntries(db.wings.map(w => [w.id, w])), [db.wings])
  const worder = id => { const i = db.wings.findIndex(w => w.id === id); return i < 0 ? 999 : i }

  // A scoped viewer may not be able to see the true root, so anything whose
  // parent is invisible counts as a root for them.
  const roots = useMemo(
    () => db.offices.filter(o => !o.parent_id || !officeMap[o.parent_id])
      .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [db.offices, officeMap]
  )
  const kidsOf = id => db.offices.filter(o => o.parent_id === id)
    .sort((a, b) => (worder(a.wing_id) - worder(b.wing_id)) || String(a.name).localeCompare(String(b.name)))
  const postsOf = id => db.posts.filter(p => p.office_id === id)
    .sort((a, b) => String(a.title).localeCompare(String(b.title)))
  const occOf = pid => db.employees.filter(e => e.post_id === pid)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
  const benched = () => db.employees.filter(e => !e.post_id)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
  const historyOf = id => db.postings.filter(h => h.employee_id === id)
  const openTerm = id => historyOf(id).find(h => !h.to_date)

  const pathOf = id => { const out = []; let c = officeMap[id]; while (c) { out.unshift(c); c = c.parent_id ? officeMap[c.parent_id] : null } return out }
  const pathStr = id => pathOf(id).map(o => lbl(o.name, 'Untitled ' + LEVELS[o.type].label.toLowerCase())).join(' › ')
  const descendants = id => { let out = []; kidsOf(id).forEach(k => { out.push(k.id); out = out.concat(descendants(k.id)) }); return out }
  const rollup = id => {
    const ids = [id].concat(descendants(id)); let posts = 0, vac = 0
    ids.forEach(i => postsOf(i).forEach(p => { posts++; if (!occOf(p.id).length) vac++ }))
    return { posts, vac, filled: posts - vac }
  }

  useEffect(() => {
    if (!loading && !sel && roots.length) { setSel(roots[0].id); setOpen(o => ({ ...o, [roots[0].id]: true })) }
  }, [loading, sel, roots])

  // ---------- writes ----------
  const guard = async fn => { try { await fn(); await load() } catch (e) { say(e.message || 'That did not save') } }
  const die = r => { if (r.error) throw r.error; return r.data }

  const closeOpenTerm = async (empId, date) => {
    const t = openTerm(empId)
    if (t) die(await supabase.from('postings').update({ to_date: date }).eq('id', t.id))
  }
  const conflictOn = (postId, empId, desig) => {
    if (!norm(desig)) return null
    return occOf(postId).find(e => e.id !== empId && norm(e.designation) === norm(desig)) || null
  }
  const assign = async (empId, postId, date) => {
    const emp = db.employees.find(e => e.id === empId)
    const post = db.posts.find(p => p.id === postId)
    if (!emp || !post) return
    await closeOpenTerm(empId, date)
    die(await supabase.from('employees').update({ post_id: postId }).eq('id', empId))
    die(await supabase.from('postings').insert({
      employee_id: empId, post_id: postId,
      post_title: post.title, office_path: pathStr(post.office_id), from_date: date
    }))
  }
  const bench = async (empId, date) => {
    await closeOpenTerm(empId, date)
    die(await supabase.from('employees').update({ post_id: null }).eq('id', empId))
  }

  // ---------- search ----------
  const results = useMemo(() => {
    const s = norm(q); if (s.length < 2) return null
    const out = []
    db.employees.forEach(e => {
      if (norm(e.name).includes(s) || norm(e.designation).includes(s) || norm(e.phone).includes(s)) {
        const p = e.post_id ? db.posts.find(x => x.id === e.post_id) : null
        out.push({ t: lbl(e.name, 'Unnamed person'), s: lbl(e.designation, '—') + ' · ' + (p ? lbl(p.title, 'Untitled post') : 'Bench'), go: 'emp', id: e.id })
      }
    })
    db.posts.forEach(p => {
      if (norm(p.title).includes(s) || norm(p.phone).includes(s))
        out.push({ t: lbl(p.title, 'Untitled post'), s: 'Post · ' + pathStr(p.office_id), go: 'office', id: p.office_id })
    })
    db.offices.forEach(o => {
      if (norm(o.name).includes(s)) out.push({ t: lbl(o.name, 'Untitled office'), s: LEVELS[o.type].label, go: 'office', id: o.id })
    })
    return out.slice(0, 24)
  }, [q, db]) // eslint-disable-line react-hooks/exhaustive-deps

  const goOffice = id => { pathOf(id).forEach(o => setOpen(v => ({ ...v, [o.id]: true }))); setSel(id); setQ('') }

  // ---------- render helpers ----------
  const WingChip = ({ id, style }) => {
    const w = wingMap[id]; if (!w) return null
    return <span className="wg" style={{ background: w.color, ...(style || {}) }}>{w.label}</span>
  }

  const TreeNode = ({ id, depth }) => {
    const o = officeMap[id]; if (!o) return null
    const kids = kidsOf(id)
    const isOpen = open[id] === undefined ? depth === 0 : open[id]
    const r = rollup(id)
    const L = LEVELS[o.type]
    return (
      <div className="node">
        <div className={'row' + (sel === id ? ' on' : '')} onClick={() => setSel(id)}
          tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setSel(id) }}>
          <button className={'tw' + (kids.length ? '' : ' hide')}
            onClick={e => { e.stopPropagation(); setOpen(v => ({ ...v, [id]: !isOpen })) }}>
            {kids.length ? (isOpen ? '▾' : '▸') : ''}
          </button>
          <span className="lvl" style={{ background: L.color }}>{L.abbr}</span>
          <span className="nm">{lbl(o.name, 'Untitled ' + L.label.toLowerCase())}</span>
          <WingChip id={o.wing_id} />
          {r.posts > 0 && <span className={'tag' + (r.vac ? ' v' : '')}>{r.filled}/{r.posts}</span>}
        </div>
        {kids.length > 0 && isOpen && (
          <div className="kids">{kids.map(k => <TreeNode key={k.id} id={k.id} depth={depth + 1} />)}</div>
        )}
      </div>
    )
  }

  const PostCard = ({ p }) => {
    const occ = occOf(p.id)
    const vac = occ.length === 0
    return (
      <div className={'post' + (vac ? ' vac' : '')}>
        {editor && (
          <div className="post-a">
            <button className="icb" title="Edit post" onClick={() => setModal({ kind: 'post', officeId: p.office_id, existing: p })}>✎</button>
            <button className="icb" title="Delete post" onClick={() => setModal({ kind: 'delPost', id: p.id })}>✕</button>
          </div>
        )}
        <h3 className="post-t">{lbl(p.title, 'Untitled post')}</h3>
        <div className={'post-ph' + (p.phone ? '' : ' none')}>
          {p.phone ? '☎ ' + p.phone : 'no official number on record'}
        </div>
        {p.notes && <div className="post-n">{p.notes}</div>}

        {vac ? (
          <div className="empty-w">
            <div className="stamp">Vacant</div>
            {editor && <div><button className="btn sm" onClick={() => setModal({ kind: 'pick', postId: p.id })}>Post someone here</button></div>}
          </div>
        ) : (
          <>
            <div className="occ">
              {occ.map(e => {
                const t = openTerm(e.id)
                return (
                  <div className="occ-i" key={e.id}>
                    <div className="who">
                      <b>{lbl(e.name, 'Unnamed person')}</b>
                      <i>{lbl(e.designation, 'designation not set')}{t ? ' · since ' + fmt(t.from_date) : ''}</i>
                    </div>
                    <div className="num">{e.phone || '—'}</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="icb" title="Open record" onClick={() => setModal({ kind: 'record', empId: e.id })}>◉</button>
                      {editor && <button className="icb" title="Transfer" onClick={() => setModal({ kind: 'move', empId: e.id })}>⇄</button>}
                      {editor && <button className="icb" title="Move to bench"
                        onClick={() => guard(async () => { await bench(e.id, today()); say(lbl(e.name, 'Person') + ' moved to bench') })}>⌫</button>}
                    </div>
                  </div>
                )
              })}
            </div>
            {editor && (
              <div style={{ marginTop: 8 }}>
                <button className="btn gh sm" onClick={() => setModal({ kind: 'pick', postId: p.id })}>+ Attach another person</button>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ---------- main panel ----------
  const OfficePanel = () => {
    const o = officeMap[sel]
    if (!o) return (
      <div className="blank">
        <p>Nothing selected.</p>
        <div className="sub">Pick an office from the list on the left.</div>
      </div>
    )
    const L = LEVELS[o.type]
    const posts = postsOf(sel)
    const kids = kidsOf(sel)
    const r = rollup(sel)
    const path = pathOf(sel)
    const groups = db.wings.map(w => w.id).concat([null])

    return (
      <>
        <div className="crumb">
          {path.map((p, i) => (
            <span key={p.id}>{i ? ' › ' : ''}{i === path.length - 1
              ? <b>{lbl(p.name, 'Untitled ' + LEVELS[p.type].label.toLowerCase())}</b>
              : lbl(p.name, 'Untitled ' + LEVELS[p.type].label.toLowerCase())}</span>
          ))}
        </div>

        <div className="head">
          <div>
            <h1 className="title">
              {lbl(o.name, 'Untitled ' + L.label.toLowerCase())}
              <WingChip id={o.wing_id} style={{ verticalAlign: 9, marginLeft: 9 }} />
            </h1>
            <div className="eyebrow" style={{ marginTop: 5 }}>
              {L.label}{kids.length ? ` · ${kids.length} ${LEVELS[L.next].label.toLowerCase()}${kids.length > 1 ? 's' : ''}` : ''}
            </div>
          </div>
          <div className="stats">
            <div><b>{posts.length}</b>posts here</div>
            <div className="v"><b>{posts.filter(p => !occOf(p.id).length).length}</b>vacant here</div>
            <div><b>{r.filled}/{r.posts}</b>filled incl. below</div>
          </div>
        </div>

        {editor && (
          <div className="actions">
            {L.next && <button className="btn" onClick={() => setModal({ kind: 'office', parentId: sel })}>+ {LEVELS[L.next].label}</button>}
            <button className="btn gh" onClick={() => setModal({ kind: 'post', officeId: sel })}>+ Department card</button>
            <button className="btn gh" onClick={() => setModal({ kind: 'office', existing: o })}>
              {role === 'superadmin' ? 'Rename / set wing' : 'Set wing'}
            </button>
            {role === 'superadmin' && o.type !== 'head' &&
              <button className="btn gh dg" onClick={() => setModal({ kind: 'delOffice', id: sel })}>Delete office</button>}
          </div>
        )}

        {posts.length === 0 ? (
          <div className="blank">
            <p>No department cards at this office.</p>
            <div className="sub">
              {editor
                ? 'Add as many as this office has — Executive Engineer, Steno, Accountant, and so on. Each card keeps its own official number, and people attach to it. Nothing is compulsory.'
                : 'Nothing has been recorded here yet.'}
            </div>
            {editor && <div className="row2"><button className="btn" onClick={() => setModal({ kind: 'post', officeId: sel })}>Add the first post</button></div>}
          </div>
        ) : (
          <div className="grid">{posts.map(p => <PostCard key={p.id} p={p} />)}</div>
        )}

        {kids.length > 0 && (
          <div className="subs">
            <div className="subs-h">{LEVELS[L.next].label}s under this office</div>
            {groups.map(g => {
              const set = kids.filter(k => (k.wing_id || null) === g)
              if (!set.length) return null
              const w = g ? wingMap[g] : null
              return (
                <div className="wgrp" key={g || 'none'}>
                  {w
                    ? <div className="wgrp-h" style={{ borderLeftColor: w.color, color: w.color }}>{w.label} branch</div>
                    : (kids.some(k => k.wing_id) ? <div className="wgrp-h">Wing not set</div> : null)}
                  <div className="wgrp-l">
                    {set.map(k => {
                      const rr = rollup(k.id)
                      return (
                        <button className="subrow" key={k.id} onClick={() => goOffice(k.id)}>
                          <span className="nm">{lbl(k.name, 'Untitled ' + LEVELS[k.type].label.toLowerCase())}</span>
                          <span className={'tag' + (rr.vac ? ' v' : '')}>{rr.filled}/{rr.posts} filled</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </>
    )
  }

  // ---------- shell ----------
  return (
    <>
      <TopBar role={role} email={email}>
        <div className="searchwrap">
          <input className="search" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search people, posts, offices" autoComplete="off" />
          {results && (
            <div className="results">
              {results.length === 0
                ? <div className="res" style={{ color: 'var(--ink3)' }}>Nothing matches that.</div>
                : results.map((r, i) => (
                  <button className="res" key={i}
                    onClick={() => r.go === 'emp' ? (setModal({ kind: 'record', empId: r.id }), setQ('')) : goOffice(r.id)}>
                    <b>{r.t}</b><i>{r.s}</i>
                  </button>
                ))}
            </div>
          )}
        </div>
      </TopBar>

      <div className="shell">
        <aside className="side">
          <div className="side-h">
            <span className="eyebrow">Office hierarchy</span>
            {editor && roots.length > 0 &&
              <button className="btn gh sm" onClick={() => setModal({ kind: 'office', parentId: roots[0].id })}>+ Zone</button>}
          </div>
          <div className="tree">
            {loading ? <div className="hint" style={{ padding: '6px 4px' }}>Loading…</div>
              : roots.length === 0
                ? <div className="hint" style={{ padding: '6px 4px' }}>
                  No offices are visible to you yet. Ask a superadmin to grant you a zone, circle or district.
                </div>
                : roots.map(r => <TreeNode key={r.id} id={r.id} depth={0} />)}
          </div>

          <div className="bench">
            <div className="bench-h">
              <span className="eyebrow">Benched {benched().length ? `(${benched().length})` : ''}</span>
              {editor && <button className="btn gh sm" onClick={() => setModal({ kind: 'emp' })}>+ Person</button>}
            </div>
            <div className="bench-l">
              {benched().length === 0
                ? <div style={{ fontSize: 12.5, color: 'var(--ink3)', padding: '2px 3px 8px' }}>
                  {editor ? 'Nobody is off-post. People removed from a post land here.' : 'Nobody off-post.'}
                </div>
                : benched().map(e => (
                  <button className="bchip" key={e.id} onClick={() => setModal({ kind: 'record', empId: e.id })}>
                    <span className="n">{lbl(e.name, 'Unnamed person')}</span>
                    <span className="d">{lbl(e.designation, '—')}</span>
                  </button>
                ))}
            </div>
          </div>

          {editor && (
            <div style={{ padding: '9px 14px', borderTop: '1px solid var(--cover2)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn gh sm" onClick={() => setModal({ kind: 'import' })}>Import backup</button>
            </div>
          )}
        </aside>

        <main className="main">
          {err && <div className="warn">{err}</div>}
          <OfficePanel />
        </main>
      </div>

      {modal && <Dialogs
        modal={modal} setModal={setModal} db={db} supabase={supabase} role={role}
        helpers={{ officeMap, wingMap, kidsOf, postsOf, occOf, historyOf, openTerm, pathOf, pathStr, descendants, assign, bench, conflictOn, guard, die, say, load, roots, setSel }}
      />}
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}

/* ============================================================
   Dialogs
   ============================================================ */
function Dialogs({ modal, setModal, db, supabase, role, helpers }) {
  const { officeMap, wingMap, kidsOf, postsOf, occOf, historyOf, openTerm, pathOf, pathStr,
    descendants, assign, bench, conflictOn, guard, die, say, load, roots, setSel } = helpers
  const shut = () => setModal(null)

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') shut() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const Sheet = ({ title, children, footer, wide }) => (
    <div className="veil" onClick={e => { if (e.target.classList.contains('veil')) shut() }}>
      <div className={'sheet' + (wide ? ' wide' : '')}>
        <div className="sheet-h"><h3>{title}</h3><button className="icb" onClick={shut}>✕</button></div>
        <div className="sheet-b">{children}</div>
        <div className="sheet-f">{footer}</div>
      </div>
    </div>
  )

  // ---------- office ----------
  if (modal.kind === 'office') {
    return <OfficeDialog {...{ modal, shut, db, supabase, role, Sheet, pathStr, officeMap, guard, die, say, setSel }} />
  }

  if (modal.kind === 'delOffice') {
    const id = modal.id
    const all = [id].concat(descendants(id))
    let np = 0, ne = 0
    all.forEach(i => postsOf(i).forEach(p => { np++; ne += occOf(p.id).length }))
    return (
      <Sheet title="Delete this office?"
        footer={<>
          <button className="btn gh" onClick={shut}>Cancel</button>
          <button className="btn" style={{ background: 'var(--seal)', borderColor: 'var(--seal)' }}
            onClick={() => guard(async () => {
              for (const i of all) for (const p of postsOf(i)) for (const e of occOf(p.id)) await bench(e.id, new Date().toISOString().slice(0, 10))
              die(await supabase.from('offices').delete().eq('id', id))
              setSel(roots.length ? roots[0].id : null); shut(); say('Office deleted')
            })}>Delete</button>
        </>}>
        <div className="warn">
          This removes <b>{lbl(officeMap[id]?.name, 'this office')}</b>, {all.length - 1} office(s) below it, and {np} department card(s).
        </div>
        <div style={{ fontSize: 13.5 }}>
          {ne} people on those posts move to the bench. Their posting history is kept.
        </div>
      </Sheet>
    )
  }

  // ---------- post ----------
  if (modal.kind === 'post') {
    return <PostDialog {...{ modal, shut, supabase, Sheet, pathStr, guard, die, say }} />
  }

  if (modal.kind === 'delPost') {
    const p = db.posts.find(x => x.id === modal.id)
    const occ = occOf(modal.id)
    return (
      <Sheet title="Delete this department card?"
        footer={<>
          <button className="btn gh" onClick={shut}>Cancel</button>
          <button className="btn" style={{ background: 'var(--seal)', borderColor: 'var(--seal)' }}
            onClick={() => guard(async () => {
              for (const e of occ) await bench(e.id, new Date().toISOString().slice(0, 10))
              die(await supabase.from('posts').delete().eq('id', modal.id))
              shut(); say('Card deleted')
            })}>Delete</button>
        </>}>
        <div className="warn">{lbl(p?.title, 'Untitled post')}</div>
        <div style={{ fontSize: 13.5 }}>
          {occ.length
            ? `${occ.length} person(s) on this post move to the bench. Their history keeps this post by name.`
            : 'This post is vacant.'}
        </div>
      </Sheet>
    )
  }

  // ---------- employee ----------
  if (modal.kind === 'emp') {
    return <EmpDialog {...{ modal, shut, supabase, Sheet, assign, guard, die, say }} />
  }

  if (modal.kind === 'move' || modal.kind === 'pick') {
    return <MoveDialog {...{ modal, shut, db, Sheet, postsOf, occOf, pathStr, officeMap, assign, bench, conflictOn, guard, say, setModal }} />
  }

  // ---------- record ----------
  if (modal.kind === 'record') {
    const e = db.employees.find(x => x.id === modal.empId)
    if (!e) { shut(); return null }
    const hist = historyOf(e.id).slice().reverse()
    const cur = e.post_id ? db.posts.find(p => p.id === e.post_id) : null
    const editor = role === 'admin' || role === 'superadmin'
    return (
      <Sheet wide title={lbl(e.name, 'Unnamed person')}
        footer={<>
          <button className="btn gh" onClick={shut}>Close</button>
          {role === 'superadmin' && <button className="btn gh dg" onClick={() => guard(async () => {
            die(await supabase.from('employees').delete().eq('id', e.id)); shut(); say('Employee card deleted')
          })}>Delete</button>}
          {editor && <button className="btn gh" onClick={() => setModal({ kind: 'emp', existing: e })}>Edit</button>}
          {editor && <button className="btn" onClick={() => setModal({ kind: 'move', empId: e.id })}>Transfer</button>}
        </>}>
        <dl className="kv">
          <dt>Designation</dt><dd>{lbl(e.designation, '—')}</dd>
          <dt>Personal no.</dt><dd className="mn">{lbl(e.phone, '—')}</dd>
          <dt>Current charge</dt>
          <dd>{cur
            ? <>{lbl(cur.title, 'Untitled post')}<div className="tag" style={{ color: 'var(--canal)' }}>{pathStr(cur.office_id)}</div></>
            : <span style={{ color: 'var(--vac)' }}>On bench — no post held</span>}</dd>
          {cur?.phone && <><dt>Office no.</dt><dd className="mn">{cur.phone}</dd></>}
        </dl>
        {e.notes && (
          <div style={{ fontStyle: 'italic', color: 'var(--ink2)', borderLeft: '2px solid var(--rule)', paddingLeft: 10, marginBottom: 16, whiteSpace: 'pre-wrap' }}>
            {e.notes}
          </div>
        )}
        <div className="rec-h">Service record — postings</div>
        {hist.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--ink3)' }}>No postings recorded yet.</div>
          : <div className="lad">
            {hist.map(x => (
              <div className={'step' + (x.to_date ? '' : ' cur')} key={x.id}>
                <div className="dt">{fmt(x.from_date)} → {x.to_date ? fmt(x.to_date) : 'present'}</div>
                <div className="pt">{lbl(x.post_title, 'Untitled post')}{!x.to_date && <span className="cb">Current</span>}</div>
                <div className="of">{x.office_path}</div>
              </div>
            ))}
          </div>}
      </Sheet>
    )
  }

  // ---------- import ----------
  if (modal.kind === 'import') {
    return <ImportDialog {...{ shut, supabase, Sheet, db, guard, die, say }} />
  }

  return null
}

/* ---------- office dialog (with in-dropdown wing creation) ---------- */
function OfficeDialog({ modal, shut, db, supabase, role, Sheet, pathStr, officeMap, guard, die, say, setSel }) {
  const existing = modal.existing
  const parentId = modal.parentId
  const type = existing ? existing.type : LEVELS[officeMap[parentId].type].next
  const L = LEVELS[type]
  const nameLock = role !== 'superadmin'

  const [name, setName] = useState(existing ? existing.name || '' : '')
  const [wingId, setWingId] = useState(existing ? existing.wing_id || '' : (officeMap[parentId]?.wing_id || ''))
  const [adding, setAdding] = useState(false)
  const [wname, setWname] = useState('')
  const [colour, setColour] = useState(SWATCH[db.wings.length % SWATCH.length])

  const addWing = () => guard(async () => {
    const n = wname.trim(); if (!n) return
    if (db.wings.some(w => norm(w.label) === norm(n))) { say('A wing with that name already exists'); return }
    const rows = die(await supabase.from('wings')
      .insert({ label: n, color: colour, sort_order: db.wings.length + 1 }).select())
    setWingId(rows[0].id); setAdding(false); setWname(''); say(`Wing “${n}” added`)
  })

  const removeWing = () => guard(async () => {
    const used = db.offices.filter(o => o.wing_id === wingId).length
    if (!window.confirm(`Remove this wing? ${used} office(s) tagged with it become untagged.`)) return
    die(await supabase.from('wings').delete().eq('id', wingId))
    setWingId(''); say('Wing removed')
  })

  const save = () => guard(async () => {
    if (existing) {
      const patch = { wing_id: wingId || null }
      if (!nameLock) patch.name = name.trim()
      die(await supabase.from('offices').update(patch).eq('id', existing.id))
    } else {
      const rows = die(await supabase.from('offices')
        .insert({ name: name.trim(), type, parent_id: parentId, wing_id: wingId || null }).select())
      setSel(rows[0].id)
    }
    shut(); say('Saved')
  })

  return (
    <Sheet title={existing ? (nameLock ? 'Set wing' : 'Edit ' + L.label.toLowerCase()) : 'New ' + L.label.toLowerCase()}
      footer={<><button className="btn gh" onClick={shut}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      <div className="hint" style={{ marginTop: -2 }}>
        {existing ? pathStr(existing.id) : `Under ${pathStr(parentId)} · every field is optional`}
      </div>
      <div className="fld">
        <label>{L.label} name</label>
        <input value={name} disabled={!!existing && nameLock} onChange={e => setName(e.target.value)}
          placeholder="e.g. Tubewell Division, Lucknow" />
      </div>
      {existing && nameLock && <div className="hint" style={{ marginTop: -8 }}>Only a superadmin can rename an office.</div>}

      <div className="fld">
        <label>Wing</label>
        <select value={adding ? '__new' : wingId}
          onChange={e => { if (e.target.value === '__new') setAdding(true); else { setAdding(false); setWingId(e.target.value) } }}>
          <option value="">Not specified / combined</option>
          {db.wings.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
          <option value="__new">+  Add a new wing…</option>
        </select>
      </div>

      {adding && (
        <div className="wnew">
          <div className="fld" style={{ marginBottom: 9 }}>
            <label>New wing name</label>
            <input value={wname} onChange={e => setWname(e.target.value)} placeholder="e.g. Mechanical Store, Quality Control" />
          </div>
          <div className="swrow">
            {SWATCH.map(c => (
              <button key={c} className={'sw' + (c === colour ? ' on' : '')} style={{ background: c }}
                title={c} onClick={() => setColour(c)} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button className="btn sm" onClick={addWing}>Add wing</button>
            <button className="btn gh sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      {!adding && wingId && (
        <button className="btn gh sm" style={{ marginBottom: 12 }} onClick={removeWing}>
          Remove “{db.wings.find(w => w.id === wingId)?.label}” from the wing list
        </button>
      )}

      <div className="hint">
        Tubewell divisions split into a Civil branch and an Electrical &amp; Mechanical branch.
        Add your own wings for anything else the department runs separately.
      </div>
    </Sheet>
  )
}

/* ---------- post dialog ---------- */
function PostDialog({ modal, shut, supabase, Sheet, pathStr, guard, die, say }) {
  const ex = modal.existing
  const [title, setTitle] = useState(ex?.title || '')
  const [phone, setPhone] = useState(ex?.phone || '')
  const [notes, setNotes] = useState(ex?.notes || '')

  const save = () => guard(async () => {
    const v = { title: title.trim(), phone: phone.trim(), notes: notes.trim() }
    if (ex) die(await supabase.from('posts').update(v).eq('id', ex.id))
    else die(await supabase.from('posts').insert({ ...v, office_id: modal.officeId }))
    shut(); say('Card saved')
  })

  return (
    <Sheet title={ex ? 'Edit department card' : 'New department card'}
      footer={<><button className="btn gh" onClick={shut}>Cancel</button><button className="btn" onClick={save}>Save card</button></>}>
      <div className="hint" style={{ marginTop: -2 }}>At {pathStr(modal.officeId)} · every field is optional</div>
      <div className="fld">
        <label>Post / position name</label>
        <input value={title} onChange={e => setTitle(e.target.value)} list="dl_desig"
          placeholder="e.g. Executive Engineer, Lucknow Division" />
      </div>
      <div className="fld">
        <label>Official phone number — stays with the post</label>
        <input className="mono" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0522-2620000 / 9450000000" />
      </div>
      <div className="fld">
        <label>Notes on this post</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Jurisdiction, office address, charge held, anything worth remembering" />
      </div>
      <datalist id="dl_desig">{DESIGS.map(d => <option key={d} value={d} />)}</datalist>
    </Sheet>
  )
}

/* ---------- employee dialog ---------- */
function EmpDialog({ modal, shut, supabase, Sheet, assign, guard, die, say }) {
  const ex = modal.existing
  const [name, setName] = useState(ex?.name || '')
  const [desig, setDesig] = useState(ex?.designation || '')
  const [phone, setPhone] = useState(ex?.phone || '')
  const [notes, setNotes] = useState(ex?.notes || '')

  const save = () => guard(async () => {
    const v = { name: name.trim(), designation: desig.trim(), phone: phone.trim(), notes: notes.trim() }
    if (ex) die(await supabase.from('employees').update(v).eq('id', ex.id))
    else {
      const rows = die(await supabase.from('employees').insert(v).select())
      if (modal.presetPost) await assign(rows[0].id, modal.presetPost, new Date().toISOString().slice(0, 10))
    }
    shut(); say('Saved')
  })

  return (
    <Sheet title={ex ? 'Edit person' : 'New employee card'}
      footer={<><button className="btn gh" onClick={shut}>Cancel</button><button className="btn" onClick={save}>Save person</button></>}>
      <div className="two">
        <div className="fld"><label>Full name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ram Kumar Verma" /></div>
        <div className="fld"><label>Designation</label>
          <input value={desig} onChange={e => setDesig(e.target.value)} list="dl_desig2" placeholder="Executive Engineer" /></div>
      </div>
      <div className="fld"><label>Personal contact number</label>
        <input className="mono" value={phone} onChange={e => setPhone(e.target.value)} placeholder="98765 43210" /></div>
      <div className="fld"><label>Notes on this person</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Cadre, batch, WhatsApp, who introduced you, anything worth remembering" /></div>
      <div className="hint">
        Every field is optional. Leave designation blank and the one-per-designation rule won&apos;t apply to this person.
        {!ex && ' New people start on the bench unless you post them straight away.'}
      </div>
      <datalist id="dl_desig2">{DESIGS.map(d => <option key={d} value={d} />)}</datalist>
    </Sheet>
  )
}

/* ---------- transfer / pick dialog ---------- */
function MoveDialog({ modal, shut, db, Sheet, postsOf, occOf, pathStr, officeMap, assign, bench, conflictOn, guard, say, setModal }) {
  const picking = modal.kind === 'pick'
  const emp0 = picking ? null : db.employees.find(e => e.id === modal.empId)
  const fixedPost = picking ? modal.postId : null

  const offices = db.offices.slice().sort((a, b) => pathStr(a.id).localeCompare(pathStr(b.id)))
  const startOffice = fixedPost
    ? db.posts.find(p => p.id === fixedPost)?.office_id
    : (emp0?.post_id ? db.posts.find(p => p.id === emp0.post_id)?.office_id : offices[0]?.id)

  const pool = db.employees.slice().sort((a, b) =>
    (a.post_id ? 1 : 0) - (b.post_id ? 1 : 0) || String(a.name).localeCompare(String(b.name)))

  const [empId, setEmpId] = useState(picking ? (pool[0]?.id || '') : modal.empId)
  const [officeId, setOfficeId] = useState(startOffice || '')
  const [postId, setPostId] = useState(fixedPost || '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const emp = db.employees.find(e => e.id === empId)
  const options = postsOf(officeId)
  useEffect(() => {
    if (picking) return
    if (!options.find(p => p.id === postId)) setPostId(options[0]?.id || '')
  }, [officeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const clash = postId && emp ? conflictOn(postId, emp.id, emp.designation) : null

  const confirm = () => guard(async () => {
    if (!postId || !emp) return
    if (clash) { say('Blocked — same designation already on that card'); return }
    if (emp.post_id === postId) { say('Already on this post'); shut(); return }
    await assign(emp.id, postId, date)
    shut(); say('Posted')
  })

  if (picking && pool.length === 0) {
    return (
      <Sheet title="Post someone here"
        footer={<>
          <button className="btn gh" onClick={shut}>Cancel</button>
          <button className="btn" onClick={() => setModal({ kind: 'emp', presetPost: fixedPost })}>+ New person</button>
        </>}>
        <div className="hint">No employee cards exist yet.</div>
      </Sheet>
    )
  }

  return (
    <Sheet title={picking ? 'Post someone to this card' : `Post ${lbl(emp0?.name, 'this person')}`}
      footer={<>
        <button className="btn gh" onClick={shut}>Cancel</button>
        {picking && <button className="btn gh" onClick={() => setModal({ kind: 'emp', presetPost: fixedPost })}>+ New person</button>}
        {!picking && emp0?.post_id && (
          <button className="btn gh" onClick={() => guard(async () => {
            await bench(emp0.id, date); shut(); say(lbl(emp0.name, 'Person') + ' moved to bench')
          })}>Move to bench</button>
        )}
        <button className="btn" onClick={confirm} disabled={!postId || !!clash}>Confirm posting</button>
      </>}>

      {picking ? (
        <>
          <div className="hint" style={{ marginTop: -2 }}>{pathStr(officeId)}</div>
          <div className="fld">
            <label>Person</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)}>
              {pool.map(e => {
                const p = e.post_id ? db.posts.find(x => x.id === e.post_id) : null
                return <option key={e.id} value={e.id}>
                  {lbl(e.name, 'Unnamed')} — {lbl(e.designation, '—')} {p ? `(on ${lbl(p.title, 'untitled post')})` : '(bench)'}
                </option>
              })}
            </select>
          </div>
        </>
      ) : (
        <>
          <div className="hint" style={{ marginTop: -2 }}>
            {lbl(emp0?.designation, 'no designation')}
            {emp0?.post_id ? ` · currently ${lbl(db.posts.find(p => p.id === emp0.post_id)?.title, 'untitled post')}` : ' · on bench'}
          </div>
          <div className="fld">
            <label>Office</label>
            <select value={officeId} onChange={e => setOfficeId(e.target.value)}>
              {offices.map(o => <option key={o.id} value={o.id}>{pathStr(o.id)}</option>)}
            </select>
          </div>
          <div className="fld">
            <label>Department card</label>
            <select value={postId} onChange={e => setPostId(e.target.value)}>
              {options.length === 0 && <option value="">No department cards at this office</option>}
              {options.map(p => (
                <option key={p.id} value={p.id}>
                  {lbl(p.title, 'Untitled post')} ({occOf(p.id).length ? `${occOf(p.id).length} on post` : 'vacant'})
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div className="fld"><label>Effective date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>

      {clash && <div className="warn">Blocked: {lbl(clash.name, 'Somebody')} already holds this card as {emp?.designation}.</div>}
    </Sheet>
  )
}

/* ---------- import dialog ---------- */
function ImportDialog({ shut, supabase, Sheet, db, guard, die, say }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState('')

  const run = () => guard(async () => {
    setBusy(true); setLog('Reading…')
    let j
    try { j = JSON.parse(text) } catch { setBusy(false); setLog('That is not valid JSON.'); return }
    if (!j.offices) { setBusy(false); setLog('That file has no offices in it.'); return }

    // wings
    const wingMap = {}
    for (const w of (j.wings || [])) {
      const found = db.wings.find(x => x.label.toLowerCase() === String(w.label).toLowerCase())
      if (found) { wingMap[w.id] = found.id; continue }
      const rows = die(await supabase.from('wings').insert({ label: w.label, color: w.color || '#2E5D62' }).select())
      wingMap[w.id] = rows[0].id
    }

    // offices, level by level, reusing the existing head office
    const head = db.offices.find(o => o.type === 'head')
    const idMap = {}
    const src = Object.values(j.offices)
    const srcHead = src.find(o => o.type === 'head')
    if (srcHead && head) idMap[srcHead.id] = head.id
    setLog('Creating offices…')
    for (const type of ['zone', 'circle', 'district', 'subdistrict']) {
      for (const o of src.filter(x => x.type === type)) {
        const parent = idMap[o.parentId]
        if (!parent) continue
        const rows = die(await supabase.from('offices').insert({
          name: o.name || '', type, parent_id: parent, wing_id: wingMap[o.wing] || null
        }).select())
        idMap[o.id] = rows[0].id
      }
    }

    setLog('Creating department cards…')
    const postMap = {}
    for (const p of Object.values(j.posts || {})) {
      const office = idMap[p.officeId]; if (!office) continue
      const rows = die(await supabase.from('posts').insert({
        office_id: office, title: p.title || '', phone: p.phone || '', notes: p.notes || ''
      }).select())
      postMap[p.id] = rows[0].id
    }

    setLog('Creating people and history…')
    for (const e of Object.values(j.employees || {})) {
      const rows = die(await supabase.from('employees').insert({
        name: e.name || '', designation: e.designation || '', phone: e.phone || '',
        notes: e.notes || '', post_id: postMap[e.postId] || null
      }).select())
      const newId = rows[0].id
      for (const h of (e.history || [])) {
        die(await supabase.from('postings').insert({
          employee_id: newId, post_id: postMap[h.postId] || null,
          post_title: h.postTitle || '', office_path: h.office || '',
          from_date: h.from || new Date().toISOString().slice(0, 10), to_date: h.to || null
        }))
      }
    }

    setBusy(false); setLog('')
    shut(); say('Backup imported')
  })

  return (
    <Sheet wide title="Import a prototype backup"
      footer={<>
        <button className="btn gh" onClick={shut}>Cancel</button>
        <button className="btn" onClick={run} disabled={busy || !text.trim()}>{busy ? 'Importing…' : 'Import'}</button>
      </>}>
      <div className="hint" style={{ marginTop: -2 }}>
        Open the single-file prototype, press <b>Export backup</b>, then paste the contents of that .json file here.
        Existing data is kept — this adds to it, so only run it once.
      </div>
      <div className="fld">
        <label>Backup JSON</label>
        <textarea style={{ minHeight: 200, fontFamily: 'var(--mono)', fontSize: 12 }}
          value={text} onChange={e => setText(e.target.value)} placeholder='{ "offices": { … }, "posts": { … } }' />
      </div>
      {log && <div className="hint">{log}</div>}
    </Sheet>
  )
}
