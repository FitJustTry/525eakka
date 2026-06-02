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
 *  scheduleSmartOT (⚡ Smart OT)
 *    • Try to fit all work in regular hours first (0 OT)
 *    • Weekday overflow → add exactly the minimum OT needed (up to max)
 *    • Saturday → force otCap=0 (no Saturday OT)
 *    • Shows minimum OT budget to avoid carry-overs
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
import { useState, useMemo, useEffect } from 'react'
import { api } from '../../api'
import { useApp } from '../../context/AppContext'
import type { CuttingMachine, CuttingRate, Order, WCConfig } from '../../types'
import { decodeItemInfo } from '../../utils/itemCodeDecode'
import styles from './CuttingMachines.module.css'

/**
 * Lookup cutting hours for a kVA.
 * Exact match only — if the kVA has a defined rate, use it.
 * Everything else uses m.hrs_per_unit (machine default).
 */
function getHrsForKva(m: CuttingMachine, kva: number, globalRates: CuttingRate[]): number {
  const rates = globalRates.length > 0 ? globalRates : (m.rates ?? [])
  const match = rates.find(r => r.kva === kva)
  return match ? match.hrs : m.hrs_per_unit
}

/** Returns true if the machine is scheduled to run on this day of week (1=Mon … 6=Sat) */
function isMachineOn(m: CuttingMachine, dayOfWeek: number): boolean {
  return !(m.off_days ?? []).includes(dayOfWeek)
}

/** Effective hours from WC Config (if wc_id set) or machine's own reg_hrs/ot_hrs */
function resolveHours(m: CuttingMachine, wcConfig: Record<string, WCConfig>, isSat: boolean, dayOfWeek?: number) {
  if (dayOfWeek !== undefined && !isMachineOn(m, dayOfWeek)) return { reg: 0, ot: 0 }
  const wc = m.wc_id ? wcConfig[m.wc_id] : null
  if (wc) return {
    reg: isSat ? (wc.sat_hrs ?? 0) : (wc.hrs ?? 8),
    ot:  isSat ? (wc.sat_ot ?? 0) : (wc.ot  ?? 4),
  }
  return {
    reg: isSat ? (m.reg_hrs ?? 8) / 2 : (m.reg_hrs ?? 8),
    ot:  isSat ? (m.ot_hrs  ?? 4) / 2 : (m.ot_hrs  ?? 4),
  }
}

const DAY_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const DAY_SHORT = ['อา','จ','อ','พ','พฤ','ศ','ส']
const REG_PER = 5 * 8 + 1 * 4   // 44h/week regular
const OT_PER  = 5 * 4            // 20h max OT

/**
 * Greedy LPT assignment — load-balance first, drill preference as tiebreaker.
 *
 * Rule: assign each order to the eligible machine with minimum score where
 *   score = current_wall_time − (drillPrefers ? DRILL_BONUS : 0)
 *
 * DRILL_BONUS is tiny (< one unit's wall time) so it only breaks ties.
 * As soon as a drill-capable machine is even slightly more loaded than an
 * alternative, the alternative wins → all machines finish at the same time.
 *
 * Order priority: exclusive (1 eligible machine) first, then LPT.
 */
const DRILL_BONUS = 0.0001   // soft drill preference — yields to any real load difference
const INDEX_BONUS = 1e-10    // reverse-index tiebreaker: higher machine index wins ties

/**
 * @param initWall  Starting wall time per machine (0 = daily mode, cumulative = weekly mode)
 * @param machIdx   Map of machineId → position in array (for index-based tiebreaker)
 */
function assignOrders(
  dayOrders: Order[],
  machines: CuttingMachine[],
  products: Record<string, { kva?: number }>,
  globalRates: CuttingRate[],
  initWall: Map<number, number> = new Map(),
  machIdx: Map<number, number> = new Map()
): Map<number, Order[]> {
  const assigned = new Map<number, Order[]>()
  const wall     = new Map<number, number>()
  machines.forEach((m, i) => {
    assigned.set(m.id, [])
    wall.set(m.id, initWall.get(m.id) ?? 0)
    if (!machIdx.has(m.id)) machIdx.set(m.id, i)
  })

  const el = (o: Order) => machines.filter(m => canMachineCut(m, o, products))

  // Sort: exclusive orders first, then LPT (largest wall contribution first)
  const sorted = [...dayOrders].sort((a, b) => {
    const ae = el(a), be = el(b)
    if (ae.length !== be.length) return ae.length - be.length
    return b.qty * (be[0]?.hrs_per_unit ?? 1) - a.qty * (ae[0]?.hrs_per_unit ?? 1)
  })

  for (const o of sorted) {
    const eligible = el(o)
    if (eligible.length === 0) continue

    // Score = wall_time − drill_bonus − index_bonus
    // Lower score = better candidate.
    // Drill bonus: prefer drill machine when load is equal.
    // Index bonus: higher-index machines preferred on ties → round-robin effect.
    const best = eligible.reduce((a, m) => {
      const sa = (wall.get(a.id) ?? 0) - (drillPrefers(a, o) ? DRILL_BONUS : 0) - (machIdx.get(a.id) ?? 0) * INDEX_BONUS
      const sm = (wall.get(m.id) ?? 0) - (drillPrefers(m, o) ? DRILL_BONUS : 0) - (machIdx.get(m.id) ?? 0) * INDEX_BONUS
      return sm < sa ? m : a
    })

    assigned.get(best.id)!.push(o)
    const kva = products[o.product ?? '']?.kva ?? o.kva ?? 0
    wall.set(best.id, (wall.get(best.id) ?? 0) + (o.qty * getHrsForKva(best, kva, globalRates)) / (best.count || 1))
  }
  return assigned
}

function fmtISO(d: Date) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
}

function getWeekRange(offset: number) {
  const today = new Date()
  const dow = today.getDay()
  const toMon = dow === 0 ? -6 : 1 - dow
  const mon = new Date(today)
  mon.setDate(today.getDate() + toMon + offset * 7)
  mon.setHours(0, 0, 0, 0)
  const sat = new Date(mon)
  sat.setDate(mon.getDate() + 5)
  sat.setHours(23, 59, 59, 999)
  return { mon, sat }
}

// ── Carry-over scheduler ──────────────────────────────────────────────────────
interface DayWork {
  order: Order
  qtyDone: number      // units cut today
  hrsWorked: number    // hours used today
  isCarryOver: boolean // started on a previous day
  carriesOver: boolean // not finished — continues tomorrow
}
interface MachineDaySched {
  regHrs: number; otHrs: number; otNeeded: number
  work: DayWork[]; hasCarryOver: boolean; carriesForward: boolean
}

/**
 * Simulates week day-by-day with carry-over.
 * Machine finishes current order before accepting new ones.
 * Returns Map<machineId, Map<dateStr, MachineDaySched>>
 */
