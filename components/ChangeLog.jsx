'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import TopBar from './TopBar'

const PAGE = 100

const TABLES = {
  offices: 'Office',
  posts: 'Department card',
  employees: 'Person',
  postings: 'Posting record',
  wings: 'Wing',
  profiles: 'User',
  user_scopes: 'Access grant'
}
const ACTIONS = { insert: 'Created', update: 'Edited', delete: 'Deleted' }
const APILL = { insert: 'ad', update: '', delete: 'sa' }
// id never changes and created_at is noise in a diff
const HIDE = new Set(['id', 'created_at'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const stamp = s => {
  const d = new Date(s)
  const p = n => String(n).padStart(2, '0')
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`
}
const fieldName = k => k.replace(/_id$/, '').replace(/_/g, ' ')
const labelOf = d =>
  d ? (d.name || d.title || d.label || d.full_name || d.post_title || d.email || null) : null

const changedFields = (o, n) => {
  const keys = new Set([...Object.keys(o || {}), ...Object.keys(n || {})])
  const out = []
  keys.forEach(k => {
    if (HIDE.has(k)) return
    const a = o ? o[k] : undefined
    const b = n ? n[k] : undefined
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ k, a, b })
  })
  return out
}

/* A raw uuid tells a superadmin nothing, so swap in the name where we have it. */
function Val({ v, names }) {
  if (v === null || v === undefined || v === '') return <i className="cl-empty">empty</i>
  const s = String(v)
  if (UUID.test(s)) return <>{names[s] || s.slice(0, 8) + '…'}</>
  return <>{s}</>
}

function Confirm({ title, children, cta, busy, onGo, onShut }) {
  return (
    <div className="veil" onClick={e => { if (e.target.classList.contains('veil')) onShut() }}>
      <div className="sheet">
        <div className="sheet-h"><h3>{title}</h3><button className="icb" onClick={onShut}>✕</button></div>
        <div className="sheet-b">{children}</div>
        <div className="sheet-f">
          <button className="btn gh" onClick={onShut}>Cancel</button>
          <button className="btn" style={{ background: 'var(--seal)', borderColor: 'var(--seal)' }}
            onClick={onGo} disabled={busy}>{busy ? 'Working…' : cta}</button>
        </div>
      </div>
    </div>
  )
}

function Entry({ row, names, onAsk }) {
  const fields = row.action === 'update'
    ? changedFields(row.old_data, row.new_data)
    : changedFields(null, row.new_data || row.old_data)
  const name = labelOf(row.new_data) || labelOf(row.old_data)
  const shown = row.action === 'update' ? fields : fields.filter(f => f.b !== null && f.b !== '')

  return (
    <div className={'cl-row' + (row.reverted_at ? ' done' : '')}>
      <div className="cl-top">
        <span className={'pill ' + APILL[row.action]}>{ACTIONS[row.action]}</span>
        <span className="cl-what">
          {TABLES[row.table_name] || row.table_name}
          {name && <b> {name}</b>}
        </span>
        {row.reverted_at
          ? <span className="cl-done">reverted {stamp(row.reverted_at)}</span>
          : <button className="btn gh sm" onClick={() => onAsk({ kind: 'one', row })}>Revert</button>}
      </div>

      {shown.length > 0 && (
        <div className="cl-diff">
          {shown.map(f => (
            <div className="cl-f" key={f.k}>
              <span className="cl-k">{fieldName(f.k)}</span>
              {row.action === 'update' ? (
                <span>
                  <Val v={f.a} names={names} /> <span className="cl-ar">→</span> <Val v={f.b} names={names} />
                </span>
              ) : (
                <span><Val v={f.b} names={names} /></span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ChangeLog({ role, email }) {
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState([])
  const [names, setNames] = useState({})
  const [limit, setLimit] = useState(PAGE)
  const [table, setTable] = useState('')
  const [q, setQ] = useState('')
  const [ask, setAsk] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  const say = m => { setToast(m); setTimeout(() => setToast(''), 3200) }

  const load = useCallback(async () => {
    let query = supabase.from('audit_log').select('*').order('id', { ascending: false }).limit(limit)
    if (table) query = query.eq('table_name', table)

    const [a, o, p, e, w, pr] = await Promise.all([
      query,
      supabase.from('offices').select('id,name'),
      supabase.from('posts').select('id,title'),
      supabase.from('employees').select('id,name'),
      supabase.from('wings').select('id,label'),
      supabase.from('profiles').select('id,full_name,email')
    ])
    setErr(a.error ? a.error.message : '')
    setRows(a.data || [])

    const m = {}
    ;(o.data || []).forEach(x => { m[x.id] = x.name || 'Untitled office' })
    ;(p.data || []).forEach(x => { m[x.id] = x.title || 'Untitled post' })
    ;(e.data || []).forEach(x => { m[x.id] = x.name || 'Unnamed person' })
    ;(w.data || []).forEach(x => { m[x.id] = x.label })
    ;(pr.data || []).forEach(x => { m[x.id] = x.full_name || x.email })
    setNames(m)
    setLoading(false)
  }, [supabase, limit, table])

  useEffect(() => { load() }, [load])

  // Rows arrive newest first and one action's rows share a txid, so equal
  // neighbours are always adjacent — a single pass groups them. Group before
  // filtering, never after: half an action on screen would misrepresent what
  // "revert this action" is about to do.
  const groups = useMemo(() => {
    const out = []
    rows.forEach(r => {
      const last = out[out.length - 1]
      if (last && last.txid === r.txid) last.rows.push(r)
      else out.push({ txid: r.txid, at: r.at, actor: r.actor_email, rows: [r] })
    })
    const s = q.trim().toLowerCase()
    if (!s) return out
    const hit = r =>
      String(r.actor_email || '').toLowerCase().includes(s) ||
      String(labelOf(r.new_data) || labelOf(r.old_data) || '').toLowerCase().includes(s) ||
      String(TABLES[r.table_name] || r.table_name).toLowerCase().includes(s)
    return out.filter(g => g.rows.some(hit))
  }, [rows, q])

  const doRevert = async () => {
    setBusy(true)
    const { error } = ask.kind === 'one'
      ? await supabase.rpc('revert_audit', { entry_id: ask.row.id })
      : await supabase.rpc('revert_audit_tx', { tx: ask.group.txid })
    setBusy(false)
    setAsk(null)
    if (error) return say(error.message)
    say('Reverted')
    load()
  }

  const pending = g => g.rows.filter(r => !r.reverted_at).length

  return (
    <>
      <TopBar role={role} email={email} />
      <div className="wide-page">
        <h1 className="title" style={{ marginBottom: 4 }}>Changes</h1>
        <div className="hint" style={{ marginBottom: 18 }}>
          Every edit to offices, cards, people, postings, roles and access grants, newest first.
          The log is written by the database itself, so it captures changes no matter where they came from.
          Reverting puts a record back the way it was — and is itself recorded here.
        </div>

        <div className="cl-bar">
          <select value={table} onChange={e => { setLimit(PAGE); setTable(e.target.value) }}>
            <option value="">Everything</option>
            {Object.entries(TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by name or who made the change" />
        </div>

        {err && <div className="warn">{err}</div>}

        {loading ? <div className="hint">Loading…</div>
          : groups.length === 0 ? (
            <div className="blank">
              <p>Nothing recorded yet.</p>
              <div className="sub">
                {rows.length ? 'No change matches that filter.' : 'Changes made from now on will appear here.'}
              </div>
            </div>
          ) : (
            <>
              {groups.map(g => (
                <div className="cl-grp" key={g.txid + '-' + g.rows[0].id}>
                  <div className="cl-head">
                    <span className="cl-when">{stamp(g.at)}</span>
                    <span className="cl-who">{g.actor || 'unknown'}</span>
                    <div className="bar-sp" />
                    {g.rows.length > 1 && (
                      <>
                        <span className="cl-n">{g.rows.length} changes in one action</span>
                        {pending(g) > 0 && (
                          <button className="btn gh sm" onClick={() => setAsk({ kind: 'group', group: g })}>
                            Revert this action
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {g.rows.map(r => <Entry key={r.id} row={r} names={names} onAsk={setAsk} />)}
                </div>
              ))}

              {rows.length >= limit && (
                <div style={{ textAlign: 'center', marginTop: 18 }}>
                  <button className="btn gh" onClick={() => setLimit(limit + PAGE)}>Load older changes</button>
                </div>
              )}
            </>
          )}
      </div>

      {ask && (
        <Confirm
          title={ask.kind === 'one' ? 'Revert this change?' : 'Revert this whole action?'}
          cta={ask.kind === 'one' ? 'Revert' : 'Revert the action'}
          busy={busy} onGo={doRevert} onShut={() => setAsk(null)}>
          {ask.kind === 'one' ? (
            <>
              <div className="warn">
                {ACTIONS[ask.row.action]} {TABLES[ask.row.table_name] || ask.row.table_name}
                {labelOf(ask.row.new_data) || labelOf(ask.row.old_data)
                  ? ' — ' + (labelOf(ask.row.new_data) || labelOf(ask.row.old_data)) : ''}
              </div>
              <div style={{ fontSize: 13.5 }}>
                {ask.row.action === 'insert' && 'The record will be deleted again. Anything created underneath it goes too.'}
                {ask.row.action === 'delete' && 'The record comes back with its original id. If it sat under an office that has since been deleted, restore that first.'}
                {ask.row.action === 'update' && 'The fields above go back to their earlier values. Later edits to this record are overwritten.'}
              </div>
            </>
          ) : (
            <>
              <div className="warn">{ask.group.rows.length} change(s) made in one action</div>
              <div style={{ fontSize: 13.5 }}>
                Every change in this action that has not already been reverted is undone, including any
                further down than the log has loaded. If one step cannot be undone the whole revert stops
                and nothing changes.
              </div>
            </>
          )}
        </Confirm>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
