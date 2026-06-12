import { useState } from 'react'
import type { CuttingMachine, CuttingRate } from '../../../types'
import { fmtISO, origId as stripOrigId } from '../scheduling/utils'
import type { WeekData } from '../scheduling/weekData'
import type { MachineDaySched } from '../scheduling/constants'

export type PlanStatus = 'draft' | 'approved' | 'in_production' | 'completed' | 'cancelled' | 'archived'

export type ResultSummary = {
  planned_count: number
  completed_count: number
  partial_count: number
  not_started_count: number
  completion_rate: number
  carry_count: number
  carry_orders: { key: string; sap_so: string; reason: string; remaining_qty: number }[]
  best_machine: string
  bottleneck_machine: string
  avg_delay_days: number
  on_time_count: number
  late_count: number
  early_count: number
}

export type SnapMeta = {
  id: number
  week_start: string
  week_end: string
  label: string
  status: PlanStatus
  saved_at: string
  confirmed_at: string | null
  started_at: string | null
  completed_at: string | null
  result_summary: ResultSummary | null
}

interface SavePlanCtx {
  weekData: WeekData
  machines: CuttingMachine[]
  products: Record<string, { kva: number; label: string; std_hrs: number; ops: unknown[] }>
  globalRates: CuttingRate[]
  globalTmcRates: CuttingRate[]
  weekLabel: string
  mon: Date
  sat: Date
  balanceMode: string
  useNearestKva: boolean
  shiftMode: string
  shiftNDays: number
  shiftHrsDefault: number
  manualShiftDays: Map<number, Set<string>>
  useRoutingCr: boolean
  weekSchedule: Map<number, Map<string, MachineDaySched>>
}

