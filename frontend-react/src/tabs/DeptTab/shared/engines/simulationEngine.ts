/**
 * simulationEngine — digital-twin "what-if" scenarios.
 *
 * Demand is computed once (it doesn't change with capacity); each scenario only
 * transforms capacity, then we re-derive risk metrics. Levers, all relative to
 * each pool's configured regular capacity (so no extra staffing data needed):
 *   - includeOt:        add the workcenter's configured OT band
 *   - shiftDays (0–6):  add a night-shift proxy ≈ reg × (8·days / 44)
 *                       (a same-size night crew for N days — a modelled estimate)
 *   - capacityBoostPct: extra workers / machines as a % of regular capacity
 *
 * Outputs are comparable side-by-side: peak utilisation, red/critical pool-weeks,
 * total overload hours, and capacity-based carry-risk order count.
 */

import type { Order } from '../../../../types'
import type { PoolHorizon, HorizonWeek, DeptRates } from './forecastEngine'
import { rescaleHorizon } from './forecastEngine'
import { riskLevel, carryRiskOrders } from './riskEngine'

export interface Scenario {
  id: string
  label: string
  includeOt: boolean
  shiftDays: number
  capacityBoostPct: number
}

export const DEFAULT_SCENARIOS: Scenario[] = [
  { id: 'current', label: 'ปัจจุบัน (ไม่ทำอะไร)', includeOt: false, shiftDays: 0, capacityBoostPct: 0 },
  { id: 'ot',      label: '+ OT',                  includeOt: true,  shiftDays: 0, capacityBoostPct: 0 },
  { id: 'shift',   label: '+ กะกลางคืน 3 วัน',     includeOt: false, shiftDays: 3, capacityBoostPct: 0 },
  { id: 'ot_shift',label: '+ OT + กะ 3 วัน',       includeOt: true,  shiftDays: 3, capacityBoostPct: 0 },
  { id: 'capacity',label: '+ กำลังผลิต 20%',       includeOt: false, shiftDays: 0, capacityBoostPct: 20 },
]

/** Effective regular-capacity function for a scenario (OT/shift/boost folded in). */
export function scenarioCapacity(s: Scenario) {
  return (pool: PoolHorizon): { reg: number; ot: number } => {
    const baseReg = pool.cap.reg
    const shiftAdd = baseReg * (8 * s.shiftDays / 44)
    const boostAdd = baseReg * (s.capacityBoostPct / 100)
    const otAdd = s.includeOt ? pool.cap.ot : 0
    return { reg: baseReg + otAdd + shiftAdd + boostAdd, ot: 0 }
  }
}

export interface ScenarioResult {
  scenario: Scenario
  peakUtil: number
  redWeeks: number
  criticalWeeks: number
  totalOverloadHrs: number
  carryRiskCount: number
  addedCapHrs: number
}

export function runScenario(
  base: PoolHorizon[],
  orders: Order[],
  deptRates: DeptRates,
  weeks: HorizonWeek[],
  scenario: Scenario,
): ScenarioResult {
  const pools = rescaleHorizon(base, scenarioCapacity(scenario))
  let peakUtil = 0, redWeeks = 0, criticalWeeks = 0, totalOverloadHrs = 0
  let addedCapHrs = 0
  for (let pi = 0; pi < pools.length; pi++) {
    const p = pools[pi]
    addedCapHrs += (p.cap.reg - base[pi].cap.reg) * weeks.length
    for (const w of p.weeks) {
      if (w.regCap <= 0) continue
      peakUtil = Math.max(peakUtil, w.util)
      const lvl = riskLevel(w.util)
      if (lvl === 'red') redWeeks++
      if (lvl === 'critical') criticalWeeks++
      totalOverloadHrs += Math.max(0, w.demand - w.regCap)
    }
  }
  const carryRiskCount = carryRiskOrders(orders, deptRates, pools, weeks, 'reg').size
  return { scenario, peakUtil, redWeeks, criticalWeeks, totalOverloadHrs, carryRiskCount, addedCapHrs }
}

export function runScenarios(
  base: PoolHorizon[],
  orders: Order[],
  deptRates: DeptRates,
  weeks: HorizonWeek[],
  scenarios: Scenario[] = DEFAULT_SCENARIOS,
): ScenarioResult[] {
  return scenarios.map(s => runScenario(base, orders, deptRates, weeks, s))
}
