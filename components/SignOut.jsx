'use client'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignOut({ ghost }) {
  const router = useRouter()
  const supabase = createClient()
  return (
    <button
      className={ghost ? 'navlink' : 'btn gh'}
      onClick={async () => {
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
      }}
    >
      Sign out
    </button>
  )
}
