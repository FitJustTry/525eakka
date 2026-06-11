import type { CuttingRate, RoutingCrRow } from '../../../../types'

export type { RoutingCrRow }

/**
 * Build two CuttingRate[] arrays from raw routing_cr rows:
 *  - normalRates: sheets that are NOT Cast Resin (Oil, Class H, Tr Power, …)
 *  - crRates:     Cast Resin sheets
 *
 * For each (sheet_name, size_kva) pair, all operation std_hrs are summed.
 * When the same kVA appears in multiple normal sheets the values are averaged.
 */
export function buildRoutingCrRates(rows: RoutingCrRow[]): {
  normalRates: CuttingRate[]
  crRates: CuttingRate[]
} {
  // Sum std_hrs per (sheet_name, size_kva)
  const groupHrs = new Map<string, number>()
  const groupMeta = new Map<string, { sheet_name: string; size_kva: number }>()
  for (const r of rows) {
    const key = `${r.sheet_name}||${r.size_kva}`
    groupHrs.set(key, (groupHrs.get(key) ?? 0) + (Number(r.std_hrs) || 0))
    if (!groupMeta.has(key)) groupMeta.set(key, { sheet_name: r.sheet_name, size_kva: r.size_kva })
  }

  // Separate Cast Resin vs normal — collect per kVA
  const crMap    = new Map<number, number[]>()
  const normalMap = new Map<number, number[]>()

  for (const [key, hrs] of groupHrs) {
    const { sheet_name, size_kva } = groupMeta.get(key)!
    const isCr = sheet_name.toLowerCase().includes('cast resin')
    const target = isCr ? crMap : normalMap
    if (!target.has(size_kva)) target.set(size_kva, [])
    target.get(size_kva)!.push(hrs)
  }

  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length

  const crRates: CuttingRate[]     = [...crMap.entries()]    .map(([kva, a]) => ({ kva, hrs: avg(a) }))
  const normalRates: CuttingRate[] = [...normalMap.entries()].map(([kva, a]) => ({ kva, hrs: avg(a) }))

  return { normalRates, crRates }
}

/**
 * Return the individual operations for a given kVA and type (CR or normal).
 * Picks the routing_group with the most operations as the representative.
 * Returns [] when no match.
 */
export function getRoutingOps(
  rows: RoutingCrRow[],
  kva: number,
  isCr: boolean
): RoutingCrRow[] {
  const matching = rows.filter(r => {
    if (r.size_kva !== kva) return false
    return r.sheet_name.toLowerCase().includes('cast resin') === isCr
  })
  if (!matching.length) return []
  // Group by routing_group, pick the one with most operations (most complete)
  const groups = new Map<string, RoutingCrRow[]>()
  for (const r of matching) {
    if (!groups.has(r.routing_group)) groups.set(r.routing_group, [])
    groups.get(r.routing_group)!.push(r)
  }
  const best = [...groups.values()].reduce((a, b) => a.length >= b.length ? a : b)
  return best.sort((a, b) => a.operation.localeCompare(b.operation))
}
