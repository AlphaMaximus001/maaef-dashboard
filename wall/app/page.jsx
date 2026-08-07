import { redirect } from 'next/navigation'
import { getSession, gateFor } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const { user, profile } = await getSession()
  redirect(gateFor(user, profile))
}
