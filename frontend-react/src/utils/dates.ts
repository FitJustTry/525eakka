export function fmtISO(d: Date): string {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
}

export function toKey(d: Date): string { return fmtISO(d) }

export function isHoliday(d: Date, holidays: Record<string, string>, factoryHolidays: Record<string, string>): string | null {
  const key = toKey(d)
  const fh = factoryHolidays[key]
  if (fh === '__WORKDAY__') return null   // factory override: work this day
  return fh || holidays[key] || null      // factory name takes display priority
}

export function isWorkDay(d: Date, holidays: Record<string, string>, factoryHolidays: Record<string, string>): boolean {
  return d.getDay() !== 0 && !isHoliday(d, holidays, factoryHolidays)
}

export function nextWorkDay(d: Date, holidays: Record<string, string>, factoryHolidays: Record<string, string>): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + 1)
  while (!isWorkDay(next, holidays, factoryHolidays)) next.setDate(next.getDate() + 1)
  return next
}

export function addWorkDaysReal(start: Date, n: number, holidays: Record<string, string>, factoryHolidays: Record<string, string>): Date {
  let count = 0
  const cur = new Date(start)
  while (count < n) {
    cur.setDate(cur.getDate() + 1)
    if (isWorkDay(cur, holidays, factoryHolidays)) count++
  }
  return cur
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export function fmtDateTH(d: Date): string {
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
}

export function fmtDayShort(d: Date): string {
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0')
}
