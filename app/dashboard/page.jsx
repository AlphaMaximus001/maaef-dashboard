import { redirect } from 'next/navigation'
import { getSession } from '@/lib/supabase/server'
import DirectoryApp from '@/components/DirectoryApp'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const { user, profile } = await getSession()
  if (!user) redirect('/login')
  if (!profile || profile.role === 'pending') redirect('/pending')
  return <DirectoryApp mode="view" role={profile.role} email={user.email} />
}
