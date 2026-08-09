// The matching behind the search page, kept free of React so it can be
// exercised on its own.

import { LEVELS, lbl, norm, digits, pathStrIn, isUnder } from './directory'

/* An exact hit outranks a prefix, which outranks a word inside the value,
   which outranks something buried mid-word. */
export const score = (value, s) => {
  const h = norm(value)
  if (!h || !s) return 0
  if (h === s) return 100
  if (h.startsWith(s)) return 70
  if (h.split(' ').some(w => w.startsWith(s))) return 55
  if (h.includes(s)) return 30
  return 0
}

export const MIN_QUERY = 2

/**
 * @param db    {{ offices, posts, employees }} everything the caller can see
 * @param opts  { q, scope, vacantOnly } scope is an office id, or '' for anywhere
 * @returns null when the query is too short, otherwise grouped results
 */
export function runSearch(db, { q, scope = '', vacantOnly = false } = {}) {
  const s = norm(q)
  if (s.length < MIN_QUERY) return null

  const offices = db.offices || []
  const posts = db.posts || []
  const employees = db.employees || []

  const officeMap = Object.fromEntries(offices.map(o => [o.id, o]))
  const postMap = Object.fromEntries(posts.map(p => [p.id, p]))
  const pathStr = id => pathStrIn(officeMap, id)
  const inScope = officeId => !scope || isUnder(officeMap, officeId, scope)

  const qd = digits(q)
  // a one or two digit query is a name fragment far more often than a phone
  const asPhone = qd.length >= 3

  const text = (value, label) => { const sc = score(value, s); return sc ? { sc, label } : null }
  const phone = (value, label) => {
    if (!asPhone) return null
    const d = digits(value)
    if (!d) return null
    if (d === qd) return { sc: 100, label }
    if (d.includes(qd)) return { sc: 65, label }
    return null
  }
  const collect = (...hits) => hits.filter(Boolean)
  const best = why => Math.max(...why.map(w => w.sc))

  const peopleRows = employees.map(e => {
    const post = e.post_id ? postMap[e.post_id] : null
    const why = collect(
      text(e.name, 'name'),
      phone(e.phone, 'personal no.'),
      text(e.designation, 'designation'),
      text(e.notes, 'notes'),
      post && text(post.title, 'position'),
      post && phone(post.phone, 'office no.'),
      post && text(pathStr(post.office_id), 'office')
    )
    if (!why.length) return null
    // someone on the bench sits in no office, so a location filter excludes them
    if (scope && !(post && inScope(post.office_id))) return null
    return { e, post, why, sc: best(why) }
  }).filter(Boolean)

  const postRows = posts.map(p => {
    const why = collect(
      text(p.title, 'position'),
      phone(p.phone, 'office no.'),
      text(p.notes, 'notes'),
      text(pathStr(p.office_id), 'office')
    )
    if (!why.length) return null
    if (!inScope(p.office_id)) return null
    const occ = employees.filter(e => e.post_id === p.id)
    if (vacantOnly && occ.length) return null
    return { p, occ, why, sc: best(why) }
  }).filter(Boolean)

  const officeRows = offices.map(o => {
    // matched on its own name and level only. Matching the ancestor path here
    // would list every office beneath any office that matched — searching
    // "Lucknow Zone" would return Kanpur Circle. Use the location filter for
    // "everything under here"; that is what it is for.
    const why = collect(
      text(o.name, 'office'),
      text(LEVELS[o.type].label, 'level')
    )
    if (!why.length) return null
    if (!inScope(o.id)) return null
    return { o, why, sc: best(why) }
  }).filter(Boolean)

  const byScore = (a, b) => b.sc - a.sc

  // Two officers really can share a name, so gather them under one heading
  // instead of leaving the reader to spot the repeat.
  const groups = []
  const seen = new Map()
  peopleRows.sort(byScore).forEach(r => {
    const k = norm(r.e.name) || ' '
    if (!seen.has(k)) {
      const g = { key: k, name: lbl(r.e.name, 'Unnamed person'), rows: [], sc: r.sc }
      seen.set(k, g)
      groups.push(g)
    }
    seen.get(k).rows.push(r)
  })

  return {
    people: groups.sort(byScore),
    peopleCount: peopleRows.length,
    posts: postRows.sort(byScore),
    offices: officeRows.sort(byScore)
  }
}
