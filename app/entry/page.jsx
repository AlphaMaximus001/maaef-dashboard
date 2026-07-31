import { redirect } from 'next/navigation'
import { getSession } from '@/lib/supabase/server'
import DirectoryApp from '@/components/DirectoryApp'

export const dynamic = 'force-dynamic'

export default async function Entry() {
  const { user, profile } = await getSession()
  if (!user) redirect('/login')
  if (!profile || profile.role === 'pending') redirect('/pending')
  if (profile.role === 'viewer') redirect('/dashboard')
  return <DirectoryApp mode="entry" role={profile.role} email={user.email} />
}
