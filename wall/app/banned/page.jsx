import { redirect } from 'next/navigation'
import { getSession } from '@/lib/supabase/server'
import SignOut from '@/components/SignOut'

export const dynamic = 'force-dynamic'

export default async function Banned() {
  const { user, profile } = await getSession()
  if (!user) redirect('/login')
  if (profile && !profile.banned) redirect('/')

  return (
    <div className="centre">
      <div className="card">
        <h1 style={{ color: '#e9b8b2' }}>Closed</h1>
        <div className="sub" style={{ color: '#8a3f38' }}>Access withdrawn</div>
        <div className="hint" style={{ marginBottom: 22 }}>
          This account has been closed by an admin. Everything you pinned is still on the wall,
          but you cannot reach it. Speak to whoever runs this if you think that is a mistake.
        </div>
        <div className="mono" style={{ marginBottom: 20 }}>{user.email}</div>
        <SignOut />
      </div>
    </div>
  )
}
