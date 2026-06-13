import type { CuttingRate, RoutingCrRow } from '../../../types'

/**
 * Core rate builder for downstream departments.
 *
 * Groups routing rows by (routing_group, size_kva), sums std_hrs within
 * each group (multiple ops → one total per unit), then averages across
 * routing_groups that share the same kVA (handles multiple sheet variants).
 *
 * @param rows   Raw RoutingCrRow[] from /api/routing-cr
 * @param ops    Operation codes to include, e.g. ['0070','0080']
 * @param wcId   Workcenter to filter on, e.g. 'EE3105'
 */
export function buildDeptRates(
  rows: RoutingCrRow[],
  ops: string[],
  wcId: string,
): CuttingRate[] {
  const filtered = rows.filter(r => r.wc_id === wcId && ops.includes(r.operation))
  if (!filtered.length) return []

  const groupHrs = new Map<string, number>()
  const groupMeta = new Map<string, { size_kva: number }>()
  for (const r of filtered) {
    const key = `${r.routing_group}||${r.size_kva}`
    groupHrs.set(key, (groupHrs.get(key) ?? 0) + (Number(r.std_hrs) || 0))
    if (!groupMeta.has(key)) groupMeta.set(key, { size_kva: r.size_kva })
  }

  const kvaMap = new Map<number, number[]>()
  for (const [key, hrs] of groupHrs) {
    const { size_kva } = groupMeta.get(key)!
    if (!kvaMap.has(size_kva)) kvaMap.set(size_kva, [])
    kvaMap.get(size_kva)!.push(hrs)
  }

  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
  return [...kvaMap.entries()]
    .map(([kva, a]) => ({ kva, hrs: avg(a) }))
    .sort((a, b) => a.kva - b.kva)
}

// ─── Department presets ──────────────────────────────────────────────────────
// Each wraps buildDeptRates with the correct WC + operation codes.
// Typical standard hours (from routing) are shown as comments.

/** EE3105 ops 0070+0080 — เตรียมงาน + เรียงเหล็ก  ≈ 5.00 hr/unit */
export const buildSteelStackRates = (rows: RoutingCrRow[]) =>
  buildDeptRates(rows, ['0070', '0080'], 'EE3105')

/** EE3105 op  0055 — เขย่าเหล็ก                    ≈ 2.00 hr/unit */
export const buildSteelShakeRates = (rows: RoutingCrRow[]) =>
  buildDeptRates(rows, ['0055'], 'EE3105')

/** EE3106 ops 0090+0100 — ประกบแคลมป์ + พันผ้า+ทากาว ≈ 1.50 hr/unit */
export const buildClampRates = (rows: RoutingCrRow[]) =>
  buildDeptRates(rows, ['0090', '0100'], 'EE3106')

/** EE3107 op  0110 — No Load Test                   ≈ 0.25 hr/unit */
export const buildNoLoadRates = (rows: RoutingCrRow[]) =>
  buildDeptRates(rows, ['0110'], 'EE3107')
