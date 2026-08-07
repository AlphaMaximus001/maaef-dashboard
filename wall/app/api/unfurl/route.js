import { getSession } from '@/lib/supabase/server'
import { unfurl } from '@/lib/unfurl'

// node, not edge: the address checks need dns and net
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  // this route makes outbound requests on the caller's behalf, so it is closed
  // to anyone who is not already through the door
  const { user, profile } = await getSession()
  const allowed = user && profile && !profile.banned && profile.role !== 'pending'
  if (!allowed) {
    return Response.json({ error: 'Not allowed.' }, { status: 403 })
  }

  let url
  try { ({ url } = await request.json()) } catch { url = null }
  if (!url || typeof url !== 'string') {
    return Response.json({ error: 'No link given.' }, { status: 400 })
  }

  try {
    return Response.json(await unfurl(url))
  } catch (e) {
    return Response.json({ error: e.message || 'Could not read that link.' }, { status: 400 })
  }
}
