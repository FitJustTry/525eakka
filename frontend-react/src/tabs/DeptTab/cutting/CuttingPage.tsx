import React, { useState, useMemo, useEffect } from 'react'
import { useApp } from '../../../context/AppContext'
import type { CuttingRate, RoutingCrRow } from '../../../types'
import styles from './CuttingPage.module.css'
import { DAY_SHORT } from './scheduling/constants'
import type { MachineDaySched } from './scheduling/constants'
import {
  getHrsForKva, isMachineOn, resolveHours,
  mLabel, fmtISO, getWeekRange,
  origId, fmtD as fmtDUtil,
} from './scheduling/utils'
import CardView from './components/CardView'
import TableView from './components/TableView'
import PipelineView from './components/PipelineView'
import MachineConfigPanel from './components/MachineConfigPanel'
import GlobalRatesPanel from './components/GlobalRatesPanel'
import PerMachineRatesPanel from './components/PerMachineRatesPanel'
import ControlBar from './components/ControlBar'
import ManualShiftGrid from './components/ManualShiftGrid'
import ManualOtGrid from './components/ManualOtGrid'
import CustomShiftOtGrid from './components/CustomShiftOtGrid'
import SchedulingToolbar from './components/SchedulingToolbar'
import SnapshotPanel from './components/SnapshotPanel'
import SnapshotViewer from './components/SnapshotViewer'
import WeekCompletionSummary from './components/WeekCompletionSummary'
import CapacityGapPanel from './components/CapacityGapPanel'
import { assignOrders, scheduleFastest, scheduleMode } from './scheduling/engine'
import type { ShiftMode } from './scheduling/engine'
import { computeWeekData } from './scheduling/weekData'
import { buildRoutingCrRates, buildTrPowerRates, buildClassHRates, getRoutingOps, DEFAULT_CUTTING_WCS } from './scheduling/routingRates'
import {
  exportPlanCSV as _exportCSV,
  exportTXT as _exportTXT,
  exportXLSX as _exportXLSX,
  exportMachineXLSX as _exportMachineXLSX,
  exportJSON as _exportJSON,
  exportPrint as _exportPrint,
  exportMachinePrint as _exportMachinePrint,
} from './scheduling/export'
import { useCuttingActions } from './hooks/useCuttingActions'
import { usePlanSnapshots } from './hooks/usePlanSnapshots'

type BalanceMode =
  | 'daily_no_ot' | 'weekly_no_ot' | 'fastest_no_ot'
  | 'deadline_no_ot' | 'priority_no_ot' | 'interweek_no_ot' | 'batch_no_ot'
  | 'daily_smart' | 'weekly_smart' | 'fastest_smart'
  | 'deadline_smart' | 'priority_smart' | 'interweek_smart' | 'batch_smart'
  | 'daily_full' | 'weekly_full' | 'fastest_full'
  | 'deadline_full' | 'priority_full' | 'interweek_full' | 'batch_full'