function scheduleWeekWithCarryOver(
  assignedPerDay: { dStr: string; asgn: Map<number, Order[]> }[],
  machines: CuttingMachine[],
  products: Record<string, { kva?: number }>,
  globalRates: CuttingRate[]
): Map<number, Map<string, MachineDaySched>> {
  const result = new Map<number, Map<string, MachineDaySched>>()

  for (const m of machines) {
    const mMap = new Map<string, MachineDaySched>()
    result.set(m.id, mMap)

    // carry-over queue: {order, remainingQty, isCarryOver}
    let carryQueue: { order: Order; remainingQty: number; isCarryOver: boolean }[] = []

    for (const { dStr, asgn } of assignedPerDay) {
      const dow = new Date(dStr + 'T00:00:00').getDay()
      const isSat = dow === 6
      // Machine off today? → zero capacity, everything carries over
      const machineOff = !isMachineOn(m, dow)
      const regCap = machineOff ? 0 : (isSat ? m.reg_hrs / 2 : m.reg_hrs) * (m.count || 1)
      const otCap  = machineOff ? 0 : (isSat ? m.ot_hrs  / 2 : m.ot_hrs)  * (m.count || 1)

      // Add today's new orders ONLY after carry-over (appended to queue)
      const todayOrders = asgn.get(m.id) ?? []
      const fullQueue = [
        ...carryQueue,
        ...todayOrders.map(o => ({ order: o, remainingQty: o.qty, isCarryOver: false }))
      ]
      carryQueue = []

      const work: DayWork[] = []
      let remainingCap = regCap
      let otUsed = 0

      for (const item of fullQueue) {
        if (remainingCap <= 0 && otUsed >= otCap) {
          // No more capacity — whole item carries over
          carryQueue.push({ ...item, isCarryOver: true })
          continue
        }
        const kva = products[item.order.product]?.kva ?? item.order.kva ?? 0
        const hrsEach = getHrsForKva(m, kva, globalRates)
        const totalHrs = item.remainingQty * hrsEach

        const available = remainingCap + otCap - otUsed
        if (totalHrs <= available) {
          // Finish this order today
          const otForThis = Math.max(0, totalHrs - remainingCap)
          remainingCap = Math.max(0, remainingCap - totalHrs)
          otUsed += otForThis
          work.push({ order: item.order, qtyDone: item.remainingQty, hrsWorked: totalHrs, isCarryOver: item.isCarryOver, carriesOver: false })
        } else {
          // Partial — do as many units as possible
          const canDo = Math.floor(available / hrsEach)
          if (canDo > 0) {
            const hrsUsed = canDo * hrsEach
            const otForThis = Math.max(0, hrsUsed - remainingCap)
            remainingCap = Math.max(0, remainingCap - hrsUsed)
            otUsed += otForThis
            work.push({ order: item.order, qtyDone: canDo, hrsWorked: hrsUsed, isCarryOver: item.isCarryOver, carriesOver: true })
            carryQueue.push({ order: item.order, remainingQty: item.remainingQty - canDo, isCarryOver: true })
          } else {
            carryQueue.push({ ...item, isCarryOver: true })
          }
        }
      }

      const regUsed = regCap - Math.max(0, remainingCap)
      const otNeeded = Math.max(0, work.reduce((s, w) => s + w.hrsWorked, 0) - regCap)
      mMap.set(dStr, {
        regHrs: regUsed,
        otHrs: otUsed,
        otNeeded,
        work,
        hasCarryOver: carryQueue.length > 0 && fullQueue.some(q => q.isCarryOver),
        carriesForward: carryQueue.length > 0,
      })
    }
  }
  return result
}

/** Pull-forward: machine works through all week's orders continuously, no idle time */
function schedulePullForward(
  weekOrders: Order[], machines: CuttingMachine[],
  products: Record<string, { kva?: number }>, globalRates: CuttingRate[],
  wcConfig: Record<string, WCConfig>, days: Date[], machIdx: Map<number, number>
): Map<number, Map<string, MachineDaySched>> {
  const result = new Map<number, Map<string, MachineDaySched>>()
  const globalAsgn = assignOrders(weekOrders, machines, products, globalRates, new Map<number, number>(), new Map(machIdx))
  for (const m of machines) {
    const mMap = new Map<string, MachineDaySched>()
    result.set(m.id, mMap)
    const queue: { order: Order; remainingHrs: number }[] =
      (globalAsgn.get(m.id) ?? [])
        .sort((a, b) => (a.plan_date ?? '').localeCompare(b.plan_date ?? ''))
        .map(o => ({ order: o, remainingHrs: o.qty * getHrsForKva(m, products[o.product]?.kva ?? o.kva ?? 0, globalRates) }))
    let qi = 0
    for (const d of days) {
      const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      const dow = d.getDay(); const isSat = dow === 6
      const { reg, ot } = resolveHours(m, wcConfig, isSat, dow)
      const regCap = reg * (m.count || 1); const otCap = ot * (m.count || 1)
      const work: DayWork[] = []; let rem = regCap; let otUsed = 0
      while (qi < queue.length) {
        const avail = rem + otCap - otUsed; if (avail <= 0) break
        const item = queue[qi]
        const isCarryOver = (item.order.plan_date ?? '') < dStr
        if (item.remainingHrs <= avail) {
          const ot2 = Math.max(0, item.remainingHrs - rem); rem = Math.max(0, rem - item.remainingHrs); otUsed += ot2
          work.push({ order: item.order, hrsWorked: item.remainingHrs, isComplete: true, isCarryOver, carriesOver: false }); qi++
        } else {
          const h = avail; const ot2 = Math.max(0, h - rem); rem = 0; otUsed += ot2
          work.push({ order: item.order, hrsWorked: h, isComplete: false, isCarryOver, carriesOver: true }); item.remainingHrs -= h; break
        }
      }
      mMap.set(dStr, { regHrs: regCap - Math.max(0, rem), otHrs: otUsed, otNeeded: otUsed, work, hasCarryOver: work.some(w => w.isCarryOver), carriesForward: qi < queue.length })
    }
  }
  return result
}

/** Smart OT: use minimum weekday OT to avoid carry-overs; Saturday = 0 OT */
function scheduleSmartOT(
  assignedPerDay: { dStr: string; asgn: Map<number, Order[]> }[], machines: CuttingMachine[],
  products: Record<string, { kva?: number }>, globalRates: CuttingRate[], wcConfig: Record<string, WCConfig>
): Map<number, Map<string, MachineDaySched>> {
  const result = new Map<number, Map<string, MachineDaySched>>()
  for (const m of machines) {
    const mMap = new Map<string, MachineDaySched>(); result.set(m.id, mMap)
    let carryQueue: { order: Order; remainingHrs: number; isCarryOver: boolean }[] = []
    for (const { dStr, asgn } of assignedPerDay) {
      const dow = new Date(dStr + 'T00:00:00').getDay(); const isSat = dow === 6
      const { reg } = resolveHours(m, wcConfig, isSat, dow)
      const regCap = reg * (m.count || 1)
      const maxOt = isSat ? 0 : resolveHours(m, wcConfig, false, dow).ot * (m.count || 1)
      const todayOrders = asgn.get(m.id) ?? []
      const fullQueue = [...carryQueue, ...todayOrders.map(o => ({ order: o, remainingHrs: o.qty * getHrsForKva(m, products[o.product]?.kva ?? o.kva ?? 0, globalRates), isCarryOver: false }))]
      carryQueue = []; const work: DayWork[] = []; let regUsed = 0; let otUsed = 0
      for (const item of fullQueue) {
        const regAvail = regCap - regUsed
        if (regAvail <= 0) { carryQueue.push({ ...item, isCarryOver: true }); continue }
        if (item.remainingHrs <= regAvail) { regUsed += item.remainingHrs; work.push({ order: item.order, hrsWorked: item.remainingHrs, isComplete: true, isCarryOver: item.isCarryOver, carriesOver: false }) }
        else { work.push({ order: item.order, hrsWorked: regAvail, isComplete: false, isCarryOver: item.isCarryOver, carriesOver: true }); carryQueue.push({ order: item.order, remainingHrs: item.remainingHrs - regAvail, isCarryOver: true }); regUsed = regCap }
      }
      if (!isSat && maxOt > 0 && carryQueue.length > 0) {
        let otAvail = maxOt; const rescued: typeof carryQueue = []; const remaining: typeof carryQueue = []
        for (const item of carryQueue) {
          if (otAvail <= 0) { remaining.push(item); continue }
          if (item.remainingHrs <= otAvail) {
            otAvail -= item.remainingHrs; otUsed += item.remainingHrs
            const p = work.find(w => w.order.id === item.order.id && w.carriesOver)
            if (p) { p.hrsWorked += item.remainingHrs; p.isComplete = true; p.carriesOver = false }
            else work.push({ order: item.order, hrsWorked: item.remainingHrs, isComplete: true, isCarryOver: item.isCarryOver, carriesOver: false })
          } else {
            remaining.push({ order: item.order, remainingHrs: item.remainingHrs - otAvail, isCarryOver: true }); otUsed += otAvail; otAvail = 0
          }
        }
        carryQueue = remaining
      }
      mMap.set(dStr, { regHrs: regUsed, otHrs: otUsed, otNeeded: otUsed, work: work.filter(w => w.hrsWorked > 0.01), hasCarryOver: fullQueue.some(q => q.isCarryOver), carriesForward: carryQueue.length > 0 })
    }
  }
  return result
}

