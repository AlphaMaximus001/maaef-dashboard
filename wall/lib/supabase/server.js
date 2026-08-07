import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const store = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return store.getAll() },
        setAll(list) {
          try { list.forEach(({ name, value, options }) => store.set(name, value, options)) }
          catch { /* called from a Server Component — middleware refreshes instead */ }
        }
      }
    }
  )
}

// Returns { user, profile }. Every page uses this to decide what to show.
export async function getSession() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, profile: null, supabase }
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()
  return { user, profile, supabase }
}

// Where a given session belongs. Every page redirects through this so the
// rules live in exactly one place.
export function gateFor(user, profile) {
  if (!user) return '/login'
  if (!profile) return '/pending'
  if (profile.banned) return '/banned'
  if (profile.role === 'pending') return '/pending'
  return '/wall'
}
