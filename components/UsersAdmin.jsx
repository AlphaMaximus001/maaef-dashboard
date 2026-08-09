'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { officeName } from '@/lib/directory'
import TopBar from './TopBar'

const ROLES = ['pending', 'viewer', 'admin', 'superadmin']
const PILL = { superadmin: 'sa', admin: 'ad', pending: 'pd', viewer: '' }

export default function UsersAdmin({ role, email, myId }) {
  const supabase = useMemo(() => createClient(), [])
  const [profiles, setProfiles] = useState([])
  const [offices, setOffices] = useState([])
  const [scopes, setScopes] = useState([])
  const [toast, setToast] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  const say = m => { setToast(m); setTimeout(() => setToast(''), 2600) }

  const load = useCallback(async () => {
    const [p, o, s] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at'),
      supabase.from('offices').select('*'),
      supabase.from('user_scopes').select('*')
    ])
    const bad = [p, o, s].find(r => r.error)
    setErr(bad ? bad.error.message : '')
    setProfiles(p.data || []); setOffices(o.data || []); setScopes(s.data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const officeMap = useMemo(() => Object.fromEntries(offices.map(o => [o.id, o])), [offices])
  const pathStr = id => {
    const out = []; let c = officeMap[id]
    while (c) { out.unshift(officeName(c)); c = c.parent_id ? officeMap[c.parent_id] : null }
    return out.join(' › ')
  }
  const sorted = useMemo(
    () => offices.slice().sort((a, b) => pathStr(a.id).localeCompare(pathStr(b.id))),
    [offices] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const setRole = async (id, r) => {
    const { error } = await supabase.from('profiles').update({ role: r }).eq('id', id)
    if (error) return say(error.message)
    say('Role updated'); load()
  }
  const addScope = async (userId, officeId) => {
    if (!officeId) return
    const { error } = await supabase.from('user_scopes').insert({ user_id: userId, office_id: officeId })
    if (error) return say(error.message)
    say('Access granted'); load()
  }
  const dropScope = async (id) => {
    const { error } = await supabase.from('user_scopes').delete().eq('id', id)
    if (error) return say(error.message)
    say('Access removed'); load()
  }

  return (
    <>
      <TopBar role={role} email={email} />
      <div className="wide-page">
        <h1 className="title" style={{ marginBottom: 4 }}>Users and access</h1>
        <div className="hint" style={{ marginBottom: 22 }}>
          New sign-ups arrive as <b>pending</b> and can&apos;t see anything until you change their role.
          Admins and superadmins see the whole directory. Viewers see only what you grant below —
          a grant on a zone, circle or district includes everything under it. A viewer with no grants sees nothing.
        </div>

        {err && <div className="warn">{err}</div>}
        {loading ? <div className="hint">Loading…</div> : (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>Person</th>
                <th style={{ width: '20%' }}>Role</th>
                <th>Can see</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => {
                const mine = scopes.filter(s => s.user_id === p.id)
                const isMe = p.id === myId
                return (
                  <tr key={p.id}>
                    <td>
                      <b>{p.full_name || '—'}</b>
                      <div className="tag">{p.email}</div>
                    </td>
                    <td>
                      <span className={'pill ' + (PILL[p.role] || '')} style={{ marginRight: 8 }}>{p.role}</span>
                      {isMe ? (
                        <div className="tag" style={{ marginTop: 6 }}>that&apos;s you</div>
                      ) : (
                        <select value={p.role} onChange={e => setRole(p.id, e.target.value)}
                          style={{ marginTop: 6, width: '100%', padding: '5px 7px', border: '1px solid var(--cover2)', borderRadius: 2 }}>
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      )}
                    </td>
                    <td>
                      {p.role === 'admin' || p.role === 'superadmin' ? (
                        <div className="tag">Everything — scopes don&apos;t restrict editors.</div>
                      ) : p.role === 'pending' ? (
                        <div className="tag">Nothing yet. Set a role first.</div>
                      ) : (
                        <>
                          {mine.length === 0 && <div className="tag">No access granted — this person sees an empty directory.</div>}
                          <div className="scopebox">
                            {mine.map(s => (
                              <span className="scopechip" key={s.id}>
                                {pathStr(s.office_id)}
                                <button title="Remove" onClick={() => dropScope(s.id)}>✕</button>
                              </span>
                            ))}
                          </div>
                          <select defaultValue="" onChange={e => { addScope(p.id, e.target.value); e.target.value = '' }}
                            style={{ marginTop: 8, width: '100%', padding: '5px 7px', border: '1px solid var(--cover2)', borderRadius: 2 }}>
                            <option value="">+ Grant a zone, circle or district…</option>
                            {sorted.map(o => <option key={o.id} value={o.id}>{pathStr(o.id)}</option>)}
                          </select>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}
