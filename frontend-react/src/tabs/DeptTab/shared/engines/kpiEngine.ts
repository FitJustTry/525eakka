/**
 * kpiEngine — management / Operations-Director KPIs from real outcomes.
 *
 * On-Time Delivery, throughput, and lateness come from each order's actual
 * completion (`done_at`) vs its `deadline`. Plan-attainment comes from the
 * calibration engine (closed-week history). Pure, page-free; degrades to nulls
 * when there's no completed-order history yet.
 */

import type { Order } from '../../../../types'

export interface MonthKpi {
  month: string        // YYYY-MM
  completed: number
  onTime: number
  late: number
  kva: number
  otd: number          // on-time / completed (0..1)
}

export interface FactoryKpis {
  totalCompleted: number
  otdOverall: number | null     // 0..1
  openOverdue: number           // active orders past deadline, not done
  avgLatenessDays: number | null
  throughputUnits: number       // units completed in the window
  throughputKva: number
  months: MonthKpi[]            // ascending
}

const dateOf = (iso?: string | null) => (iso ? iso.slice(0, 10) : null)
const monthOf = (iso: string) => iso.slice(0, 7)
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)

export function computeKpis(orders: Order[], today: string, lookbackMonths = 6): FactoryKpis {
  const completed = orders.filter(o => o.done_at)
  let onTimeTotal = 0
  let latenessSum = 0, latenessN = 0
  let tputUnits = 0, tputKva = 0
  const months = new Map<string, MonthKpi>()
  const cutoff = (() => { const d = new Date(today); d.setMonth(d.getMonth() - lookbackMonths); return d.toISOString().slice(0, 7) })()

  for (const o of completed) {
    const done = dateOf(o.done_at)!
    const onTime = o.deadline ? done <= o.deadline : true
    if (onTime) onTimeTotal++
    if (o.deadline) {
      const slip = daysBetween(o.deadline, done)
      if (slip > 0) { latenessSum += slip; latenessN++ }
    }
    tputUnits += o.qty ?? 1
    tputKva += (o.kva ?? 0) * (o.qty ?? 1)

    const mk = monthOf(done)
    if (mk < cutoff) continue
    const m = months.get(mk) ?? { month: mk, completed: 0, onTime: 0, late: 0, kva: 0, otd: 0 }
    m.completed++; m.kva += (o.kva ?? 0) * (o.qty ?? 1)
    if (onTime) m.onTime++; else m.late++
    months.set(mk, m)
  }

  const monthList = [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
  monthList.forEach(m => { m.otd = m.completed ? m.onTime / m.completed : 0 })

  const openOverdue = orders.filter(o => o.workflow_status !== 'DONE' && !o.done_at && o.deadline && o.deadline < today).length

  return {
    totalCompleted: completed.length,
    otdOverall: completed.length ? onTimeTotal / completed.length : null,
    openOverdue,
    avgLatenessDays: latenessN ? latenessSum / latenessN : null,
    throughputUnits: tputUnits,
    throughputKva: tputKva,
    months: monthList,
  }
}
