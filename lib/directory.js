// Shared vocabulary for the office hierarchy and the small text helpers that
// go with it. Kept here so the directory, the users table and search all label
// an office the same way.

export const LEVELS = {
  head: { next: 'zone', label: 'Head Office', abbr: 'HO', color: '#8B0000' },
  zone: { next: 'circle', label: 'Zone', abbr: 'ZONE', color: '#2E5D62' },
  circle: { next: 'district', label: 'Circle', abbr: 'CIRCLE', color: '#4A7A6E' },
  district: { next: 'subdistrict', label: 'District', abbr: 'DIST', color: '#7C7A4A' },
  subdistrict: { next: null, label: 'Sub-district office', abbr: 'SUB', color: '#9A8B6B' }
}

// value if it has one, otherwise the fallback
export const lbl = (s, f) => (String(s == null ? '' : s).trim() || f)
export const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
// phone numbers get written 0522-262 0000, 0522 2620000, +91 94500 00000 …
// so compare the digits and nothing else
export const digits = s => String(s || '').replace(/\D/g, '')

export const untitled = o => 'Untitled ' + LEVELS[o.type].label.toLowerCase()
export const officeName = o => (o ? lbl(o.name, untitled(o)) : '')

export const today = () => new Date().toISOString().slice(0, 10)

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const fmt = d => {
  if (!d) return '—'
  const p = String(d).slice(0, 10).split('-')
  return `${+p[2]} ${MON[+p[1] - 1]} ${p[0]}`
}

// walk of officeMap from the root down to id, inclusive
export const pathOfIn = (officeMap, id) => {
  const out = []
  let c = officeMap[id]
  while (c) { out.unshift(c); c = c.parent_id ? officeMap[c.parent_id] : null }
  return out
}
export const pathStrIn = (officeMap, id) => pathOfIn(officeMap, id).map(officeName).join(' › ')

// is id the office itself or anywhere beneath it?
export const isUnder = (officeMap, id, rootId) => {
  let c = officeMap[id]
  while (c) { if (c.id === rootId) return true; c = c.parent_id ? officeMap[c.parent_id] : null }
  return false
}
