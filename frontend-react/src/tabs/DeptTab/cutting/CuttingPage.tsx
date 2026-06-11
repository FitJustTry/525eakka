/**
 * ════════════════════════════════════════════════════════════════════
 *  CuttingMachines.tsx — แผนการตัดโลหะ (Metal Cutting Plan)
 * ════════════════════════════════════════════════════════════════════
 *
 * ── DATA FLOW ────────────────────────────────────────────────────────
 *
 *  accepted_orders (DB)
 *    ↓  filtered to current week (weekOrders)
 *  dailyAssignments  [useMemo]
 *    └─ for each day: assignOrders(activeMachines, dayOrders)
 *       • activeMachines = machines WHERE off_days does NOT include today
 *       • assignOrders uses LPT greedy + tiny drill-preference bonus
 *       • result: Map<machineId, Order[]> per day
 *    ↓
 *  weekSchedule  [useMemo]  ← algorithm selected by balanceMode
 *    └─ scheduleWeekWithCarryOver  (daily / weekly)
 *    └─ schedulePullForward        (⏩ เติมเต็ม)
 *    └─ scheduleSmartOT            (⚡ Smart OT)
 *       result: Map<machineId, Map<dateStr, MachineDaySched>>
 *
 * ── KEY FUNCTIONS ────────────────────────────────────────────────────
 *
 *  getHrsForKva(m, kva, globalRates)
 *    → exact-match kVA in globalRates table → if not found, m.hrs_per_unit
 *    → globalRates loaded from /api/cutting-rates (saved in DB)
 *    → load from SAP: /api/sap-routing/rates-by-kva?wc_id=EE3102
 *       reads MaterialDescription to extract kVA, averages std_hrs
 *
 *  isMachineOn(m, dayOfWeek)
 *    → returns false if dayOfWeek ∈ m.off_days  (1=Mon … 6=Sat)
 *    → used in dailyAssignments to exclude machine from that day
 *
 *  resolveHours(m, wcConfig, isSat, dayOfWeek?)
 *    → if off_days includes dayOfWeek: {reg:0, ot:0}
 *    → if m.wc_id set: pull hrs/ot/sat_hrs/sat_ot from wcConfig[m.wc_id]
 *    → else: m.reg_hrs / m.ot_hrs  (Saturday = ÷2 by default)
 *
 *  canMachineCut(m, order, products)
 *    → kVA range only (m.min_kva … m.max_kva)
 *    → max_kva ≥ 9999 = ไม่จำกัด
 *    → drill type is SOFT preference, not a hard filter
 *
 *  drillPrefers(m, order)
 *    → m.drill_8mm=true AND typeCode∈{1,2,3} → prefers Oil orders
 *    → m.drill_22mm=true AND typeCode=4      → prefers Cast Resin orders
 *    → used as tiebreaker (DRILL_BONUS=0.0001h) in assignOrders
 *
 * ── SCHEDULING ALGORITHMS ────────────────────────────────────────────
 *
 *  All algorithms use HOURS (not units) for carry-over.
 *  An order needing 21h/unit spans multiple days continuously.
 *
 *  scheduleWeekWithCarryOver (📅 รายวัน / 📆 สัปดาห์)
 *    • Processes dailyAssignments day-by-day
 *    • Machine off that day → regCap=0, otCap=0 → all work carries forward
 *    • Carry-over queue: remainingHrs per order item
 *    • DAILY mode: each day starts fresh (initWall=0)
 *    • WEEKLY mode: cumulative wall time carried across days (balance week)
 *
 *  schedulePullForward (⏩ เติมเต็ม)
 *    • Global LPT assignment for ALL week orders at once
 *    • Machine processes queue continuously — when done early, pulls next
 *      future-day orders (no idle time)
 *    • Orders pulled before their plan_date are flagged "pulled"
 *
 *  scheduleSmartOT (⚠️ เมื่อจำเป็น)
 *    • Fills regular hours completely first (no pre-allocated OT)
 *    • OT kicks in only when today's queue (carry + new) exceeds reg capacity
 *    • OT amount = exact overflow (capped at ot_hrs) — no more, no less
 *    • Saturday → force otCap=0 (no Saturday OT)
 *
 * ── DISPLAY LOGIC ────────────────────────────────────────────────────
 *
 *  Card view (📋 รายวัน)  &  Table view (📊 ตาราง)  use IDENTICAL data:
 *    • dayWalls: from weekSchedule.sched.regHrs + sched.otHrs
 *    • Cells built from weekSchedule.work[] items (NOT raw asgn)
 *    • Off-day machine → 🔴 ปิดวันนี้
 *    • Carry-over from yesterday → ↩ badge
 *    • Work continues tomorrow → → badge
 *    • Click cell → full detail (SAP SO, kVA, customer, deadline, hours)
 *
 *  mTotals (weekly header per machine)
 *    • Sums wallHrs and qty from weekSchedule across all days
 *
 * ── TO EXTEND ────────────────────────────────────────────────────────
 *
 *  Add a new scheduling mode:
 *    1. Add value to balanceMode type: 'daily' | 'weekly' | 'pull' | 'smart' | 'NEW'
 *    2. Write scheduleXxx(assignedPerDay, machines, ...) → Map<id, Map<date, MachineDaySched>>
 *    3. Add case in weekSchedule useMemo
 *    4. Add button in toggle section
 *
 *  Add per-machine cutting rate override:
 *    • Currently globalRates applies to ALL machines
 *    • To add per-machine: add m.rates?: CuttingRate[] and check in getHrsForKva
 *      before falling back to globalRates → m.hrs_per_unit
 *
 *  Change kVA→hours lookup:
 *    → Edit getHrsForKva() — currently exact-match only, returns m.hrs_per_unit if not found
 *    → To add interpolation: find nearest lower kVA entry
 *
 *  Change drill assignment priority:
 *    → Edit DRILL_BONUS constant (0.0001h = tiebreaker only)
 *    → Increase to give drill machines stronger preference at cost of balance
 * ════════════════════════════════════════════════════════════════════
 */
import React, { useState, useMemo, useEffect } from 'react'
import { api } from '../../../api'
import { useApp } from '../../../context/AppContext'
import type { CuttingMachine, CuttingRate, Order, RoutingCrRow } from '../../../types'
import styles from './CuttingPage.module.css'
import { DAY_TH, DAY_SHORT, REG_PER, OT_PER } from './scheduling/constants'
import type { MachineDaySched } from './scheduling/constants'
import {
  getHrsForKva, isMachineOn, resolveHours, resolveShift,
  mLabel, fmtISO, getWeekRange,
  origId, fmtD as fmtDUtil,
} from './scheduling/utils'
import CardView from './components/CardView'
import TableView from './components/TableView'
import PipelineView from './components/PipelineView'
import MachineConfigPanel from './components/MachineConfigPanel'
import GlobalRatesPanel from './components/GlobalRatesPanel'
import PerMachineRatesPanel from './components/PerMachineRatesPanel'
import { assignOrders, scheduleFastest, scheduleMode } from './scheduling/engine'
import type { ShiftMode } from './scheduling/engine'
import { computeWeekData } from './scheduling/weekData'
import { buildRoutingCrRates, getRoutingOps, DEFAULT_CUTTING_WCS } from './scheduling/routingRates'
import {
  exportPlanCSV as _exportCSV,
  exportTXT as _exportTXT,
  exportXLSX as _exportXLSX,
  exportMachineXLSX as _exportMachineXLSX,
  exportJSON as _exportJSON,
  exportPrint as _exportPrint,
  exportMachinePrint as _exportMachinePrint,
} from './scheduling/export'

