import { redirect } from 'next/navigation'
import { getSession } from '@/lib/supabase/server'
import SignOut from '@/components/SignOut'

export const dynamic = 'force-dynamic'

export default async function Pending() {
  const { user, profile } = await getSession()
  if (!user) redirect('/login')
  if (profile && profile.role !== 'pending') redirect('/dashboard')

  return (
    <div className="centre">
      <div className="card">
        <h1>Waiting for approval</h1>
        <div className="sub">
          Your account is created but not yet let in. A superadmin has to approve it and choose
          which zones, circles and districts you can see. You&apos;ll get in as soon as that happens.
        </div>
        <div className="hint" style={{ margin: '0 0 16px' }}>Signed in as {user.email}</div>
        <SignOut />
      </div>
    </div>
  )
}
