import { redirect } from 'next/navigation'
import { getSession } from '@/lib/supabase/server'
import SignOut from '@/components/SignOut'

export const dynamic = 'force-dynamic'

export default async function Pending() {
  const { user, profile } = await getSession()
  if (!user) redirect('/login')
  if (profile?.banned) redirect('/banned')
  if (profile && profile.role !== 'pending') redirect('/wall')

  return (
    <div className="centre">
      <div className="card">
        <h1>Not yet</h1>
        <div className="sub">Waiting on the admin</div>
        <div className="hint" style={{ marginBottom: 22 }}>
          Your account exists but it has not been let in. An admin has to open the door before
          you can see the wall. Nothing on it is visible to you until then.
        </div>
        <div className="mono" style={{ marginBottom: 20 }}>Signed in as {user.email}</div>
        <SignOut />
      </div>
    </div>
  )
}
