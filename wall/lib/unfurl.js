import dns from 'node:dns/promises'
import net from 'node:net'

const UA = 'Mozilla/5.0 (compatible; TheWall/1.0; +link preview bot)'
const MAX_BYTES = 512 * 1024
const MAX_REDIRECTS = 4
const TIMEOUT_MS = 9000

// This endpoint fetches a URL that a signed-in person typed, from inside our
// own network. That is the classic shape of a server side request forgery, so
// every hop is checked against the private address space before we connect.
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 0 || a === 10 || a === 127) return true          // this host, private, loopback
    if (a === 169 && b === 254) return true                     // link local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true            // private
    if (a === 192 && b === 168) return true                     // private
    if (a === 100 && b >= 64 && b <= 127) return true           // carrier grade NAT
    if (a === 192 && b === 0) return true                       // protocol assignments
    if (a >= 224) return true                                   // multicast + reserved
    return false
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase().replace(/^\[|\]$/g, '')
    if (s === '::1' || s === '::') return true
    if (s.startsWith('::ffff:')) return isPrivateIp(s.slice(7))  // v4 mapped
    if (/^f[cd]/.test(s)) return true                            // unique local
    if (s.startsWith('fe80')) return true                        // link local
    if (s.startsWith('ff')) return true                          // multicast
    return false
  }
  return true // unparseable: refuse
}

async function assertReachable(u) {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Only http and https links can be pinned.')
  }
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.endsWith('.internal') || host === 'metadata.google.internal') {
    throw new Error('That address is not reachable from here.')
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('That address is not reachable from here.')
    return
  }
  let records
  try {
    records = await dns.lookup(host, { all: true })
  } catch {
    throw new Error('That domain could not be resolved.')
  }
  if (!records.length || records.some(r => isPrivateIp(r.address))) {
    throw new Error('That address is not reachable from here.')
  }
}

// fetch, following redirects by hand so each hop gets the same address check
async function walk(url, depth = 0) {
  if (depth > MAX_REDIRECTS) throw new Error('That link redirects too many times.')
  const u = new URL(url)
  await assertReachable(u)

  const res = await fetch(u, {
    redirect: 'manual',
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })

  const location = res.headers.get('location')
  if (res.status >= 300 && res.status < 400 && location) {
    return walk(new URL(location, u).toString(), depth + 1)
  }
  return { res, finalUrl: u }
}

// read at most MAX_BYTES so a huge or endless body cannot tie up the server
async function readCapped(res) {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.length
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  const buf = new Uint8Array(total)
  let at = 0
  for (const c of chunks) { buf.set(c.subarray(0, Math.min(c.length, total - at)), at); at += c.length }
  const charset = /charset=["']?([\w-]+)/i.exec(res.headers.get('content-type') || '')?.[1]
  try {
    return new TextDecoder(charset || 'utf-8', { fatal: false }).decode(buf)
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(buf)
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' }

function decode(s) {
  if (!s) return ''
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+|#\d+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

function readAttrs(raw) {
  const out = {}
  for (const m of raw.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? ''
  }
  return out
}

function absolute(href, base) {
  if (!href) return null
  try { return new URL(decode(href), base).toString() } catch { return null }
}

function cut(s, n) {
  if (!s) return null
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}

/**
 * Best effort metadata for a pasted link. Never throws for a merely unhelpful
 * page — a card with only a URL on it is still a perfectly good card. It does
 * throw when the address itself is refused, because that is worth saying out loud.
 */
export async function unfurl(input) {
  const raw = String(input || '').trim()
  if (!raw) throw new Error('Paste a link first.')
  const withScheme = /^[a-z][\w+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`

  let target
  try { target = new URL(withScheme) } catch { throw new Error('That does not look like a link.') }

  const bare = {
    url: target.toString(),
    title: null, description: null,
    site_name: target.hostname.replace(/^www\./, ''),
    image_url: null,
    favicon_url: `${target.origin}/favicon.ico`
  }

  let res, finalUrl
  try {
    ({ res, finalUrl } = await walk(target.toString()))
  } catch (e) {
    // an address we refuse to touch is a hard no; anything else (timeout, DNS
    // hiccup, far end down) still gets pinned with what we already know
    if (/not reachable|http and https/.test(e.message)) throw e
    return bare
  }

  bare.url = finalUrl.toString()
  bare.site_name = finalUrl.hostname.replace(/^www\./, '')
  bare.favicon_url = `${finalUrl.origin}/favicon.ico`

  const type = res.headers.get('content-type') || ''
  if (type.startsWith('image/')) {
    bare.image_url = bare.url
    bare.title = decodeURIComponent(finalUrl.pathname.split('/').pop() || '') || bare.site_name
    return bare
  }
  if (!res.ok || !/text\/html|application\/xhtml/i.test(type)) return bare

  const html = await readCapped(res)
  const meta = {}
  for (const m of html.matchAll(/<meta\s+([^>]*)>/gi)) {
    const a = readAttrs(m[1])
    const key = (a.property || a.name || a.itemprop || '').toLowerCase()
    if (key && a.content && !(key in meta)) meta[key] = a.content
  }

  const pick = (...keys) => { for (const k of keys) if (meta[k]) return decode(meta[k]); return null }

  bare.title = cut(
    pick('og:title', 'twitter:title', 'title') ||
    decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '') || null,
    300
  )
  bare.description = cut(pick('og:description', 'twitter:description', 'description'), 600)
  bare.site_name = pick('og:site_name', 'application-name') || bare.site_name
  bare.image_url = absolute(pick('og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image', 'twitter:image:src'), bare.url)

  for (const m of html.matchAll(/<link\s+([^>]*)>/gi)) {
    const a = readAttrs(m[1])
    if (!a.href) continue
    const rel = (a.rel || '').toLowerCase()
    if (/(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/.test(rel)) {
      bare.favicon_url = absolute(a.href, bare.url) || bare.favicon_url
      if (rel.includes('apple-touch-icon')) break
    }
  }

  if (!bare.title) bare.title = bare.site_name
  return bare
}
