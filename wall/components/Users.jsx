'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Chrome from './Chrome'
import { ago, stamp, nameOf } from '@/lib/time'

const ASSIGNABLE = ['pending', 'member', 'admin']

export default function Users({ me }) {
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState([])
  const [pinned, setPinned] = useState({})
  const [toast, setToast] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  const owner = me.role === 'owner'
  const say = m => { setToast(m); setTimeout(() => setToast(t => (t === m ? '' : t)), 2800) }

  const load = useCallback(async () => {
    const [p, l] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at'),
      supabase.from('links').select('created_by')
    ])
    setErr(p.error ? p.error.message : '')
    setRows(p.data || [])
    const tally = {}
    for (const r of l.data || []) tally[r.created_by] = (tally[r.created_by] || 0) + 1
    setPinned(tally)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function patch(id, changes, note) {
    const { error } = await supabase.from('profiles').update(changes).eq('id', id)
    if (error) return say(error.message)
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...changes } : r)))
    say(note)
  }

  const waiting = rows.filter(r => r.role === 'pending' && !r.banned).length

  return (
    <>
      <Chrome me={me} />
      <div className="page" style={{ maxWidth: 1080 }}>
        <h1>Who gets in</h1>
        <div className="hint" style={{ margin: '10px 0 26px', maxWidth: 640 }}>
          A new sign-up sits at <b>pending</b> and sees nothing. Make them a <b>member</b> to let
          them onto the wall. <b>Admins</b> can let people in and take down anyone&apos;s card.
          <b> Closing</b> an account locks it out immediately without deleting anything it pinned.
        </div>

        {waiting > 0 && (
          <div className="warn">
            {waiting} {waiting === 1 ? 'person is' : 'people are'} waiting at the door.
          </div>
        )}
        {err && <div className="err">{err}</div>}

        {loading ? <div className="hint"><span className="pulse">Loading</span></div> : (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: '34%' }}>Person</th>
                <th style={{ width: '20%' }}>Standing</th>
                <th style={{ width: '18%' }}>On the wall</th>
                <th>Door</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(p => {
                const isMe = p.id === me.id
                const isOwner = p.role === 'owner'
                // the owner's row is sealed to everyone but the owner, and no
                // one gets to change their own standing from in here
                const locked = isMe || (isOwner && !owner)

                return (
                  <tr key={p.id} className={p.banned ? 'gone' : ''}>
                    <td>
                      <b>{nameOf(p, '—')}</b>
                      <div className="tag">{p.email}</div>
                      <div className="tag" title={stamp(p.created_at)}>joined {ago(p.created_at)}</div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        <span className={'pill ' + p.role}>{p.role}</span>
                        {p.banned && <span className="pill banned">closed</span>}
                        {isMe && <span className="pill">you</span>}
                      </div>
                      {locked ? (
                        <div className="tag">{isMe ? 'You cannot change your own standing.' : 'Owner — sealed.'}</div>
                      ) : (
                        <select value={p.role} onChange={e => patch(p.id, { role: e.target.value }, 'Standing changed')}>
                          {ASSIGNABLE.map(r => <option key={r} value={r}>{r}</option>)}
                          {owner && <option value="owner">owner</option>}
                        </select>
                      )}
                    </td>

                    <td>
                      <div className="mono" style={{ color: pinned[p.id] ? 'var(--dust)' : 'var(--ghost)' }}>
                        {pinned[p.id] || 0} pinned
                      </div>
                    </td>

                    <td>
                      <div className="rowacts">
                        {p.role === 'pending' && !p.banned && !locked && (
                          <button className="btn" onClick={() => patch(p.id, { role: 'member' }, 'Let in')}>
                            Let them in
                          </button>
                        )}
                        {!locked && (
                          p.banned ? (
                            <button className="btn gh" onClick={() => patch(p.id, { banned: false }, 'Account reopened')}>
                              Reopen
                            </button>
                          ) : (
                            <button className="btn dngr" onClick={() => patch(p.id, { banned: true }, 'Account closed')}>
                              Close account
                            </button>
                          )
                        )}
                        {locked && <span className="tag">—</span>}
                      </div>
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
