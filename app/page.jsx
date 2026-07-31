import { redirect } from 'next/navigation'
import { getSession } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const { user, profile } = await getSession()
  if (!user) redirect('/login')
  if (!profile || profile.role === 'pending') redirect('/pending')
  redirect('/dashboard')
}
