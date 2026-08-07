import { redirect } from 'next/navigation'
import { getSession } from '@/lib/supabase/server'
import LoginPanel from '@/components/LoginPanel'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const { user } = await getSession()
  if (user) redirect('/')
  return <LoginPanel />
}
