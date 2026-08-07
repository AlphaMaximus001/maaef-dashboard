import { redirect } from 'next/navigation'
import { getSession, gateFor } from '@/lib/supabase/server'
import Users from '@/components/Users'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const { user, profile } = await getSession()
  const gate = gateFor(user, profile)
  if (gate !== '/wall') redirect(gate)
  if (profile.role !== 'admin' && profile.role !== 'owner') redirect('/wall')

  return <Users me={{ id: user.id, email: user.email, role: profile.role }} />
}
