/**
 * DeptSchedulerPage — generic weekly scheduler for downstream departments.
 *
 * Every department (Steel Shake, Steel Stack, Clamp Assembly, No Load Test, …)
 * renders this component with its own DeptConfig.  The config drives:
 *   • which routing ops to sum for hours-per-unit
 *   • which workcenter owns the capacity
 *   • which workflow stage orders come from / advance to
 *   • API paths for station CRUD and plan snapshots
 *
 * Adding a new department: create a folder, write a config, export a one-liner
 * that renders <DeptSchedulerPage config={yourConfig} />.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useApp } from '../../../context/AppContext'
import { api } from '../../../api'
import type { CuttingMachine, CuttingRate, Order } from '../../../types'
import type { RoutingCrRow } from '../cutting/scheduling/routingRates'
import { getWeekRange, fmtISO, fmtD } from '../cutting/scheduling/utils'
import {
  scheduleMode, scheduleFastest, assignOrders,
  type ShiftMode,
} from '../cutting/scheduling/engine'
import { computeWeekData, type WeekData, type MachineCell } from '../cutting/scheduling/weekData'
import { DAY_SHORT } from '../cutting/scheduling/constants'
import type { MachineDaySched } from '../cutting/scheduling/constants'
import { buildDeptRates } from '../shared/routingRates'
import { useDeptSnapshots } from '../shared/useDeptSnapshots'
import type { DeptConfig } from '../shared/types'

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeWeekDays(mon: Date): Date[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d
  })
}

function parseBalanceMode(mode: string) {
  const parts = mode.split('_')
  const base = parts[0] as 'fastest' | 'daily' | 'weekly'
  const ot = parts.slice(1).join('_')
  return {
    approach: base,
    otPolicy: (ot === 'no_ot' ? 'none' : ot === 'full' ? 'full' : 'smart') as 'none' | 'smart' | 'full',
  }
}

function makeDefaultStation(id: number, config: DeptConfig): CuttingMachine {
  return {
    id,
    name: `${config.defaultStationName} ${id}`,
    count: 1,
    min_kva: 0, max_kva: 999999,
    hrs_per_unit: config.defaultHrsPerUnit,
    laser: false, m4: false,
    min_face_mm: 0, max_face_mm: 999999,
    drill_8mm: false, drill_22mm: false,
    notes: '',
    reg_hrs: 8, ot_hrs: 4,
    wc_id: config.workcenter,
    shift_hrs: 9, shift_enabled: true,
  }
}

const BALANCE_OPTIONS = [
  { value: 'fastest_smart',  label: '🏎 เร็วสุด + Smart OT' },
  { value: 'fastest_no_ot',  label: '🏎 เร็วสุด (ไม่ OT)' },
  { value: 'fastest_full',   label: '🏎 เร็วสุด + Full OT' },
  { value: 'weekly_smart',   label: '📅 รายสัปดาห์ + Smart OT' },
  { value: 'weekly_no_ot',   label: '📅 รายสัปดาห์ (ไม่ OT)' },
  { value: 'weekly_full',    label: '📅 รายสัปดาห์ + Full OT' },
]

// ─── sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    draft:         { bg: 'rgba(137,180,250,.15)', color: 'var(--blue)' },
    approved:      { bg: 'rgba(166,227,161,.15)', color: 'var(--green)' },
    in_production: { bg: 'rgba(249,226,175,.18)', color: 'var(--amber)' },
    completed:     { bg: 'rgba(166,227,161,.25)', color: 'var(--green)' },
    cancelled:     { bg: 'rgba(224,90,78,.15)',   color: 'var(--red)' },
  }
  const s = cfg[status] ?? { bg: 'var(--bg3)', color: 'var(--txt3)' }
  const labels: Record<string, string> = {
    draft: 'Draft', approved: 'Approved', in_production: '▶ Production',
    completed: '✅ Done', cancelled: 'Cancelled',
  }
  return (
    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 6, fontWeight: 700, background: s.bg, color: s.color }}>
      {labels[status] ?? status}
    </span>
  )
}

function OrderChip({ w }: {
  w: { order: Order; hrsWorked: number; isComplete: boolean; isCarryOver: boolean; carriesOver: boolean }
}) {
  const col = w.isComplete ? 'var(--green)' : w.carriesOver ? 'var(--amber)' : 'var(--txt2)'
  return (
    <div style={{
      padding: '2px 5px', marginBottom: 2, borderRadius: 4, fontSize: 9,
      background: w.isCarryOver ? 'rgba(249,226,175,.12)' : 'var(--bg3)',
      border: `0.5px solid ${w.carriesOver ? 'var(--amber)' : 'var(--bord)'}44`,
      display: 'flex', alignItems: 'center', gap: 4,
    }}>
      {w.isCarryOver && <span style={{ color: 'var(--amber)', fontSize: 8 }}>↩</span>}
      {w.carriesOver && <span style={{ color: 'var(--amber)', fontSize: 8 }}>↪</span>}
      <span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)', fontWeight: 700, fontSize: 8 }}>
        {w.order.sap_so || w.order.id.slice(-6)}
      </span>
      <span style={{ color: 'var(--txt3)' }}>{w.order.kva}kVA×{w.order.qty}</span>
      <span style={{ color: col, fontWeight: 600 }}>{w.hrsWorked.toFixed(1)}h</span>
    </div>
  )
}

function ScheduleTable({ stations, days, weekData }: {
  stations: CuttingMachine[]
  days: Date[]
  weekData: WeekData | null
}) {
  if (!weekData || !stations.length) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)', fontSize: 12 }}>
        {!stations.length
          ? 'ยังไม่มีสถานีงาน — กด ⚙ สถานี เพื่อเพิ่ม'
          : 'ไม่มีงานในสัปดาห์นี้ที่ตรงกับตัวกรอง'}
      </div>
    )
  }

  const cellMap = new Map<string, Map<number, MachineCell>>()
  weekData.dayRows.forEach(dr => {
    const m = new Map<number, MachineCell>()
    dr.machineCells.forEach(mc => m.set(mc.m.id, mc))
    cellMap.set(dr.dStr, m)
  })

  const mTotMap = new Map<number, typeof weekData.mTotals[0]>()
  weekData.mTotals.forEach((t, i) => { if (stations[i]) mTotMap.set(stations[i].id, t) })

  const thS: React.CSSProperties = {
    padding: '6px 8px', textAlign: 'left', fontWeight: 600, fontSize: 10,
    borderBottom: '1px solid var(--bord2)', color: 'var(--txt3)', whiteSpace: 'nowrap',
  }
  const tdS: React.CSSProperties = { padding: '6px 8px', borderBottom: '0.5px solid var(--bord)', verticalAlign: 'top' }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10 }}>
        <thead>
          <tr style={{ background: 'var(--bg3)' }}>
            <th style={thS}>สถานี</th>
            {days.map(d => (
              <th key={fmtISO(d)} style={thS}>
                <div style={{ fontWeight: 600 }}>{DAY_SHORT[d.getDay()]}</div>
                <div style={{ fontSize: 9, color: 'var(--txt3)' }}>{fmtD(d)}</div>
              </th>
            ))}
            <th style={thS}>รวม</th>
          </tr>
        </thead>
        <tbody>
          {stations.map(st => {
            const tot = mTotMap.get(st.id)
            return (
              <tr key={st.id} style={{ borderBottom: '0.5px solid var(--bord)' }}>
                <td style={{ ...tdS, fontWeight: 600, color: 'var(--blue)', whiteSpace: 'nowrap' }}>
                  {st.name}
                  <div style={{ fontSize: 8, color: 'var(--txt3)', fontWeight: 400 }}>
                    {st.reg_hrs}h reg · {st.ot_hrs}h OT{st.count > 1 ? ` · ×${st.count}` : ''}
                  </div>
                </td>
                {days.map(d => {
                  const dStr = fmtISO(d)
                  const cell = cellMap.get(dStr)?.get(st.id)
                  if (!cell || cell.machOff) {
                    return (
                      <td key={dStr} style={{ ...tdS, background: 'var(--bg3)', color: 'var(--txt3)', textAlign: 'center' }}>
                        {cell?.machOff ? '—' : ''}
                      </td>
                    )
                  }
                  const pct = Math.min(100, cell.capH > 0 ? cell.wall / cell.capH * 100 : 0)
                  const barCol = pct > 100 ? 'var(--red)' : pct > 85 ? 'var(--amber)' : 'var(--green)'
                  return (
                    <td key={dStr} style={{ ...tdS, minWidth: 120, verticalAlign: 'top' }}>
                      <div style={{ marginBottom: 4 }}>
                        {cell.work.map((w, wi) => (
                          <OrderChip key={`${w.order.id}-${wi}`} w={w} />
                        ))}
                      </div>
                      <div style={{ height: 3, background: 'var(--bg3)', borderRadius: 2, marginBottom: 2 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: barCol, borderRadius: 2 }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'var(--txt3)' }}>
                        <span style={{ fontFamily: 'var(--mono)', color: pct > 95 ? barCol : 'var(--txt3)' }}>
                          {cell.wall.toFixed(1)}h / {cell.capH.toFixed(0)}h
                        </span>
                        {(cell.sched?.otHrs ?? 0) > 0 && <span style={{ color: 'var(--amber)' }}>OT</span>}
                        {(cell.sched?.shiftHrs ?? 0) > 0 && <span style={{ color: 'var(--blue)' }}>🌙</span>}
                      </div>
                    </td>
                  )
                })}
                <td style={{ ...tdS, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {tot ? (
                    <>
                      <div style={{ fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{tot.qty} uts</div>
                      <div style={{ fontSize: 9, color: 'var(--txt3)' }}>{tot.wallHrs.toFixed(1)}h / {tot.capHrs.toFixed(0)}h</div>
                      {tot.ot > 0 && <div style={{ fontSize: 8, color: 'var(--amber)' }}>OT {tot.ot.toFixed(1)}h</div>}
                    </>
                  ) : <span style={{ color: 'var(--txt3)' }}>—</span>}
                </td>
              </tr>
            )
          })}
          {/* Capacity footer */}
          <tr style={{ background: 'var(--bg3)', borderTop: '1px solid var(--bord2)', fontSize: 9 }}>
            <td style={{ ...tdS, fontWeight: 600, color: 'var(--txt3)' }}>ความจุรวม</td>
            {days.map(d => {
              const dStr = fmtISO(d)
              const dr = weekData.dayRows.find(r => r.dStr === dStr)
              const totalCap = dr?.machineCells.reduce((s, mc) => s + mc.capH, 0) ?? 0
              const totalWall = dr?.dayCapHrs ?? 0
              const pct = totalCap > 0 ? Math.min(100, totalWall / totalCap * 100) : 0
              return (
                <td key={dStr} style={{ ...tdS, textAlign: 'center', color: 'var(--txt3)' }}>
                  <span style={{ fontFamily: 'var(--mono)' }}>{totalCap.toFixed(0)}h</span>
                  {pct > 0 && (
                    <div style={{ fontSize: 8, color: pct > 90 ? 'var(--amber)' : 'var(--txt3)' }}>
                      {Math.round(pct)}%
                    </div>
                  )}
                </td>
              )
            })}
            <td style={{ ...tdS, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--txt2)' }}>
              {weekData.totalQtyWeek} uts
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function StationConfig({ stations, config, onAdd, onDelete, onChange }: {
  stations: CuttingMachine[]
  config: DeptConfig
  onAdd: () => void
  onDelete: (id: number) => void
  onChange: (id: number, field: keyof CuttingMachine, value: unknown) => void
}) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt2)' }}>
          ⚙ สถานีงาน {config.workcenter}
        </span>
        <button onClick={onAdd} style={btnSm}>+ เพิ่มสถานี</button>
      </div>
      {stations.length === 0 && <div style={{ color: 'var(--txt3)', fontSize: 11 }}>ยังไม่มีสถานี</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {stations.map(s => (
          <div key={s.id} style={{ background: 'var(--bg)', border: '1px solid var(--bord)', borderRadius: 8, padding: '8px 12px', minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <input value={s.name} onChange={e => onChange(s.id, 'name', e.target.value)}
                style={{ flex: 1, fontSize: 11, fontWeight: 600, border: '1px solid var(--bord)', borderRadius: 4, padding: '2px 6px', background: 'var(--bg)' }} />
              <button onClick={() => onDelete(s.id)} style={{ ...btnSm, color: 'var(--red)', border: '1px solid var(--red)' }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 8, fontSize: 10 }}>
              {[
                { label: 'Reg', field: 'reg_hrs' as const, max: 24, col: 'var(--txt3)' },
                { label: 'OT',  field: 'ot_hrs'  as const, max: 12, col: 'var(--amber)' },
                { label: '×',   field: 'count'   as const, max: 10, col: 'var(--txt3)' },
              ].map(({ label, field, max, col }) => (
                <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ color: col }}>{label}</span>
                  <input type="number" value={s[field] as number} min={1} max={max}
                    onChange={e => onChange(s.id, field, Number(e.target.value))}
                    style={{ width: field === 'count' ? 36 : 40, fontSize: 10, border: '1px solid var(--bord)', borderRadius: 3, padding: '1px 4px', background: 'var(--bg)' }} />
                  {field !== 'count' && <span style={{ color: 'var(--txt3)' }}>h</span>}
                  {field === 'count' && <span style={{ color: 'var(--txt3)' }}>ทีม</span>}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const btnSm: React.CSSProperties = {
  fontSize: 10, padding: '3px 10px', borderRadius: 6,
  border: '1px solid var(--bord)', background: 'var(--bg3)',
  cursor: 'pointer', color: 'var(--txt2)',
}

// ─── Main exported component ─────────────────────────────────────────────────

export default function DeptSchedulerPage({ config }: { config: DeptConfig }) {
  const { state } = useApp()
  const { orders, products, wcConfig } = state

  const [weekOffset, setWeekOffset] = useState(0)
  const [balanceMode, setBalanceMode] = useState('fastest_smart')
  const [shiftMode, setShiftMode] = useState<ShiftMode>('none')
  const [shiftNDays, setShiftNDays] = useState(3)
  const [showConfig, setShowConfig] = useState(false)
  const [stations, setStations] = useState<CuttingMachine[]>([])
  const [routingRows, setRoutingRows] = useState<RoutingCrRow[]>([])
  const [planLabel, setPlanLabel] = useState('')
  const [wfFilter, setWfFilter] = useState<'all' | 'stage'>('all')

  // These are intentionally empty — manual OT/Shift day selection can be added per-dept later
  const [manualOtDays] = useState(() => new Map<number, Set<string>>())
  const [manualShiftDays] = useState(() => new Map<number, Set<string>>())

  const stationsApi = api.deptStations(config.stationsPath)
  const snap = useDeptSnapshots(config.snapshotsPath)

  // Load stations (fallback to one default if backend not yet deployed)
  useEffect(() => {
    stationsApi.list()
      .then(setStations)
      .catch(() => setStations([makeDefaultStation(1, config)]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.stationsPath])

  // Load routing data (shared endpoint with cutting)
  useEffect(() => {
    api.routingCr.list()
      .then(rows => setRoutingRows(rows as RoutingCrRow[]))
      .catch(() => {})
  }, [])

  const { mon, sat } = useMemo(() => getWeekRange(weekOffset), [weekOffset])
  const days = useMemo(() => makeWeekDays(mon), [mon])
  const weekLabel = `${fmtD(mon)} – ${fmtD(sat)} (${fmtISO(mon).slice(0, 7)})`

  const rates = useMemo(
    () => buildDeptRates(routingRows, config.routingOps, config.workcenter),
    [routingRows, config.routingOps, config.workcenter]
  )

  const weekOrders = useMemo(() => {
    const monStr = fmtISO(mon), satStr = fmtISO(sat)
    return orders.filter(o => {
      if (!o.plan_date || o.plan_date < monStr || o.plan_date > satStr) return false
      if (wfFilter === 'stage' && o.workflow_status !== config.workflowStage) return false
      if (config.orderFilter && !config.orderFilter(o)) return false
      return true
    })
  }, [orders, mon, sat, wfFilter, config])

  const weekSchedule = useMemo((): Map<number, Map<string, MachineDaySched>> => {
    if (!stations.length || !weekOrders.length) return new Map()
    const { approach, otPolicy } = parseBalanceMode(balanceMode)
    if (approach === 'fastest') {
      return scheduleFastest(
        weekOrders, stations, products, rates, wcConfig, days, otPolicy,
        false, false, true, true, [], false,
        shiftMode, shiftNDays, 9, manualShiftDays, false, manualOtDays,
      )
    }
    const machIdx = new Map<number, number>()
    stations.forEach((m, i) => machIdx.set(m.id, i))
    const dayAsgn = approach === 'daily'
      ? days.map(d => {
          const dStr = fmtISO(d)
          return { dStr, asgn: assignOrders(weekOrders.filter(o => o.plan_date === dStr), stations, products, rates) }
        })
      : []
    return scheduleMode(
      weekOrders, dayAsgn, stations, products, rates, wcConfig, days,
      machIdx, approach, otPolicy, 'plan_date', [], false, false, true, true, [],
      0.5, false, shiftMode, shiftNDays, 9, manualShiftDays, false, manualOtDays,
    )
  }, [weekOrders, stations, products, rates, wcConfig, days, balanceMode, shiftMode, shiftNDays, manualShiftDays, manualOtDays])

  const weekData = useMemo((): WeekData | null => {
    if (!stations.length) return null
    return computeWeekData({
      weekSchedule, weekOrders, machines: stations, days,
      balanceMode, strictWire: false, requireDrill: false,
      products, wcConfig, globalRates: rates, globalTmcRates: [],
    })
  }, [weekSchedule, weekOrders, stations, days, balanceMode, products, wcConfig, rates])

  const handleAddStation = useCallback(async () => {
    const newId = Math.max(0, ...stations.map(s => s.id)) + 1
    const s = makeDefaultStation(newId, config)
    try {
      const created = await stationsApi.create({ ...s } as Omit<CuttingMachine, 'id'>)
      setStations(prev => [...prev, created])
    } catch {
      setStations(prev => [...prev, s])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, config])

  const handleDeleteStation = useCallback(async (id: number) => {
    try { await stationsApi.delete(id) } catch {}
    setStations(prev => prev.filter(s => s.id !== id))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleStationChange = useCallback(async (id: number, field: keyof CuttingMachine, value: unknown) => {
    setStations(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
    try { await stationsApi.update(id, { [field]: value }) } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = useCallback(async () => {
    if (!weekData) return
    await snap.savePlan(planLabel, {
      weekData, stations, rates, weekLabel, mon, sat,
      balanceMode, shiftMode, shiftNDays, weekSchedule,
      deptId: config.id,
    })
    setPlanLabel('')
  }, [snap, planLabel, weekData, stations, rates, weekLabel, mon, sat, balanceMode, shiftMode, shiftNDays, weekSchedule, config.id])

  const statusColor = weekData?.summaryStatus === 'over'
    ? 'var(--red)' : weekData?.summaryStatus === 'warn'
    ? 'var(--amber)' : 'var(--green)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{config.icon} {config.title}</div>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{config.workcenter}</span>
        {rates.length > 0 && (
          <span style={{ fontSize: 10, color: 'var(--green)', background: 'rgba(166,227,161,.12)', padding: '1px 6px', borderRadius: 4 }}>
            📐 Routing ({rates.length} kVA)
          </span>
        )}
        {rates.length === 0 && (
          <span style={{ fontSize: 10, color: 'var(--amber)', background: 'rgba(249,226,175,.12)', padding: '1px 6px', borderRadius: 4 }}>
            ⚠ ไม่มี routing data — ใช้ {config.defaultHrsPerUnit}h/unit
          </span>
        )}

        {/* Week navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <button onClick={() => setWeekOffset(v => v - 1)} style={btnSm}>‹</button>
          <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'var(--mono)', minWidth: 152, textAlign: 'center' }}>
            {weekLabel}
          </span>
          <button onClick={() => setWeekOffset(v => v + 1)} style={btnSm}>›</button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} style={{ ...btnSm, color: 'var(--blue)' }}>วันนี้</button>
          )}
        </div>

        {/* Quick stats */}
        {weekData && (
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { v: weekData.totalQtyWeek, label: 'uts', col: 'var(--blue)' },
              { v: weekData.weekDoneOrders.length, label: 'done', col: 'var(--green)' },
              { v: weekData.weekCarryOrders.length, label: 'carry', col: 'var(--amber)' },
            ].map(({ v, label, col }) => (
              <div key={label} style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 6, padding: '4px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: col }}>{v}</div>
                <div style={{ fontSize: 8, color: 'var(--txt3)' }}>{label}</div>
              </div>
            ))}
            <div style={{ background: 'var(--bg2)', border: `1px solid ${statusColor}44`, borderRadius: 6, padding: '4px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: statusColor }}>
                {weekData.bottleneckWall.toFixed(0)}h
              </div>
              <div style={{ fontSize: 8, color: 'var(--txt3)' }}>bottleneck</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <select value={balanceMode} onChange={e => setBalanceMode(e.target.value)}
          style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--bord)', background: 'var(--bg3)', cursor: 'pointer' }}>
          {BALANCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Shift mode (only when supported) */}
        {(config.supportsShift !== false) && (
          <div style={{ display: 'flex', gap: 4 }}>
            {(['none', 'smart', 'every', 'n_days'] as ShiftMode[]).map(sm => (
              <button key={sm} onClick={() => setShiftMode(sm)}
                style={{
                  fontSize: 10, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${shiftMode === sm ? 'var(--blue)' : 'var(--bord)'}`,
                  background: shiftMode === sm ? 'rgba(137,180,250,.15)' : 'var(--bg3)',
                  color: shiftMode === sm ? 'var(--blue)' : 'var(--txt3)',
                }}>
                {sm === 'none' ? '❌ Shift' : sm === 'smart' ? '⚠ Smart' : sm === 'every' ? '🌙 Every' : `📅 ${shiftNDays}d`}
              </button>
            ))}
            {shiftMode === 'n_days' && (
              <input type="number" value={shiftNDays} min={1} max={6}
                onChange={e => setShiftNDays(Number(e.target.value))}
                style={{ width: 36, fontSize: 10, border: '1px solid var(--bord)', borderRadius: 4, padding: '2px 4px', background: 'var(--bg)' }} />
            )}
          </div>
        )}

        {/* Workflow filter */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'stage'] as const).map(f => (
            <button key={f} onClick={() => setWfFilter(f)}
              style={{
                fontSize: 10, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${wfFilter === f ? 'var(--amber)' : 'var(--bord)'}`,
                background: wfFilter === f ? 'rgba(249,226,175,.15)' : 'var(--bg3)',
                color: wfFilter === f ? 'var(--amber)' : 'var(--txt3)',
              }}>
              {f === 'all' ? '📋 ทั้งหมด' : `${config.icon} ${config.workflowStage} Queue`}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setShowConfig(v => !v)}
            style={{ ...btnSm, border: showConfig ? '1px solid var(--blue)' : '1px solid var(--bord)', color: showConfig ? 'var(--blue)' : 'var(--txt2)' }}>
            ⚙ สถานี
          </button>
          <input value={planLabel} onChange={e => setPlanLabel(e.target.value)}
            placeholder="ชื่อแผน (ไม่บังคับ)"
            style={{ fontSize: 10, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--bord)', background: 'var(--bg)', width: 140 }} />
          <button onClick={handleSave} disabled={snap.saving || !weekData}
            style={{ ...btnSm, background: 'rgba(137,180,250,.15)', color: 'var(--blue)', border: '1px solid var(--blue)' }}>
            {snap.saving ? '…' : '💾 บันทึกแผน'}
          </button>
          <button onClick={snap.loadSnapshots}
            style={{ ...btnSm, border: snap.showSnapshots ? '1px solid var(--green)' : '1px solid var(--bord)', color: snap.showSnapshots ? 'var(--green)' : 'var(--txt2)' }}>
            📋 แผนที่บันทึก
          </button>
        </div>
      </div>

      {/* Save message */}
      {snap.saveMsg && (
        <div style={{
          fontSize: 11, padding: '6px 12px', borderRadius: 6,
          background: snap.saveMsg.startsWith('✅') ? 'rgba(166,227,161,.15)' : 'rgba(224,90,78,.12)',
          color: snap.saveMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)',
          border: `1px solid ${snap.saveMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)'}44`,
        }}>
          {snap.saveMsg}
        </div>
      )}

      {/* ── Station config ──────────────────────────────────────────────── */}
      {showConfig && (
        <StationConfig
          stations={stations} config={config}
          onAdd={handleAddStation} onDelete={handleDeleteStation} onChange={handleStationChange}
        />
      )}

      {/* ── Schedule table ──────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, overflow: 'hidden' }}>
        <ScheduleTable stations={stations} days={days} weekData={weekData} />
      </div>

      {/* ── Week summary ────────────────────────────────────────────────── */}
      {weekData && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'งานเสร็จ', orders: weekData.weekDoneOrders, col: 'var(--green)' },
            { label: 'ค้างสัปดาห์ถัดไป', orders: weekData.weekCarryOrders, col: 'var(--amber)' },
            { label: 'ไม่ได้จัดตาราง', orders: weekData.weekUnscheduled, col: 'var(--txt3)' },
          ].filter(g => g.orders.length > 0).map(g => (
            <div key={g.label} style={{
              flex: 1, minWidth: 180,
              background: 'var(--bg2)', border: `1px solid ${g.col}44`, borderRadius: 8, padding: '8px 12px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: g.col, marginBottom: 6 }}>
                {g.label} ({g.orders.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {g.orders.slice(0, 12).map(o => (
                  <span key={o.id} style={{
                    fontSize: 9, padding: '1px 6px', borderRadius: 4,
                    background: `${g.col}15`, color: g.col, fontFamily: 'var(--mono)',
                  }}>
                    {o.sap_so || o.id.slice(-6)} {o.kva}kVA
                  </span>
                ))}
                {g.orders.length > 12 && <span style={{ fontSize: 9, color: 'var(--txt3)' }}>+{g.orders.length - 12}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Snapshot list ───────────────────────────────────────────────── */}
      {snap.showSnapshots && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>📋 แผนที่บันทึกไว้</span>
            <button onClick={() => snap.setShowSnapshots(false)} style={{ ...btnSm, marginLeft: 'auto' }}>ปิด</button>
          </div>
          {snap.snapshots.length === 0
            ? <div style={{ color: 'var(--txt3)', fontSize: 11 }}>ยังไม่มีแผนที่บันทึก</div>
            : (
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--bord)' }}>
                    {['สัปดาห์', 'ชื่อแผน', 'บันทึกเมื่อ', 'สถานะ', ''].map(h => (
                      <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--txt3)', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {snap.snapshots.map(s => (
                    <tr key={s.id} style={{ borderBottom: '0.5px solid var(--bord)' }}>
                      <td style={{ padding: '5px 8px', fontFamily: 'var(--mono)', fontSize: 9 }}>{s.week_start} – {s.week_end}</td>
                      <td style={{ padding: '5px 8px', fontWeight: 600 }}>{s.label}</td>
                      <td style={{ padding: '5px 8px', color: 'var(--txt3)', fontSize: 9 }}>
                        {new Date(s.saved_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '5px 8px' }}><StatusBadge status={s.status} /></td>
                      <td style={{ padding: '5px 8px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => snap.viewSnapshot(s.id)} style={btnSm}>ดู</button>
                          <button onClick={() => snap.deleteSnapshot(s.id)}
                            style={{ ...btnSm, color: 'var(--red)', border: '1px solid var(--red)44' }}>ลบ</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}

      {/* ── Snapshot viewer ─────────────────────────────────────────────── */}
      {snap.viewSnap && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>
              {snap.viewSnap._label as string} — {snap.viewSnap._week as string}
            </span>
            <StatusBadge status={snap.viewSnap._status as string} />
            <button onClick={() => snap.setViewSnap(null)} style={{ ...btnSm, marginLeft: 'auto' }}>ปิด</button>
          </div>
          <pre style={{ fontSize: 9, color: 'var(--txt3)', overflow: 'auto', maxHeight: 200 }}>
            {JSON.stringify(snap.viewSnap, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
