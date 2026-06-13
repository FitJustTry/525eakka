/**
 * flowEngine — projects each order through the production pipeline over time.
 *
 * NOT a finite-capacity optimiser. It's a lead-time projection: from an order's
 * plan-week (the core line), each downstream phase lands `lead` weeks later
 * (same model as the forecast). It answers "when does each order hit each phase,
 * where do they collide, and will it ship before its deadline?" — the
 * sequencing VISIBILITY a planner uses, without fabricating an exact schedule.
 *
 * Pure, page-free.
 */

import type { Order } from '../../../../types'
import { getWeekRange, fmtISO, fmtD } from '../../cutting/scheduling/utils'
import type { HorizonWeek } from './forecastEngine'

export interface FlowPhaseDef { key: string; label: string; color: string; lead: number }

export const FLOW_PHASES: FlowPhaseDef[] = [
  { key: 'core',     label: 'แกน+คอยล์',     color: 'var(--blue)', lead: 0 },
  { key: 'internal', label: 'ประกอบใน',      color: '#94e2d5',     lead: 1 },
  { key: 'external', label: 'ประกอบนอก+เทส', color: '#89dceb',     lead: 2 },
]
const SHIP_LEAD = 3   // weeks from core to ready-to-ship (projection buffer)

export interface FlowRow {
  order: Order
  coreWeekIndex: number
  phases: { key: string; label: string; color: string; weekIndex: number }[]
  shipWeekIndex: number
  shipDate: string      // DD/MM of projected ship week
  shipsLate: boolean
}

export function projectFlows(orders: Order[], weeks: HorizonWeek[]): FlowRow[] {
  const rows: FlowRow[] = []
  for (const o of orders) {
    if (o.workflow_status === 'DONE' || !o.plan_date) continue
    const ci = weeks.findIndex(w => o.plan_date! >= w.monStr && o.plan_date! <= w.satStr)
    if (ci < 0) continue
    const phases = FLOW_PHASES.map(p => ({ key: p.key, label: p.label, color: p.color, weekIndex: ci + p.lead }))
    const shipWeekIndex = ci + SHIP_LEAD
    const { mon } = getWeekRange(weeks[0].offset + shipWeekIndex)
    const shipsLate = !!o.deadline && fmtISO(mon) > o.deadline
    rows.push({ order: o, coreWeekIndex: ci, phases, shipWeekIndex, shipDate: fmtD(mon), shipsLate })
  }
  return rows.sort((a, b) =>
    a.coreWeekIndex - b.coreWeekIndex
    || Number(b.shipsLate) - Number(a.shipsLate)
    || (a.order.deadline ?? '').localeCompare(b.order.deadline ?? ''))
}

/** Count of orders entering each phase in each display week (collision view). */
export function phaseLoadByWeek(rows: FlowRow[], weekCount: number): number[] {
  const counts = Array(weekCount).fill(0)
  for (const r of rows) for (const p of r.phases) {
    if (p.weekIndex >= 0 && p.weekIndex < weekCount) counts[p.weekIndex]++
  }
  return counts
}