export default function CuttingMachines() {
  const { state, dispatch } = useApp()
  const { cuttingMachines: machines, orders, products, wcConfig } = state
  const [weekOffset, setWeekOffset] = useState(0)
  const [includePrevCarry, setIncludePrevCarry] = useState(false)
  const [showWireData, setShowWireData] = useState(true)   // show Raw Mat / LV / HV in order cards
  const [workDisplay, setWorkDisplay]   = useState<'order' | 'carry' | 'segment' | 'unit'>('order')
  const [planSaving, setPlanSaving] = useState(false)
  const [planSaveMsg, setPlanSaveMsg] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<{ id: number; week_start: string; week_end: string; label: string; saved_at: string }[]>([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [viewSnap, setViewSnap] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving] = useState<number | null>(null)
  const [selectedCell, setSelectedCell] = useState<{ machineId: number; date: string } | null>(null)
  type BalanceMode =
    | 'daily_no_ot' | 'weekly_no_ot' | 'fastest_no_ot'
    | 'deadline_no_ot' | 'priority_no_ot' | 'interweek_no_ot' | 'batch_no_ot'
    | 'daily_smart' | 'weekly_smart' | 'fastest_smart'
    | 'deadline_smart' | 'priority_smart' | 'interweek_smart' | 'batch_smart'
    | 'daily_full' | 'weekly_full' | 'fastest_full'
    | 'deadline_full' | 'priority_full' | 'interweek_full' | 'batch_full'
  const [balanceMode, setBalanceMode] = useState<BalanceMode>('fastest_smart')
  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'pipeline'>('table')
  const [globalRates, setGlobalRates]       = useState<CuttingRate[]>([])
  const [globalTmcRates, setGlobalTmcRates] = useState<CuttingRate[]>([])
  const [globalRateSubTab, setGlobalRateSubTab] = useState<'cut' | 'tmc'>('cut')
  const [machineRateTab, setMachineRateTab]     = useState<number | null>(null)
  const [machineRateSubTab, setMachineRateSubTab] = useState<'cut' | 'tmc'>('cut')
  const [strictWire,   setStrictWire]   = useState(true)
  const [requireDrill, setRequireDrill] = useState(true)
  const [stickyOrders, setStickyOrders] = useState(true)  // true = one machine owns all units of an order
  const isFastest = balanceMode.startsWith('fastest')
  const [lazyOT, setLazyOT] = useState(false)            // true = defer OT to end of week; false = eager (fire from day 1)
  const [interweekThreshold, setInterweekThreshold] = useState(0.5)
  const [useNearestKva, setUseNearestKva] = useState(true)
  const [shiftMode, setShiftMode] = useState<ShiftMode>('none')
  const [shiftNDays, setShiftNDays] = useState(2)
  const [shiftHrsDefault, setShiftHrsDefault] = useState(9)
  const [manualShiftDays, setManualShiftDays] = useState<Map<number, Set<string>>>(new Map())
  const [machineTableOpen, setMachineTableOpen] = useState(false)
  const [globalRatesOpen, setGlobalRatesOpen]   = useState(false)
  const [perMachRatesOpen, setPerMachRatesOpen] = useState(false)
  const [routingCrData, setRoutingCrData]     = useState<RoutingCrRow[]>([])
  const [useRoutingCr, setUseRoutingCr]       = useState(false)
  const [routingWcFilter, setRoutingWcFilter] = useState<string[]>(DEFAULT_CUTTING_WCS)
  const [routingRatesOpen, setRoutingRatesOpen] = useState(false)
  const [expandedRoutingRow, setExpandedRoutingRow] = useState<string | null>(null)

  // Stable string key for manualShiftDays — used in useMemo deps
  const manualShiftKey = useMemo(() =>
    [...manualShiftDays.entries()].sort((a, b) => a[0] - b[0])
      .map(([mid, s]) => `${mid}:${[...s].sort().join(',')}`)
      .join('|')
  , [manualShiftDays])

  const availableRoutingWcs = useMemo(
    () => [...new Set(routingCrData.map(r => r.wc_id))].sort(),
    [routingCrData]
  )

  const { normalRates: routingNormalRates, crRates: routingCrRates } = useMemo(
    () => buildRoutingCrRates(routingCrData, routingWcFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routingCrData, routingWcFilter.join(',')]
  )

  const effectiveGlobalRates    = useRoutingCr && routingNormalRates.length > 0 ? routingNormalRates : globalRates
  const effectiveGlobalTmcRates = useRoutingCr && routingCrRates.length    > 0 ? routingCrRates    : globalTmcRates

  function getTimeDebugTitle(m: CuttingMachine, kva: number, itemCode: string | undefined): string {
    const isCr = itemCode?.[1] === '4'
    const typeLabel = isCr ? 'Cast Resin (CR)' : 'Normal'
    const routingPool = isCr ? routingCrRates : routingNormalRates
    const routingHit  = useRoutingCr ? routingPool.find(r => r.kva === kva) : undefined
    const isFallback  = useRoutingCr && !routingHit

    if (isFallback) {
      const fallbackHrs = getHrsForKva(m, kva, globalRates, itemCode, globalTmcRates, useNearestKva)
      return `⚠ Routing Missing\n${kva.toLocaleString()}kVA · ${typeLabel}\n📊 Manual fallback: ${fallbackHrs.toFixed(2)}h`
    }

    if (!useRoutingCr) {
      const hrs = getHrsForKva(m, kva, globalRates, itemCode, globalTmcRates, useNearestKva)
      return `📊 Manual Table\n${kva.toLocaleString()}kVA · ${typeLabel}\nFinal Hours: ${hrs.toFixed(2)}h`
    }

    // Routing CR hit — show operations
    const ops = getRoutingOps(routingCrData, kva, isCr, routingWcFilter)
    const totalOps = ops.reduce((s, r) => s + Number(r.std_hrs), 0)
    const pad = ops.length ? Math.min(36, Math.max(...ops.map(o => `${o.operation} ${o.description}`.length))) : 0
    let txt = `🏭 Routing CR\n${kva.toLocaleString()}kVA · ${typeLabel}\n`
    if (ops.length > 0) {
      txt += '\n'
      for (const op of ops) {
        const label = `${op.operation} ${op.description}`
        txt += `${label.padEnd(pad)} = ${Number(op.std_hrs).toFixed(2)}h\n`
      }
      txt += `${'─'.repeat(pad + 9)}\n${'Total'.padEnd(pad)} = ${totalOps.toFixed(2)}h`
    } else {
      txt += `Total: ${(routingHit?.hrs ?? 0).toFixed(2)}h`
    }
    return txt
  }

  function toggleManualShift(machineId: number, dStr: string) {
    setManualShiftDays(prev => {
      const next = new Map(prev)
      const set = new Set(next.get(machineId) ?? [])
      if (set.has(dStr)) set.delete(dStr); else set.add(dStr)
      if (set.size === 0) next.delete(machineId); else next.set(machineId, set)
      return next
    })
  }

  useEffect(() => {
    fetch('/api/cutting-rates').then(r => r.json()).then(setGlobalRates).catch(() => {})
    fetch('/api/cutting-tmc-rates').then(r => r.json()).then(setGlobalTmcRates).catch(() => {})
    api.routingCr.list().then(rows => setRoutingCrData(rows as RoutingCrRow[])).catch(() => {})
  }, [])

  async function saveGlobalRates(rates: CuttingRate[]) {
    setGlobalRates(rates)
    await fetch('/api/cutting-rates', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rates) })
  }

  async function saveGlobalTmcRates(rates: CuttingRate[]) {
    setGlobalTmcRates(rates)
    await fetch('/api/cutting-tmc-rates', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rates) })
  }

  async function saveMachineRates(machineId: number, rates: CuttingRate[]) {
    const updated = machines.map(m => m.id === machineId ? { ...m, rates } : m)
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: updated })
    const machine = updated.find(m => m.id === machineId)!
    await api.cuttingMachines.update(machineId, machine)
  }

  async function saveMachineTmcRates(machineId: number, tmc_rates: CuttingRate[]) {
    const updated = machines.map(m => m.id === machineId ? { ...m, tmc_rates } : m)
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: updated })
    const machine = updated.find(m => m.id === machineId)!
    await api.cuttingMachines.update(machineId, machine)
  }

  // ── Plan snapshot ────────────────────────────────────────────
  function expCtx() { return { weekData, machines, products, globalRates: effectiveGlobalRates, globalTmcRates: effectiveGlobalTmcRates, weekLabel, mon, sat, balanceMode, useNearestKva, shiftMode, shiftNDays, shiftHrsDefault, manualShiftDays, useRoutingCr } }
  function exportPlanCSV()      { _exportCSV(expCtx()) }
  function exportTXT()          { _exportTXT(expCtx()) }
  function exportXLSX()         { _exportXLSX(expCtx()) }
  function exportMachineXLSX()  { _exportMachineXLSX(expCtx()) }
  function exportJSON()         { _exportJSON(expCtx()) }
  function exportPrint()        { _exportPrint(expCtx()) }
  function exportMachinePrint() { _exportMachinePrint(expCtx()) }

  async function savePlan(label: string) {
    setPlanSaving(true); setPlanSaveMsg(null)
    try {
      const res = await fetch('/api/cutting-plan-snapshots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start: fmtISO(mon), week_end: fmtISO(sat),
          label: label || weekLabel,
          plan_data: {
            // ── Calculation parameters (inputs) ──────────────
            balanceMode,
            shiftMode,
            shiftNDays,
            shiftHrsDefault,
            manualShiftDays: [...manualShiftDays.entries()].map(([machineId, days]) => ({ machineId, days: [...days] })),
            useRoutingCr,
            cutting_rates: effectiveGlobalRates,   // ⏱ เวลาตัดโลหะตามขนาด
            machines: machines.map(m => ({    // machine config at time of save
              id: m.id, name: m.name, count: m.count,
              min_kva: m.min_kva, max_kva: m.max_kva,
              hrs_per_unit: m.hrs_per_unit,
              laser: m.laser, m4: m.m4,
              min_face_mm: m.min_face_mm, max_face_mm: m.max_face_mm,
              drill_8mm: m.drill_8mm, drill_22mm: m.drill_22mm,
              reg_hrs: m.reg_hrs, ot_hrs: m.ot_hrs,
              off_days: m.off_days ?? [],
              wc_id: m.wc_id ?? '',
            })),
            // ── Calculation output ────────────────────────────
            summary: {
              totalQtyWeek: weekData.totalQtyWeek,
              totalKvaWeek: weekData.totalKvaWeek,
              bottleneckWall: weekData.bottleneckWall,
              totalOT: weekData.totalOT,
              totalShift: weekData.totalShift,
            },
            dayRows: weekData.dayRows.map(r => ({
              dStr: r.dStr,
              dayScheduledQty: r.dayScheduledQty,
              dayKva: r.dayKva,
              dayFinish: r.dayFinish,
              machineCells: r.machineCells.map(mc => ({
                machineId: mc.m.id, machineName: mc.m.name,
                machOff: mc.machOff, wall: mc.wall, capH: mc.capH,
                otHrs: mc.sched?.otHrs ?? 0,
                carriesForward: mc.sched?.carriesForward ?? false,
                work: mc.work.map(w => ({
                  sap_so: w.order.sap_so, customer: w.order.customer,
                  kva: w.order.kva ?? products[w.order.product]?.kva,
                  qty: w.order.qty, hrsWorked: w.hrsWorked,
                  isComplete: w.isComplete, carriesOver: w.carriesOver,
                  isCarryOver: w.isCarryOver,
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

  // ── CRUD ────────────────────────────────────────────────────
  async function handleAdd() {
    const m = { name: 'เครื่องตัด', count: 1, min_kva: 160, max_kva: 2500, hrs_per_unit: 2.5, laser: false, m4: false, min_face_mm: 1, max_face_mm: 9999, drill_8mm: false, drill_22mm: false, notes: '', reg_hrs: 8, ot_hrs: 4, time_mul: 1, tmc_hrs: 0 }
    const saved = await api.cuttingMachines.create(m)
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: [...machines, saved] })
  }

  async function handleDelete(id: number) {
    await api.cuttingMachines.delete(id)
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: machines.filter(m => m.id !== id) })
  }

  async function handleChange(id: number, field: keyof Omit<CuttingMachine, 'id'>, raw: string) {
    const updated = machines.map(m => {
      if (m.id !== id) return m
      const next = { ...m }
      if (field === 'name')         next.name         = raw
      if (field === 'count')        next.count        = Math.max(1, parseInt(raw) || 1)
      if (field === 'min_kva')      next.min_kva      = Math.max(0, parseInt(raw) || 0)
      if (field === 'max_kva')      next.max_kva      = Math.max(0, parseInt(raw) || 0)
      if (field === 'hrs_per_unit') next.hrs_per_unit = Math.max(0.1, parseFloat(raw) || 1)
      if (field === 'reg_hrs')     next.reg_hrs      = Math.max(0.5, parseFloat(raw) || 8)
      if (field === 'ot_hrs')      next.ot_hrs       = Math.max(0,   parseFloat(raw) || 0)
      if (field === 'time_mul')    next.time_mul     = Math.max(0.1, parseFloat(raw) || 1)
      if (field === 'tmc_hrs')     next.tmc_hrs      = Math.max(0,   parseFloat(raw) || 0)
      if (field === 'min_face_mm')  next.min_face_mm  = Math.max(1, parseInt(raw) || 1)
      if (field === 'max_face_mm')  next.max_face_mm  = Math.max(1, parseInt(raw) || 9999)
      if (field === 'notes')        next.notes        = raw
      if (field === 'shift_hrs')   next.shift_hrs    = Math.max(0, parseFloat(raw) || 9)
      return next
    })
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: updated })
    const machine = updated.find(m => m.id === id)!
    setSaving(id)
    await api.cuttingMachines.update(id, machine)
    setSaving(null)
  }

  async function toggleOffDay(id: number, dow: number) {
    const m = machines.find(mc => mc.id === id)!
    const current = m.off_days ?? []
    const next = current.includes(dow) ? current.filter(d => d !== dow) : [...current, dow]
    const updated = machines.map(mc => mc.id === id ? { ...mc, off_days: next } : mc)
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: updated })
    setSaving(id)
    await api.cuttingMachines.update(id, { ...m, off_days: next })
    setSaving(null)
  }

  async function handleToggle(id: number, field: 'laser' | 'm4' | 'drill_8mm' | 'drill_22mm' | 'shift_enabled') {
    const updated = machines.map(m => m.id !== id ? m : { ...m, [field]: !m[field] })
    dispatch({ type: 'SET_CUTTING_MACHINES', machines: updated })
    const machine = updated.find(m => m.id === id)!
    setSaving(id)
    await api.cuttingMachines.update(id, machine)
    setSaving(null)
  }

  // ── Week plan data ───────────────────────────────────────────
  const { mon, sat } = getWeekRange(weekOffset)
  const monStr = fmtISO(mon)
  const satStr = fmtISO(sat)
  const fmtD = fmtDUtil
  const weekLabel = `${fmtD(mon)} – ${fmtD(sat)}/${String(sat.getFullYear() % 100).padStart(2, '0')}`

  const currentWeekOrders = orders.filter(o => o.plan_date && o.plan_date >= monStr && o.plan_date <= satStr)

  const days = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d
  })

  // Machine index map — must be defined before prevCarryOrders
  const machIdx = useMemo(() => {
    const m = new Map<number, number>()
    machines.forEach((mc, i) => m.set(mc.id, i))
    return m
  }, [machines.map(m => m.id).join(',')])  // eslint-disable-line

  // Previous week carry-over: simulate prev week → find orders still in queue at end of Saturday
  const prevCarryOrders = useMemo(() => {
    try {
    if (!includePrevCarry || !machines.length) return [] as Order[]
    const { mon: prevMon, sat: prevSat } = getWeekRange(weekOffset - 1)
    const prevMonStr = fmtISO(prevMon); const prevSatStr = fmtISO(prevSat)
    const prevOrders = orders.filter(o => o.plan_date && o.plan_date >= prevMonStr && o.plan_date <= prevSatStr)
    if (!prevOrders.length) return [] as Order[]
    const prevDays = Array.from({ length: 6 }, (_, i) => { const d = new Date(prevMon); d.setDate(prevMon.getDate() + i); return d })
    // Run same scheduler for previous week
    const prevDailyAsgn = prevDays.map(d => {
      const dStr = fmtISO(d); const dow = d.getDay()
      const active = machines.filter(m => isMachineOn(m, dow))
      const asgn = assignOrders(prevOrders.filter(o => o.plan_date === dStr), active, products, effectiveGlobalRates, new Map(), new Map(machIdx), false, false, effectiveGlobalTmcRates, false, false, useRoutingCr)
      return { dStr, asgn }
    })
    const prevApproach = balanceMode.startsWith('weekly') ? 'weekly' : 'daily'
    const prevOtPolicy = balanceMode.endsWith('_no_ot') ? 'none' : balanceMode.endsWith('_smart') ? 'smart' : 'full'
    const prevSched = scheduleMode(prevOrders, prevDailyAsgn, machines, products, effectiveGlobalRates, wcConfig, prevDays, new Map(machIdx), prevApproach as 'daily'|'weekly', prevOtPolicy as 'none'|'smart'|'full', 'plan_date', [], false, false, true, effectiveGlobalTmcRates, 0.5, false, 'none', 0, 9, new Map(), useRoutingCr)
    // Find orders that were NOT completed (still in machine queues at week end)
    const completedIds = new Set<string>()
    machines.forEach(m => {
      prevDays.forEach(d => {
        prevSched.get(m.id)?.get(fmtISO(d))?.work.forEach(w => { if (w.isComplete) completedIds.add(w.order.id) })
      })
    })
    return prevOrders.filter(o => !completedIds.has(o.id))
    } catch { return [] as Order[] }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includePrevCarry, weekOffset, balanceMode, orders.map(o=>o.id+o.qty).join(','), machines.map(m=>m.id).join(',')])

  const weekOrders = [...prevCarryOrders, ...currentWeekOrders]
  const prevCarryQty = prevCarryOrders.reduce((s, o) => s + o.qty, 0)
  // Next week orders (for interweek mode)
  const { mon: nextMon, sat: nextSat } = getWeekRange(weekOffset + 1)
  const nextWeekOrders = orders.filter(o => o.plan_date && o.plan_date >= fmtISO(nextMon) && o.plan_date <= fmtISO(nextSat))

  // Compute optimal daily assignments
  const dailyAssignments = useMemo(() => {
    // Build bump map: if a day has no active machines, advance orders to the next active day
    const bumpedPlanDate = new Map<string, string>()
    days.forEach((d, di) => {
      const dStr = fmtISO(d)
      const hasActive = machines.some(m => isMachineOn(m, d.getDay()))
      if (hasActive) {
        bumpedPlanDate.set(dStr, dStr)
      } else {
        const next = days.slice(di + 1).find(dd => machines.some(m => isMachineOn(m, dd.getDay())))
        bumpedPlanDate.set(dStr, next ? fmtISO(next) : dStr)
      }
    })
    const cumWall = new Map<number, number>()
    machines.forEach(m => cumWall.set(m.id, 0))
    return days.map(d => {
      const dStr = fmtISO(d)
      const dow = d.getDay()
      // Only assign to machines that are ON today
      const activeMachines = machines.filter(m => isMachineOn(m, dow))
      // Bump orders from off-days: include orders whose effective plan_date lands on today
      const dayOrds = weekOrders.filter(o => (bumpedPlanDate.get(o.plan_date ?? '') ?? o.plan_date) === dStr)
      // stickyOrders=false: expand to individual 1-unit orders so each unit can go to a different machine
      const dayOrdsEff = stickyOrders
        ? dayOrds
        : dayOrds.flatMap(o => Array.from({length: o.qty}, (_, ui) => ({...o, id: `${o.id}__u${ui}`, qty: 1})))
      const initWall = new Map<number, number>()
      const isBatch = balanceMode.includes('batch_kva')
      const asgn = assignOrders(dayOrdsEff, activeMachines, products, effectiveGlobalRates, initWall, new Map(machIdx), strictWire, requireDrill, effectiveGlobalTmcRates, isBatch, useNearestKva, useRoutingCr)
      // Always accumulate for weekly mode reference
      activeMachines.forEach(m => {
        const mOrd = asgn.get(m.id) ?? []
        const w = mOrd.reduce((a, o) => {
          const kva = o.kva ?? products[o.product]?.kva ?? 0
          return a + (o.qty * getHrsForKva(m, kva, effectiveGlobalRates, o.item_code, effectiveGlobalTmcRates, useNearestKva, useRoutingCr)) / (m.count || 1)
        }, 0)
        cumWall.set(m.id, (cumWall.get(m.id) ?? 0) + w)
      })
      return { dStr, asgn }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceMode, strictWire, requireDrill, stickyOrders, effectiveGlobalRates.map(r => `${r.kva}:${r.hrs}`).join(','), effectiveGlobalTmcRates.map(r => `${r.kva}:${r.hrs}`).join(','), weekOrders.map(o => o.id + o.qty).join(','), machines.map(m => `${m.id}${m.count}${m.hrs_per_unit}${m.min_kva}${m.max_kva}${+m.drill_8mm}${+m.drill_22mm}${+m.laser}${+m.m4}${m.time_mul??1}${m.tmc_hrs??0}${(m.off_days??[]).join('-')}`).join(',')])



  // Schedule — algorithm depends on balanceMode
  const weekSchedule = useMemo(() => {
    // ── ❌ ไม่ OT ─────────────────────────────────────────────────
    const mi = new Map(machIdx)
    const sm = (ot: 'none'|'smart'|'full', sort='plan_date') => scheduleMode(weekOrders, dailyAssignments, machines, products, effectiveGlobalRates, wcConfig, days, mi, 'weekly', ot, sort, nextWeekOrders, strictWire, requireDrill, stickyOrders, ot === 'smart' ? lazyOT : true, effectiveGlobalTmcRates, interweekThreshold, useNearestKva, shiftMode, shiftNDays, shiftHrsDefault, manualShiftDays, useRoutingCr)
    const sd = (ot: 'none'|'smart'|'full') => scheduleMode(weekOrders, dailyAssignments, machines, products, effectiveGlobalRates, wcConfig, days, mi, 'daily', ot, 'plan_date', [], strictWire, requireDrill, stickyOrders, ot === 'smart' ? lazyOT : true, effectiveGlobalTmcRates, interweekThreshold, useNearestKva, shiftMode, shiftNDays, shiftHrsDefault, manualShiftDays, useRoutingCr)
    const sf = (ot: 'none'|'smart'|'full') => scheduleFastest(weekOrders, machines, products, effectiveGlobalRates, wcConfig, days, ot, strictWire, requireDrill, stickyOrders, ot === 'smart' ? lazyOT : true, effectiveGlobalTmcRates, useNearestKva, shiftMode, shiftNDays, shiftHrsDefault, manualShiftDays, useRoutingCr)
    const modeMap: Record<string, ()=>Map<number,Map<string,MachineDaySched>>> = {
      daily_no_ot: () => sd('none'),    weekly_no_ot: () => sm('none'),    fastest_no_ot: () => sf('none'),
      deadline_no_ot: () => sm('none','deadline'), priority_no_ot: () => sm('none','priority'),
      interweek_no_ot: () => sm('none','interweek'), batch_no_ot: () => sm('none','batch_kva'),
      daily_smart: () => sd('smart'),   weekly_smart: () => sm('smart'),   fastest_smart: () => sf('smart'),
      deadline_smart: () => sm('smart','deadline'), priority_smart: () => sm('smart','priority'),
      interweek_smart: () => sm('smart','interweek'), batch_smart: () => sm('smart','batch_kva'),
      daily_full: () => sd('full'),     weekly_full: () => sm('full'),     fastest_full: () => sf('full'),
      deadline_full: () => sm('full','deadline'), priority_full: () => sm('full','priority'),
      interweek_full: () => sm('full','interweek'), batch_full: () => sm('full','batch_kva'),
    }
    return (modeMap[balanceMode] ?? modeMap['weekly_no_ot'])()
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [balanceMode, strictWire, requireDrill, stickyOrders, lazyOT, interweekThreshold, useNearestKva, shiftMode, shiftNDays, shiftHrsDefault, manualShiftKey, dailyAssignments, machines.map(m => `${m.id}${m.reg_hrs}${m.ot_hrs}${+m.laser}${+m.m4}${+m.drill_8mm}${+m.drill_22mm}${m.time_mul??1}${m.tmc_hrs??0}${(m.off_days??[]).join('-')}`).join(','), effectiveGlobalRates.map(r=>`${r.kva}:${r.hrs}`).join(','), effectiveGlobalTmcRates.map(r=>`${r.kva}:${r.hrs}`).join(',')])

  // SINGLE SOURCE OF TRUTH — compute everything once from weekSchedule.
  const weekData = useMemo(
    () => computeWeekData({ weekSchedule, weekOrders, machines, days, balanceMode, strictWire, requireDrill, stickyOrders, products, wcConfig, globalRates: effectiveGlobalRates, globalTmcRates: effectiveGlobalTmcRates }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekSchedule, balanceMode, strictWire, requireDrill, weekOrders.map(o=>o.id+o.qty).join(','), machines.map(m=>`${m.id}${(m.off_days??[]).join('-')}`).join(',')]
  )

  const { mTotals, dayRows, bottleneckWall, totalQtyWeek, totalKvaWeek: _totalKvaWeek, totalOT, summaryStatus: _summaryStatus, weekDoneOrders, weekCarryOrders, weekUnscheduled } = weekData

  // Orders that finish later than their due_so — shown as 🔴 in work rows
  const lateOrders = useMemo(() => {
    const late = new Set<string>()
    const lastCompDay = new Map<string, string>() // origOrderId → latest dStr where isComplete=true
    for (const [, machMap] of weekSchedule) {
      for (const [dStr, sched] of machMap) {
        for (const w of sched.work) {
          if (w.isComplete) {
            const oid = origId(w.order.id)
            const cur = lastCompDay.get(oid)
            if (!cur || dStr > cur) lastCompDay.set(oid, dStr)
          }
        }
      }
    }
    // Orders completing this week but after their due_so
    for (const [oid, completedOn] of lastCompDay) {
      const order = weekOrders.find(o => o.id === oid)
      const due = order?.due_so
      if (due && completedOn > due) late.add(oid)
    }
    // Orders NOT completing this week — late if due_so is within or before week end
    const weekEndStr = days.length > 0 ? fmtISO(days[days.length - 1]) : ''
    for (const o of weekCarryOrders) {
      const due = o.due_so
      if (due && weekEndStr && due <= weekEndStr) late.add(origId(o.id))
    }
    return late
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekSchedule, weekOrders, weekCarryOrders, days.map(d => fmtISO(d)).join(',')])

  // Days that actually received shift capacity (any machine shiftHrs > 0)
  const shiftDays = useMemo(() => {
    const set = new Set<string>()
    if (shiftMode === 'none') return set
    for (const [, machMap] of weekSchedule) {
      for (const [dStr, sched] of machMap) {
        if ((sched.shiftHrs ?? 0) > 0.01) set.add(dStr)
      }
    }
    return set
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftMode, weekSchedule])

  // Late order count WITHOUT shift (baseline for comparison panel)
  const baselineLateCount = useMemo(() => {
    if (shiftMode === 'none') return lateOrders.size
    const otPolicy = (balanceMode.endsWith('_no_ot') ? 'none' : balanceMode.endsWith('_smart') ? 'smart' : 'full') as 'none'|'smart'|'full'
    const mi2 = new Map(machIdx)
    let noShiftSched: Map<number, Map<string, MachineDaySched>>
    if (isFastest) {
      noShiftSched = scheduleFastest(weekOrders, machines, products, effectiveGlobalRates, wcConfig, days, otPolicy, strictWire, requireDrill, stickyOrders, otPolicy === 'smart' ? lazyOT : true, effectiveGlobalTmcRates, useNearestKva, 'none', 0, shiftHrsDefault, new Map(), useRoutingCr)
    } else {
      const sortStr = balanceMode.includes('deadline') ? 'deadline' : balanceMode.includes('priority') ? 'priority' : balanceMode.includes('interweek') ? 'interweek' : balanceMode.includes('batch') ? 'batch_kva' : 'plan_date'
      const approach = balanceMode.startsWith('daily') ? 'daily' : 'weekly' as 'daily'|'weekly'
      noShiftSched = scheduleMode(weekOrders, dailyAssignments, machines, products, effectiveGlobalRates, wcConfig, days, mi2, approach, otPolicy, sortStr, nextWeekOrders, strictWire, requireDrill, stickyOrders, otPolicy === 'smart' ? lazyOT : true, effectiveGlobalTmcRates, interweekThreshold, useNearestKva, 'none', 0, shiftHrsDefault, new Map(), useRoutingCr)
    }
    // Count late orders in no-shift schedule
    const late = new Set<string>()
    const lastComp = new Map<string, string>()
    for (const [, machMap] of noShiftSched) {
      for (const [dStr, sched] of machMap) {
        for (const w of sched.work) {
          if (w.isComplete) {
            const oid = origId(w.order.id)
            if (!lastComp.has(oid) || dStr > lastComp.get(oid)!) lastComp.set(oid, dStr)
          }
        }
      }
    }
    for (const [oid, completedOn] of lastComp) {
      const o = weekOrders.find(x => x.id === oid)
      if (o?.due_so && completedOn > o.due_so) late.add(oid)
    }
    const weekEndStr2 = days.length > 0 ? fmtISO(days[days.length - 1]) : ''
    for (const o of weekOrders) {
      const due = o.due_so
      if (due && weekEndStr2 && due <= weekEndStr2 && !lastComp.has(origId(o.id))) late.add(origId(o.id))
    }
    return late.size
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftMode, shiftHrsDefault, manualShiftKey, weekSchedule, weekOrders, days.map(d => fmtISO(d)).join(',')])

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className={styles.root}>

      {/* ── Weekly plan ──────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.sectionTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            แผนการตัดโลหะ — สัปดาห์
            {totalQtyWeek > 0 && (
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt2)' }}>
                {totalQtyWeek} ตัว
                {weekCarryOrders.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)', marginLeft: 4 }}>
                    (⏭ {weekCarryOrders.reduce((s,o)=>s+o.qty,0)} ค้าง)
                  </span>
                )}
              </span>
            )}
            {lateOrders.size > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', background: 'rgba(224,90,78,.12)', padding: '2px 8px', borderRadius: 8, border: '1px solid rgba(224,90,78,.3)' }}>
                🔴 {lateOrders.size} ออเดอร์ส่งช้า
              </span>
            )}
          </span>
          {(() => {
            const otPol = balanceMode.endsWith('_no_ot') ? 'no_ot' : balanceMode.endsWith('_smart') ? 'smart' : 'full'
            const schedKey = balanceMode.replace(/_(?:no_ot|smart|full)$/, '')
            const otOptions = [
              { id: 'no_ot', label: '❌ ไม่ OT',      col: 'var(--green)' },
              { id: 'smart', label: '⚠️ เมื่อจำเป็น', col: 'var(--amber)' },
              { id: 'full',  label: '🔥 OT เสมอ',     col: 'var(--red)'   },
            ] as const
            const schedOptions = [
              { id: 'daily',     label: '📅 รายวัน' },
              { id: 'weekly',    label: '🗓 รายสัปดาห์' },
              { id: 'fastest',   label: '🏎 เร็วสุด' },
              { id: 'deadline',  label: '📅 วันส่งก่อน' },
              { id: 'priority',  label: '⭐ ความสำคัญ' },
              { id: 'interweek', label: '🔮 สัปดาห์หน้า' },
              { id: 'batch',     label: '🔗 Batch kVA' },
            ] as const
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginLeft: 12 }}>
                {/* Row 1: View mode + OT policy */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--txt3)' }}>มุมมอง:</span>
                  {(['cards', 'table', 'pipeline'] as const).map(v => (
                    <button key={v} onClick={() => setViewMode(v)} style={{
                      fontSize: 10, padding: '3px 10px', borderRadius: 12, border: '1px solid var(--bord2)', cursor: 'pointer',
                      background: viewMode === v ? 'var(--blue)' : 'var(--bg3)',
                      color: viewMode === v ? '#000' : 'var(--txt2)', fontWeight: viewMode === v ? 700 : 400,
                    }}>
                      {v === 'cards' ? '📋 รายวัน' : v === 'table' ? '📊 ตาราง' : '🔄 Pipeline'}
                    </button>
                  ))}
                  {([
                    { id: 'order',   label: '📦 ต่อออเดอร์',    col: 'var(--green)',  title: 'รวม segment, ซ่อนค้างจากเมื่อวาน' },
                    { id: 'carry',   label: '↩ ต่อเนื่อง',      col: 'var(--blue)',   title: 'รวม segment แต่แสดงค้างต่อเนื่อง' },
                    { id: 'segment', label: '📋 ต่อเซ็กเมนต์',  col: 'var(--amber)',  title: 'แสดงทุก segment รวมค้าง' },
                    { id: 'unit',    label: '🔩 ต่อหน่วย',      col: 'var(--purple)', title: 'แต่ละ transformer แยกแถว' },
                  ] as const).map(w => (
                    <button key={w.id} onClick={() => setWorkDisplay(w.id)} title={w.title}
                      style={{ fontSize: 10, padding: '3px 10px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
                        border: `1px solid ${workDisplay === w.id ? w.col : 'var(--bord2)'}`,
                        background: workDisplay === w.id ? w.col + '22' : 'var(--bg3)',
                        color: workDisplay === w.id ? w.col : 'var(--txt2)',
                        fontWeight: workDisplay === w.id ? 700 : 400,
                      }}>
                      {w.label}
                    </button>
                  ))}
                  <span style={{ width: 1, height: 16, background: 'var(--bord2)', margin: '0 6px', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'var(--txt3)' }}>OT:</span>
                  {otOptions.map(ot => (
                    <button key={ot.id} onClick={() => setBalanceMode(`${schedKey}_${ot.id}` as typeof balanceMode)} style={{
                      fontSize: 10, padding: '3px 10px', borderRadius: 8,
                      border: `1px solid ${otPol === ot.id ? ot.col : 'var(--bord2)'}`,
                      background: otPol === ot.id ? ot.col + '22' : 'var(--bg3)',
                      color: otPol === ot.id ? ot.col : 'var(--txt2)',
                      fontWeight: otPol === ot.id ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>
                      {ot.label}
                    </button>
                  ))}
                  <span style={{ width: 1, height: 16, background: 'var(--bord2)', margin: '0 2px', flexShrink: 0 }} />
                  {([
                    { v: true,  label: '🌅 ท้ายสัปดาห์', title: 'OT ท้ายสัปดาห์ — เต็มวันปกติก่อน ค่อยเพิ่ม OT เมื่อจำเป็น' },
                    { v: false, label: '⚡ ต้นสัปดาห์',   title: 'OT ทันที — เพิ่ม OT ตั้งแต่วันแรกถ้า queue เกิน reg' },
                  ] as const).map(({ v, label, title }) => (
                    <button key={String(v)} title={title} onClick={() => setLazyOT(v)} style={{
                      fontSize: 10, padding: '3px 10px', borderRadius: 8,
                      border: `1px solid ${lazyOT === v ? 'var(--amber)' : 'var(--bord2)'}`,
                      background: lazyOT === v ? 'rgba(249,226,175,.25)' : 'var(--bg3)',
                      color: lazyOT === v ? 'var(--amber)' : 'var(--txt2)',
                      fontWeight: lazyOT === v ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>
                      {label}
                    </button>
                  ))}
                </div>
                {/* Row 2: Schedule mode */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--txt3)', minWidth: 40 }}>แผน:</span>
                  {schedOptions.map(s => (
                    <button key={s.id} onClick={() => setBalanceMode(`${s.id}_${otPol}` as typeof balanceMode)} style={{
                      fontSize: 10, padding: '3px 10px', borderRadius: 8,
                      border: `1px solid ${schedKey === s.id ? 'var(--blue)' : 'var(--bord2)'}`,
                      background: schedKey === s.id ? 'rgba(137,180,250,.18)' : 'var(--bg3)',
                      color: schedKey === s.id ? 'var(--blue)' : 'var(--txt2)',
                      fontWeight: schedKey === s.id ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>
                      {s.label}
                    </button>
                  ))}
                  {schedKey === 'interweek' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--txt3)', marginLeft: 4 }}>
                      threshold:
                      <input
                        type="number" min={0.1} max={5} step={0.1}
                        value={interweekThreshold}
                        onChange={e => setInterweekThreshold(Math.max(0.01, parseFloat(e.target.value) || 0.5))}
                        style={{ width: 48, fontSize: 10, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--bord2)', background: 'var(--bg2)', color: 'var(--txt1)', textAlign: 'center' }}
                      />
                    </label>
                  )}
                  <span style={{ width: 1, height: 16, background: 'var(--bord2)', margin: '0 4px', flexShrink: 0 }} />
                  <button
                    onClick={() => setUseNearestKva(v => !v)}
                    title={useNearestKva
                      ? 'KVA ใกล้เคียง: ใช้ค่าที่ใกล้ที่สุดเมื่อไม่มีค่าตรง'
                      : 'KVA ตรงเท่านั้น: ใช้ hrs_per_unit เมื่อไม่มีค่าตรง'}
                    style={{ fontSize: 10, padding: '3px 10px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
                      border: `1px solid ${useNearestKva ? 'var(--purple)' : 'var(--bord2)'}`,
                      background: useNearestKva ? 'rgba(203,166,247,.2)' : 'var(--bg3)',
                      color: useNearestKva ? 'var(--purple)' : 'var(--txt2)',
                      fontWeight: useNearestKva ? 700 : 400 }}>
                    🎯 KVA {useNearestKva ? 'ใกล้เคียง' : 'ตรงเท่านั้น'}
                  </button>
                </div>
                {/* Row 3: Shift mode */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, color: 'var(--txt3)', minWidth: 40 }}>กะ:</span>
                  {([
                    { id: 'none',   label: '❌ ไม่มีกะ',   col: 'var(--txt3)',   title: 'ไม่ใช้กะกลางคืน' },
                    { id: 'smart',  label: '⚠ Smart',      col: 'var(--amber)',  title: 'เปิดกะเมื่องานล้น reg+OT ของสัปดาห์ที่เหลือ' },
                    { id: 'every',  label: '🌙 ทุกวัน',    col: 'var(--blue)',   title: 'เพิ่มกะกลางคืนทุกวัน' },
                    { id: 'n_days', label: '📅 N วัน',     col: 'var(--purple)', title: 'เลือก N วันที่ต้องการกะมากที่สุด (auto-select busiest)' },
                    { id: 'manual', label: '🗓 กำหนดเอง',  col: 'var(--green)',  title: 'เลือกเครื่อง+วันที่ต้องการกะด้วยตัวเอง' },
                  ] as const).map(s => (
                    <button key={s.id} onClick={() => setShiftMode(s.id)} title={s.title} style={{
                      fontSize: 10, padding: '3px 10px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
                      border: `1px solid ${shiftMode === s.id ? s.col : 'var(--bord2)'}`,
                      background: shiftMode === s.id ? s.col + '22' : 'var(--bg3)',
                      color: shiftMode === s.id ? s.col : 'var(--txt2)',
                      fontWeight: shiftMode === s.id ? 700 : 400,
                    }}>
                      {s.label}
                    </button>
                  ))}
                  {shiftMode === 'n_days' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--txt3)', marginLeft: 4 }}>
                      จำนวนวัน:
                      <input type="number" min={1} max={6} step={1} value={shiftNDays}
                        onChange={e => setShiftNDays(Math.max(1, Math.min(6, parseInt(e.target.value) || 2)))}
                        style={{ width: 44, fontSize: 10, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--bord2)', background: 'var(--bg2)', color: 'var(--txt1)', textAlign: 'center' }} />
                    </label>
                  )}
                  {shiftMode !== 'none' && (
                    <>
                      <span style={{ width: 1, height: 16, background: 'var(--bord2)', margin: '0 4px', flexShrink: 0 }} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--txt3)' }}
                        title="ชั่วโมงกะ/คืน (default ถ้าไม่ได้ตั้งค่า per-machine)">
                        🌙 ชม:
                        <input type="number" min={1} max={24} step={0.5} value={shiftHrsDefault}
                          onChange={e => setShiftHrsDefault(Math.max(1, parseFloat(e.target.value) || 9))}
                          style={{ width: 48, fontSize: 10, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--bord2)', background: 'var(--bg2)', color: 'var(--blue)', fontWeight: 700, textAlign: 'center' }} />
                        h
                      </label>
                    </>
                  )}
                </div>
                {/* Shift info panel — shown when auto shift is active (not manual, which uses the full grid) */}
                {shiftMode !== 'none' && shiftMode !== 'manual' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: 'rgba(137,180,250,.07)', border: '1px solid rgba(137,180,250,.2)', borderRadius: 8, flexWrap: 'wrap', fontSize: 10 }}>
                    <span style={{ color: 'var(--blue)', fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.04em' }}>🌙 กะที่ใช้:</span>
                    {days.map(d => {
                      const dStr = fmtISO(d)
                      const hasShift = shiftDays.has(dStr)
                      return (
                        <span key={dStr} style={{
                          padding: '2px 7px', borderRadius: 6, fontWeight: hasShift ? 700 : 400,
                          background: hasShift ? 'rgba(137,180,250,.25)' : 'var(--bg3)',
                          color: hasShift ? 'var(--blue)' : 'var(--txt3)',
                          border: `1px solid ${hasShift ? 'rgba(137,180,250,.5)' : 'var(--bord2)'}`,
                          fontSize: 9,
                        }}>
                          {DAY_SHORT[d.getDay()]} {String(d.getDate()).padStart(2,'0')}/{String(d.getMonth()+1).padStart(2,'0')}
                          {hasShift ? ' 🌙' : ''}
                        </span>
                      )
                    })}
                    <span style={{ width: 1, height: 16, background: 'var(--bord2)', flexShrink: 0 }} />
                    {weekData.totalShift >= 0.05 ? (
                      <span style={{ color: 'var(--blue)', fontWeight: 700 }}>+{weekData.totalShift.toFixed(1)}h/สัปดาห์</span>
                    ) : (
                      <span style={{ color: 'var(--txt3)' }}>+0h (ไม่มีงานล้น)</span>
                    )}
                    {lateOrders.size !== baselineLateCount && (
                      <>
                        <span style={{ width: 1, height: 16, background: 'var(--bord2)', flexShrink: 0 }} />
                        <span style={{ color: 'var(--txt3)', fontSize: 9 }}>🔴 ส่งช้า:</span>
                        <span style={{ fontWeight: 700, color: baselineLateCount > lateOrders.size ? 'var(--green)' : 'var(--red)' }}>
                          {baselineLateCount} → {lateOrders.size}
                          {baselineLateCount > lateOrders.size
                            ? ` (−${baselineLateCount - lateOrders.size} ดีขึ้น)`
                            : ` (+${lateOrders.size - baselineLateCount})`}
                        </span>
                      </>
                    )}
                    {lateOrders.size === baselineLateCount && weekData.totalShift >= 0.05 && (
                      <>
                        <span style={{ width: 1, height: 16, background: 'var(--bord2)', flexShrink: 0 }} />
                        <span style={{ color: 'var(--txt3)', fontSize: 9 }}>🔴 ส่งช้า: {lateOrders.size} (ไม่เปลี่ยน)</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })()}
          <div className={styles.weekNav}>
            <button className={styles.btn} onClick={() => setWeekOffset(w => w - 1)}>‹ ก่อนหน้า</button>
            <span className={styles.weekLabel}>{weekLabel}</span>
            <button className={styles.btn} onClick={() => setWeekOffset(w => w + 1)}>ถัดไป ›</button>
            {weekOffset !== 0 && (
              <button className={styles.btnGhost} onClick={() => setWeekOffset(0)}>สัปดาห์นี้</button>
            )}
          </div>
        </div>

        {/* ── Manual shift selection grid ──────────────────── */}
        {shiftMode === 'manual' && (
          <div style={{ padding: '8px 16px', background: 'rgba(166,227,161,.04)', borderBottom: '1px solid var(--bord)', overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>🗓 เลือกเครื่อง + วันที่เปิดกะกลางคืน</span>
              <span style={{ fontSize: 10, color: 'var(--txt3)' }}>คลิก checkbox เพื่อเพิ่ม/ลบกะในเครื่องและวันนั้น</span>
              {weekData.totalShift >= 0.05 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', background: 'rgba(137,180,250,.12)', padding: '2px 8px', borderRadius: 8 }}>
                  +{weekData.totalShift.toFixed(1)}h/สัปดาห์
                </span>
              )}
              {lateOrders.size !== baselineLateCount && (
                <span style={{ fontSize: 10, fontWeight: 700, color: baselineLateCount > lateOrders.size ? 'var(--green)' : 'var(--red)', background: baselineLateCount > lateOrders.size ? 'rgba(166,227,161,.15)' : 'rgba(224,90,78,.08)', padding: '2px 8px', borderRadius: 8 }}>
                  🔴 ส่งช้า {baselineLateCount} → {lateOrders.size}
                  {baselineLateCount > lateOrders.size ? ` (−${baselineLateCount - lateOrders.size} ดีขึ้น)` : ` (+${lateOrders.size - baselineLateCount})`}
                </span>
              )}
              <button
                onClick={() => setManualShiftDays(new Map())}
                style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt3)', cursor: 'pointer', marginLeft: 'auto' }}>
                ล้างทั้งหมด
              </button>
            </div>
            <table style={{ borderCollapse: 'collapse', fontSize: 10, width: 'auto' }}>
              <thead>
                <tr>
                  <th style={{ padding: '3px 10px', textAlign: 'left', color: 'var(--txt3)', fontWeight: 600, minWidth: 120, borderBottom: '1px solid var(--bord)' }}>เครื่อง</th>
                  {days.map(d => (
                    <th key={fmtISO(d)} style={{ padding: '3px 10px', textAlign: 'center', borderBottom: '1px solid var(--bord)', minWidth: 54 }}>
                      <div style={{ color: d.getDay() === 6 ? 'var(--amber)' : 'var(--txt2)', fontWeight: 600 }}>{DAY_SHORT[d.getDay()]}</div>
                      <div style={{ color: 'var(--txt3)', fontSize: 9 }}>{String(d.getDate()).padStart(2,'0')}/{String(d.getMonth()+1).padStart(2,'0')}</div>
                    </th>
                  ))}
                  <th style={{ padding: '3px 10px', textAlign: 'right', color: 'var(--blue)', fontWeight: 600, borderBottom: '1px solid var(--bord)', whiteSpace: 'nowrap' }}>+h/สัปดาห์</th>
                </tr>
              </thead>
              <tbody>
                {machines.map((m, mi2) => {
                  const machShiftHrs = resolveShift(m, shiftHrsDefault)
                  const machShiftSet = manualShiftDays.get(m.id)
                  const selectedDays = days.filter(d => machShiftSet?.has(fmtISO(d)) && isMachineOn(m, d.getDay()))
                  const totalAddedH = selectedDays.length * machShiftHrs * (m.count || 1)
                  const t = mTotals[mi2]
                  return (
                    <tr key={m.id} style={{ background: mi2 % 2 === 0 ? 'transparent' : 'rgba(127,127,127,.03)' }}>
                      <td style={{ padding: '4px 10px', fontWeight: 600, color: 'var(--txt)', borderBottom: '0.5px solid var(--bord)', whiteSpace: 'nowrap' }}>
                        <div>{mLabel(m)}</div>
                        {!(m.shift_enabled ?? true) && <div style={{ fontSize: 8, color: 'var(--red)' }}>🌑 กะปิด</div>}
                        {(m.shift_enabled ?? true) && <div style={{ fontSize: 8, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>{machShiftHrs}h/คืน · {t.wallHrs.toFixed(1)}h ทั้งสัปดาห์</div>}
                      </td>
                      {days.map(d => {
                        const dStr = fmtISO(d)
                        const machOff = !isMachineOn(m, d.getDay())
                        const shiftOff = !(m.shift_enabled ?? true)
                        const checked = machShiftSet?.has(dStr) ?? false
                        const dayWall = weekSchedule.get(m.id)?.get(dStr)
                        const wallH = dayWall ? (dayWall.regHrs + dayWall.otHrs) : 0
                        const capH = resolveHours(m, wcConfig, d.getDay() === 6, d.getDay()).reg
                        return (
                          <td key={dStr} style={{ padding: '4px 6px', textAlign: 'center', borderBottom: '0.5px solid var(--bord)', borderLeft: '0.5px solid var(--bord)' }}>
                            {machOff || shiftOff ? (
                              <span title={machOff ? 'เครื่องปิดวันนี้' : 'กะปิด (shift_enabled=false)'} style={{ color: 'var(--txt3)', fontSize: 8, opacity: 0.5 }}>—</span>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <input type="checkbox" checked={checked} onChange={() => toggleManualShift(m.id, dStr)}
                                  style={{ cursor: 'pointer', accentColor: 'var(--green)', width: 14, height: 14 }} />
                                {wallH > 0 && (
                                  <div title={`งาน ${wallH.toFixed(1)}h / ปกติ ${capH}h`} style={{ fontSize: 7, fontFamily: 'var(--mono)', color: wallH > capH ? 'var(--amber)' : 'var(--txt3)' }}>
                                    {wallH.toFixed(1)}h
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        )
                      })}
                      <td style={{ padding: '4px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: totalAddedH > 0 ? 700 : 400, color: totalAddedH > 0 ? 'var(--blue)' : 'var(--txt3)', borderBottom: '0.5px solid var(--bord)', borderLeft: '1px solid var(--bord)', whiteSpace: 'nowrap' }}>
                        {totalAddedH > 0 ? `+${totalAddedH.toFixed(1)}h` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Carry-over + save bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--bord)', flexShrink: 0 }}>
          {/* Wire data toggle */}
          <button onClick={() => setShowWireData(v => !v)}
            title="แสดง Raw Mat / LV / HV ในแต่ละ order"
            style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, border: `1px solid ${showWireData ? 'rgba(137,180,250,.5)' : 'var(--bord2)'}`, background: showWireData ? 'rgba(137,180,250,.15)' : 'var(--bg3)', color: showWireData ? 'var(--blue)' : 'var(--txt3)', cursor: 'pointer', fontWeight: showWireData ? 700 : 400 }}>
            📐 Wire Data
          </button>
          {/* Wire Match toggle */}
          <button onClick={() => setStrictWire(v => !v)}
            title={strictWire ? 'Wire Match ON: LS→laser machine, M-4→M4 machine (click to disable)' : 'Wire Match OFF: soft preference only (click to enable strict matching)'}
            style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, border: `1px solid ${strictWire ? 'rgba(250,179,135,.6)' : 'var(--bord2)'}`, background: strictWire ? 'rgba(250,179,135,.15)' : 'var(--bg3)', color: strictWire ? 'var(--amber)' : 'var(--txt3)', cursor: 'pointer', fontWeight: strictWire ? 700 : 400 }}>
            {strictWire ? '🔒 Wire Match' : '🔓 Wire Match'}
          </button>
          {/* Drill required toggle */}
          <button onClick={() => setRequireDrill(v => !v)}
            title={requireDrill ? 'เจาะ ≥315kVA ON: งาน ≥315kVA ต้องใช้เครื่องที่มีสว่านเจาะ (click to disable)' : 'เจาะ ≥315kVA OFF: ไม่บังคับ (click to enable)'}
            style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, border: `1px solid ${requireDrill ? 'rgba(166,227,161,.6)' : 'var(--bord2)'}`, background: requireDrill ? 'rgba(166,227,161,.12)' : 'var(--bg3)', color: requireDrill ? 'var(--green)' : 'var(--txt3)', cursor: 'pointer', fontWeight: requireDrill ? 700 : 400 }}>
            {requireDrill ? '🔩 เจาะ ≥315kVA' : '🔩 เจาะ ≥315kVA'}
          </button>
          {/* Sticky orders toggle */}
          <button onClick={() => setStickyOrders(v => !v)}
            title={stickyOrders ? 'ครบต่อเครื่อง ON: เมื่อเครื่องเริ่มออเดอร์ใด จะตัดจนครบทุกตัวก่อนเปลี่ยน (click to allow split)' : 'แยกเครื่องได้: เครื่องหลายตัวช่วยกันตัดออเดอร์เดียวกันได้ (click to enforce sticky)'}
            style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, border: `1px solid ${stickyOrders ? 'rgba(203,166,247,.6)' : 'var(--bord2)'}`, background: stickyOrders ? 'rgba(203,166,247,.15)' : 'var(--bg3)', color: stickyOrders ? 'var(--purple)' : 'var(--txt3)', cursor: 'pointer', fontWeight: stickyOrders ? 700 : 400 }}>
            {stickyOrders ? '🔗 ครบต่อเครื่อง' : '🔀 แยกเครื่องได้'}
          </button>
          {/* Toggle carry-over from prev week */}
          <button onClick={() => setIncludePrevCarry(v => !v)}
            title="นำงานที่ค้างจากสัปดาห์ที่แล้วมาคำนวณด้วย"
            style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, border: `1px solid ${includePrevCarry ? 'rgba(137,180,250,.5)' : 'var(--bord2)'}`, background: includePrevCarry ? 'rgba(137,180,250,.15)' : 'var(--bg3)', color: includePrevCarry ? 'var(--blue)' : 'var(--txt3)', cursor: 'pointer', fontWeight: includePrevCarry ? 700 : 400 }}>
            ↩ รวมงานค้างสัปดาห์ก่อน
          </button>
          {includePrevCarry && prevCarryQty > 0 && (
            <span style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 600 }}>+{prevCarryQty} ตัว ยกมา</span>
          )}
          {includePrevCarry && prevCarryQty === 0 && (
            <span style={{ fontSize: 10, color: 'var(--green)' }}>✓ สัปดาห์ก่อนเสร็จทุก order</span>
          )}
          <div style={{ width: 1, height: 20, background: 'var(--bord2)' }} />
          <button onClick={() => savePlan('')} disabled={planSaving || weekOrders.length === 0}
            style={{ fontSize: 11, padding: '5px 14px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#000', fontWeight: 700, cursor: 'pointer', opacity: (planSaving || weekOrders.length === 0) ? 0.5 : 1 }}>
            {planSaving ? 'กำลังบันทึก…' : '💾 บันทึกแผน'}
          </button>
          {/* Export dropdown */}
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button disabled={weekOrders.length === 0}
              onClick={e => { const m = (e.currentTarget.nextSibling as HTMLElement); m.style.display = m.style.display === 'block' ? 'none' : 'block' }}
              style={{ fontSize: 11, padding: '5px 14px', borderRadius: 8, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt2)', fontWeight: 600, cursor: 'pointer', opacity: weekOrders.length === 0 ? 0.5 : 1 }}>
              📤 Export ▾
            </button>
            <div style={{ display: 'none', position: 'absolute', top: '100%', left: 0, zIndex: 100, background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.3)', minWidth: 160, padding: 4, marginTop: 2 }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.display = 'none' }}>
              {[
                { label: '📄 CSV', fn: exportPlanCSV, desc: 'Spreadsheet rows' },
                { label: '📊 Excel (.xlsx)', fn: exportXLSX, desc: 'ต่อวัน — formatted workbook' },
                { label: '📊 Excel ต่อเครื่อง', fn: exportMachineXLSX, desc: 'แต่ละเครื่อง = 1 sheet' },
                { label: '📝 Text (.txt)', fn: exportTXT, desc: 'Plain text summary' },
                { label: '🖨 Print / PDF', fn: exportPrint, desc: 'Print ต่อวัน' },
                { label: '🖨 Print ต่อเครื่อง', fn: exportMachinePrint, desc: 'บัตรงานต่อเครื่อง' },
                { label: '{ } JSON', fn: exportJSON, desc: 'Raw data' },
              ].map(({ label, fn, desc }) => (
                <button key={label} onClick={() => { fn(); (document.activeElement as HTMLElement)?.blur() }}
                  style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderRadius: 6, color: 'var(--txt)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg3)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
                  <span style={{ fontSize: 9, color: 'var(--txt3)' }}>{desc}</span>
                </button>
              ))}
            </div>
          </div>
          <button onClick={loadSnapshots}
            style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt2)', cursor: 'pointer' }}>
            📋 ดูแผนที่บันทึก
          </button>
          {planSaveMsg && <span style={{ fontSize: 10, color: planSaveMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>{planSaveMsg}</span>}
          <span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 'auto' }}>บันทึกแผนเพื่อดูย้อนหลัง — รวมค่า machine config + rates + schedule output</span>
        </div>

        {/* Saved plans panel */}
        {showSnapshots && (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--bord)', background: 'var(--bg2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 12 }}>📋 แผนที่บันทึกไว้</span>
              <button onClick={() => setShowSnapshots(false)} style={{ fontSize: 11, marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)' }}>✕ ปิด</button>
            </div>
            {snapshots.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--txt3)' }}>ยังไม่มีแผนที่บันทึก</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {snapshots.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', background: 'var(--bg3)', borderRadius: 6, border: '1px solid var(--bord)', fontSize: 11 }}>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)', fontWeight: 700 }}>{s.week_start} – {s.week_end}</span>
                    <span style={{ color: 'var(--txt2)' }}>{s.label}</span>
                    <span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 'auto' }}>{new Date(s.saved_at).toLocaleString('th-TH')}</span>
                    <button onClick={() => viewSnapshot(s.id)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, border: '1px solid rgba(137,180,250,.3)', background: 'rgba(137,180,250,.1)', color: 'var(--blue)', cursor: 'pointer' }}>ดู</button>
                    <button onClick={() => deleteSnapshot(s.id)} style={{ fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '0 4px' }}>🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Saved plan viewer */}
        {viewSnap && (() => {
          const snap = viewSnap as Record<string, unknown>
          type SavedCell = { machineId: number; machineName: string; machOff: boolean; wall: number; capH: number; otHrs: number; carriesForward: boolean; work: {sap_so:string;customer:string;kva:number;qty:number;hrsWorked:number;isComplete:boolean;carriesOver:boolean}[] }
          type SavedDay = { dStr: string; dayScheduledQty: number; dayKva: number; dayFinish: number; machineCells: SavedCell[] }
          type SavedMachine = { id: number; name: string; count: number; min_kva: number; max_kva: number; hrs_per_unit: number; laser: boolean; m4: boolean; min_face_mm: number; max_face_mm: number; drill_8mm: boolean; drill_22mm: boolean; reg_hrs: number; ot_hrs: number; off_days: number[]; wc_id: string }
          type SavedRate = { kva: number; hrs: number }
          const snapMachines = snap.machines as SavedMachine[]
          const snapRates = snap.cutting_rates as SavedRate[]
          const snapDays = snap.dayRows as SavedDay[]
          const snapSummary = snap.summary as { totalQtyWeek: number; totalKvaWeek: number; bottleneckWall: number; totalOT: number }
          const snapBalance = snap.balanceMode as string
          const modeLabel = snapBalance === 'pull' ? '⏩ เติมเต็ม' : snapBalance === 'smart' ? '⚡ Smart OT' : snapBalance === 'weekly' ? '📆 สัปดาห์' : '📅 รายวัน'
          return (
            <div style={{ border: '2px solid var(--blue)', borderRadius: 10, margin: '0 0 12px', overflow: 'hidden' }}>
              {/* Viewer header */}
              <div style={{ background: 'rgba(137,180,250,.1)', padding: '10px 16px', borderBottom: '1px solid var(--bord)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--blue)' }}>📋 {String(snap._label || snap._week)}</span>
                <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{String(snap._week)}</span>
                <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, background: 'rgba(137,180,250,.2)', color: 'var(--blue)' }}>{modeLabel}</span>
                <span style={{ fontSize: 10, color: 'var(--txt3)', marginLeft: 'auto' }}>บันทึก: {String(snap._saved_at || '').slice(0,16)}</span>
                <button onClick={() => setViewSnap(null)} style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', marginLeft: 8 }}>✕ ปิด</button>
              </div>

              {/* Calculation inputs */}
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--bord)', background: 'var(--bg2)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>พารามิเตอร์ที่ใช้คำนวณ</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {/* Machines */}
                  <div style={{ flex: '2 1 400px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>เครื่องตัด</div>
                    <table style={{ borderCollapse: 'collapse', fontSize: 9, width: '100%' }}>
                      <thead><tr style={{ background: 'var(--bg3)' }}>
                        {['เครื่อง','จำนวน','kVA','h/ตัว','Laser','M4','8mm','22mm','Reg h','OT h','วันปิด'].map(h => (
                          <th key={h} style={{ padding: '3px 5px', textAlign: 'center', color: 'var(--txt3)', borderBottom: '1px solid var(--bord)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {snapMachines?.map(m => (
                          <tr key={m.id}>
                            <td style={{ padding: '2px 5px', fontWeight: 700 }}>{mLabel(m)}</td>
                            <td style={{ padding: '2px 5px', textAlign: 'center' }}>{m.count}</td>
                            <td style={{ padding: '2px 5px', fontFamily: 'var(--mono)', fontSize: 8 }}>{m.min_kva}–{m.max_kva >= 9999 ? '∞' : m.max_kva}</td>
                            <td style={{ padding: '2px 5px', textAlign: 'center', color: 'var(--amber)', fontFamily: 'var(--mono)' }}>{m.hrs_per_unit}</td>
                            <td style={{ padding: '2px 5px', textAlign: 'center' }}>{m.laser ? '✅' : '❌'}</td>
                            <td style={{ padding: '2px 5px', textAlign: 'center' }}>{m.m4 ? '✅' : '❌'}</td>
                            <td style={{ padding: '2px 5px', textAlign: 'center' }}>{m.drill_8mm ? '✅' : '❌'}</td>
                            <td style={{ padding: '2px 5px', textAlign: 'center' }}>{m.drill_22mm ? '✅' : '❌'}</td>
                            <td style={{ padding: '2px 5px', textAlign: 'center', color: 'var(--green)', fontFamily: 'var(--mono)' }}>{m.reg_hrs}h</td>
                            <td style={{ padding: '2px 5px', textAlign: 'center', color: 'var(--amber)', fontFamily: 'var(--mono)' }}>{m.ot_hrs}h</td>
                            <td style={{ padding: '2px 5px', textAlign: 'center', color: m.off_days?.length ? 'var(--red)' : 'var(--txt3)', fontSize: 8 }}>
                              {m.off_days?.length ? m.off_days.map(d => DAY_SHORT[d]).join(' ') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Rates */}
                  <div style={{ flex: '1 1 150px', minWidth: 120 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>⏱ เวลาตัดตามขนาด</div>
                    {!snapRates?.length ? <div style={{ fontSize: 9, color: 'var(--txt3)' }}>ใช้ h/ตัว default</div> : snapRates.map((r, i) => (
                      <div key={i} style={{ fontSize: 9, fontFamily: 'var(--mono)' }}>
                        <span style={{ color: 'var(--blue)' }}>{r.kva.toLocaleString()}kVA</span> → <span style={{ color: 'var(--amber)' }}>{r.hrs}h</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Output: day plan */}
              <div style={{ padding: '10px 16px' }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap', fontSize: 10 }}>
                  <span style={{ fontWeight: 700 }}>ผลการคำนวณ</span>
                  <span style={{ color: 'var(--txt3)' }}>{snapSummary?.totalQtyWeek} ตัว · {snapSummary?.totalKvaWeek?.toLocaleString()} kVA</span>
                  {(snapSummary?.totalOT ?? 0) > 0 && <span style={{ color: 'var(--amber)' }}>⚠ OT {snapSummary.totalOT.toFixed(1)}h</span>}
                  <span style={{ color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>เสร็จสุด {snapSummary?.bottleneckWall?.toFixed(1)}h</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {snapDays?.map(r => {
                    const dt = new Date(r.dStr + 'T00:00:00')
                    return (
                      <div key={r.dStr} style={{ border: '1px solid var(--bord)', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: 'var(--bg2)', borderBottom: '1px solid var(--bord)', fontSize: 10 }}>
                          <span style={{ fontWeight: 700 }}>{DAY_TH[dt.getDay()]} {r.dStr.slice(5)}</span>
                          <span style={{ color: 'var(--txt3)' }}>{r.dayScheduledQty} ตัว · {r.dayKva?.toLocaleString()} kVA</span>
                          <span style={{ fontFamily: 'var(--mono)', color: r.dayFinish <= 8 ? 'var(--green)' : 'var(--amber)', marginLeft: 'auto' }}>เสร็จใน {r.dayFinish?.toFixed(1)}h</span>
                        </div>
                        <div style={{ padding: '4px 0' }}>
                          {r.machineCells?.map((mc, mi) => mc.machOff ? (
                            <div key={mi} style={{ padding: '2px 10px', fontSize: 9, color: 'var(--red)', opacity: 0.6 }}>🔴 {mc.machineName} ปิด</div>
                          ) : mc.work.length === 0 ? null : (
                            <div key={mi} style={{ display: 'flex', padding: '3px 10px', gap: 8, fontSize: 9 }}>
                              <span style={{ minWidth: 100, fontWeight: 700 }}>{mc.machineName}</span>
                              <span style={{ fontFamily: 'var(--mono)', color: mc.wall <= mc.capH ? 'var(--green)' : 'var(--amber)' }}>{mc.wall?.toFixed(1)}h</span>
                              <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {mc.work.map((w, wi) => (
                                  <span key={wi} style={{ fontFamily: 'var(--mono)', color: (w.kva ?? 0) <= 400 ? 'var(--blue)' : (w.kva ?? 0) <= 3500 ? 'var(--amber)' : 'var(--red)' }}>
                                    {w.sap_so || '—'} {(w.kva??0).toLocaleString()}kVA×{w.qty} {w.hrsWorked?.toFixed(1)}h{w.isComplete ? '✓' : '→'}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })()}

        {machines.length === 0 ? (
          <p className={styles.empty}>เพิ่มเครื่องตัดโลหะก่อน</p>
        ) : weekOrders.length === 0 ? (
          <p className={styles.empty}>📭 ไม่มี orders ในสัปดาห์ {weekLabel}</p>
        ) : (
          <>
            {/* Week summary */}
            <div className={styles.summary}>
              <span className={styles.dim}>สัปดาห์นี้</span>
              {/* OT policy chip */}
              {(() => {
                const otPol2 = balanceMode.endsWith('_no_ot') ? 'no_ot' : balanceMode.endsWith('_smart') ? 'smart' : 'full'
                const otLabel: Record<string, string> = { no_ot: '❌ ไม่ OT', smart: '⚠️ เมื่อจำเป็น', full: '🔥 OT เสมอ' }
                const otColor: Record<string, string> = { no_ot: 'var(--txt3)', smart: 'var(--amber)', full: 'var(--red)' }
                return (
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: 'var(--bg3)', border: '1px solid var(--bord2)', color: otColor[otPol2] }}>
                    {otLabel[otPol2]}
                  </span>
                )
              })()}
              {/* Schedule mode chip */}
              {(() => {
                const schedKey2 = balanceMode.replace(/_(?:no_ot|smart|full)$/, '')
                const schedLabel: Record<string, string> = {
                  daily: '📅 รายวัน', weekly: '🗓 รายสัปดาห์', fastest: '🏎 เร็วสุด',
                  deadline: '📅 วันส่งก่อน', priority: '⭐ ความสำคัญ',
                  interweek: '🔮 สัปดาห์หน้า', batch: '🔗 Batch kVA',
                }
                return (
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: 'rgba(137,180,250,.12)', border: '1px solid rgba(137,180,250,.3)', color: 'var(--blue)' }}>
                    {schedLabel[schedKey2] ?? schedKey2}
                  </span>
                )
              })()}
              {/* View + work display chip */}
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: 'var(--bg3)', border: '1px solid var(--bord2)', color: 'var(--txt3)' }}>
                {viewMode === 'cards' ? '📋 รายวัน' : viewMode === 'table' ? '📊 ตาราง' : '🔄 Pipeline'}
                {' · '}
                {workDisplay === 'order' ? '📦 ต่อออเดอร์' : workDisplay === 'carry' ? '↩ ต่อเนื่อง' : workDisplay === 'unit' ? '🔩 ต่อหน่วย' : '📋 ต่อเซ็กเมนต์'}
              </span>
              {balanceMode.startsWith('fastest') && (
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, fontWeight: 600, background: 'var(--bg3)', border: '1px solid var(--bord2)', color: stickyOrders ? 'var(--purple)' : 'var(--txt3)' }}>
                  {stickyOrders ? '🔗 ครบต่อเครื่อง' : '🔀 แยกเครื่องได้'}
                </span>
              )}
              <span style={{ fontWeight: 700 }}>{totalQtyWeek} ตัว · {weekOrders.length} orders</span>
              {includePrevCarry && prevCarryQty > 0 && (
                <span style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'rgba(137,180,250,.15)' }}>
                  ↩ {prevCarryQty} ยกมาจากสัปดาห์ก่อน · แผนใหม่ {currentWeekOrders.reduce((s,o)=>s+o.qty,0)} ตัว
                </span>
              )}
              {weekData.weekCarryOrders.length > 0 && (
                <span style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'rgba(249,226,175,.15)', border: '1px solid rgba(249,226,175,.3)' }}>
                  ⏭ {weekData.weekCarryOrders.reduce((s,o)=>s+o.qty,0)} ตัวค้างหน้า
                </span>
              )}
              {totalOT > 0
                ? <span className={styles.warn}>⚠ OT สูงสุด {totalOT.toFixed(1)}h/วัน</span>
                : <span className={styles.ok}>✓ เสร็จในเวลาปกติทุกวัน</span>}
              {weekData.totalShift >= 0.05 && (
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: 'rgba(137,180,250,.12)', border: '1px solid rgba(137,180,250,.3)', color: 'var(--blue)' }}>
                  🌙 กะ {weekData.totalShift.toFixed(1)}h
                </span>
              )}
            </div>

            {/* ── CARD VIEW ── */}
            {viewMode === 'cards' && <CardView
              dayRows={dayRows}
              weekOrders={weekOrders}
              machines={machines}
              products={products}
              workDisplay={workDisplay}
              isFastest={isFastest}
              lateOrders={lateOrders}
              showWireData={showWireData}
              weekSchedule={weekSchedule}
              fmtD={fmtD}
              origId={origId}
            />}


            {/* ── TABLE VIEW ── */}
            {viewMode === 'table' && <TableView
              dayRows={dayRows}
              weekOrders={weekOrders}
              machines={machines}
              products={products}
              workDisplay={workDisplay}
              isFastest={isFastest}
              lateOrders={lateOrders}
              showWireData={showWireData}
              mTotals={mTotals}
              totalQtyWeek={totalQtyWeek}
              bottleneckWall={bottleneckWall}
              effectiveGlobalRates={effectiveGlobalRates}
              effectiveGlobalTmcRates={effectiveGlobalTmcRates}
              useRoutingCr={useRoutingCr}
              routingCrRates={routingCrRates}
              routingNormalRates={routingNormalRates}
              wcConfig={wcConfig}
              selectedCell={selectedCell}
              setSelectedCell={setSelectedCell}
              handleToggle={handleToggle}
              getTimeDebugTitle={getTimeDebugTitle}
              useNearestKva={useNearestKva}
              fmtD={fmtD}
              origId={origId}
            />}

            {/* ── WEEK COMPLETION SUMMARY ── */}
            {viewMode !== 'pipeline' && (weekDoneOrders.length > 0 || weekCarryOrders.length > 0 || weekUnscheduled.length > 0) && (() => {
              const doneQty  = weekDoneOrders.reduce((s, o) => s + o.qty, 0)
              const carryQty = weekCarryOrders.reduce((s, o) => s + o.qty, 0)
              const unschedQty = weekUnscheduled.reduce((s, o) => s + o.qty, 0)
              const chip = (label: string, count: number, qty: number, col: string) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg3)', borderRadius: 8, border: `1px solid ${col}22` }}>
                  <span style={{ fontSize: 13 }}>{label}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12, color: col }}>{count} orders</span>
                  <span style={{ fontSize: 10, color: 'var(--txt3)' }}>·</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: col }}>{qty} ตัว</span>
                </div>
              )
              const today = fmtISO(new Date())
              const weekEndStr = days.length > 0 ? fmtISO(days[days.length - 1]) : ''
              const orderRow = (o: Order) => {
                const kva = o.kva ?? products[o.product]?.kva ?? 0
                const due = o.due_so
                const dueCol = !due ? 'var(--txt3)'
                  : due < today      ? 'var(--red)'
                  : due <= weekEndStr ? 'var(--amber)'
                  : 'var(--green)'
                const isLate = lateOrders.has(origId(o.id))
                return (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6, fontSize: 11, whiteSpace: 'nowrap',
                    background: isLate ? 'rgba(224,90,78,.08)' : 'var(--bg4)',
                    border: isLate ? '1px solid rgba(224,90,78,.3)' : '1px solid transparent' }}>
                    {isLate && <span style={{ fontSize: 10 }}>🔴</span>}
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--txt1)' }}>{o.sap_so ?? o.id.slice(-8)}</span>
                    <span style={{ color: 'var(--txt3)' }}>{kva.toLocaleString()}kVA</span>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt2)' }}>×{o.qty}</span>
                    {o.customer && <span style={{ color: 'var(--txt3)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.customer}</span>}
                    {due && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: dueCol, fontWeight: due < today ? 700 : 400 }}>due {due}</span>}
                  </div>
                )
              }
              return (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {weekDoneOrders.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {chip('✅ เสร็จสัปดาห์นี้', weekDoneOrders.length, doneQty, 'var(--green)')}
                      {weekDoneOrders.map(orderRow)}
                    </div>
                  )}
                  {weekCarryOrders.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {chip('⏭ ค้างสัปดาห์หน้า', weekCarryOrders.length, carryQty, 'var(--amber)')}
                      <button
                        title="ไปสัปดาห์หน้าพร้อมนำงานค้างเข้าแผน"
                        onClick={() => { setWeekOffset(w => w + 1); setIncludePrevCarry(true) }}
                        style={{ fontSize: 11, padding: '3px 12px', borderRadius: 8, border: '1px solid rgba(249,226,175,.5)', background: 'rgba(249,226,175,.15)', color: 'var(--amber)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        → ดูสัปดาห์หน้า + รวมงานค้าง
                      </button>
                      {weekCarryOrders.map(orderRow)}
                    </div>
                  )}
                  {weekUnscheduled.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {chip('❌ ไม่ได้ตั้งแผน', weekUnscheduled.length, unschedQty, 'var(--red)')}
                      {weekUnscheduled.map(orderRow)}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* ── PIPELINE VIEW — horizontal timeline per machine ── */}
            {viewMode === 'pipeline' && <PipelineView
              dayRows={dayRows}
              weekOrders={weekOrders}
              machines={machines}
              products={products}
              workDisplay={workDisplay}
              isFastest={isFastest}
              lateOrders={lateOrders}
              mTotals={mTotals}
              weekSchedule={weekSchedule}
              days={days}
              wcConfig={wcConfig}
              fmtD={fmtD}
              origId={origId}
            />}
          </>
        )}
      </div>

      {/* ── Config table ──────────────────────────────────── */}
      <MachineConfigPanel
        machines={machines}
        products={products}
        shiftHrsDefault={shiftHrsDefault}
        saving={saving}
        open={machineTableOpen}
        setOpen={setMachineTableOpen}
        handleAdd={handleAdd}
        handleDelete={handleDelete}
        handleChange={handleChange}
        handleToggle={handleToggle}
        toggleOffDay={toggleOffDay}
      />
      {/* ── Global Cutting + TMC Rates ───────────────────── */}
      <GlobalRatesPanel
        open={globalRatesOpen}
        setOpen={setGlobalRatesOpen}
        globalRates={globalRates}
        globalTmcRates={globalTmcRates}
        effectiveGlobalRates={effectiveGlobalRates}
        effectiveGlobalTmcRates={effectiveGlobalTmcRates}
        useRoutingCr={useRoutingCr}
        setUseRoutingCr={setUseRoutingCr}
        routingCrData={routingCrData}
        routingNormalRates={routingNormalRates}
        routingCrRates={routingCrRates}
        routingWcFilter={routingWcFilter}
        setRoutingWcFilter={setRoutingWcFilter}
        availableRoutingWcs={availableRoutingWcs}
        routingRatesOpen={routingRatesOpen}
        setRoutingRatesOpen={setRoutingRatesOpen}
        expandedRoutingRow={expandedRoutingRow}
        setExpandedRoutingRow={setExpandedRoutingRow}
        saveGlobalRates={saveGlobalRates}
        saveGlobalTmcRates={saveGlobalTmcRates}
        globalRateSubTab={globalRateSubTab}
        setGlobalRateSubTab={setGlobalRateSubTab}
      />

      {/* ── Per-Machine Rates + TMC (consolidated) ──────── */}
      <PerMachineRatesPanel
        open={perMachRatesOpen}
        setOpen={setPerMachRatesOpen}
        machines={machines}
        machineRateTab={machineRateTab}
        setMachineRateTab={setMachineRateTab}
        machineRateSubTab={machineRateSubTab}
        setMachineRateSubTab={setMachineRateSubTab}
        shiftHrsDefault={shiftHrsDefault}
        saveMachineRates={saveMachineRates}
        saveMachineTmcRates={saveMachineTmcRates}
        globalRates={globalRates}
      />

    </div>
  )
}
