import { redirect } from 'next/navigation'
import { getSession } from '@/lib/supabase/server'
import UsersAdmin from '@/components/UsersAdmin'

export const dynamic = 'force-dynamic'

export default async function Users() {
  const { user, profile } = await getSession()
  if (!user) redirect('/login')
  if (!profile || profile.role === 'pending') redirect('/pending')
  if (profile.role !== 'superadmin') redirect('/dashboard')
  return <UsersAdmin role={profile.role} email={user.email} myId={user.id} />
}