export function usePlanSnapshots() {
  const [planSaving, setPlanSaving] = useState(false)
  const [planSaveMsg, setPlanSaveMsg] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<SnapMeta[]>([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [viewSnap, setViewSnap] = useState<Record<string, unknown> | null>(null)

  async function savePlan(label: string, ctx: SavePlanCtx) {
    const { weekData, machines, products, globalRates, globalTmcRates, weekLabel, mon, sat,
            balanceMode, useNearestKva, shiftMode, shiftNDays, shiftHrsDefault, manualShiftDays,
            useRoutingCr, weekSchedule } = ctx
    setPlanSaving(true); setPlanSaveMsg(null)

    // Conflict detection: warn if approved/in_production plan already exists for this week
    const conflicting = snapshots.find(s =>
      (s.status === 'approved' || s.status === 'in_production') &&
      s.week_start === fmtISO(mon) && s.week_end === fmtISO(sat)
    )
    if (conflicting) {
      const statusLabel = conflicting.status === 'in_production' ? '▶ In Production' : '✅ Approved'
      const ok = window.confirm(
        `สัปดาห์ ${fmtISO(mon)} – ${fmtISO(sat)}\nมีแผน "${conflicting.label}" ในสถานะ ${statusLabel} อยู่แล้ว\n\nบันทึกแผนใหม่ซ้อนด้วยหรือไม่?`
      )
      if (!ok) { setPlanSaving(false); return }
    }

    // Compute planned_finish_dates and planned_hours from weekSchedule
    const plannedFinishDates: Record<string, string> = {}
    const plannedHoursMap: Record<string, number> = {}
    for (const [, machMap] of weekSchedule) {
      for (const [dStr, sched] of machMap) {
        for (const w of sched.work) {
          const oid = stripOrigId(w.order.id)
          if (w.isComplete) {
            if (!plannedFinishDates[oid] || dStr > plannedFinishDates[oid])
              plannedFinishDates[oid] = dStr
          }
          plannedHoursMap[oid] = (plannedHoursMap[oid] ?? 0) + w.hrsWorked
        }
      }
    }

    try {
      const res = await fetch('/api/cutting-plan-snapshots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start: fmtISO(mon), week_end: fmtISO(sat),
          label: label || weekLabel,
          planned_finish_dates: plannedFinishDates,
          planned_hours: plannedHoursMap,
          plan_data: {
            balanceMode, shiftMode, shiftNDays, shiftHrsDefault,
            manualShiftDays: [...manualShiftDays.entries()].map(([machineId, days]) => ({ machineId, days: [...days] })),
            useRoutingCr,
            cutting_rates: globalRates,
            machines: machines.map(m => ({
              id: m.id, name: m.name, count: m.count,
              min_kva: m.min_kva, max_kva: m.max_kva, hrs_per_unit: m.hrs_per_unit,
              laser: m.laser, m4: m.m4, min_face_mm: m.min_face_mm, max_face_mm: m.max_face_mm,
              drill_8mm: m.drill_8mm, drill_22mm: m.drill_22mm,
              reg_hrs: m.reg_hrs, ot_hrs: m.ot_hrs, off_days: m.off_days ?? [], wc_id: m.wc_id ?? '',
            })),
            summary: {
              totalQtyWeek: weekData.totalQtyWeek, totalKvaWeek: weekData.totalKvaWeek,
              bottleneckWall: weekData.bottleneckWall, totalOT: weekData.totalOT, totalShift: weekData.totalShift,
            },
            dayRows: weekData.dayRows.map(r => ({
              dStr: r.dStr, dayScheduledQty: r.dayScheduledQty, dayKva: r.dayKva, dayFinish: r.dayFinish,
              machineCells: r.machineCells.map(mc => ({
                machineId: mc.m.id, machineName: mc.m.name, machOff: mc.machOff, wall: mc.wall, capH: mc.capH,
                otHrs: mc.sched?.otHrs ?? 0, carriesForward: mc.sched?.carriesForward ?? false,
                work: mc.work.map(w => ({
                  order_id: w.order.id, sap_so: w.order.sap_so, customer: w.order.customer,
                  kva: w.order.kva ?? products[w.order.product]?.kva,
                  qty: w.order.qty, hrsWorked: w.hrsWorked,
                  isComplete: w.isComplete, carriesOver: w.carriesOver, isCarryOver: w.isCarryOver,
                })),
              })),
            })),
          }
        })
      })
      if (!res.ok) throw new Error(await res.text())
      const saved = await res.json()
      setPlanSaveMsg(`✅ บันทึกแล้ว — ${weekLabel}`)
      setSnapshots(prev => [saved, ...prev])
    } catch (e) { setPlanSaveMsg(`❌ ${e instanceof Error ? e.message : String(e)}`) }
    setPlanSaving(false)
    setTimeout(() => setPlanSaveMsg(null), 4000)
  }

  async function loadSnapshots() {
    const res = await fetch('/api/cutting-plan-snapshots')
    setSnapshots(await res.json())
    setShowSnapshots(true)
  }

  async function viewSnapshot(id: number) {
    const res = await fetch(`/api/cutting-plan-snapshots/${id}`)
    const snap = await res.json()
    setViewSnap({ ...snap.plan_data, _label: snap.label, _saved_at: snap.saved_at, _week: `${snap.week_start} – ${snap.week_end}`, _status: snap.status })
    setShowSnapshots(false)
  }

  async function deleteSnapshot(id: number) {
    await fetch(`/api/cutting-plan-snapshots/${id}`, { method: 'DELETE' })
    setSnapshots(prev => prev.filter(s => s.id !== id))
  }

  async function updateStatus(id: number, status: PlanStatus) {
    const res = await fetch(`/api/cutting-plan-snapshots/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    })
    if (!res.ok) throw new Error(await res.text())
    const updated = await res.json()
    setSnapshots(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s))
    return updated as SnapMeta
  }

  async function closeWeek(id: number, summary: ResultSummary) {
    const res = await fetch(`/api/cutting-plan-snapshots/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', result_summary: summary })
    })
    if (!res.ok) throw new Error(await res.text())
    const updated = await res.json()
    setSnapshots(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s))
    return updated as SnapMeta
  }

  return { planSaving, planSaveMsg, snapshots, showSnapshots, setShowSnapshots, viewSnap, setViewSnap, savePlan, loadSnapshots, viewSnapshot, deleteSnapshot, updateStatus, closeWeek }
}
