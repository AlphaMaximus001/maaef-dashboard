const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

// "4 minutes ago" — the human half of the hover credit
export function ago(iso) {
  if (!iso) return ''
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  const steps = [
    [60, 'second'], [60, 'minute'], [24, 'hour'],
    [7, 'day'], [4.348, 'week'], [12, 'month']
  ]
  let n = secs
  for (const [size, unit] of steps) {
    if (n < size) {
      const r = Math.floor(n)
      if (unit === 'second' && r < 20) return 'just now'
      return `${r} ${unit}${r === 1 ? '' : 's'} ago`
    }
    n /= size
  }
  const y = Math.floor(n)
  return `${y} year${y === 1 ? '' : 's'} ago`
}

// "14 MAR 2026 · 21:04" — the exact half
export function stamp(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function clock(ms) {
  const t = Math.max(0, Math.round((ms || 0) / 1000))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

// what to call somebody, given their profile row
export function nameOf(profile, fallback = 'Unknown') {
  if (!profile) return fallback
  return profile.full_name?.trim() || profile.email?.split('@')[0] || fallback
}
