/**
 * Generic plan-snapshot hook for downstream departments.
 *
 * Parameterised by snapshotsPath (API path after /api).
 * Used by every department except Cutting (which has its own usePlanSnapshots).
 *
 * Usage:
 *   const snap = useDeptSnapshots(config.snapshotsPath, config.id)
 */
import { useState } from 'react'
import type { CuttingMachine, CuttingRate } from '../../../types'
import { fmtISO } from '../cutting/scheduling/utils'
import type { WeekData } from '../cutting/scheduling/weekData'
import type { MachineDaySched } from '../cutting/scheduling/constants'
import type { SnapMeta, PlanStatus, ResultSummary } from '../cutting/hooks/usePlanSnapshots'

export type { SnapMeta, PlanStatus, ResultSummary }

export interface DeptSaveCtx {
  weekData: WeekData
  stations: CuttingMachine[]
  rates: CuttingRate[]
  weekLabel: string
  mon: Date
  sat: Date
  balanceMode: string
  shiftMode: string
  shiftNDays: number
  weekSchedule: Map<number, Map<string, MachineDaySched>>
  deptId: string
}

export function useDeptSnapshots(snapshotsPath: string) {
  const base = `/api${snapshotsPath}`

  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<SnapMeta[]>([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [viewSnap, setViewSnap] = useState<Record<string, unknown> | null>(null)

  async function savePlan(label: string, ctx: DeptSaveCtx) {
    const {
      weekData, stations, rates, weekLabel, mon, sat,
      balanceMode, shiftMode, shiftNDays, weekSchedule, deptId,
    } = ctx
    setSaving(true); setSaveMsg(null)

    const conflicting = snapshots.find(s =>
      (s.status === 'approved' || s.status === 'in_production') &&
      s.week_start === fmtISO(mon) && s.week_end === fmtISO(sat)
    )
    if (conflicting) {
      const ok = window.confirm(
        `สัปดาห์ ${fmtISO(mon)} – ${fmtISO(sat)}\nมีแผน "${conflicting.label}" อยู่แล้ว\nบันทึกซ้อนทับด้วยหรือไม่?`
      )
      if (!ok) { setSaving(false); return }
    }

    const plannedFinish: Record<string, string> = {}
    const plannedHours: Record<string, number> = {}
    for (const [, machMap] of weekSchedule) {
      for (const [dStr, sched] of machMap) {
        for (const w of sched.work) {
          const oid = w.order.id.replace(/__u\d+$/, '')
          if (w.isComplete && (!plannedFinish[oid] || dStr > plannedFinish[oid]))
            plannedFinish[oid] = dStr
          plannedHours[oid] = (plannedHours[oid] ?? 0) + w.hrsWorked
        }
      }
    }

    try {
      const res = await fetch(base, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start: fmtISO(mon), week_end: fmtISO(sat),
          label: label || weekLabel,
          planned_finish_dates: plannedFinish,
          planned_hours: plannedHours,
          plan_data: {
            dept: deptId,
            balanceMode, shiftMode, shiftNDays,
            rates,
            stations: stations.map(s => ({
              id: s.id, name: s.name, count: s.count,
              reg_hrs: s.reg_hrs, ot_hrs: s.ot_hrs,
              wc_id: s.wc_id ?? '',
              shift_hrs: s.shift_hrs ?? 9,
              shift_enabled: s.shift_enabled ?? true,
            })),
            summary: {
              totalQtyWeek: weekData.totalQtyWeek,
              totalKvaWeek: weekData.totalKvaWeek,
              bottleneckWall: weekData.bottleneckWall,
              totalOT: weekData.totalOT,
              totalShift: weekData.totalShift,
            },
          },
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const saved = await res.json()
      setSaveMsg(`✅ บันทึกแล้ว — ${weekLabel}`)
      setSnapshots(prev => [saved as SnapMeta, ...prev])
    } catch (e) {
      setSaveMsg(`❌ ${e instanceof Error ? e.message : String(e)}`)
    }
    setSaving(false)
    setTimeout(() => setSaveMsg(null), 4000)
  }

  async function loadSnapshots() {
    try {
      const res = await fetch(base)
      if (res.ok) setSnapshots(await res.json())
    } catch {}
    setShowSnapshots(true)
  }

  async function viewSnapshot(id: number) {
    try {
      const res = await fetch(`${base}/${id}`)
      const snap = await res.json()
      setViewSnap({
        ...snap.plan_data,
        _label: snap.label, _saved_at: snap.saved_at,
        _week: `${snap.week_start} – ${snap.week_end}`,
        _status: snap.status,
      })
      setShowSnapshots(false)
    } catch {}
  }

  async function deleteSnapshot(id: number) {
    try { await fetch(`${base}/${id}`, { method: 'DELETE' }) } catch {}
    setSnapshots(prev => prev.filter(s => s.id !== id))
  }

  async function updateStatus(id: number, status: PlanStatus) {
    const res = await fetch(`${base}/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) throw new Error(await res.text())
    const updated = await res.json()
    setSnapshots(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s))
    return updated as SnapMeta
  }

  async function closeWeek(id: number, summary: ResultSummary) {
    const res = await fetch(`${base}/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', result_summary: summary }),
    })
    if (!res.ok) throw new Error(await res.text())
    const updated = await res.json()
    setSnapshots(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s))
    return updated as SnapMeta
  }

  return {
    saving, saveMsg, snapshots, showSnapshots, setShowSnapshots,
    viewSnap, setViewSnap,
    savePlan, loadSnapshots, viewSnapshot, deleteSnapshot, updateStatus, closeWeek,
  }
}