/** Hard constraint: kVA range only. max_kva ≥ 9999 = ไม่จำกัด (no upper limit). */
function canMachineCut(m: CuttingMachine, o: { product?: string; kva?: number | null }, products: Record<string, { kva?: number }> = {}): boolean {
  const kva = products[o.product ?? '']?.kva ?? o.kva ?? 0
  if (kva < m.min_kva) return false
  if (m.max_kva >= 9999) return true   // ไม่จำกัด — no upper bound
  return kva <= m.max_kva
}

/** Returns true if this machine prefers this order (drill type matches). */
function drillPrefers(m: CuttingMachine, o: { item_code?: string }): boolean {
  if (!m.drill_8mm && !m.drill_22mm) return false
  const { typeCode } = decodeItemInfo(o.item_code ?? '')
  if (typeCode === '4') return m.drill_22mm
  if (['1','2','3'].includes(typeCode)) return m.drill_8mm
  return false
}

function machineTypeLabel(m: CuttingMachine): { label: string; color: string } {
  if (m.drill_8mm && m.drill_22mm) return { label: '🔩 เจาะ 8+22mm',   color: 'var(--purple)' }
  if (m.drill_8mm)                 return { label: '🔩 เจาะ 8mm (Oil)', color: 'var(--blue)'   }
  if (m.drill_22mm)                return { label: '🔩 เจาะ 22mm (CR)', color: 'var(--amber)'  }
  return                                  { label: '✂ ตัดเท่านั้น',      color: 'var(--txt3)'  }
}

