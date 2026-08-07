import { redirect } from 'next/navigation'
import { getSession, gateFor } from '@/lib/supabase/server'
import Wall from '@/components/Wall'

export const dynamic = 'force-dynamic'

export default async function WallPage() {
  const { user, profile } = await getSession()
  const gate = gateFor(user, profile)
  if (gate !== '/wall') redirect(gate)

  return <Wall me={{ id: user.id, email: user.email, role: profile.role }} />
}
