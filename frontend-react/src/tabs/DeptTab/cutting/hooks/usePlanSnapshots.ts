import { useState } from 'react'
import type { CuttingMachine, CuttingRate } from '../../../types'
import { fmtISO } from '../scheduling/utils'
import type { WeekData } from '../scheduling/weekData'

export type SnapMeta = { id: number; week_start: string; week_end: string; label: string; saved_at: string }

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
}

export function usePlanSnapshots() {
  const [planSaving, setPlanSaving] = useState(false)
  const [planSaveMsg, setPlanSaveMsg] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<SnapMeta[]>([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [viewSnap, setViewSnap] = useState<Record<string, unknown> | null>(null)

  async function savePlan(label: string, ctx: SavePlanCtx) {
    const { weekData, machines, products, globalRates, globalTmcRates, weekLabel, mon, sat, balanceMode, useNearestKva, shiftMode, shiftNDays, shiftHrsDefault, manualShiftDays, useRoutingCr } = ctx
    setPlanSaving(true); setPlanSaveMsg(null)
    try {
      const res = await fetch('/api/cutting-plan-snapshots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start: fmtISO(mon), week_end: fmtISO(sat),
          label: label || weekLabel,
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
                  sap_so: w.order.sap_so, customer: w.order.customer,
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
    setViewSnap({ ...snap.plan_data, _label: snap.label, _saved_at: snap.saved_at, _week: `${snap.week_start} – ${snap.week_end}` })
    setShowSnapshots(false)
  }

  async function deleteSnapshot(id: number) {
    await fetch(`/api/cutting-plan-snapshots/${id}`, { method: 'DELETE' })
    setSnapshots(prev => prev.filter(s => s.id !== id))
  }

  return { planSaving, planSaveMsg, snapshots, showSnapshots, setShowSnapshots, viewSnap, setViewSnap, savePlan, loadSnapshots, viewSnapshot, deleteSnapshot }
}
