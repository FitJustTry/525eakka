/**
 * Department hours-per-unit derived from the SAP routing export.
 *
 * Unlike the core line (single workcenter, simple op codes in routing_cr),
 * the assembly departments span many workcenters with many operations, and
 * their standard hours live in SAP_ROUTING_DB keyed per material — with kVA
 * embedded in the material description (e.g. "tr.160KVA 3ph …").
 *
 * For a department (a set of workcenters) we:
 *   1. sum every op's std_hrs at those workcenters for each material
 *      → total department hours per unit for that material
 *   2. average across all materials sharing a kVA
 *      → {kva, hrs} rate points
 *
 * This mirrors buildDeptRates() (sum ops, average by kVA) but for the
 * multi-WC, per-material SAP structure.
 */

import type { CuttingRate } from '../../../types'
import { SAP_ROUTING_DB } from '../../../data/sapRouting'

/** Parse kVA from a material description, e.g. "tr.160KVA 3ph …" → 160. */
export function kvaFromDesc(desc: string): number {
  const m = String(desc).match(/(\d[\d,]*)\s*kva/i)
  return m ? parseInt(m[1].replace(/,/g, ''), 10) || 0 : 0
}

export function buildSapDeptRates(wcs: string[]): CuttingRate[] {
  const set = new Set(wcs)
  const byKva = new Map<number, number[]>()
  for (const e of SAP_ROUTING_DB) {
    const kva = kvaFromDesc(e.desc)
    if (!kva) continue
    let sum = 0
    let hit = false
    for (const op of e.ops) {
      // op = [opCode, wc_id, taskDescription, std_hrs]
      if (set.has(op[1])) { sum += Number(op[3]) || 0; hit = true }
    }
    if (!hit) continue
    if (!byKva.has(kva)) byKva.set(kva, [])
    byKva.get(kva)!.push(sum)
  }
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
  return [...byKva.entries()]
    .map(([kva, a]) => ({ kva, hrs: avg(a) }))
    .sort((a, b) => a.kva - b.kva)
}
