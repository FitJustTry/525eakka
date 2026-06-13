/**
 * recommendationEngine — for each overloaded pool, propose the concrete levers
 * that would bring it back under capacity, sized from the actual overload.
 * Pure; consumes the forecastEngine horizon. Projected utilisation per action
 * uses the same capacity model as simulationEngine.
 */

import type { PoolHorizon } from './forecastEngine'
import { riskLevel, type RiskLevel } from './riskEngine'

export interface RecAction {
  kind: 'ot' | 'shift' | 'move' | 'capacity'
  text: string
  projectedUtil?: number   // utilisation at the pool's peak week after this action
}

export interface Recommendation {
  poolKey: string
  label: string
  icon: string
  peakWeekIndex: number
  peakUtil: number
  level: RiskLevel
  overloadHrs: number      // demand − regCap at the peak week
  actions: RecAction[]
}

/** Recommendations for every pool whose peak utilisation exceeds `threshold`. */
export function recommendations(pools: PoolHorizon[], threshold = 1.10): Recommendation[] {
  const out: Recommendation[] = []
  for (const pool of pools) {
    // peak week
    let pi = -1, peak = -1
    pool.weeks.forEach((w, i) => { if (w.regCap > 0 && w.util > peak) { peak = w.util; pi = i } })
    if (pi < 0 || peak <= threshold) continue

    const { demand, regCap, otCap } = pool.weeks[pi]
    const overloadHrs = demand - regCap
    const actions: RecAction[] = []

    // OT
    if (otCap > 0) {
      actions.push({
        kind: 'ot',
        text: `เปิด OT (+${Math.round(otCap)}h/สัปดาห์)`,
        projectedUtil: demand / (regCap + otCap),
      })
    }
    // Night shift — minimum days to clear the overload (capped 1–6)
    if (regCap > 0) {
      const needed = (demand / regCap - 1) * 44 / 8
      const days = Math.min(6, Math.max(1, Math.ceil(needed)))
      const shiftAdd = regCap * (8 * days / 44)
      actions.push({
        kind: 'shift',
        text: `เปิดกะกลางคืน ${days} วัน (+${Math.round(shiftAdd)}h)`,
        projectedUtil: demand / (regCap + shiftAdd),
      })
    }
    // Move work out of the peak week
    actions.push({
      kind: 'move',
      text: `ย้ายงาน ~${Math.round(overloadHrs)}h (งานสำคัญน้อย) ไปสัปดาห์ถัดไป`,
      projectedUtil: 1.0,
    })
    // Add capacity (workers/machine) if even OT can't clear it
    if (demand > regCap + otCap) {
      const boostPct = Math.ceil((demand / regCap - 1) * 100)
      actions.push({
        kind: 'capacity',
        text: `เพิ่มกำลังผลิต ~${boostPct}% (คน/เครื่องชั่วคราว)`,
        projectedUtil: 1.0,
      })
    }

    out.push({
      poolKey: pool.key,
      label: pool.label,
      icon: pool.icon,
      peakWeekIndex: pi,
      peakUtil: peak,
      level: riskLevel(peak),
      overloadHrs,
      actions,
    })
  }
  // worst first
  return out.sort((a, b) => b.peakUtil - a.peakUtil)
}
