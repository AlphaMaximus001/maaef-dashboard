'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPanel() {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState('in')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const swap = t => { setTab(t); setErr(''); setMsg('') }

  async function submit() {
    if (busy || !email || !pw) return
    setErr(''); setMsg(''); setBusy(true)
    try {
      if (tab === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
        if (error) throw error
        router.push('/')
        router.refresh()
      } else {
        const { data, error } = await supabase.auth.signUp({
          email, password: pw, options: { data: { full_name: name } }
        })
        if (error) throw error
        if (data.session) { router.push('/'); router.refresh() }
        else setMsg('Account made. Confirm it from your email, then sign in.')
      }
    } catch (e) {
      setErr(e.message || 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="centre">
      <div className="card">
        <h1>The Wall</h1>
        <div className="sub">Maaef Media House · restricted</div>

        <div className="tabs">
          <button className={'tab' + (tab === 'in' ? ' on' : '')} onClick={() => swap('in')}>Sign in</button>
          <button className={'tab' + (tab === 'up' ? ' on' : '')} onClick={() => swap('up')}>Request access</button>
        </div>

        {err && <div className="err">{err}</div>}
        {msg && <div className="warn">{msg}</div>}

        {tab === 'up' && (
          <div className="fld">
            <label>Your name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="How you want to be credited"
              autoComplete="name"
            />
          </div>
        )}

        <div className="fld">
          <label>Email</label>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder="you@maaef.in"
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
          />
        </div>

        <div className="fld">
          <label>Password</label>
          <input
            value={pw}
            onChange={e => setPw(e.target.value)}
            type="password"
            autoComplete={tab === 'in' ? 'current-password' : 'new-password'}
            placeholder={tab === 'in' ? '••••••••' : 'At least 6 characters'}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
          />
        </div>

        <button
          className="btn"
          style={{ width: '100%', padding: '11px' }}
          onClick={submit}
          disabled={busy || !email || !pw}
        >
          {busy ? 'Working…' : tab === 'in' ? 'Enter' : 'Request access'}
        </button>

        <div className="hint" style={{ marginTop: 18 }}>
          {tab === 'up'
            ? 'A new account can see nothing at all until an admin lets it in. You will land on a holding screen until then.'
            : 'Access is granted by the admin. If you were let in and now cannot get through, your account has been closed.'}
        </div>
      </div>
    </div>
  )
}
