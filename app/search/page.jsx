import { redirect } from 'next/navigation'
import { getSession } from '@/lib/supabase/server'
import SearchApp from '@/components/SearchApp'

export const dynamic = 'force-dynamic'

export default async function Search({ searchParams }) {
  const { user, profile } = await getSession()
  if (!user) redirect('/login')
  if (!profile || profile.role === 'pending') redirect('/pending')
  const sp = await searchParams
  const q = typeof sp?.q === 'string' ? sp.q : ''
  return <SearchApp role={profile.role} email={user.email} initialQ={q} />
}
