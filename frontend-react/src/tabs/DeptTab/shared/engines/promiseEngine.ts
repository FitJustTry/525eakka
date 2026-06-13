/**
 * promiseEngine — Available-to-Promise (ATP).
 *
 * Answers "if we take this order, when can we ship it?" by walking the order
 * through every capacity pool: each stage needs its hours of free capacity in
 * the week it actually runs (start week + the stage's lead time). The earliest
 * start where every stage fits sets the promise date; the stage that pushed it
 * latest is the binding constraint.
 *
 * Free capacity = (reg + OT) − already-committed demand, per pool per week —
 * so promises tighten automatically as the book fills up. Pure, page-free.
 */

import type { CuttingRate } from '../../../../types'
import { lookupHrs, type DeptRegistryEntry } from '../deptRegistry'
import type { PoolHorizon, HorizonWeek, DeptRates } from './forecastEngine'

export interface StagePlan {
  poolKey: string
  label: string
  icon: string
  weekIndex: number
  requiredHrs: number
  freeHrs: number
  leadWeeks: number
}

export interface PromiseResult {
  feasible: boolean
  startWeekIndex: number
  shipWeekIndex: number          // last stage week + 1 (ship/buffer week)
  binding: StagePlan | null      // the stage that determined the start
  stages: StagePlan[]
}

const leadOf = (depts: DeptRegistryEntry[]) => Math.max(0, ...depts.map(d => d.leadWeeks ?? 0))

/** Hours this order needs at a pool = Σ member-dept (qty × rate), respecting orderFilter. */
function poolRequiredHrs(pool: PoolHorizon, deptRates: DeptRates, kva: number, qty: number, itemCode?: string): number {
  const rateOf = new Map(deptRates.map(dr => [dr.dept.id, dr.rates] as [string, CuttingRate[]]))
  let hrs = 0
  for (const dept of pool.depts) {
    if (dept.orderFilter && !dept.orderFilter({ item_code: itemCode } as never)) continue
    hrs += qty * lookupHrs(rateOf.get(dept.id) ?? [], kva, dept.fallbackHrs) * (dept.demandWeight ?? 1)
  }
  return hrs
}

/**
 * Earliest feasible start across the horizon. For each candidate start week S,
 * every pool must have free capacity for this order in week S + pool.lead.
 */
export function earliestShip(
  kva: number,
  qty: number,
  base: PoolHorizon[],
  deptRates: DeptRates,
  weeks: HorizonWeek[],
  itemCode?: string,
): PromiseResult {
  const stagesMeta = base
    .map(pool => ({
      pool,
      lead: leadOf(pool.depts),
      required: poolRequiredHrs(pool, deptRates, kva, qty, itemCode),
    }))
    .filter(s => s.required > 0)

  const maxLead = Math.max(0, ...stagesMeta.map(s => s.lead))

  for (let start = 0; start < weeks.length; start++) {
    // every stage must run within the horizon and have room
    if (start + maxLead >= weeks.length) break
    const stages: StagePlan[] = []
    let ok = true
    for (const s of stagesMeta) {
      const wi = start + s.lead
      const wl = s.pool.weeks[wi]
      const free = wl ? (wl.regCap + wl.otCap) - wl.demand : -1
      stages.push({
        poolKey: s.pool.key, label: s.pool.label, icon: s.pool.icon,
        weekIndex: wi, requiredHrs: s.required, freeHrs: free, leadWeeks: s.lead,
      })
      if (free < s.required) ok = false
    }
    if (ok) {
      const binding = stages.reduce((a, b) => (b.weekIndex > a.weekIndex ? b : a), stages[0] ?? null)
      return { feasible: true, startWeekIndex: start, shipWeekIndex: start + maxLead + 1, binding, stages }
    }
  }

  // Not feasible within the horizon — report the tightest stage at the last start
  const lastStart = Math.max(0, weeks.length - 1 - maxLead)
  const stages: StagePlan[] = stagesMeta.map(s => {
    const wi = Math.min(weeks.length - 1, lastStart + s.lead)
    const wl = s.pool.weeks[wi]
    const free = wl ? (wl.regCap + wl.otCap) - wl.demand : -1
    return { poolKey: s.pool.key, label: s.pool.label, icon: s.pool.icon, weekIndex: wi, requiredHrs: s.required, freeHrs: free, leadWeeks: s.lead }
  })
  const binding = stages.filter(s => s.freeHrs < s.requiredHrs).reduce<StagePlan | null>((a, b) => (!a || b.requiredHrs - b.freeHrs > a.requiredHrs - a.freeHrs ? b : a), null)
  return { feasible: false, startWeekIndex: lastStart, shipWeekIndex: lastStart + maxLead + 1, binding, stages }
}
