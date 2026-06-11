export function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function detectSlashFmt(rows: unknown[][], dateCols: number[]): 'MM/DD' | 'DD/MM' {
  for (const row of rows.slice(0, 80)) {
    for (const col of dateCols) {
      const s = String((row as unknown[])[col] ?? '').trim()
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (!m) continue
      const a = parseInt(m[1]), b = parseInt(m[2])
      if (b > 12) return 'MM/DD'
      if (a > 12) return 'DD/MM'
    }
  }
  return 'MM/DD'
}

export function parseDate(raw: unknown, fmt: 'MM/DD' | 'DD/MM' = 'MM/DD'): string {
  const fallback = () => localISO(new Date(Date.now() + 30 * 86400000))
  if (!raw) return fallback()
  const s = String(raw).trim()
  if (!s || s === '-' || s === '—') return fallback()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slash) {
    const [, a, b, y] = slash
    const aNum = parseInt(a), bNum = parseInt(b), yNum = parseInt(y)
    const year = yNum > 2400 ? yNum - 543 : yNum
    if (bNum > 12) return `${year}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`
    if (aNum > 12) return `${year}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`
    if (fmt === 'DD/MM') return `${year}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`
    return `${year}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`
  }
  const n = parseInt(s)
  if (!isNaN(n) && n > 40000) return localISO(new Date(new Date(1899, 11, 30).getTime() + n * 86400000))
  const d3 = new Date(s)
  if (!isNaN(d3.getTime())) return localISO(d3)
  return fallback()
}

export function dmyToISO(raw: string): string | null {
  if (!raw || raw === '-') return null
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const y = parseInt(raw.slice(0, 4))
    return (y > 2400 ? `${y - 543}` : raw.slice(0, 4)) + raw.slice(4, 10)
  }
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const d = parseInt(m[1]), mo = parseInt(m[2]), y = parseInt(m[3]) > 2400 ? parseInt(m[3]) - 543 : parseInt(m[3])
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function planDateToWeekStart(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  if (isNaN(d.getTime())) return isoDate
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  return localISO(d)
}
