'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function Login() {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState('in')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setErr(''); setMsg(''); setBusy(true)
    try {
      if (tab === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
        if (error) throw error
        router.push('/')
        router.refresh()
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: pw,
          options: { data: { full_name: name } }
        })
        if (error) throw error
        if (data.session) { router.push('/'); router.refresh() }
        else setMsg('Account created. Check your email to confirm, then sign in.')
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
        <h1>UP Irrigation Directory</h1>
        <div className="sub">Maaef Enterprises · internal posting directory</div>

        <div className="tabs">
          <button className={'tab' + (tab === 'in' ? ' on' : '')} onClick={() => { setTab('in'); setErr(''); setMsg('') }}>Sign in</button>
          <button className={'tab' + (tab === 'up' ? ' on' : '')} onClick={() => { setTab('up'); setErr(''); setMsg('') }}>Create account</button>
        </div>

        {err && <div className="err">{err}</div>}
        {msg && <div className="hint" style={{ marginTop: 0 }}>{msg}</div>}

        {tab === 'up' && (
          <div className="fld">
            <label>Your name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ankur Patel" />
          </div>
        )}
        <div className="fld">
          <label>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@maaef.in" />
        </div>
        <div className="fld">
          <label>Password</label>
          <input
            value={pw}
            onChange={e => setPw(e.target.value)}
            type="password"
            autoComplete={tab === 'in' ? 'current-password' : 'new-password'}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            placeholder="At least 6 characters"
          />
        </div>

        <button className="btn" style={{ width: '100%', padding: '9px' }} onClick={submit} disabled={busy || !email || !pw}>
          {busy ? 'Working…' : tab === 'in' ? 'Sign in' : 'Create account'}
        </button>

        {tab === 'up' && (
          <div className="hint" style={{ marginTop: 14, marginBottom: 0 }}>
            New accounts start with no access. A superadmin approves you and picks which zones,
            circles and districts you can see.
          </div>
        )}
      </div>
    </div>
  )
}
