import { redirect } from 'next/navigation'
import { getSession } from '@/lib/supabase/server'
import DirectoryApp from '@/components/DirectoryApp'

export const dynamic = 'force-dynamic'

export default async function Chart({ searchParams }) {
  const { user, profile } = await getSession()
  if (!user) redirect('/login')
  if (!profile || profile.role === 'pending') redirect('/pending')
  const sp = await searchParams
  const office = typeof sp?.office === 'string' ? sp.office : null
  return <DirectoryApp mode="chart" role={profile.role} email={user.email} initialOffice={office} />
}
