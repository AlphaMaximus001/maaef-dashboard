import { redirect } from 'next/navigation'
import { getSession } from '@/lib/supabase/server'
import ChangeLog from '@/components/ChangeLog'

export const dynamic = 'force-dynamic'

export default async function Changes() {
  const { user, profile } = await getSession()
  if (!user) redirect('/login')
  if (!profile || profile.role === 'pending') redirect('/pending')
  if (profile.role !== 'superadmin') redirect('/dashboard')
  return <ChangeLog role={profile.role} email={user.email} />
}