export default function CuttingMachines() {
  const { state, dispatch } = useApp()
  const { cuttingMachines: machines, orders, products, wcConfig } = state
  const [weekOffset, setWeekOffset] = useState(0)
  const [planSaving, setPlanSaving] = useState(false)
  const [planSaveMsg, setPlanSaveMsg] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<{ id: number; week_start: string; week_end: string; label: string; saved_at: string }[]>([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [viewSnap, setViewSnap] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving] = useState<number | null>(null)
  const [selectedCell, setSelectedCell] = useState<{ machineId: number; date: string } | null>(null)
  const [balanceMode, setBalanceMode] = useState<'daily' | 'weekly' | 'pull' | 'smart'>('daily')
  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'pipeline'>('cards')
  const [globalRates, setGlobalRates] = useState<CuttingRate[]>([])

  useEffect(() => {
    fetch('/api/cutting-rates').then(r => r.json()).then(setGlobalRates).catch(() => {})
  }, [])

  async function saveGlobalRates(rates: CuttingRate[]) {
    setGlobalRates(rates)
    await fetch('/api/cutting-rates', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rates) })
  }

  // ── Plan snapshot ────────────────────────────────────────────
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
            cutting_rates: globalRates,       // ⏱ เวลาตัดโลหะตามขนาด
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
                  kva: products[w.order.product]?.kva ?? w.order.kva,
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
    const m = { name: 'เครื่องตัด', count: 1, min_kva: 160, max_kva: 2500, hrs_per_unit: 2.5, laser: false, m4: false, min_face_mm: 1, max_face_mm: 9999, drill_8mm: false, drill_22mm: false, notes: '', reg_hrs: 8, ot_hrs: 4 }
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
      if (field === 'min_face_mm')  next.min_face_mm  = Math.max(1, parseInt(raw) || 1)
      if (field === 'max_face_mm')  next.max_face_mm  = Math.max(1, parseInt(raw) || 9999)
      if (field === 'notes')        next.notes        = raw
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

  async function handleToggle(id: number, field: 'laser' | 'm4' | 'drill_8mm' | 'drill_22mm') {
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
  const fmtD = (d: Date) => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0')
  const weekLabel = `${fmtD(mon)} – ${fmtD(sat)}/${String(sat.getFullYear() % 100).padStart(2, '0')}`

  const weekOrders = orders.filter(o => o.plan_date && o.plan_date >= monStr && o.plan_date <= satStr)

  const days = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d
  })

  // Machine index map for tiebreaker (built once)
  const machIdx = useMemo(() => {
    const m = new Map<number, number>()
    machines.forEach((mc, i) => m.set(mc.id, i))
    return m
  }, [machines.map(m => m.id).join(',')])  // eslint-disable-line

  // Compute optimal daily assignments
  const dailyAssignments = useMemo(() => {
    const cumWall = new Map<number, number>()
    machines.forEach(m => cumWall.set(m.id, 0))
    return days.map(d => {
      const dStr = fmtISO(d)
      const dow = d.getDay()
      // Only assign to machines that are ON today
      const activeMachines = machines.filter(m => isMachineOn(m, dow))
      const dayOrds = weekOrders.filter(o => o.plan_date === dStr)
      // Daily mode: each day starts fresh (wall=0) — balance within each day
      // Weekly mode: carry forward cumulative wall — balance across the week
      const initWall = balanceMode === 'weekly' ? new Map(cumWall) : new Map<number, number>()
      const asgn = assignOrders(dayOrds, activeMachines, products, globalRates, initWall, new Map(machIdx))
      // Always accumulate for weekly mode reference
      activeMachines.forEach(m => {
        const mOrd = asgn.get(m.id) ?? []
        const w = mOrd.reduce((a, o) => {
          const kva = products[o.product]?.kva ?? o.kva ?? 0
          return a + (o.qty * getHrsForKva(m, kva, globalRates)) / (m.count || 1)
        }, 0)
        cumWall.set(m.id, (cumWall.get(m.id) ?? 0) + w)
      })
      return { dStr, asgn }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceMode, globalRates.map(r => `${r.kva}:${r.hrs}`).join(','), weekOrders.map(o => o.id + o.qty).join(','), machines.map(m => `${m.id}${m.count}${m.hrs_per_unit}${m.min_kva}${m.max_kva}${+m.drill_8mm}${+m.drill_22mm}${(m.off_days??[]).join('-')}`).join(',')])

  // Machine index map for tiebreaker
  const machIdx = useMemo(() => { const mi = new Map<number,number>(); machines.forEach((m,i) => mi.set(m.id,i)); return mi }, [machines.map(m=>m.id).join(',')])  // eslint-disable-line

  // Schedule — algorithm depends on balanceMode
  const weekSchedule = useMemo(() => {
    if (balanceMode === 'pull') return schedulePullForward(weekOrders, machines, products, globalRates, wcConfig, days, new Map(machIdx))
    if (balanceMode === 'smart') return scheduleSmartOT(dailyAssignments, machines, products, globalRates, wcConfig)
    return scheduleWeekWithCarryOver(dailyAssignments, machines, products, globalRates)
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [balanceMode, dailyAssignments, machines.map(m => `${m.id}${m.reg_hrs}${m.ot_hrs}${(m.off_days??[]).join('-')}`).join(','), globalRates.map(r=>`${r.kva}:${r.hrs}`).join(',')])

  /**
   * SINGLE SOURCE OF TRUTH — compute everything once from weekSchedule.
   * All views (card, table, pipeline) read from weekData only.
   * No view calculates anything independently.
   */
  const weekData = useMemo(() => {
    // ── Per-machine weekly totals ──────────────────────────────
    const mTotals = machines.map(m => {
      let wallHrs = 0, qty = 0
      days.forEach(d => {
        const dStr = fmtISO(d)
        const sched = weekSchedule.get(m.id)?.get(dStr)
        if (!sched) return
        wallHrs += sched.regHrs + sched.otHrs
        qty += sched.work.filter(w => w.isComplete).length > 0
          ? sched.work.filter(w => w.isComplete).reduce((s, w) => {
              const kva = products[w.order.product]?.kva ?? w.order.kva ?? 0
              const hrsEach = getHrsForKva(m, kva, globalRates)
              return s + (hrsEach > 0 ? w.hrsWorked / hrsEach : 0)
            }, 0)
          : 0
      })
      // Count all orders (complete + in-progress) assigned to this machine
      const totalQty = days.reduce((s, d) => {
        const sched = weekSchedule.get(m.id)?.get(fmtISO(d))
        return s + (sched?.work.reduce((q, w) => q + w.order.qty, 0) ?? 0)
      }, 0)
      return { wallHrs, qty: totalQty, regCap: REG_PER, ot: Math.max(0, wallHrs - REG_PER), over: wallHrs > REG_PER + OT_PER }
    })

    // ── Per-day data for each machine ──────────────────────────
    const dayRows = days.map((d, di) => {
      const dStr = fmtISO(d)
      const dow = d.getDay()
      const isSat = dow === 6
      const dayOrders = weekOrders.filter(o => o.plan_date === dStr)
      const dayScheduledQty = dayOrders.reduce((a, o) => a + o.qty, 0)
      const dayKva = dayOrders.reduce((a, o) => a + ((o.total_kva ?? 0) > 0 ? (o.total_kva ?? 0) : (o.kva ?? 0) * (o.qty ?? 1)), 0)
      const unassigned = dayOrders.filter(o => machines.every(m => !canMachineCut(m, o, products)))

      const machineCells = machines.map(m => {
        const machOff = !isMachineOn(m, dow)
        const sched = weekSchedule.get(m.id)?.get(dStr)
        const work = sched?.work ?? []
        const wall = machOff ? 0 : (sched ? sched.regHrs + sched.otHrs : 0)
        const { reg: capH } = resolveHours(m, wcConfig, isSat, dow)
        const grp: Record<number, { drilled: boolean; partial: boolean }> = {}
        work.forEach(w => {
          const kva = products[w.order.product]?.kva ?? w.order.kva ?? 0
          if (!grp[kva]) grp[kva] = { drilled: drillPrefers(m, w.order), partial: !w.isComplete }
          if (!w.isComplete) grp[kva].partial = true
        })
        return { m, machOff, sched, work, wall, capH, grp }
      })

      const dayCarryQty = machineCells.reduce((a, mc) => a + mc.work.filter(w => w.isCarryOver).reduce((s, w) => s + w.order.qty, 0), 0)
      const dayWalls = machineCells.map(mc => mc.wall)
      const dayFinish = Math.max(...dayWalls, 0)
      const { reg: dayCapHrs } = machines[0] ? resolveHours(machines[0], wcConfig, isSat, dow) : { reg: isSat ? 4 : 8 }
      const finishCol = dayFinish === 0 ? 'var(--txt3)' : dayFinish <= dayCapHrs ? 'var(--green)' : dayFinish <= dayCapHrs * 2 ? 'var(--amber)' : 'var(--red)'

      return { dStr, d, di, dow, isSat, dayOrders, dayScheduledQty, dayKva, dayCarryQty, unassigned, machineCells, dayWalls, dayFinish, dayCapHrs, finishCol }
    })

    const bottleneckWall = mTotals.reduce((a, t) => Math.max(a, t.wallHrs), 0)
    const totalQtyWeek   = mTotals.reduce((a, t) => a + t.qty, 0)
    const totalKvaWeek   = weekOrders.reduce((a, o) => a + ((o.total_kva ?? 0) > 0 ? (o.total_kva ?? 0) : (o.kva ?? 0) * (o.qty ?? 1)), 0)
    const totalOT        = Math.max(0, bottleneckWall - REG_PER)
    const summaryStatus  = bottleneckWall > REG_PER + OT_PER ? 'over' : totalOT > 0 ? 'warn' : 'ok'

    return { mTotals, dayRows, bottleneckWall, totalQtyWeek, totalKvaWeek, totalOT, summaryStatus }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekSchedule, weekOrders.map(o=>o.id+o.qty).join(','), machines.map(m=>`${m.id}${(m.off_days??[]).join('-')}`).join(',')])

  const { mTotals, dayRows, bottleneckWall, totalQtyWeek, totalKvaWeek, totalOT, summaryStatus } = weekData

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className={styles.root}>

      {/* ── Config table ──────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.sectionTitle}>เครื่องตัดโลหะ — Metal Cutting Machines</span>
          <button className={styles.btn} onClick={handleAdd}>+ เพิ่มเครื่อง</button>
        </div>

        {machines.length === 0 ? (
          <p className={styles.empty}>ยังไม่มีเครื่องตัดโลหะ — กด "+ เพิ่มเครื่อง"</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>เครื่อง</th>
                  <th>จำนวน</th>
                  <th style={{ color: 'var(--blue)' }}>kVA ต่ำสุด</th>
                  <th style={{ color: 'var(--red)' }}>kVA สูงสุด</th>
                  <th style={{ color: 'var(--green)' }}>h/ตัว</th>
                  <th style={{ textAlign: 'center' }}>Laser</th>
                  <th style={{ textAlign: 'center' }}>M4</th>
                  <th style={{ textAlign: 'center' }}>หน้ากว้างต่ำสุด (mm)</th>
                  <th style={{ textAlign: 'center' }}>หน้ากว้างสูงสุด (mm)</th>
                  <th style={{ textAlign: 'center' }}>เจาะรู 8mm</th>
                  <th style={{ textAlign: 'center' }}>เจาะรู 22mm</th>
                  <th style={{ textAlign: 'center' }}>ชม.ปกติ/วัน</th>
                  <th style={{ textAlign: 'center' }}>OT สูงสุด/วัน</th>
                  <th style={{ textAlign: 'center', minWidth: 160 }}>วันทำงาน (คลิกปิด)</th>
                  <th style={{ textAlign: 'left', minWidth: 180 }}>หมายเหตุ / ข้อจำกัด</th>
                  <th style={{ textAlign: 'left' }}>หม้อแปลงที่รองรับ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {machines.map(m => {
                  const supported = Object.values(products)
                    .filter(p => p.kva && p.kva >= m.min_kva && p.kva <= m.max_kva)
                    .sort((a, b) => a.kva - b.kva)
                  const boolBtn = (val: boolean, field: 'laser' | 'm4' | 'drill_8mm' | 'drill_22mm') => (
                    <button onClick={() => handleToggle(m.id, field)} style={{
                      fontSize: 14, background: 'none', border: 'none', cursor: 'pointer',
                      opacity: val ? 1 : 0.35, padding: '2px 4px',
                    }}>{val ? '✅' : '❌'}</button>
                  )
                  return (
                    <tr key={m.id} className={saving === m.id ? styles.saving : ''}>
                      <td>
                        <input
                          className={styles.input}
                          defaultValue={m.name}
                          onBlur={e => handleChange(m.id, 'name', e.target.value)}
                          style={{ width: 130 }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          className={styles.inputNum}
                          type="number" min={1} max={20}
                          defaultValue={m.count}
                          onBlur={e => handleChange(m.id, 'count', e.target.value)}
                          style={{ color: 'var(--txt)', width: 46, fontWeight: 700, fontSize: 13 }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          className={styles.inputNum}
                          type="number" min={0} step={50}
                          defaultValue={m.min_kva <= 0 ? '' : m.min_kva}
                          placeholder="ไม่จำกัด"
                          onBlur={e => handleChange(m.id, 'min_kva', e.target.value || '0')}
                          style={{ color: 'var(--blue)', width: 72 }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          className={styles.inputNum}
                          type="number" min={0} step={50}
                          defaultValue={m.max_kva >= 9999 ? '' : m.max_kva}
                          placeholder="ไม่จำกัด"
                          onBlur={e => handleChange(m.id, 'max_kva', e.target.value || '9999')}
                          style={{ color: 'var(--red)', width: 72 }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          className={styles.inputNum}
                          type="number" min={0.1} step={0.5}
                          defaultValue={m.hrs_per_unit}
                          onBlur={e => handleChange(m.id, 'hrs_per_unit', e.target.value)}
                          style={{ color: 'var(--green)', width: 52 }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>{boolBtn(m.laser, 'laser')}</td>
                      <td style={{ textAlign: 'center' }}>{boolBtn(m.m4, 'm4')}</td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          className={styles.inputNum}
                          type="number" min={1}
                          defaultValue={m.min_face_mm <= 1 ? '' : m.min_face_mm}
                          placeholder="ไม่จำกัด"
                          onBlur={e => handleChange(m.id, 'min_face_mm', e.target.value || '1')}
                          style={{ width: 72, textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          className={styles.inputNum}
                          type="number" min={1}
                          defaultValue={m.max_face_mm >= 9999 ? '' : m.max_face_mm}
                          placeholder="ไม่จำกัด"
                          onBlur={e => handleChange(m.id, 'max_face_mm', e.target.value || '9999')}
                          style={{ width: 72, textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>{boolBtn(m.drill_8mm, 'drill_8mm')}</td>
                      <td style={{ textAlign: 'center' }}>{boolBtn(m.drill_22mm, 'drill_22mm')}</td>
                      <td style={{ textAlign: 'center' }}>
                        <input className={styles.inputNum} type="number" min={1} max={24} step={0.5}
                          defaultValue={m.reg_hrs ?? 8}
                          onBlur={e => handleChange(m.id, 'reg_hrs', e.target.value || '8')}
                          style={{ width: 52, color: 'var(--green)', fontWeight: 700 }} />
                        <span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 2 }}>h</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input className={styles.inputNum} type="number" min={0} max={12} step={0.5}
                          defaultValue={m.ot_hrs ?? 4}
                          onBlur={e => handleChange(m.id, 'ot_hrs', e.target.value || '0')}
                          style={{ width: 52, color: 'var(--amber)', fontWeight: 700 }} />
                        <span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 2 }}>h</span>
                      </td>
                      {/* Day-on/off picker — Mon=1 … Sat=6 */}
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                          {[1,2,3,4,5,6].map(dow => {
                            const isOff = (m.off_days ?? []).includes(dow)
                            const label = DAY_SHORT[dow]
                            return (
                              <button key={dow} onClick={() => toggleOffDay(m.id, dow)}
                                title={isOff ? `เปิด ${DAY_TH[dow]}` : `ปิด ${DAY_TH[dow]}`}
                                style={{
                                  width: 22, height: 22, borderRadius: 4, border: '1px solid var(--bord2)',
                                  fontSize: 9, fontWeight: 700, cursor: 'pointer',
                                  background: isOff ? 'rgba(224,90,78,.15)' : 'rgba(166,227,161,.15)',
                                  color: isOff ? 'var(--red)' : 'var(--green)',
                                  textDecoration: isOff ? 'line-through' : 'none',
                                }}>
                                {label}
                              </button>
                            )
                          })}
                        </div>
                        {(m.off_days ?? []).length > 0 && (
                          <div style={{ fontSize: 8, color: 'var(--red)', marginTop: 3 }}>
                            ปิด: {(m.off_days ?? []).map(d => DAY_SHORT[d]).join(' ')}
                          </div>
                        )}
                      </td>
                      <td>
                        <input
                          className={styles.input}
                          defaultValue={m.notes}
                          onBlur={e => handleChange(m.id, 'notes', e.target.value)}
                          style={{ width: '100%', minWidth: 180 }}
                        />
                      </td>
                      <td>
                        <div className={styles.chips}>
                          {supported.length === 0
                            ? <span className={styles.dim}>—</span>
                            : supported.map(p => {
                                const col = p.kva <= 400 ? 'var(--blue)' : p.kva <= 3500 ? 'var(--amber)' : 'var(--red)'
                                return (
                                  <span key={p.kva} className={styles.chip} style={{ color: col }}>
                                    {p.label.split('—')[0].trim()}
                                  </span>
                                )
                              })}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button className={styles.delBtn} onClick={() => handleDelete(m.id)}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Global Cutting Rates ─────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.sectionTitle}>⏱ เวลาตัดโลหะตามขนาด (มาตรฐานทุกเครื่อง)</span>
          <span style={{ fontSize: 10, color: 'var(--txt3)' }}>ใช้กับทุกเครื่องตัด — ถ้าไม่มีขนาดที่ตรงจะใช้ค่า h/ตัว จากตารางด้านบน</span>
        </div>
        <div style={{ padding: '10px 16px' }}>
          {/* Table header */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 10, fontWeight: 700, color: 'var(--txt3)' }}>
            <span style={{ width: 90, textAlign: 'right' }}>ขนาด (kVA)</span>
            <span style={{ width: 16 }} />
            <span style={{ width: 80, textAlign: 'right' }}>เวลาตัด (h)</span>
            <span style={{ width: 60 }} />
          </div>
          {globalRates.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--txt3)', padding: '8px 0' }}>ยังไม่มีข้อมูล — ใช้ค่า h/ตัว ของแต่ละเครื่องแทน</div>
          )}
          {[...globalRates].sort((a, b) => a.kva - b.kva).map((r, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <input type="number" min={0} placeholder="kVA" value={r.kva || ''}
                onChange={e => {
                  const next = globalRates.map((x, i) => i === ri ? { ...x, kva: parseFloat(e.target.value) || 0 } : x)
                  saveGlobalRates(next)
                }}
                style={{ width: 90, fontSize: 12, padding: '4px 8px', background: 'var(--bg3)', border: '1px solid var(--bord2)', borderRadius: 6, color: 'var(--blue)', fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'right' }} />
              <span style={{ fontSize: 11, color: 'var(--txt3)' }}>kVA →</span>
              <input type="number" min={0} step={0.1} placeholder="h" value={r.hrs || ''}
                onChange={e => {
                  const next = globalRates.map((x, i) => i === ri ? { ...x, hrs: parseFloat(e.target.value) || 0 } : x)
                  saveGlobalRates(next)
                }}
                style={{ width: 80, fontSize: 12, padding: '4px 8px', background: 'var(--bg3)', border: '1px solid var(--bord2)', borderRadius: 6, color: 'var(--amber)', fontFamily: 'var(--mono)', textAlign: 'right' }} />
              <span style={{ fontSize: 11, color: 'var(--txt3)' }}>h/ตัว</span>
              <button onClick={() => saveGlobalRates(globalRates.filter((_, i) => i !== ri))}
                style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '0 4px' }}>✕</button>
            </div>
          ))}
          <button onClick={() => saveGlobalRates([...globalRates, { kva: 0, hrs: 2.5 }])}
            style={{ fontSize: 11, padding: '5px 16px', borderRadius: 7, border: '1px solid rgba(137,180,250,.3)', background: 'rgba(137,180,250,.08)', color: 'var(--blue)', cursor: 'pointer', marginTop: 4 }}>
            + เพิ่มขนาด
          </button>
        </div>
      </div>

      {/* ── Weekly plan ──────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.sectionTitle}>แผนการตัดโลหะ — สัปดาห์</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12 }}>
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
            <span style={{ fontSize: 10, color: 'var(--txt3)', marginLeft: 6 }}>สมดุล:</span>
            {(['daily', 'weekly', 'pull', 'smart'] as const).map(mode => (
              <button key={mode} onClick={() => setBalanceMode(mode)} style={{
                fontSize: 10, padding: '3px 10px', borderRadius: 12, border: '1px solid var(--bord2)', cursor: 'pointer',
                background: balanceMode === mode ? 'var(--blue)' : 'var(--bg3)',
                color: balanceMode === mode ? '#000' : 'var(--txt2)', fontWeight: balanceMode === mode ? 700 : 400,
              }}>
                {mode === 'daily' ? '📅 รายวัน' : mode === 'weekly' ? '📆 สัปดาห์' : mode === 'pull' ? '⏩ เติมเต็ม' : '⚡ Smart OT'}
              </button>
            ))}
          </div>
          <div className={styles.weekNav}>
            <button className={styles.btn} onClick={() => setWeekOffset(w => w - 1)}>‹ ก่อนหน้า</button>
            <span className={styles.weekLabel}>{weekLabel}</span>
            <button className={styles.btn} onClick={() => setWeekOffset(w => w + 1)}>ถัดไป ›</button>
            {weekOffset !== 0 && (
              <button className={styles.btnGhost} onClick={() => setWeekOffset(0)}>สัปดาห์นี้</button>
            )}
          </div>
        </div>
        {/* Save plan bar — separate row, always visible */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--bord)', flexShrink: 0 }}>
          <button onClick={() => savePlan('')} disabled={planSaving || weekOrders.length === 0}
            style={{ fontSize: 11, padding: '5px 14px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#000', fontWeight: 700, cursor: 'pointer', opacity: (planSaving || weekOrders.length === 0) ? 0.5 : 1 }}>
            {planSaving ? 'กำลังบันทึก…' : '💾 บันทึกแผน'}
          </button>
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
                            <td style={{ padding: '2px 5px', fontWeight: 700 }}>{m.name}</td>
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
              <span style={{ fontWeight: 700 }}>{totalQtyWeek} ตัว · {weekOrders.length} orders</span>
              {totalOT > 0
                ? <span className={styles.warn}>⚠ OT สูงสุด {totalOT.toFixed(1)}h/วัน</span>
                : <span className={styles.ok}>✓ เสร็จในเวลาปกติทุกวัน</span>}
            </div>

            {/* ── CARD VIEW ── */}
            {viewMode === 'cards' && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dayRows.map(row => {
                const { dStr, d, isSat, dayOrders, dayScheduledQty, dayKva, dayCarryQty, unassigned, machineCells, dayFinish, dayCapHrs, finishCol } = row
                if (dayOrders.length === 0) return null
                const isToday = dStr === fmtISO(new Date())
                const totalQty = dayScheduledQty

                return (
                  <div key={dStr} style={{ border: `1px solid ${isToday ? 'var(--blue)' : 'var(--bord)'}`, borderRadius: 8, overflow: 'hidden' }}>
                    {/* Day header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', background: isToday ? 'rgba(137,180,250,.08)' : 'var(--bg2)', borderBottom: '1px solid var(--bord)' }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: isToday ? 'var(--blue)' : isSat ? 'var(--txt2)' : 'var(--txt)' }}>
                        {DAY_TH[d.getDay()]} {fmtD(d)}{isToday ? ' ◀ วันนี้' : ''}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{totalQty} ตัว · {dayOrders.length} orders</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: finishCol, fontFamily: 'var(--mono)', marginLeft: 'auto' }}>
                        เสร็จใน {dayFinish.toFixed(1)}h
                        {dayFinish > dayCapHrs && <span style={{ fontSize: 9, marginLeft: 4 }}>⚠ OT {(dayFinish - dayCapHrs).toFixed(1)}h</span>}
                      </span>
                    </div>

                    {/* Machine rows — data from weekData.machineCells (same source for all views) */}
                    <div style={{ padding: '6px 0' }}>
                      {machineCells.map(({ m, machOff, sched, work, wall, capH, grp }) => {
                        if (machOff) return (
                          <div key={m.id} style={{ display: 'flex', alignItems: 'center', padding: '4px 14px', borderBottom: '0.5px solid var(--bord)', gap: 8, opacity: 0.5 }}>
                            <div style={{ minWidth: 140, fontSize: 10, fontWeight: 700, color: 'var(--red)' }}>🔴 {m.name}</div>
                            <span style={{ fontSize: 9, color: 'var(--txt3)' }}>ปิดวันนี้</span>
                          </div>
                        )
                        if (!sched || (work.length === 0 && !sched.hasCarryOver)) return null
                        const totalH = wall
                        const timeCol = sched.carriesForward ? 'var(--red)' : sched.otHrs > 0 ? 'var(--amber)' : 'var(--green)'
                        return (
                          <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', padding: '6px 14px', borderBottom: '0.5px solid var(--bord)', gap: 0 }}>
                            {/* Machine name + time */}
                            <div style={{ minWidth: 140, flexShrink: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt)' }}>
                                {m.name}
                                {sched.hasCarryOver && <span style={{ fontSize: 8, marginLeft: 4, color: 'var(--blue)', background: 'rgba(137,180,250,.15)', padding: '1px 4px', borderRadius: 4 }}>↩ ต่อจากเมื่อวาน</span>}
                              </div>
                              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: timeCol, fontWeight: 600 }}>
                                {totalH.toFixed(1)}h / {capH}h
                                {sched.otHrs > 0 && <span style={{ color: 'var(--amber)', marginLeft: 4 }}>+OT {sched.otHrs.toFixed(1)}h</span>}
                                {sched.carriesForward && <span style={{ color: 'var(--red)', marginLeft: 4 }}>→ พรุ่งนี้</span>}
                              </div>
                            </div>
                            {/* Work items */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {sched.work.map((w, wi) => {
                                const kva = products[w.order.product]?.kva ?? w.order.kva ?? 0
                                const { typeCode } = decodeItemInfo(w.order.item_code ?? '')
                                const kvaCol = kva <= 400 ? 'var(--blue)' : kva <= 3500 ? 'var(--amber)' : 'var(--red)'
                                const typeLabel = typeCode === '4' ? 'CR' : ['1','2','3'].includes(typeCode) ? 'Oil' : ''
                                return (
                                  <div key={wi} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                                    {w.isCarryOver && <span style={{ fontSize: 8, color: 'var(--blue)' }}>↩</span>}
                                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt3)', fontSize: 9, minWidth: 110 }}>{w.order.sap_so || w.order.id.slice(-10)}</span>
                                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: kvaCol }}>{kva.toLocaleString()}kVA</span>
                                    <span style={{ color: w.carriesOver ? 'var(--red)' : 'var(--txt3)' }}>
                                      {w.qtyDone}/{w.order.qty} ตัว
                                      {w.carriesOver && <span style={{ fontSize: 8, marginLeft: 3 }}>→ต่อ</span>}
                                    </span>
                                    {typeLabel && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 4, background: typeCode === '4' ? 'rgba(250,179,135,.2)' : 'rgba(137,180,250,.15)', color: typeCode === '4' ? 'var(--amber)' : 'var(--blue)' }}>{typeLabel}</span>}
                                    {drillPrefers(m, w.order) && <span style={{ fontSize: 9 }}>🔩</span>}
                                    <span style={{ color: 'var(--txt3)', marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9 }}>{w.hrsWorked.toFixed(1)}h</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                      {/* Unassigned */}
                      {unassigned.map((o, i) => {
                        const kva = products[o.product]?.kva ?? o.kva ?? 0
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', fontSize: 10, color: 'var(--red)' }}>
                            <div style={{ minWidth: 140, flexShrink: 0, fontSize: 11, fontWeight: 700 }}>⚠ ไม่มีเครื่อง</div>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--txt3)', minWidth: 110 }}>{o.sap_so || o.id.slice(-10)}</span>
                            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{kva.toLocaleString()}kVA ×{o.qty}</span>
                            <span style={{ fontSize: 9, marginLeft: 8, color: 'var(--txt3)' }}>เพิ่ม max_kva ให้เครื่องตัด</span>
                          </div>
                        )
                      })}
                    </div>

                    {/* OT recommendation for this day */}
                    {(() => {
                      const otMachines = machines.filter(m => (weekSchedule.get(m.id)?.get(dStr)?.otNeeded ?? 0) > 0)
                      const carryMachines = machines.filter(m => weekSchedule.get(m.id)?.get(dStr)?.carriesForward)
                      if (!otMachines.length && !carryMachines.length) return null
                      return (
                        <div style={{ padding: '5px 14px', background: 'rgba(250,179,135,.06)', borderTop: '1px dashed var(--bord)', fontSize: 10 }}>
                          {otMachines.length > 0 && (
                            <span style={{ color: 'var(--amber)', marginRight: 12 }}>
                              ⚠ OT แนะนำ: {otMachines.map(m => `${m.name} +${(weekSchedule.get(m.id)!.get(dStr)!.otNeeded).toFixed(1)}h`).join(', ')}
                            </span>
                          )}
                          {carryMachines.length > 0 && (
                            <span style={{ color: 'var(--red)' }}>
                              ↩ งานค้าง: {carryMachines.map(m => m.name).join(', ')} → ต่อวันถัดไป
                            </span>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </div>}

            {/* ── TABLE VIEW ── */}
            {viewMode === 'table' && (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', minWidth: 110 }}>วัน</th>
                      {machines.map((m, i) => {
                        const t = mTotals[i]
                        const col = t.over ? 'var(--red)' : t.ot > 0 ? 'var(--amber)' : 'var(--green)'
                        const typeInfo = machineTypeLabel(m)
                        return (
                          <th key={m.id} style={{ textAlign: 'center', minWidth: 150, borderLeft: '1px solid var(--bord)' }}>
                            <div style={{ fontWeight: 700 }}>{m.name}</div>
                            <div style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, display: 'inline-block', marginTop: 2, background: `${typeInfo.color}22`, color: typeInfo.color, fontWeight: 600 }}>{typeInfo.label}</div>
                            <div style={{ fontSize: 9, color: 'var(--txt3)', fontWeight: 400, marginTop: 2 }}>{m.min_kva}–{m.max_kva >= 9999 ? '∞' : m.max_kva}kVA · {m.hrs_per_unit}h/ตัว</div>
                            <div style={{ fontSize: 9, color: col, fontWeight: 600, marginTop: 2 }}>{t.qty} ตัว · {t.wallHrs.toFixed(1)}h{t.ot > 0 ? ` · OT ${t.ot.toFixed(1)}h` : ''}</div>
                          </th>
                        )
                      })}
                      <th style={{ textAlign: 'center', borderLeft: '2px solid var(--bord2)', whiteSpace: 'nowrap' }}>รวม/วัน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayRows.map(row => {
                      const { dStr, d, isSat, dayOrders, dayScheduledQty, dayCarryQty, unassigned: dayUnassigned2, machineCells, dayFinish, dayCapHrs, finishCol } = row
                      const isToday = dStr === fmtISO(new Date())
                      const dayTotalQty = dayScheduledQty
                      return (
                        <tr key={dStr} className={isToday ? styles.today : isSat ? styles.saturday : ''}>
                          <td>
                            <div style={{ fontWeight: isToday ? 700 : 600, fontSize: 11, color: isToday ? 'var(--blue)' : isSat ? 'var(--txt2)' : 'var(--txt)' }}>
                              {DAY_TH[d.getDay()]} {fmtD(d)}{isToday ? ' ◀' : ''}
                            </div>
                            <div style={{ fontSize: 9, color: 'var(--txt3)' }}>{dayOrders.length} orders · {dayOrders.reduce((a, o) => a + o.qty, 0)} ตัว</div>
                            {dayOrders.filter(o => machines.every(m => !canMachineCut(m, o, products))).map((o, i) => (
                              <div key={i} style={{ fontSize: 8, color: 'var(--red)', fontFamily: 'var(--mono)', padding: '1px 4px', borderRadius: 4, background: 'rgba(224,90,78,.1)', marginTop: 2 }}>
                                ⚠ {(products[o.product]?.kva ?? o.kva ?? 0).toLocaleString()}kVA ×{o.qty}
                              </div>
                            ))}
                          </td>
                          {machineCells.map(({ m, machOff, sched, work, wall, capH, grp: cellGrp }, mi) => {
                            if (machOff) return (
                              <td key={m.id} style={{ verticalAlign: 'top', borderLeft: '1px solid var(--bord)', background: 'rgba(224,90,78,.04)', textAlign: 'center', color: 'var(--red)', fontSize: 9, fontWeight: 700, padding: 6 }}>
                                🔴 ปิด
                              </td>
                            )
                            const grp = cellGrp
                            const col = work.length === 0 ? 'var(--txt3)' : wall <= capH ? 'var(--green)' : wall <= capH * 2 ? 'var(--amber)' : 'var(--red)'
                            const isSelected = selectedCell?.machineId === m.id && selectedCell?.date === dStr
                            return (
                              <td key={m.id} style={{ verticalAlign: 'top', borderLeft: '1px solid var(--bord)', cursor: work.length > 0 ? 'pointer' : 'default', background: isSelected ? 'rgba(137,180,250,.08)' : undefined }}
                                onClick={() => work.length > 0 && setSelectedCell(isSelected ? null : { machineId: m.id, date: dStr })}>
                                {work.length === 0 ? <span className={styles.dim}>—</span> : (
                                  <>
                                    {sched?.hasCarryOver && <span style={{ fontSize: 7, color: 'var(--blue)', display: 'block', marginBottom: 2 }}>↩ ต่อ</span>}
                                    <div className={styles.chips} style={{ marginBottom: 3 }}>
                                      {Object.entries(grp).sort((a, b) => +a[0] - +b[0]).map(([kva, g]) => (
                                        <span key={kva} className={styles.chip} style={{ color: +kva <= 400 ? 'var(--blue)' : +kva <= 3500 ? 'var(--amber)' : 'var(--red)', opacity: g.partial ? 0.7 : 1 }}>
                                          {(+kva).toLocaleString()}kVA{g.drilled ? '🔩' : ''}{g.partial ? '→' : ''}
                                        </span>
                                      ))}
                                    </div>
                                    <div style={{ fontSize: 9, color: col, fontWeight: 600 }}>
                                      {wall.toFixed(1)}h
                                      {sched?.otHrs ? <span style={{ color: 'var(--amber)', marginLeft: 4 }}>+OT {sched.otHrs.toFixed(1)}h</span> : ''}
                                      {sched?.carriesForward && <span style={{ color: 'var(--red)', marginLeft: 4 }}>→</span>}
                                    </div>
                                    {isSelected && (
                                      <div style={{ marginTop: 4, borderTop: '1px solid var(--bord)', paddingTop: 4 }}>
                                        {work.map((w, idx) => {
                                          const kva = products[w.order.product]?.kva ?? w.order.kva ?? 0
                                          const totalH = w.order.qty * getHrsForKva(m, kva, globalRates)
                                          return (
                                            <div key={idx} style={{ fontSize: 9, display: 'flex', gap: 4, marginBottom: 2 }}>
                                              {w.isCarryOver && <span style={{ color: 'var(--blue)', fontSize: 7 }}>↩</span>}
                                              <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt3)', fontSize: 8 }}>{w.order.sap_so || w.order.id.slice(-8)}</span>
                                              <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{kva.toLocaleString()}kVA ×{w.order.qty}</span>
                                              <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', color: w.carriesOver ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                                                {w.hrsWorked.toFixed(1)}h{totalH > 0 ? `/${totalH.toFixed(1)}h` : ''}{w.isComplete ? ' ✓' : ' →'}
                                              </span>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </>
                                )}
                              </td>
                            )
                          })}
                          <td style={{ textAlign: 'center', borderLeft: '2px solid var(--bord2)', verticalAlign: 'middle' }}>
                            {dayTotalQty > 0 ? (
                              <>
                                <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12 }}>{dayTotalQty} ตัว</div>
                                <div style={{ fontSize: 9, color: finishCol, fontWeight: 600 }}>เสร็จใน {dayFinish.toFixed(1)}h</div>
                              </>
                            ) : <span className={styles.dim}>—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className={styles.footerRow}>
                      <td style={{ fontWeight: 700, color: 'var(--txt2)', fontSize: 10 }}>รวมสัปดาห์</td>
                      {machines.map((m, i) => {
                        const t = mTotals[i]
                        const col = t.over ? 'var(--red)' : t.ot > 0 ? 'var(--amber)' : 'var(--green)'
                        const pct = Math.min(100, Math.round(t.wallHrs / t.regCap * 100))
                        return (
                          <td key={m.id} style={{ textAlign: 'center', borderLeft: '1px solid var(--bord)' }}>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: col }}>{t.qty} ตัว</div>
                            <div style={{ fontSize: 9, color: 'var(--txt3)' }}>{t.wallHrs.toFixed(1)}h / {t.regCap}h</div>
                            <div style={{ height: 4, background: 'var(--bg4)', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 3 }} />
                            </div>
                          </td>
                        )
                      })}
                      <td style={{ textAlign: 'center', borderLeft: '2px solid var(--bord2)' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13 }}>{totalQtyWeek} ตัว</div>
                        <div style={{ fontSize: 9, color: 'var(--txt3)' }}>{bottleneckWall.toFixed(1)}h</div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* ── PIPELINE VIEW — horizontal timeline per machine ── */}
            {viewMode === 'pipeline' && (() => {
              // Build timeline segments from weekSchedule (same data as card/table)
              const COLORS = ['#89b4fa','#fab387','#a6e3a1','#cba6f7','#f38ba8','#f9e2af','#94e2d5','#89dceb']
              const orderColor = new Map<string, string>()
              let ci = 0
              weekOrders.forEach(o => { if (!orderColor.has(o.id)) orderColor.set(o.id, COLORS[ci++ % COLORS.length]) })

              // Day layout: width proportional to regular hours
              const dayRegHrs = days.map(d => {
                const isSat = d.getDay() === 6
                const m0 = machines[0]
                if (!m0) return isSat ? 4 : 8
                return resolveHours(m0, wcConfig, isSat, d.getDay()).reg || (isSat ? 4 : 8)
              })
              const totalHrs = dayRegHrs.reduce((a, h) => a + h, 0) || 1
              const dayStart = dayRegHrs.reduce<number[]>((acc, h, i) => { acc.push(i === 0 ? 0 : acc[i-1] + dayRegHrs[i-1]); return acc }, [])

              interface Seg { order: Order; start: number; dur: number; isCarryOver: boolean; carriesOver: boolean; isComplete: boolean }
              const machineSegs = machines.map(m => {
                const segs: Seg[] = []
                days.forEach((d, di) => {
                  const dStr = fmtISO(d)
                  const sched = weekSchedule.get(m.id)?.get(dStr)
                  if (!sched) return
                  let within = 0
                  sched.work.forEach(w => {
                    segs.push({ order: w.order, start: dayStart[di] + within, dur: w.hrsWorked, isCarryOver: w.isCarryOver, carriesOver: w.carriesOver, isComplete: w.isComplete })
                    within += w.hrsWorked
                  })
                })
                return { m, segs }
              })

              return (
                <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
                  {/* Day ruler */}
                  <div style={{ display: 'flex', marginLeft: 130, marginBottom: 4 }}>
                    {days.map((d, di) => {
                      const isSat = d.getDay() === 6
                      const off = machines.filter(m => !isMachineOn(m, d.getDay()))
                      return (
                        <div key={di} style={{ width: `${dayRegHrs[di]/totalHrs*100}%`, flexShrink: 0, textAlign: 'center', fontSize: 9, color: isSat ? 'var(--amber)' : 'var(--txt3)', borderLeft: '1px solid var(--bord)', paddingTop: 2 }}>
                          {DAY_SHORT[d.getDay()]} {fmtD(d)}
                          {off.length > 0 && <span style={{ color: 'var(--red)', marginLeft: 3 }}>🔴{off.length}</span>}
                        </div>
                      )
                    })}
                  </div>

                  {/* Machine rows */}
                  {machineSegs.map(({ m, segs }) => {
                    const t = mTotals[machines.indexOf(m)]
                    const col = t.over ? 'var(--red)' : t.ot > 0 ? 'var(--amber)' : 'var(--green)'
                    return (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}>
                        <div style={{ width: 130, flexShrink: 0, paddingRight: 8 }}>
                          <div style={{ fontSize: 10, fontWeight: 700 }}>{m.name}</div>
                          <div style={{ fontSize: 8, color: col, fontFamily: 'var(--mono)' }}>{t.qty}ตัว·{t.wallHrs.toFixed(1)}h</div>
                        </div>
                        <div style={{ flex: 1, position: 'relative', height: 32, background: 'var(--bg3)', borderRadius: 4, border: '1px solid var(--bord)', overflow: 'hidden' }}>
                          {/* Day dividers + off-day shading */}
                          {days.map((d, di) => (
                            <div key={di} style={{ position: 'absolute', left: `${dayStart[di]/totalHrs*100}%`, top: 0, bottom: 0, width: `${dayRegHrs[di]/totalHrs*100}%`,
                              background: !isMachineOn(m, d.getDay()) ? 'rgba(224,90,78,.15)' : undefined,
                              borderLeft: di > 0 ? '1px dashed var(--bord2)' : undefined, zIndex: 1 }}>
                              {!isMachineOn(m, d.getDay()) && <span style={{ fontSize: 7, color: 'var(--red)', position: 'absolute', top: 2, left: 2 }}>🔴</span>}
                            </div>
                          ))}
                          {/* Order segments */}
                          {segs.map((seg, si) => {
                            const kva = products[seg.order.product]?.kva ?? seg.order.kva ?? 0
                            const color = orderColor.get(seg.order.id) ?? '#89b4fa'
                            const left = seg.start / totalHrs * 100
                            const width = Math.max(seg.dur / totalHrs * 100, 0.3)
                            return (
                              <div key={si} title={`${seg.order.sap_so||seg.order.id.slice(-6)} · ${kva.toLocaleString()}kVA×${seg.order.qty} · ${seg.dur.toFixed(1)}h${seg.isCarryOver?' (↩)':''}${seg.carriesOver?' →':seg.isComplete?' ✓':''}`}
                                style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: 2, bottom: 2, borderRadius: 3, zIndex: 2,
                                  background: color, opacity: seg.isCarryOver ? 0.7 : 0.9,
                                  borderLeft: seg.isCarryOver ? '3px solid rgba(0,0,0,.3)' : undefined,
                                  borderRight: seg.carriesOver ? '3px solid rgba(0,0,0,.4)' : undefined,
                                  display: 'flex', alignItems: 'center', overflow: 'hidden', paddingLeft: 2 }}>
                                <span style={{ fontSize: 7, color: '#11111b', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--mono)' }}>
                                  {kva >= 1000 ? `${kva/1000}k` : kva}{seg.isComplete ? '✓' : seg.carriesOver ? '→' : ''} {seg.dur.toFixed(1)}h
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ marginLeft: 130, fontSize: 9, color: 'var(--txt3)', marginTop: 4, display: 'flex', gap: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: '#89b4fa', display: 'inline-block' }}/>งานใหม่</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: '#89b4fa', opacity: 0.7, borderLeft: '3px solid rgba(0,0,0,.3)', display: 'inline-block' }}/>ต่อจากเมื่อวาน</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: '#89b4fa', borderRight: '3px solid rgba(0,0,0,.4)', display: 'inline-block' }}/>ยังไม่เสร็จ→</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: 'rgba(224,90,78,.15)', display: 'inline-block' }}/>🔴 ปิด</span>
                  </div>
                </div>
              )
            })()}
          </>
        )}
      </div>
    </div>
  )
}