export default function CuttingMachines() {
  const { state } = useApp()
  const { cuttingMachines: machines, orders, products, wcConfig } = state

  // ── UI state ─────────────────────────────────────────────────
  const [weekOffset, setWeekOffset] = useState(0)
  const [includePrevCarry, setIncludePrevCarry] = useState(false)
  const [carryOverOrders, setCarryOverOrders] = useState<Set<string>>(new Set())
  const [showWireData, setShowWireData] = useState(true)
  const [workDisplay, setWorkDisplay] = useState<'order' | 'carry' | 'segment' | 'unit'>('order')
  const [saving, setSaving] = useState<number | null>(null)
  const [selectedCell, setSelectedCell] = useState<{ machineId: number; date: string } | null>(null)
  const [balanceMode, setBalanceMode] = useState<BalanceMode>('fastest_smart')
  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'pipeline'>('table')
  const [globalRates, setGlobalRates] = useState<CuttingRate[]>([])
  const [globalTmcRates, setGlobalTmcRates] = useState<CuttingRate[]>([])
  const [globalTrPowerRates, setGlobalTrPowerRates] = useState<CuttingRate[]>([])
  const [globalClassHRates, setGlobalClassHRates] = useState<CuttingRate[]>([])
  const [globalRateSubTab, setGlobalRateSubTab] = useState<'cut' | 'tmc' | 'tr' | 'ch'>('cut')
  const [machineRateTab, setMachineRateTab] = useState<number | null>(null)
  const [machineRateSubTab, setMachineRateSubTab] = useState<'cut' | 'tmc' | 'tr' | 'ch'>('cut')
  const [strictWire, setStrictWire] = useState(true)
  const [requireDrill, setRequireDrill] = useState(true)
  const [stickyOrders, setStickyOrders] = useState(true)
  const isFastest = balanceMode.startsWith('fastest')
  const [lazyOT, setLazyOT] = useState(false)
  const [interweekThreshold, setInterweekThreshold] = useState(0.5)
  const [useNearestKva, setUseNearestKva] = useState(true)
  const [shiftMode, setShiftMode] = useState<ShiftMode>('none')
  const [shiftNDays, setShiftNDays] = useState(2)
  const [shiftHrsDefault, setShiftHrsDefault] = useState(9)
  const [manualShiftDays, setManualShiftDays] = useState<Map<number, Set<string>>>(new Map())
  const [manualOtDays, setManualOtDays] = useState<Map<number, Set<string>>>(new Map())
  const [manualOtMode, setManualOtMode] = useState(false)
  const [customShiftHrs, setCustomShiftHrs] = useState<Map<number, Map<string, number>>>(new Map())
  const [customOtHrs, setCustomOtHrs] = useState<Map<number, Map<string, number>>>(new Map())
  const [machineTableOpen, setMachineTableOpen] = useState(false)
  const [globalRatesOpen, setGlobalRatesOpen] = useState(false)
  const [perMachRatesOpen, setPerMachRatesOpen] = useState(false)
  const [routingCrData, setRoutingCrData] = useState<RoutingCrRow[]>([])
  const [useRoutingCr, setUseRoutingCr] = useState(false)
  const [routingWcFilter, setRoutingWcFilter] = useState<string[]>(DEFAULT_CUTTING_WCS)
  const [routingRatesOpen, setRoutingRatesOpen] = useState(false)
  const [expandedRoutingRow, setExpandedRoutingRow] = useState<string | null>(null)

  const manualShiftKey = useMemo(() =>
    [...manualShiftDays.entries()].sort((a, b) => a[0] - b[0])
      .map(([mid, s]) => `${mid}:${[...s].sort().join(',')}`)
      .join('|')
  , [manualShiftDays])

  const manualOtKey = useMemo(() =>
    [...manualOtDays.entries()].sort((a, b) => a[0] - b[0])
      .map(([mid, s]) => `${mid}:${[...s].sort().join(',')}`)
      .join('|')
  , [manualOtDays])

  const customShiftKey = useMemo(() =>
    [...customShiftHrs.entries()].sort((a, b) => a[0] - b[0])
      .map(([mid, m]) => `${mid}:${[...m.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([d,v])=>`${d}=${v}`).join(',')}`)
      .join('|')
  , [customShiftHrs])

  const customOtKey = useMemo(() =>
    [...customOtHrs.entries()].sort((a, b) => a[0] - b[0])
      .map(([mid, m]) => `${mid}:${[...m.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([d,v])=>`${d}=${v}`).join(',')}`)
      .join('|')
  , [customOtHrs])

  const availableRoutingWcs = useMemo(
    () => [...new Set(routingCrData.map(r => r.wc_id))].sort(),
    [routingCrData]
  )

  const { normalRates: routingNormalRates, crRates: routingCrRates } = useMemo(
    () => buildRoutingCrRates(routingCrData, routingWcFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routingCrData, routingWcFilter.join(',')]
  )

  const routingTrPowerRates = useMemo(
    () => buildTrPowerRates(routingCrData, routingWcFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routingCrData, routingWcFilter.join(',')]
  )

  const routingClassHRates = useMemo(
    () => buildClassHRates(routingCrData, routingWcFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routingCrData, routingWcFilter.join(',')]
  )

  const effectiveGlobalRates        = useRoutingCr && routingNormalRates.length   > 0 ? routingNormalRates   : globalRates
  const effectiveGlobalTmcRates     = useRoutingCr && routingCrRates.length       > 0 ? routingCrRates       : globalTmcRates
  const effectiveGlobalTrPowerRates = useRoutingCr && routingTrPowerRates.length  > 0 ? routingTrPowerRates  : globalTrPowerRates
  const effectiveGlobalClassHRates  = useRoutingCr && routingClassHRates.length   > 0 ? routingClassHRates   : globalClassHRates

  // ── Hooks ────────────────────────────────────────────────────
  const { handleAdd, handleDelete, handleChange, toggleOffDay, handleToggle, saveMachineRates, saveMachineTmcRates, saveMachineTrPowerRates, saveMachineClassHRates } =
    useCuttingActions(saving, setSaving)

  const { planSaving, planSaveMsg, snapshots, showSnapshots, setShowSnapshots, viewSnap, setViewSnap, savePlan, loadSnapshots, viewSnapshot, deleteSnapshot } =
    usePlanSnapshots()

  // ── Data loading ─────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/cutting-rates').then(r => r.json()).then(setGlobalRates).catch(() => {})
    fetch('/api/cutting-tmc-rates').then(r => r.json()).then(setGlobalTmcRates).catch(() => {})
    fetch('/api/cutting-tr-power-rates').then(r => r.json()).then(setGlobalTrPowerRates).catch(() => {})
    fetch('/api/cutting-class-h-rates').then(r => r.json()).then(setGlobalClassHRates).catch(() => {})
    import('../../../api').then(({ api }) => api.routingCr.list().then(rows => setRoutingCrData(rows as RoutingCrRow[])).catch(() => {}))
  }, [])

  async function saveGlobalRates(rates: CuttingRate[]) {
    setGlobalRates(rates)
    await fetch('/api/cutting-rates', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rates) })
  }

  async function saveGlobalTmcRates(rates: CuttingRate[]) {
    setGlobalTmcRates(rates)
    await fetch('/api/cutting-tmc-rates', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rates) })
  }

  async function saveGlobalTrPowerRates(rates: CuttingRate[]) {
    setGlobalTrPowerRates(rates)
    await fetch('/api/cutting-tr-power-rates', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rates) })
  }

  async function saveGlobalClassHRates(rates: CuttingRate[]) {
    setGlobalClassHRates(rates)
    await fetch('/api/cutting-class-h-rates', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rates) })
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

  function toggleManualOt(machineId: number, dStr: string) {
    setManualOtDays(prev => {
      const next = new Map(prev)
      const set = new Set(next.get(machineId) ?? [])
      if (set.has(dStr)) set.delete(dStr); else set.add(dStr)
      if (set.size === 0) next.delete(machineId); else next.set(machineId, set)
      return next
    })
  }

  // ── Export helpers ───────────────────────────────────────────
  function expCtx() {
    return { weekData, machines, products, globalRates: effectiveGlobalRates, globalTmcRates: effectiveGlobalTmcRates, weekLabel, mon, sat, balanceMode, useNearestKva, shiftMode, shiftNDays, shiftHrsDefault, manualShiftDays, useRoutingCr }
  }
  function exportPlanCSV()      { _exportCSV(expCtx()) }
  function exportTXT()          { _exportTXT(expCtx()) }
  function exportXLSX()         { _exportXLSX(expCtx()) }
  function exportMachineXLSX()  { _exportMachineXLSX(expCtx()) }
  function exportJSON()         { _exportJSON(expCtx()) }
  function exportPrint()        { _exportPrint(expCtx()) }
  function exportMachinePrint() { _exportMachinePrint(expCtx()) }

  function getTimeDebugTitle(m: import('../../../types').CuttingMachine, kva: number, itemCode: string | undefined): string {
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

  // ── Week range ───────────────────────────────────────────────
  const { mon, sat } = getWeekRange(weekOffset)
  const monStr = fmtISO(mon)
  const satStr = fmtISO(sat)
  const fmtD = fmtDUtil
  const weekLabel = `${fmtD(mon)} – ${fmtD(sat)}/${String(sat.getFullYear() % 100).padStart(2, '0')}`
  const currentWeekOrders = orders.filter(o => o.plan_date && o.plan_date >= monStr && o.plan_date <= satStr)
  const days = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d
  })

  const machIdx = useMemo(() => {
    const m = new Map<number, number>()
    machines.forEach((mc, i) => m.set(mc.id, i))
    return m
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines.map(m => m.id).join(',')])

  // Previous week carry-over
  const prevCarryOrders = useMemo(() => {
    try {
      if (!includePrevCarry || !machines.length) return [] as typeof orders
      const { mon: prevMon, sat: prevSat } = getWeekRange(weekOffset - 1)
      const prevMonStr = fmtISO(prevMon); const prevSatStr = fmtISO(prevSat)
      const prevOrders = orders.filter(o => o.plan_date && o.plan_date >= prevMonStr && o.plan_date <= prevSatStr)
      if (!prevOrders.length) return [] as typeof orders
      const prevDays = Array.from({ length: 6 }, (_, i) => { const d = new Date(prevMon); d.setDate(prevMon.getDate() + i); return d })
      const prevDailyAsgn = prevDays.map(d => {
        const dStr = fmtISO(d); const dow = d.getDay()
        const active = machines.filter(m => isMachineOn(m, dow))
        const asgn = assignOrders(prevOrders.filter(o => o.plan_date === dStr), active, products, effectiveGlobalRates, new Map(), new Map(machIdx), false, false, effectiveGlobalTmcRates, false, false, useRoutingCr)
        return { dStr, asgn }
      })
      const prevApproach = balanceMode.startsWith('weekly') ? 'weekly' : 'daily'
      const prevOtPolicy = balanceMode.endsWith('_no_ot') ? 'none' : balanceMode.endsWith('_smart') ? 'smart' : 'full'
      const prevSched = scheduleMode(prevOrders, prevDailyAsgn, machines, products, effectiveGlobalRates, wcConfig, prevDays, new Map(machIdx), prevApproach as 'daily'|'weekly', prevOtPolicy as 'none'|'smart'|'full', 'plan_date', [], false, false, true, effectiveGlobalTmcRates, 0.5, false, 'none', 0, 9, new Map(), useRoutingCr)
      const completedIds = new Set<string>()
      machines.forEach(m => {
        prevDays.forEach(d => {
          prevSched.get(m.id)?.get(fmtISO(d))?.work.forEach(w => { if (w.isComplete) completedIds.add(w.order.id) })
        })
      })
      return prevOrders.filter(o => !completedIds.has(o.id))
    } catch { return [] as typeof orders }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includePrevCarry, weekOffset, balanceMode, orders.map(o=>o.id+o.qty).join(','), machines.map(m=>m.id).join(',')])

  const weekOrders = [...prevCarryOrders, ...currentWeekOrders]
  const prevCarryQty = prevCarryOrders.reduce((s, o) => s + o.qty, 0)
  const { mon: nextMon, sat: nextSat } = getWeekRange(weekOffset + 1)
  const nextWeekOrders = orders.filter(o => o.plan_date && o.plan_date >= fmtISO(nextMon) && o.plan_date <= fmtISO(nextSat))

  // Daily assignments
  const dailyAssignments = useMemo(() => {
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
      const dStr = fmtISO(d); const dow = d.getDay()
      const activeMachines = machines.filter(m => isMachineOn(m, dow))
      const dayOrds = weekOrders.filter(o => (bumpedPlanDate.get(o.plan_date ?? '') ?? o.plan_date) === dStr)
      const dayOrdsEff = stickyOrders
        ? dayOrds
        : dayOrds.flatMap(o => Array.from({length: o.qty}, (_, ui) => ({...o, id: `${o.id}__u${ui}`, qty: 1})))
      const initWall = new Map<number, number>()
      const isBatch = balanceMode.includes('batch_kva')
      const asgn = assignOrders(dayOrdsEff, activeMachines, products, effectiveGlobalRates, initWall, new Map(machIdx), strictWire, requireDrill, effectiveGlobalTmcRates, isBatch, useNearestKva, useRoutingCr)
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

  // Week schedule
  const weekSchedule = useMemo(() => {
    const mi = new Map(machIdx)
    const sm = (ot: 'none'|'smart'|'full', sort='plan_date') => scheduleMode(weekOrders, dailyAssignments, machines, products, effectiveGlobalRates, wcConfig, days, mi, 'weekly', ot, sort, nextWeekOrders, strictWire, requireDrill, stickyOrders, ot === 'smart' ? lazyOT : true, effectiveGlobalTmcRates, interweekThreshold, useNearestKva, shiftMode, shiftNDays, shiftHrsDefault, manualShiftDays, useRoutingCr, manualOtDays, customShiftHrs, customOtHrs)
    const sd = (ot: 'none'|'smart'|'full') => scheduleMode(weekOrders, dailyAssignments, machines, products, effectiveGlobalRates, wcConfig, days, mi, 'daily', ot, 'plan_date', [], strictWire, requireDrill, stickyOrders, ot === 'smart' ? lazyOT : true, effectiveGlobalTmcRates, interweekThreshold, useNearestKva, shiftMode, shiftNDays, shiftHrsDefault, manualShiftDays, useRoutingCr, manualOtDays, customShiftHrs, customOtHrs)
    const sf = (ot: 'none'|'smart'|'full') => scheduleFastest(weekOrders, machines, products, effectiveGlobalRates, wcConfig, days, ot, strictWire, requireDrill, stickyOrders, ot === 'smart' ? lazyOT : true, effectiveGlobalTmcRates, useNearestKva, shiftMode, shiftNDays, shiftHrsDefault, manualShiftDays, useRoutingCr, manualOtDays, customShiftHrs, customOtHrs)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceMode, strictWire, requireDrill, stickyOrders, lazyOT, interweekThreshold, useNearestKva, shiftMode, shiftNDays, shiftHrsDefault, manualShiftKey, manualOtKey, customShiftKey, customOtKey, dailyAssignments, machines.map(m => `${m.id}${m.reg_hrs}${m.ot_hrs}${+m.laser}${+m.m4}${+m.drill_8mm}${+m.drill_22mm}${m.time_mul??1}${m.tmc_hrs??0}${(m.off_days??[]).join('-')}`).join(','), effectiveGlobalRates.map(r=>`${r.kva}:${r.hrs}`).join(','), effectiveGlobalTmcRates.map(r=>`${r.kva}:${r.hrs}`).join(',')])

  const weekData = useMemo(
    () => computeWeekData({ weekSchedule, weekOrders, machines, days, balanceMode, strictWire, requireDrill, stickyOrders, products, wcConfig, globalRates: effectiveGlobalRates, globalTmcRates: effectiveGlobalTmcRates }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekSchedule, balanceMode, strictWire, requireDrill, weekOrders.map(o=>o.id+o.qty).join(','), machines.map(m=>`${m.id}${(m.off_days??[]).join('-')}`).join(',')]
  )

  const { mTotals, dayRows, bottleneckWall, totalQtyWeek, totalOT, weekDoneOrders, weekCarryOrders, weekUnscheduled } = weekData

  // Late order detection
  const lateOrders = useMemo(() => {
    const late = new Set<string>()
    const lastCompDay = new Map<string, string>()
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
    for (const [oid, completedOn] of lastCompDay) {
      const order = weekOrders.find(o => o.id === oid)
      const due = order?.due_so
      if (due && completedOn > due) late.add(oid)
    }
    const weekEndStr = days.length > 0 ? fmtISO(days[days.length - 1]) : ''
    for (const o of weekCarryOrders) {
      const due = o.due_so
      if (due && weekEndStr && due <= weekEndStr) late.add(origId(o.id))
    }
    return late
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekSchedule, weekOrders, weekCarryOrders, days.map(d => fmtISO(d)).join(',')])

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
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          {/* Title + badge */}
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

          {/* Scheduling toolbar */}
          <SchedulingToolbar
            balanceMode={balanceMode} setBalanceMode={setBalanceMode}
            viewMode={viewMode} setViewMode={setViewMode}
            workDisplay={workDisplay} setWorkDisplay={setWorkDisplay}
            lazyOT={lazyOT} setLazyOT={setLazyOT}
            interweekThreshold={interweekThreshold} setInterweekThreshold={setInterweekThreshold}
            useNearestKva={useNearestKva} setUseNearestKva={setUseNearestKva}
            shiftMode={shiftMode} setShiftMode={setShiftMode}
            shiftNDays={shiftNDays} setShiftNDays={setShiftNDays}
            shiftHrsDefault={shiftHrsDefault} setShiftHrsDefault={setShiftHrsDefault}
            shiftDays={shiftDays} totalShift={weekData.totalShift}
            lateOrdersSize={lateOrders.size} baselineLateCount={baselineLateCount}
            days={days}
            manualOtMode={manualOtMode} setManualOtMode={setManualOtMode}
          />

          {/* Week navigation */}
          <div className={styles.weekNav}>
            <button className={styles.btn} onClick={() => setWeekOffset(w => w - 1)}>‹ ก่อนหน้า</button>
            <span className={styles.weekLabel}>{weekLabel}</span>
            <button className={styles.btn} onClick={() => setWeekOffset(w => w + 1)}>ถัดไป ›</button>
            {weekOffset !== 0 && (
              <button className={styles.btnGhost} onClick={() => setWeekOffset(0)}>สัปดาห์นี้</button>
            )}
          </div>
        </div>

        {/* Custom shift+OT grid */}
        {shiftMode === 'custom' && (
          <CustomShiftOtGrid
            machines={machines} days={days}
            customShiftHrs={customShiftHrs} setCustomShiftHrs={setCustomShiftHrs}
            customOtHrs={customOtHrs} setCustomOtHrs={setCustomOtHrs}
            weekSchedule={weekSchedule} wcConfig={wcConfig} mTotals={mTotals}
            lateOrdersSize={lateOrders.size} baselineLateCount={baselineLateCount}
          />
        )}

        {/* Manual shift selection grid */}
        {shiftMode === 'manual' && (
          <ManualShiftGrid
            machines={machines} days={days}
            manualShiftDays={manualShiftDays} toggleManualShift={toggleManualShift}
            setManualShiftDays={setManualShiftDays} shiftHrsDefault={shiftHrsDefault}
            weekSchedule={weekSchedule} wcConfig={wcConfig} mTotals={mTotals}
            totalShift={weekData.totalShift} lateOrdersSize={lateOrders.size}
            baselineLateCount={baselineLateCount}
          />
        )}

        {/* Manual OT grid */}
        {manualOtMode && (
          <ManualOtGrid
            machines={machines} days={days}
            manualOtDays={manualOtDays} toggleManualOt={toggleManualOt}
            setManualOtDays={setManualOtDays}
            weekSchedule={weekSchedule} wcConfig={wcConfig} mTotals={mTotals}
            lateOrdersSize={lateOrders.size} baselineLateCount={baselineLateCount}
          />
        )}

        {/* Control bar */}
        <ControlBar
          showWireData={showWireData} setShowWireData={setShowWireData}
          strictWire={strictWire} setStrictWire={setStrictWire}
          requireDrill={requireDrill} setRequireDrill={setRequireDrill}
          stickyOrders={stickyOrders} setStickyOrders={setStickyOrders}
          includePrevCarry={includePrevCarry} setIncludePrevCarry={setIncludePrevCarry}
          prevCarryQty={prevCarryQty} planSaving={planSaving} planSaveMsg={planSaveMsg}
          weekOrdersLength={weekOrders.length}
          onSavePlan={() => savePlan('', { weekData, machines, products, globalRates: effectiveGlobalRates, globalTmcRates: effectiveGlobalTmcRates, weekLabel, mon, sat, balanceMode, useNearestKva, shiftMode, shiftNDays, shiftHrsDefault, manualShiftDays, useRoutingCr })}
          onExportCSV={exportPlanCSV} onExportXLSX={exportXLSX}
          onExportMachineXLSX={exportMachineXLSX} onExportTXT={exportTXT}
          onExportPrint={exportPrint} onExportMachinePrint={exportMachinePrint}
          onExportJSON={exportJSON} onLoadSnapshots={loadSnapshots}
        />

        {/* Saved plans panel */}
        {showSnapshots && (
          <SnapshotPanel
            snapshots={snapshots} setShowSnapshots={setShowSnapshots}
            viewSnapshot={viewSnapshot} deleteSnapshot={deleteSnapshot}
          />
        )}

        {/* Saved plan viewer */}
        {viewSnap && <SnapshotViewer viewSnap={viewSnap} setViewSnap={setViewSnap} />}

        {/* Empty states */}
        {machines.length === 0 ? (
          <p className={styles.empty}>เพิ่มเครื่องตัดโลหะก่อน</p>
        ) : weekOrders.length === 0 ? (
          <p className={styles.empty}>📭 ไม่มี orders ในสัปดาห์ {weekLabel}</p>
        ) : (
          <>
            {/* Week summary chips */}
            <div className={styles.summary}>
              <span className={styles.dim}>สัปดาห์นี้</span>
              {(() => {
                const otPol2 = balanceMode.endsWith('_no_ot') ? 'no_ot' : balanceMode.endsWith('_smart') ? 'smart' : 'full'
                const otLabel: Record<string, string> = { no_ot: '❌ ไม่ OT', smart: '⚠️ เมื่อจำเป็น', full: '🔥 OT เสมอ' }
                const otColor: Record<string, string> = { no_ot: 'var(--txt3)', smart: 'var(--amber)', full: 'var(--red)' }
                return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: 'var(--bg3)', border: '1px solid var(--bord2)', color: otColor[otPol2] }}>{otLabel[otPol2]}</span>
              })()}
              {(() => {
                const schedKey2 = balanceMode.replace(/_(?:no_ot|smart|full)$/, '')
                const schedLabel: Record<string, string> = { daily: '📅 รายวัน', weekly: '🗓 รายสัปดาห์', fastest: '🏎 เร็วสุด', deadline: '📅 วันส่งก่อน', priority: '⭐ ความสำคัญ', interweek: '🔮 สัปดาห์หน้า', batch: '🔗 Batch kVA' }
                return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: 'rgba(137,180,250,.12)', border: '1px solid rgba(137,180,250,.3)', color: 'var(--blue)' }}>{schedLabel[schedKey2] ?? schedKey2}</span>
              })()}
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

            {/* Card view */}
            {viewMode === 'cards' && <CardView
              dayRows={dayRows} weekOrders={weekOrders} machines={machines} products={products}
              workDisplay={workDisplay} isFastest={isFastest} lateOrders={lateOrders}
              showWireData={showWireData} weekSchedule={weekSchedule} fmtD={fmtD} origId={origId}
            />}

            {/* Table view */}
            {viewMode === 'table' && <TableView
              dayRows={dayRows} weekOrders={weekOrders} machines={machines} products={products}
              workDisplay={workDisplay} isFastest={isFastest} lateOrders={lateOrders}
              showWireData={showWireData} mTotals={mTotals} totalQtyWeek={totalQtyWeek}
              bottleneckWall={bottleneckWall} effectiveGlobalRates={effectiveGlobalRates}
              effectiveGlobalTmcRates={effectiveGlobalTmcRates} useRoutingCr={useRoutingCr}
              routingCrRates={routingCrRates} routingNormalRates={routingNormalRates}
              wcConfig={wcConfig} selectedCell={selectedCell} setSelectedCell={setSelectedCell}
              handleToggle={handleToggle} getTimeDebugTitle={getTimeDebugTitle}
              useNearestKva={useNearestKva} fmtD={fmtD} origId={origId}
            />}

            {/* Capacity gap analysis */}
            {viewMode !== 'pipeline' && machines.length > 0 && (
              <CapacityGapPanel
                mTotals={mTotals} machines={machines} days={days}
                wcConfig={wcConfig} shiftHrsDefault={shiftHrsDefault}
                weekCarryOrders={weekCarryOrders} weekUnscheduled={weekUnscheduled}
                weekDoneOrders={weekDoneOrders}
              />
            )}

            {/* Week completion summary */}
            {viewMode !== 'pipeline' && (weekDoneOrders.length > 0 || weekCarryOrders.length > 0 || weekUnscheduled.length > 0) && (
              <WeekCompletionSummary
                weekDoneOrders={weekDoneOrders} weekCarryOrders={weekCarryOrders}
                weekUnscheduled={weekUnscheduled} lateOrders={lateOrders}
                products={products} days={days}
                setWeekOffset={setWeekOffset} setIncludePrevCarry={setIncludePrevCarry}
                carryOverOrders={carryOverOrders}
                toggleCarryOver={(id) => setCarryOverOrders(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })}
              />
            )}

            {/* Pipeline view */}
            {viewMode === 'pipeline' && <PipelineView
              dayRows={dayRows} weekOrders={weekOrders} machines={machines} products={products}
              workDisplay={workDisplay} isFastest={isFastest} lateOrders={lateOrders}
              mTotals={mTotals} weekSchedule={weekSchedule} days={days}
              wcConfig={wcConfig} fmtD={fmtD} origId={origId}
            />}
          </>
        )}
      </div>

      {/* Config panels */}
      <MachineConfigPanel
        machines={machines} products={products} shiftHrsDefault={shiftHrsDefault}
        saving={saving} open={machineTableOpen} setOpen={setMachineTableOpen}
        handleAdd={handleAdd} handleDelete={handleDelete}
        handleChange={handleChange} handleToggle={handleToggle} toggleOffDay={toggleOffDay}
      />
      <GlobalRatesPanel
        open={globalRatesOpen} setOpen={setGlobalRatesOpen}
        globalRates={globalRates} globalTmcRates={globalTmcRates}
        effectiveGlobalRates={effectiveGlobalRates} effectiveGlobalTmcRates={effectiveGlobalTmcRates}
        useRoutingCr={useRoutingCr} setUseRoutingCr={setUseRoutingCr}
        routingCrData={routingCrData} routingNormalRates={routingNormalRates}
        routingCrRates={routingCrRates} routingWcFilter={routingWcFilter}
        setRoutingWcFilter={setRoutingWcFilter} availableRoutingWcs={availableRoutingWcs}
        routingRatesOpen={routingRatesOpen} setRoutingRatesOpen={setRoutingRatesOpen}
        expandedRoutingRow={expandedRoutingRow} setExpandedRoutingRow={setExpandedRoutingRow}
        saveGlobalRates={saveGlobalRates} saveGlobalTmcRates={saveGlobalTmcRates}
        globalTrPowerRates={globalTrPowerRates} saveGlobalTrPowerRates={saveGlobalTrPowerRates}
        effectiveGlobalTrPowerRates={effectiveGlobalTrPowerRates}
        routingTrPowerRates={routingTrPowerRates}
        globalClassHRates={globalClassHRates} saveGlobalClassHRates={saveGlobalClassHRates}
        effectiveGlobalClassHRates={effectiveGlobalClassHRates}
        routingClassHRates={routingClassHRates}
        globalRateSubTab={globalRateSubTab} setGlobalRateSubTab={setGlobalRateSubTab}
      />
      <PerMachineRatesPanel
        open={perMachRatesOpen} setOpen={setPerMachRatesOpen}
        machines={machines} machineRateTab={machineRateTab}
        setMachineRateTab={setMachineRateTab} machineRateSubTab={machineRateSubTab}
        setMachineRateSubTab={setMachineRateSubTab} shiftHrsDefault={shiftHrsDefault}
        saveMachineRates={saveMachineRates} saveMachineTmcRates={saveMachineTmcRates}
        saveMachineTrPowerRates={saveMachineTrPowerRates}
        saveMachineClassHRates={saveMachineClassHRates}
        globalRates={globalRates}
      />
    </div>
  )
}
