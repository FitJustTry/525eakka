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
import * as XLSX from 'xlsx'
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
function getHrsForKva(m: CuttingMachine, kva: number, globalRates: CuttingRate[], itemCode?: string): number {
  // Cast Resin (item code position 1 = '4') — use TMC rate table first, then tmc_hrs fallback
  if (itemCode && itemCode[1] === '4') {
    const tmcMatch = (m.tmc_rates ?? []).find(r => r.kva === kva)  // kVA-specific TMC rate
    if (tmcMatch) return tmcMatch.hrs
    if ((m.tmc_hrs ?? 0) > 0) return m.tmc_hrs!                    // single-value fallback
    // No TMC configured → fall through to normal kVA rate
  }
  // Priority: machine-specific rate → global rate → hrs_per_unit
  const machineMatch = (m.rates ?? []).find(r => r.kva === kva)
  if (machineMatch) return machineMatch.hrs * (m.time_mul ?? 1) + (m.tmc_hrs ?? 0)
  const globalMatch = globalRates.find(r => r.kva === kva)
  const base = globalMatch ? globalMatch.hrs : m.hrs_per_unit
  return base * (m.time_mul ?? 1) + (m.tmc_hrs ?? 0)
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
  machIdx: Map<number, number> = new Map(),
  strictWire = false,
  requireDrill = false
): Map<number, Order[]> {
  const assigned = new Map<number, Order[]>()
  const wall     = new Map<number, number>()
  machines.forEach((m, i) => {
    assigned.set(m.id, [])
    wall.set(m.id, initWall.get(m.id) ?? 0)
    if (!machIdx.has(m.id)) machIdx.set(m.id, i)
  })

  const el = (o: Order) => machines.filter(m => canMachineCut(m, o, products, strictWire, requireDrill))

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
      const pref = (mc: CuttingMachine) => (drillPrefers(mc, o) ? DRILL_BONUS : 0) + (wirePrefers(mc, o) ? DRILL_BONUS : 0)
      const sa = (wall.get(a.id) ?? 0) - pref(a) - (machIdx.get(a.id) ?? 0) * INDEX_BONUS
      const sm = (wall.get(m.id) ?? 0) - pref(m) - (machIdx.get(m.id) ?? 0) * INDEX_BONUS
      return sm < sa ? m : a
    })

    assigned.get(best.id)!.push(o)
    const kva = o.kva ?? products[o.product ?? '']?.kva ?? 0
    wall.set(best.id, (wall.get(best.id) ?? 0) + (o.qty * getHrsForKva(best, kva, globalRates, o.item_code)) / (best.count || 1))
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
  hrsWorked: number    // hours used today
  isComplete: boolean  // order fully done
  isCarryOver: boolean // started on a previous day
  carriesOver: boolean // not finished — continues tomorrow
}
interface MachineDaySched {
  regHrs: number; otHrs: number; otNeeded: number
  work: DayWork[]; hasCarryOver: boolean; carriesForward: boolean
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  FASTEST SCHEDULER — 🏎 เร็วสุด (3 modes, one per OT policy)
 * ═══════════════════════════════════════════════════════════════
 *
 *  Key difference from weekly shared-pool mode:
 *    • Expands every order into INDIVIDUAL TRANSFORMER UNITS
 *      e.g. 300kVA ×5 → five separate 1-unit slots, any machine can take any unit
 *    • Machines can split a multi-unit order: Machine3 cuts 2, Machine5 cuts 3
 *    • Goal: complete ALL transformers in minimum possible wall-clock time
 *    • Doesn't care about SAP SO grouping — only cares about total completion time
 *
 *  Pool: all individual units sorted by processing time DESC (LPT heuristic)
 *  Simulation: all machines run simultaneously, each pulling one unit at a time
 */
function scheduleFastest(
  weekOrders: Order[],
  machines: CuttingMachine[],
  products: Record<string, { kva?: number }>,
  globalRates: CuttingRate[],
  wcConfig: Record<string, WCConfig>,
  days: Date[],
  otPolicy: 'none' | 'smart' | 'full',
  strictWire = false,
  requireDrill = false
): Map<number, Map<string, MachineDaySched>> {
  const result = new Map<number, Map<string, MachineDaySched>>()
  if (!machines.length || !weekOrders.length) return result

  // ── Expand orders → individual units ────────────────────────
  interface Unit { order: Order; unitIndex: number; hrs: number }
  const allUnits: Unit[] = []
  for (const o of weekOrders) {
    const kva = o.kva ?? products[o.product]?.kva ?? 0
    for (let ui = 0; ui < o.qty; ui++) {
      const hrs = getHrsForKva(
        machines.find(m => canMachineCut(m, o, products, strictWire, requireDrill)) ?? machines[0],
        kva, globalRates, o.item_code
      )
      allUnits.push({ order: o, unitIndex: ui, hrs })
    }
  }
  // Sort: largest processing time first (LPT minimises makespan)
  allUnits.sort((a, b) => b.hrs - a.hrs)
  const pool = [...allUnits]
  const taken = new Set<string>()  // key = orderId_unitIndex

  // ── Per-machine state ────────────────────────────────────────
  type MS = { currentUnit: Unit | null; rem: number; isCarryOver: boolean; mMap: Map<string, MachineDaySched> }
  const mst = new Map<number, MS>()
  machines.forEach(m => { mst.set(m.id, { currentUnit: null, rem: 0, isCarryOver: false, mMap: new Map() }); result.set(m.id, mst.get(m.id)!.mMap) })

  // ── Simulate day-by-day, all machines simultaneously ─────────
  for (let di = 0; di < days.length; di++) {
    const d = days[di]; const dow = d.getDay(); const isSat = dow === 6
    const dStr = fmtISO(d)

    for (const m of machines) {
      const st = mst.get(m.id)!
      const { reg, ot } = resolveHours(m, wcConfig, isSat, dow)
      const regCap = reg * (m.count || 1); const otCap = ot * (m.count || 1)
      if (regCap === 0 && otCap === 0) { st.mMap.set(dStr, { regHrs:0, otHrs:0, otNeeded:0, work:[], hasCarryOver:false, carriesForward: st.rem>0 }); continue }

      // OT policy
      let effectiveOtCap = 0
      if (otPolicy === 'full') {
        effectiveOtCap = otCap
      } else if (otPolicy === 'smart') {
        // OT only when carry-over work won't finish in remaining regular days
        // Try regular hours first — OT is truly last resort
        const workDaysLeft = days.slice(di).filter(dd => isMachineOn(m, dd.getDay()))
        const regLeft = workDaysLeft.reduce((s, dd) => { const { reg: r } = resolveHours(m, wcConfig, dd.getDay()===6, dd.getDay()); return s + r*(m.count||1) }, 0)
        // Only count carry-over (in-progress order) + units this machine has exclusively
        const carryHrs = st.rem > 0 ? st.rem : 0
        if (carryHrs > regLeft) effectiveOtCap = Math.min(otCap, carryHrs - regLeft)
      }

      const work: DayWork[] = []; let avail = regCap + effectiveOtCap; let regUsed = 0; let otUsed = 0

      while (avail > 0.001) {
        if (st.rem <= 0.001) {
          st.rem = 0
          // Pick the unit this machine can complete FASTEST (min getHrsForKva)
          // — avoids assigning slow units (e.g. 11h custom rate) when fast ones exist
          const eligible = pool.filter(u => !taken.has(`${u.order.id}_${u.unitIndex}`) && canMachineCut(m, u.order, products, strictWire, requireDrill))
          if (!eligible.length) break
          const best = eligible.reduce((a, b) => {
            const ha = getHrsForKva(m, a.order.kva ?? products[a.order.product]?.kva ?? 0, globalRates, a.order.item_code)
            const hb = getHrsForKva(m, b.order.kva ?? products[b.order.product]?.kva ?? 0, globalRates, b.order.item_code)
            return hb < ha ? b : a
          })
          taken.add(`${best.order.id}_${best.unitIndex}`)
          st.currentUnit = best
          st.rem = getHrsForKva(m, best.order.kva ?? products[best.order.product]?.kva ?? 0, globalRates, best.order.item_code)
          st.isCarryOver = false
        }
        const h = Math.min(st.rem, avail)
        const ot2 = Math.max(0, h - (regCap - regUsed))
        regUsed = Math.min(regCap, regUsed + h); otUsed += ot2; avail -= h; st.rem -= h
        const done = st.rem <= 0.001
        if (done) st.rem = 0
        // One unit = one DayWork entry (group same order+day into one work item if consecutive)
        const lastW = work[work.length - 1]
        if (lastW && lastW.order.id === st.currentUnit!.order.id && !lastW.isComplete) {
          lastW.hrsWorked += h; lastW.isComplete = done; lastW.carriesOver = !done && avail <= 0.001
        } else {
          work.push({ order: st.currentUnit!.order, hrsWorked: h, isComplete: done, isCarryOver: st.isCarryOver, carriesOver: !done && avail <= 0.001 })
        }
        if (done) { st.isCarryOver = false } else { st.isCarryOver = true; break }
      }
      const hasMore = st.rem > 0.001 || pool.some(u => !taken.has(`${u.order.id}_${u.unitIndex}`) && canMachineCut(m, u.order, products, strictWire, requireDrill))
      st.mMap.set(dStr, { regHrs: regUsed, otHrs: otUsed, otNeeded: otUsed, work, hasCarryOver: work.some(w => w.isCarryOver), carriesForward: hasMore })
    }
  }
  return result
}

/** Priority rank: หลัก=1, Fast=2, เสริม=3, other=4 */
function catRank(o: Order): number {
  if (o.category === 'หลัก') return 1
  if (o.category === 'Fast')  return 2
  if (o.category === 'เสริม') return 3
  return 4
}

/** Sort shared pool by strategy */
function sortPool(
  orders: Order[], strategy: string,
  products: Record<string, { kva?: number }>, globalRates: CuttingRate[], machines: CuttingMachine[],
  nextWeekOrders: Order[] = []
): Order[] {
  const m0 = machines[0]
  const hrs = (o: Order) => m0 ? o.qty * getHrsForKva(m0, o.kva ?? products[o.product]?.kva ?? 0, globalRates, o.item_code) : 0
  const kvaOf = (o: Order) => o.kva ?? products[o.product]?.kva ?? 0
  const pool = [...orders]

  if (strategy === 'deadline') {
    // Closest deadline first; tie → LPT
    return pool.sort((a, b) => {
      const da = (a.due_so || a.deadline || '9999'), db = (b.due_so || b.deadline || '9999')
      if (da !== db) return da.localeCompare(db)
      return hrs(b) - hrs(a)
    })
  }
  if (strategy === 'priority') {
    // หลัก → Fast → เสริม → other; within same priority → LPT
    return pool.sort((a, b) => {
      const ra = catRank(a), rb = catRank(b)
      if (ra !== rb) return ra - rb
      return hrs(b) - hrs(a)
    })
  }
  if (strategy === 'interweek') {
    // If next week has many large orders → do small ones this week first (free up big-machine capacity)
    // If next week is light → do large ones this week first
    const nextWeekLargeHrs = nextWeekOrders.reduce((s, o) => s + hrs(o), 0)
    const thisWeekAvgHrs = orders.length > 0 ? orders.reduce((s, o) => s + hrs(o), 0) / orders.length : 0
    const nextWeekHeavy = nextWeekLargeHrs > thisWeekAvgHrs * orders.length * 0.5
    return pool.sort((a, b) => nextWeekHeavy ? hrs(a) - hrs(b) : hrs(b) - hrs(a))
  }
  if (strategy === 'batch_kva') {
    // Group by kVA bucket (50, 100, 160, 250, 300, 630, 1000, 2000, 3500, 7000+)
    // Within same bucket → LPT
    const bucket = (kva: number) =>
      kva <= 50 ? 0 : kva <= 100 ? 1 : kva <= 160 ? 2 : kva <= 250 ? 3 :
      kva <= 300 ? 4 : kva <= 630 ? 5 : kva <= 1000 ? 6 :
      kva <= 2000 ? 7 : kva <= 3500 ? 8 : 9
    return pool.sort((a, b) => {
      const ba = bucket(kvaOf(a)), bb = bucket(kvaOf(b))
      if (ba !== bb) return ba - bb
      return hrs(b) - hrs(a)
    })
  }
  // Default: plan_date then LPT
  return pool.sort((a, b) => {
    const pd = (a.plan_date ?? '').localeCompare(b.plan_date ?? '')
    return pd !== 0 ? pd : hrs(b) - hrs(a)
  })
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  UNIFIED SCHEDULER — handles all 6 modes
 * ═══════════════════════════════════════════════════════════════
 *
 *  approach: 'daily'  → respect plan_date, assign per day
 *            'weekly' → global LPT, one order at a time, ignore plan_date
 *
 *  otPolicy: 'none'   → reg hours only, no OT ever
 *            'smart'  → OT only when remaining work > remaining reg capacity
 *            'full'   → always use reg + max OT every day
 *
 *  Carry-over:
 *    Unfinished orders carry to next day automatically.
 *    End of week → stays in queue (next week picks up via includePrevCarry).
 */
function scheduleMode(
  weekOrders: Order[],
  dailyAssignments: { dStr: string; asgn: Map<number, Order[]> }[],
  machines: CuttingMachine[],
  products: Record<string, { kva?: number }>,
  globalRates: CuttingRate[],
  wcConfig: Record<string, WCConfig>,
  days: Date[],
  machIdx: Map<number, number>,
  approach: 'daily' | 'weekly',
  otPolicy: 'none' | 'smart' | 'full',
  sortStrategy = 'plan_date',
  nextWeekOrders: Order[] = [],
  strictWire = false,
  requireDrill = false
): Map<number, Map<string, MachineDaySched>> {
  const result = new Map<number, Map<string, MachineDaySched>>()

  // ── Build per-machine queues ─────────────────────────────────
  type QItem = { order: Order; remainingHrs: number; isCarryOver: boolean }
  const machineQueues = new Map<number, QItem[]>()

  if (approach === 'weekly') {
    // ── SHARED POOL approach ────────────────────────────────────
    // All orders in one pool sorted by plan_date (then LPT within same date).
    // Machines dynamically pull the next eligible order when they finish —
    // Machine 5 can grab a 160kVA order the moment it becomes available,
    // even if that order was "planned" for another day.
    const sharedPool: Order[] = sortPool(weekOrders, sortStrategy, products, globalRates, machines, nextWeekOrders)
    const taken = new Set<string>()  // order IDs already claimed by a machine

    // Per-machine state: what is each machine working on right now
    type MState = { currentOrder: Order | null; currentRem: number; isCarryOver: boolean; mMap: Map<string, MachineDaySched> }
    const machState = new Map<number, MState>()
    machines.forEach(m => machState.set(m.id, { currentOrder: null, currentRem: 0, isCarryOver: false, mMap: new Map() }))
    machines.forEach(m => result.set(m.id, machState.get(m.id)!.mMap))

    // Simulate ALL machines simultaneously, day by day
    for (let di = 0; di < days.length; di++) {
      const d = days[di]; const dow = d.getDay(); const isSat = dow === 6
      const dStr = fmtISO(d)

      for (const m of machines) {
        const st = machState.get(m.id)!
        const { reg, ot } = resolveHours(m, wcConfig, isSat, dow)
        const regCap = reg * (m.count || 1); const otCap = ot * (m.count || 1)
        if (regCap === 0 && otCap === 0) {
          // Machine is off — carry-over stays with this machine (resumes next working day)
          st.mMap.set(dStr, { regHrs:0, otHrs:0, otNeeded:0, work:[], hasCarryOver:false, carriesForward: st.currentRem > 0.001 })
          continue
        }

        // Smart OT: check if remaining work fits in remaining regular days
        let effectiveOtCap = 0
        if (otPolicy === 'full') {
          effectiveOtCap = otCap
        } else if (otPolicy === 'smart') {
          const workDaysLeft = days.slice(di).filter(dd => isMachineOn(m, dd.getDay()))
          const regCapLeft = workDaysLeft.reduce((s, dd) => { const isSatDD = dd.getDay() === 6; const { reg: r } = resolveHours(m, wcConfig, isSatDD, dd.getDay()); return s + r * (m.count || 1) }, 0)
          const carryHrs = st.currentRem > 0.001 ? st.currentRem : 0
          if (carryHrs > regCapLeft) effectiveOtCap = Math.min(otCap, carryHrs - regCapLeft)
        }

        const work: DayWork[] = []; let avail = regCap + effectiveOtCap; let regUsed = 0; let otUsed = 0

        while (avail > 0.001) {
          if (st.currentRem <= 0.001) {
            st.currentRem = 0
            // Pull next eligible order from shared pool (drill + wire preference as tiebreaker)
            const eligible = sharedPool.filter(o => !taken.has(o.id) && canMachineCut(m, o, products, strictWire, requireDrill))
            if (!eligible.length) break
            const score = (o: Order) => (drillPrefers(m, o) ? 1 : 0) + (wirePrefers(m, o) ? 1 : 0)
            const next = eligible.reduce((a, b) => score(b) > score(a) ? b : a)
            taken.add(next.id)
            st.currentOrder = next
            st.currentRem = next.qty * getHrsForKva(m, next.kva ?? products[next.product]?.kva ?? 0, globalRates, next.item_code)
            st.isCarryOver = false
          }
          const h = Math.min(st.currentRem, avail)
          const ot2 = Math.max(0, h - (regCap - regUsed))
          regUsed = Math.min(regCap, regUsed + h); otUsed += ot2; avail -= h; st.currentRem -= h
          const done = st.currentRem <= 0.001
          if (done) st.currentRem = 0
          work.push({ order: st.currentOrder!, hrsWorked: h, isComplete: done, isCarryOver: st.isCarryOver, carriesOver: !done && avail <= 0.001 })
          if (done) { st.isCarryOver = false }
          else { st.isCarryOver = true; break }
        }
        const hasMore = st.currentRem > 0.001 || sharedPool.some(o => !taken.has(o.id) && canMachineCut(m, o, products, strictWire, requireDrill))
        st.mMap.set(dStr, { regHrs: regUsed, otHrs: otUsed, otNeeded: otUsed, work, hasCarryOver: work.some(w => w.isCarryOver), carriesForward: hasMore })
      }
    }
    return result
  } else {
    // Daily: start empty, add orders on their plan_date
    machines.forEach(m => machineQueues.set(m.id, []))
  }

  // ── Simulate day-by-day (daily approach) ────────────────────
  for (const m of machines) {
    const mMap = new Map<string, MachineDaySched>()
    result.set(m.id, mMap)
    let carryItems: QItem[] = []  // carry-over for daily approach

    for (let di = 0; di < days.length; di++) {
      const d = days[di]
      const dStr = fmtISO(d)
      const dow = d.getDay(); const isSat = dow === 6
      const { reg, ot } = resolveHours(m, wcConfig, isSat, dow)
      const regCap = reg * (m.count || 1)
      const otCap  = ot  * (m.count || 1)

      // ── Compute effective OT cap ───────────────────────────
      let effectiveOtCap = 0
      if (otPolicy === 'full') {
        effectiveOtCap = otCap
      } else if (otPolicy === 'smart') {
        // OT only for carry-over that won't finish in remaining regular days
        const workDaysLeft = days.slice(di).filter(dd => isMachineOn(m, dd.getDay()))
        const regCapLeft = workDaysLeft.reduce((s, dd) => {
          const isSatDD = dd.getDay() === 6
          const { reg: r } = resolveHours(m, wcConfig, isSatDD, dd.getDay())
          return s + r * (m.count || 1)
        }, 0)
        // OT only for actual carry-over hours that won't fit in remaining regular days
        const carryHrs = carryItems.reduce((s, c) => s + c.remainingHrs, 0)
        if (carryHrs > regCapLeft) {
          effectiveOtCap = Math.min(otCap, carryHrs - regCapLeft)
        }
      }

      const work: DayWork[] = []
      let regUsed = 0; let otUsed = 0
      let avail = regCap + effectiveOtCap

      {
        // ── Daily: carry queue + today's new orders ───────────
        const todayOrders = dailyAssignments[di]?.asgn.get(m.id) ?? []
        const todayItems: QItem[] = todayOrders.map(o => ({
          order: o, remainingHrs: o.qty * getHrsForKva(m, o.kva ?? products[o.product]?.kva ?? 0, globalRates, o.item_code), isCarryOver: false
        }))
        const fullQueue = [...carryItems, ...todayItems]
        carryItems = []
        for (const item of fullQueue) {
          if (avail <= 0.001) { carryItems.push({ ...item, isCarryOver: true }); continue }
          const h = Math.min(item.remainingHrs, avail)
          const ot2 = Math.max(0, h - (regCap - regUsed))
          regUsed = Math.min(regCap, regUsed + h); otUsed += ot2; avail -= h
          const rem = item.remainingHrs - h
          const done = rem <= 0.001
          work.push({ order: item.order, hrsWorked: h, isComplete: done, isCarryOver: item.isCarryOver, carriesOver: !done })
          if (!done) carryItems.push({ order: item.order, remainingHrs: rem, isCarryOver: true })
        }
      }

      mMap.set(dStr, {
        regHrs: regUsed, otHrs: otUsed, otNeeded: otUsed,
        work, hasCarryOver: work.some(w => w.isCarryOver),
        carriesForward: carryItems.length > 0,
      })
    }
  }
  return result
}

/** Hard constraint: kVA range only. max_kva ≥ 9999 = ไม่จำกัด (no upper limit). */
/** Detect required cutting type from raw_mat field:
 *  'laser' = LS steel (LS0.70, LS0.80) → needs laser=true
 *  'm4'    = M-4 silicon steel         → needs m4=true
 *  'any'   = unknown / not specified   → no constraint
 */
function detectWireType(rawMat?: string): 'laser' | 'm4' | 'any' {
  if (!rawMat || rawMat === '—' || rawMat.trim() === '') return 'any'
  const r = rawMat.toUpperCase().trim()
  if (r.startsWith('LS')) return 'laser'
  if (r.includes('M - 4') || r.includes('M-4') || r === 'M4') return 'm4'
  return 'any'
}

function canMachineCut(
  m: CuttingMachine,
  o: { product?: string; kva?: number | null; raw_mat?: string },
  products: Record<string, { kva?: number }> = {},
  strictWire = false,
  requireDrill = false
): boolean {
  const kva = o.kva ?? products[o.product ?? '']?.kva ?? 0
  if (kva < m.min_kva) return false
  if (m.max_kva < 9999 && kva > m.max_kva) return false
  if (strictWire) {
    const wt = detectWireType(o.raw_mat)
    if (wt === 'laser' && !m.laser) return false
    if (wt === 'm4'    && !m.m4)    return false
  }
  if (requireDrill && kva >= 315 && !m.drill_8mm && !m.drill_22mm) return false
  return true
}

/** Returns true if this machine prefers this order (drill type matches). */
function drillPrefers(m: CuttingMachine, o: { item_code?: string }): boolean {
  if (!m.drill_8mm && !m.drill_22mm) return false
  const { typeCode } = decodeItemInfo(o.item_code ?? '')
  if (typeCode === '4') return m.drill_22mm
  if (['1','2','3'].includes(typeCode)) return m.drill_8mm
  return false
}

/** Soft wire preference: LS raw_mat prefers laser machine, M-4 raw_mat prefers m4 machine. Tiebreaker only. */
function wirePrefers(m: CuttingMachine, o: { raw_mat?: string }): boolean {
  const wt = detectWireType(o.raw_mat)
  if (wt === 'laser') return m.laser
  if (wt === 'm4')    return m.m4
  return false
}

/** Display name: uses stored name if it contains a digit, else appends #id so unnamed machines are identifiable. */
function mLabel(m: { id: number; name: string }): string {
  return m.name && /\d/.test(m.name) ? m.name : `${m.name || 'เครื่องตัด'} #${m.id}`
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
  const [includePrevCarry, setIncludePrevCarry] = useState(false)
  const [showWireData, setShowWireData] = useState(true)   // show Raw Mat / LV / HV in order cards
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
  const [balanceMode, setBalanceMode] = useState<BalanceMode>('weekly_no_ot')
  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'pipeline'>('cards')
  const [globalRates, setGlobalRates] = useState<CuttingRate[]>([])
  const [machineRateTab, setMachineRateTab] = useState<number | null>(null) // selected machine id for per-machine rates panel
  const [machineTmcTab, setMachineTmcTab]   = useState<number | null>(null) // selected machine id for per-machine TMC rates panel
  const [strictWire,   setStrictWire]   = useState(false)
  const [requireDrill, setRequireDrill] = useState(false)

  useEffect(() => {
    fetch('/api/cutting-rates').then(r => r.json()).then(setGlobalRates).catch(() => {})
  }, [])

  async function saveGlobalRates(rates: CuttingRate[]) {
    setGlobalRates(rates)
    await fetch('/api/cutting-rates', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rates) })
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
  function exportPlanCSV() {
    const DAY_EN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const rows: string[][] = []

    // ── Summary header ──────────────────────────────────────────
    rows.push([`แผนการตัดโลหะ — ${weekLabel}`])
    rows.push([`Mode: ${balanceMode}`, `Total: ${weekData.totalQtyWeek} ตัว`, `${Math.round(weekData.totalKvaWeek).toLocaleString()} kVA`, `OT: ${weekData.totalOT.toFixed(1)}h`])
    rows.push([])

    // ── Machine legend ─────────────────────────────────────────
    rows.push(['# เครื่อง', 'kVA Range', 'h/ตัว', '×Rate', 'TMC'])
    machines.forEach(m => {
      rows.push([mLabel(m), `${m.min_kva}–${m.max_kva >= 9999 ? '∞' : m.max_kva}`, m.hrs_per_unit.toString(), (m.time_mul ?? 1).toString(), (m.tmc_hrs ?? 0).toString()])
    })
    rows.push([])

    // ── Day-by-day schedule ────────────────────────────────────
    weekData.dayRows.forEach(row => {
      const { d, machineCells, dayFinish, actualQty, actualOrderCount } = row
      const hasWork = machineCells.some(mc => mc.work.length > 0 || mc.machOff)
      if (!hasWork) return

      const dateStr = fmtISO(d)
      const dayEN = DAY_EN[d.getDay()]
      const dayTH = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'][d.getDay()]
      const totalKva = row.dayOrders.reduce((s, o) => s + ((o.total_kva ?? 0) > 0 ? (o.total_kva ?? 0) : (o.kva ?? 0) * (o.qty ?? 1)), 0)

      // Day header row
      rows.push([`${dayTH} ${dateStr}`, `${dayEN}`, `${actualQty} ตัว`, `${Math.round(totalKva).toLocaleString()} kVA`, `เสร็จใน ${dayFinish.toFixed(1)}h`])

      machineCells.forEach(({ m, machOff, sched, work, wall }) => {
        if (machOff) {
          rows.push(['', mLabel(m), '🔴 ปิด'])
          return
        }
        if (work.length === 0) return

        const otNote = (sched?.otHrs ?? 0) > 0 ? ` +OT ${sched!.otHrs.toFixed(1)}h` : ''
        const carryNote = sched?.carriesForward ? ' →' : ''
        rows.push(['', mLabel(m), `${wall.toFixed(1)}h${otNote}${carryNote}`])

        work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete).forEach(w => {
          const kva = w.order.kva ?? products[w.order.product]?.kva ?? 0
          const totalHrs = w.order.qty * getHrsForKva(m, kva, globalRates, w.order.item_code)
          const status = w.isComplete ? '✓' : '→'
          const carry = w.isCarryOver ? '↩ ' : ''
          rows.push([
            '', '',
            `${carry}${w.order.sap_so ?? w.order.id}`,
            `${kva.toLocaleString()}kVA ×${w.order.qty}`,
            w.order.customer ?? '',
            `${w.hrsWorked.toFixed(1)}h / ${totalHrs.toFixed(1)}h ${status}`,
          ])
        })
      })
      rows.push([]) // blank line between days
    })

    const q = (s: string) => `"${s.replace(/"/g, '""')}"`
    const csv = rows.map(r => r.map(c => q(String(c))).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cutting-plan-${fmtISO(mon)}_${fmtISO(sat)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /** Shared helper: build plan rows for export (CSV/TXT/Excel/JSON) */
  function buildPlanRows() {
    const DAY_TH_FULL = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์']
    type PlanRow = { day: string; date: string; machine: string; machOff: boolean; wallHrs: number; ot: number; carryFwd: boolean; sapSo: string; kva: number; qty: number; customer: string; rawMat: string; hrsWorked: number; totalHrs: number; done: boolean; carryOver: boolean; isCarryIn: boolean }
    const planRows: PlanRow[] = []
    weekData.dayRows.forEach(row => {
      const { d, machineCells } = row
      const date = fmtISO(d)
      const day = DAY_TH_FULL[d.getDay()]
      machineCells.forEach(({ m, machOff, sched, work, wall }) => {
        if (machOff) { planRows.push({ day, date, machine: mLabel(m), machOff: true, wallHrs: 0, ot: 0, carryFwd: false, sapSo: '', kva: 0, qty: 0, customer: '', rawMat: '', hrsWorked: 0, totalHrs: 0, done: false, carryOver: false, isCarryIn: false }); return }
        if (work.length === 0) return
        work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete).forEach(w => {
          const kva = w.order.kva ?? products[w.order.product]?.kva ?? 0
          const totalHrs = w.order.qty * getHrsForKva(m, kva, globalRates, w.order.item_code)
          planRows.push({ day, date, machine: mLabel(m), machOff: false, wallHrs: wall, ot: sched?.otHrs ?? 0, carryFwd: sched?.carriesForward ?? false, sapSo: w.order.sap_so ?? w.order.id, kva, qty: w.order.qty, customer: w.order.customer ?? '', rawMat: w.order.raw_mat ?? '', hrsWorked: w.hrsWorked, totalHrs, done: w.isComplete, carryOver: w.carriesOver, isCarryIn: w.isCarryOver })
        })
      })
    })
    return planRows
  }

  function exportTXT() {
    const DAY_TH_FULL = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์']
    const lines: string[] = []
    lines.push(`แผนการตัดโลหะ — ${weekLabel}`)
    lines.push(`${weekData.totalQtyWeek} ตัว · ${Math.round(weekData.totalKvaWeek).toLocaleString()} kVA · OT ${weekData.totalOT.toFixed(1)}h`)
    lines.push('─'.repeat(60))
    weekData.dayRows.forEach(row => {
      const { d, machineCells, dayFinish, actualQty } = row
      if (!machineCells.some(mc => mc.work.length > 0 || mc.machOff)) return
      lines.push('')
      const totalKva = row.dayOrders.reduce((s, o) => s + ((o.total_kva ?? 0) > 0 ? (o.total_kva ?? 0) : (o.kva ?? 0) * (o.qty ?? 1)), 0)
      lines.push(`${DAY_TH_FULL[d.getDay()]} ${fmtISO(d)}  ${actualQty} ตัว · ${Math.round(totalKva).toLocaleString()} kVA  เสร็จใน ${dayFinish.toFixed(1)}h`)
      machineCells.forEach(({ m, machOff, sched, work, wall }) => {
        if (machOff) { lines.push(`  🔴 ${mLabel(m)} ปิด`); return }
        if (work.length === 0) return
        const ot = (sched?.otHrs ?? 0) > 0 ? ` +OT ${sched!.otHrs.toFixed(1)}h` : ''
        lines.push(`  ${mLabel(m).padEnd(18)} ${wall.toFixed(1)}h${ot}${sched?.carriesForward ? ' →' : ''}`)
        work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete).forEach(w => {
          const kva = w.order.kva ?? products[w.order.product]?.kva ?? 0
          const total = w.order.qty * getHrsForKva(m, kva, globalRates, w.order.item_code)
          const pre = w.isCarryOver ? '↩ ' : '  '
          lines.push(`    ${pre}${(w.order.sap_so ?? '').padEnd(14)} ${String(kva.toLocaleString() + 'kVA×' + w.order.qty).padEnd(12)} ${w.hrsWorked.toFixed(1)}h/${total.toFixed(1)}h ${w.isComplete ? '✓' : '→'}  ${w.order.customer ?? ''}`)
        })
      })
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `cutting-plan-${fmtISO(mon)}_${fmtISO(sat)}.txt`; a.click(); URL.revokeObjectURL(url)
  }

  function exportXLSX() {
    const wb = XLSX.utils.book_new()

    // ── Sheet 1: Schedule ──────────────────────────────────────
    const schedRows: (string | number)[][] = [
      [`แผนการตัดโลหะ — ${weekLabel}`],
      [`${weekData.totalQtyWeek} ตัว`, `${Math.round(weekData.totalKvaWeek).toLocaleString()} kVA`, `OT: ${weekData.totalOT.toFixed(1)}h`, `Mode: ${balanceMode}`],
      [],
      ['วัน', 'วันที่', 'เครื่อง', 'SAP SO', 'kVA', 'จำนวน', 'ลูกค้า', 'Raw Mat', 'ชม.ทำงาน', 'ชม.รวม', 'สถานะ', 'ค้าง'],
    ]
    buildPlanRows().forEach(r => {
      if (r.machOff) { schedRows.push([r.day, r.date, r.machine, '🔴 ปิด']); return }
      schedRows.push([r.day, r.date, r.machine, r.sapSo, r.kva, r.qty, r.customer, r.rawMat, +r.hrsWorked.toFixed(2), +r.totalHrs.toFixed(2), r.done ? '✓ Done' : '→ In Prog', r.carryOver ? '→' : ''])
    })
    const ws = XLSX.utils.aoa_to_sheet(schedRows)
    ws['!cols'] = [10,12,16,14,8,6,18,10,10,10,12,6].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, ws, 'Schedule')

    // ── Sheet 2: Machine Summary ───────────────────────────────
    const sumRows: (string | number)[][] = [['เครื่อง', 'kVA Range', 'h/ตัว', '×Rate', 'TMC', 'ตัว/สัปดาห์', 'ชม.รวม', 'OT']]
    machines.forEach((m, i) => {
      const t = weekData.mTotals[i]
      sumRows.push([mLabel(m), `${m.min_kva}–${m.max_kva >= 9999 ? '∞' : m.max_kva}`, m.hrs_per_unit, m.time_mul ?? 1, m.tmc_hrs ?? 0, t.qty, +t.wallHrs.toFixed(1), +t.ot.toFixed(1)])
    })
    const ws2 = XLSX.utils.aoa_to_sheet(sumRows)
    ws2['!cols'] = [18,14,8,8,8,14,10,10].map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, ws2, 'Machines')

    XLSX.writeFile(wb, `cutting-plan-${fmtISO(mon)}_${fmtISO(sat)}.xlsx`)
  }

  function exportJSON() {
    const data = {
      week: weekLabel,
      generated: new Date().toISOString(),
      summary: { qty: weekData.totalQtyWeek, kva: weekData.totalKvaWeek, ot: weekData.totalOT, bottleneck: weekData.bottleneckWall },
      machines: machines.map((m, i) => ({ ...m, weekly: weekData.mTotals[i] })),
      schedule: buildPlanRows(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `cutting-plan-${fmtISO(mon)}_${fmtISO(sat)}.json`; a.click(); URL.revokeObjectURL(url)
  }

  function exportPrint() {
    const DAY_TH_FULL = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์']
    let html = `<html><head><meta charset="utf-8"><title>แผนการตัดโลหะ ${weekLabel}</title><style>
      body{font-family:sans-serif;font-size:11px;margin:12px}
      h2{font-size:13px;margin:0 0 4px}
      .sum{color:#666;margin-bottom:10px}
      .day{font-weight:700;font-size:12px;background:#eee;padding:3px 6px;margin:8px 0 3px;border-radius:3px}
      .mach{font-weight:600;padding:2px 4px;margin:2px 0;color:#333}
      .moff{color:#e0534a;padding:2px 4px}
      table{border-collapse:collapse;width:100%;margin-bottom:2px}
      td{border:1px solid #ddd;padding:2px 5px;font-size:10px}
      td.h{background:#f5f5f5;font-weight:600}
      .done{color:#40a02b}.carry{color:#fe640b}
      @media print{body{margin:6mm}}
    </style></head><body>`
    html += `<h2>แผนการตัดโลหะ — ${weekLabel}</h2>`
    html += `<div class="sum">${weekData.totalQtyWeek} ตัว · ${Math.round(weekData.totalKvaWeek).toLocaleString()} kVA · OT ${weekData.totalOT.toFixed(1)}h · Mode: ${balanceMode}</div>`
    weekData.dayRows.forEach(row => {
      const { d, machineCells, dayFinish, actualQty } = row
      if (!machineCells.some(mc => mc.work.length > 0 || mc.machOff)) return
      const totalKva = row.dayOrders.reduce((s, o) => s + ((o.total_kva ?? 0) > 0 ? (o.total_kva ?? 0) : (o.kva ?? 0) * (o.qty ?? 1)), 0)
      html += `<div class="day">${DAY_TH_FULL[d.getDay()]} ${fmtISO(d)} &nbsp; ${actualQty} ตัว · ${Math.round(totalKva).toLocaleString()} kVA &nbsp; เสร็จใน ${dayFinish.toFixed(1)}h</div>`
      machineCells.forEach(({ m, machOff, sched, work, wall }) => {
        if (machOff) { html += `<div class="moff">🔴 ${mLabel(m)} ปิด</div>`; return }
        if (work.length === 0) return
        const ot = (sched?.otHrs ?? 0) > 0 ? ` <span style="color:#fe640b">+OT ${sched!.otHrs.toFixed(1)}h</span>` : ''
        html += `<div class="mach">${mLabel(m)} &nbsp; ${wall.toFixed(1)}h${ot}${sched?.carriesForward ? ' <span class="carry">→</span>' : ''}</div>`
        html += `<table><tr><td class="h">SAP SO</td><td class="h">kVA</td><td class="h">Qty</td><td class="h">ลูกค้า</td><td class="h">Raw Mat</td><td class="h">ชม.</td><td class="h">สถานะ</td></tr>`
        work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete).forEach(w => {
          const kva = w.order.kva ?? products[w.order.product]?.kva ?? 0
          const total = w.order.qty * getHrsForKva(m, kva, globalRates, w.order.item_code)
          const st = w.isComplete ? `<span class="done">✓</span>` : `<span class="carry">→</span>`
          const ci = w.isCarryOver ? '↩ ' : ''
          html += `<tr><td>${ci}${w.order.sap_so ?? ''}</td><td>${kva.toLocaleString()}</td><td>×${w.order.qty}</td><td>${w.order.customer ?? ''}</td><td>${w.order.raw_mat ?? ''}</td><td>${w.hrsWorked.toFixed(1)}/${total.toFixed(1)}h</td><td>${st}</td></tr>`
        })
        html += '</table>'
      })
    })
    html += '</body></html>'
    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 400) }
  }

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
      const asgn = assignOrders(prevOrders.filter(o => o.plan_date === dStr), active, products, globalRates, new Map(), new Map(machIdx))
      return { dStr, asgn }
    })
    const prevApproach = balanceMode.startsWith('weekly') ? 'weekly' : 'daily'
    const prevOtPolicy = balanceMode.endsWith('_no_ot') ? 'none' : balanceMode.endsWith('_smart') ? 'smart' : 'full'
    const prevSched = scheduleMode(prevOrders, prevDailyAsgn, machines, products, globalRates, wcConfig, prevDays, new Map(machIdx), prevApproach as 'daily'|'weekly', prevOtPolicy as 'none'|'smart'|'full')
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
      const initWall = new Map<number, number>()  // all modes use fresh start per day (weekly approach handles order assignment differently)
      const asgn = assignOrders(dayOrds, activeMachines, products, globalRates, initWall, new Map(machIdx), strictWire, requireDrill)
      // Always accumulate for weekly mode reference
      activeMachines.forEach(m => {
        const mOrd = asgn.get(m.id) ?? []
        const w = mOrd.reduce((a, o) => {
          const kva = o.kva ?? products[o.product]?.kva ?? 0
          return a + (o.qty * getHrsForKva(m, kva, globalRates, o.item_code)) / (m.count || 1)
        }, 0)
        cumWall.set(m.id, (cumWall.get(m.id) ?? 0) + w)
      })
      return { dStr, asgn }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceMode, strictWire, requireDrill, globalRates.map(r => `${r.kva}:${r.hrs}`).join(','), weekOrders.map(o => o.id + o.qty).join(','), machines.map(m => `${m.id}${m.count}${m.hrs_per_unit}${m.min_kva}${m.max_kva}${+m.drill_8mm}${+m.drill_22mm}${+m.laser}${+m.m4}${m.time_mul??1}${m.tmc_hrs??0}${(m.off_days??[]).join('-')}`).join(',')])



  // Schedule — algorithm depends on balanceMode
  const weekSchedule = useMemo(() => {
    // ── ❌ ไม่ OT ─────────────────────────────────────────────────
    const mi = new Map(machIdx)
    const sm = (ot: 'none'|'smart'|'full', sort='plan_date') => scheduleMode(weekOrders, dailyAssignments, machines, products, globalRates, wcConfig, days, mi, 'weekly', ot, sort, nextWeekOrders, strictWire, requireDrill)
    const sd = (ot: 'none'|'smart'|'full') => scheduleMode(weekOrders, dailyAssignments, machines, products, globalRates, wcConfig, days, mi, 'daily', ot, 'plan_date', [], strictWire, requireDrill)
    const sf = (ot: 'none'|'smart'|'full') => scheduleFastest(weekOrders, machines, products, globalRates, wcConfig, days, ot, strictWire, requireDrill)
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
  [balanceMode, strictWire, requireDrill, dailyAssignments, machines.map(m => `${m.id}${m.reg_hrs}${m.ot_hrs}${+m.laser}${+m.m4}${+m.drill_8mm}${+m.drill_22mm}${m.time_mul??1}${m.tmc_hrs??0}${(m.off_days??[]).join('-')}`).join(','), globalRates.map(r=>`${r.kva}:${r.hrs}`).join(',')])

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
              const kva = w.order.kva ?? products[w.order.product]?.kva ?? 0
              const hrsEach = getHrsForKva(m, kva, globalRates, w.order.item_code)
              return s + (hrsEach > 0 ? w.hrsWorked / hrsEach : 0)
            }, 0)
          : 0
      })
      // Count each order ONCE (carry-over orders appear on multiple days — use Set to deduplicate)
      const seenOrders = new Set<string>()
      days.forEach(d => {
        weekSchedule.get(m.id)?.get(fmtISO(d))?.work.forEach(w => seenOrders.add(w.order.id))
      })
      const totalQty = [...seenOrders].reduce((s, oid) => {
        const o = weekOrders.find(x => x.id === oid)
        return s + (o?.qty ?? 0)
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
      const unassigned = dayOrders.filter(o => machines.every(m => !canMachineCut(m, o, products, strictWire, requireDrill)))

      const machineCells = machines.map(m => {
        const machOff = !isMachineOn(m, dow)
        const sched = weekSchedule.get(m.id)?.get(dStr)
        const work = sched?.work ?? []
        const wall = machOff ? 0 : (sched ? sched.regHrs + sched.otHrs : 0)
        const { reg: capH } = resolveHours(m, wcConfig, isSat, dow)
        const grp: Record<number, { drilled: boolean; partial: boolean }> = {}
        work.forEach(w => {
          const kva = w.order.kva ?? products[w.order.product]?.kva ?? 0
          if (!grp[kva]) grp[kva] = { drilled: drillPrefers(m, w.order), partial: !w.isComplete }
          if (!w.isComplete) grp[kva].partial = true
        })
        return { m, machOff, sched, work, wall, capH, grp }
      })

      const dayCarryQty = machineCells.reduce((a, mc) => a + mc.work.filter(w => w.isCarryOver).reduce((s, w) => s + w.order.qty, 0), 0)
      const dayWalls = machineCells.map(mc => mc.wall)
      const dayFinish = Math.max(...dayWalls, 0)
      // Use first ACTIVE machine (not a closed one) for day capacity reference
      const activeMachineRef = machines.find(m => isMachineOn(m, dow)) ?? machines[0]
      const { reg: dayCapHrs } = activeMachineRef ? resolveHours(activeMachineRef, wcConfig, isSat, dow) : { reg: isSat ? 4 : 8 }
      const finishCol = dayFinish === 0 ? 'var(--txt3)' : dayFinish <= dayCapHrs ? 'var(--green)' : dayFinish <= dayCapHrs * 2 ? 'var(--amber)' : 'var(--red)'

      // Actual orders/units worked today (from machine cells, not plan_date)
      // In weekly shared pool, "Friday" orders may have been processed on Monday-Thursday
      const actualOrderIds = new Set<string>()
      machineCells.forEach(mc => mc.work.forEach(w => actualOrderIds.add(w.order.id)))
      const actualQty = [...actualOrderIds].reduce((s, oid) => {
        const o = weekOrders.find(x => x.id === oid)
        return s + (o?.qty ?? 0)
      }, 0)
      const actualOrderCount = actualOrderIds.size

      return { dStr, d, di, dow, isSat, dayOrders, dayScheduledQty, dayKva, dayCarryQty, unassigned, machineCells, dayWalls, dayFinish, dayCapHrs, finishCol, actualQty, actualOrderCount }
    })

    const bottleneckWall = mTotals.reduce((a, t) => Math.max(a, t.wallHrs), 0)
    const totalQtyWeek   = mTotals.reduce((a, t) => a + t.qty, 0)
    const totalKvaWeek   = weekOrders.reduce((a, o) => a + ((o.total_kva ?? 0) > 0 ? (o.total_kva ?? 0) : (o.kva ?? 0) * (o.qty ?? 1)), 0)
    const totalOT        = Math.max(0, bottleneckWall - REG_PER)
    const summaryStatus  = bottleneckWall > REG_PER + OT_PER ? 'over' : totalOT > 0 ? 'warn' : 'ok'

    return { mTotals, dayRows, bottleneckWall, totalQtyWeek, totalKvaWeek, totalOT, summaryStatus }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekSchedule, strictWire, requireDrill, weekOrders.map(o=>o.id+o.qty).join(','), machines.map(m=>`${m.id}${(m.off_days??[]).join('-')}`).join(',')])

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
                  <th style={{ textAlign: 'center', color: 'var(--amber)' }} title="Speed multiplier: final_hrs = base × ×Rate + TMC">×Rate</th>
                  <th style={{ textAlign: 'center', color: 'var(--purple)' }} title="TMC: fixed setup/overhead hours added per order">TMC (h)</th>
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
                      <td style={{ textAlign: 'center' }}>
                        <input className={styles.inputNum} type="number" min={0.1} max={5} step={0.05}
                          defaultValue={m.time_mul ?? 1}
                          onBlur={e => handleChange(m.id, 'time_mul', e.target.value || '1')}
                          title="Speed multiplier — final_hrs = base × this"
                          style={{ width: 52, color: 'var(--amber)', fontWeight: 700 }} />
                        <span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 2 }}>×</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input className={styles.inputNum} type="number" min={0} max={8} step={0.1}
                          defaultValue={m.tmc_hrs ?? 0}
                          onBlur={e => handleChange(m.id, 'tmc_hrs', e.target.value || '0')}
                          title="TMC — fixed setup hours added per order"
                          style={{ width: 52, color: 'var(--purple)', fontWeight: 700 }} />
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

      {/* ── Per-Machine Rates ───────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.sectionTitle}>⏱ เวลาตัดโลหะตามขนาด (รายเครื่อง)</span>
          <span style={{ fontSize: 10, color: 'var(--txt3)' }}>กำหนดเวลาเฉพาะแต่ละเครื่อง — จะใช้แทนค่ามาตรฐาน · ไม่ได้กำหนด = ใช้ค่ามาตรฐาน</span>
        </div>
        <div style={{ padding: '10px 16px' }}>
          {/* Machine tabs */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {machines.map(m => {
              const hasCustRates = (m.rates ?? []).length > 0
              const isActive = machineRateTab === m.id
              return (
                <button key={m.id} onClick={() => setMachineRateTab(isActive ? null : m.id)}
                  style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: isActive ? 700 : 400,
                    border: `1px solid ${isActive ? 'var(--blue)' : hasCustRates ? 'rgba(166,227,161,.5)' : 'var(--bord2)'}`,
                    background: isActive ? 'rgba(137,180,250,.15)' : hasCustRates ? 'rgba(166,227,161,.08)' : 'var(--bg3)',
                    color: isActive ? 'var(--blue)' : hasCustRates ? 'var(--green)' : 'var(--txt3)',
                  }}>
                  {mLabel(m)}{hasCustRates ? ` (${(m.rates ?? []).length})` : ''}
                </button>
              )
            })}
          </div>

          {machineRateTab !== null && (() => {
            const m = machines.find(x => x.id === machineRateTab)
            if (!m) return null
            const mRates = [...(m.rates ?? [])].sort((a, b) => a.kva - b.kva)
            return (
              <div>
                {/* TMC + multiplier summary for this machine */}
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 8, border: '1px solid var(--bord)' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt)' }}>{mLabel(m)}</span>
                  <span style={{ fontSize: 10, color: 'var(--txt3)' }}>สูตร:</span>
                  <code style={{ fontSize: 11, color: 'var(--amber)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 4 }}>
                    final = base × {m.time_mul ?? 1} + {m.tmc_hrs ?? 0}h TMC
                  </code>
                  <span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 4 }}>แก้ไข ×Rate และ TMC ได้ในตารางเครื่องด้านบน</span>
                </div>

                {/* Rate table header */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 10, fontWeight: 700, color: 'var(--txt3)' }}>
                  <span style={{ width: 90, textAlign: 'right' }}>ขนาด (kVA)</span>
                  <span style={{ width: 16 }} />
                  <span style={{ width: 80, textAlign: 'right' }}>เวลาตัด (h)</span>
                  <span style={{ width: 80, textAlign: 'right', color: 'var(--purple)' }}>รวม TMC</span>
                  <span style={{ width: 60 }} />
                </div>

                {mRates.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--txt3)', padding: '6px 0' }}>ยังไม่มีค่าเฉพาะ — ใช้ค่ามาตรฐาน (ตารางด้านบน)</div>
                )}

                {mRates.map((r, ri) => {
                  const finalHrs = r.hrs * (m.time_mul ?? 1) + (m.tmc_hrs ?? 0)
                  return (
                    <div key={ri} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <input type="number" min={0} placeholder="kVA" value={r.kva || ''}
                        onChange={e => saveMachineRates(m.id, mRates.map((x, i) => i === ri ? { ...x, kva: parseFloat(e.target.value) || 0 } : x))}
                        style={{ width: 90, fontSize: 12, padding: '4px 8px', background: 'var(--bg3)', border: '1px solid var(--bord2)', borderRadius: 6, color: 'var(--blue)', fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'right' }} />
                      <span style={{ fontSize: 11, color: 'var(--txt3)' }}>kVA →</span>
                      <input type="number" min={0} step={0.1} placeholder="h" value={r.hrs || ''}
                        onChange={e => saveMachineRates(m.id, mRates.map((x, i) => i === ri ? { ...x, hrs: parseFloat(e.target.value) || 0 } : x))}
                        style={{ width: 80, fontSize: 12, padding: '4px 8px', background: 'var(--bg3)', border: '1px solid var(--bord2)', borderRadius: 6, color: 'var(--amber)', fontFamily: 'var(--mono)', textAlign: 'right' }} />
                      <span style={{ width: 80, textAlign: 'right', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--purple)', fontWeight: 600 }}>
                        = {finalHrs.toFixed(2)}h
                      </span>
                      <button onClick={() => saveMachineRates(m.id, mRates.filter((_, i) => i !== ri))}
                        style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '0 4px' }}>✕</button>
                    </div>
                  )
                })}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  <button onClick={() => saveMachineRates(m.id, [...mRates, { kva: 0, hrs: m.hrs_per_unit }])}
                    style={{ fontSize: 11, padding: '5px 16px', borderRadius: 7, border: '1px solid rgba(137,180,250,.3)', background: 'rgba(137,180,250,.08)', color: 'var(--blue)', cursor: 'pointer' }}>
                    + เพิ่มขนาด
                  </button>
                  {globalRates.length > 0 && (
                    <button
                      title="Copy all standard rates as starting point — then edit values you want to change"
                      onClick={() => {
                        // Merge: keep existing machine rates, add any global kVA not yet in machine rates
                        const existingKvas = new Set(mRates.map(r => r.kva))
                        const newRates = [
                          ...mRates,
                          ...globalRates.filter(r => !existingKvas.has(r.kva)).map(r => ({ kva: r.kva, hrs: r.hrs }))
                        ].sort((a, b) => a.kva - b.kva)
                        saveMachineRates(m.id, newRates)
                      }}
                      style={{ fontSize: 11, padding: '5px 16px', borderRadius: 7, border: '1px solid rgba(166,227,161,.4)', background: 'rgba(166,227,161,.08)', color: 'var(--green)', cursor: 'pointer' }}>
                      📋 คัดลอกจากมาตรฐาน ({globalRates.length} ขนาด)
                    </button>
                  )}
                  {mRates.length > 0 && (
                    <button onClick={() => saveMachineRates(m.id, [])}
                      style={{ fontSize: 11, padding: '5px 16px', borderRadius: 7, border: '1px solid rgba(224,90,78,.3)', background: 'none', color: 'var(--red)', cursor: 'pointer' }}>
                      ล้างค่าเฉพาะ (กลับไปใช้มาตรฐาน)
                    </button>
                  )}
                </div>

                {/* ── TMC Rate Table ─────────────────────────────── */}
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px dashed var(--bord)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple)', marginBottom: 6 }}>
                    ⏱ TMC ตามขนาด (Cast Resin)
                    <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--txt3)', marginLeft: 8 }}>ใช้เมื่อ B=4 — แทนค่า TMC (h) เดิม · ไม่ได้กำหนด = ใช้ค่า TMC (h) จากตาราง</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 10, fontWeight: 700, color: 'var(--txt3)' }}>
                    <span style={{ width: 90, textAlign: 'right' }}>ขนาด (kVA)</span>
                    <span style={{ width: 16 }} />
                    <span style={{ width: 80, textAlign: 'right' }}>TMC (h)</span>
                    <span style={{ width: 60 }} />
                  </div>
                  {(m.tmc_rates ?? []).length === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--txt3)', paddingBottom: 6 }}>ยังไม่มี — ใช้ค่า TMC (h) = {m.tmc_hrs ?? 0}h สำหรับทุกขนาด</div>
                  )}
                  {[...(m.tmc_rates ?? [])].sort((a, b) => a.kva - b.kva).map((r, ri) => (
                    <div key={ri} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <input type="number" min={0} placeholder="kVA" value={r.kva || ''}
                        onChange={e => saveMachineTmcRates(m.id, (m.tmc_rates ?? []).map((x, i) => i === ri ? { ...x, kva: parseFloat(e.target.value) || 0 } : x))}
                        style={{ width: 90, fontSize: 12, padding: '4px 8px', background: 'var(--bg3)', border: '1px solid var(--bord2)', borderRadius: 6, color: 'var(--blue)', fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'right' }} />
                      <span style={{ fontSize: 11, color: 'var(--txt3)' }}>kVA →</span>
                      <input type="number" min={0} step={0.1} placeholder="h" value={r.hrs || ''}
                        onChange={e => saveMachineTmcRates(m.id, (m.tmc_rates ?? []).map((x, i) => i === ri ? { ...x, hrs: parseFloat(e.target.value) || 0 } : x))}
                        style={{ width: 80, fontSize: 12, padding: '4px 8px', background: 'var(--bg3)', border: '1px solid var(--bord2)', borderRadius: 6, color: 'var(--purple)', fontFamily: 'var(--mono)', textAlign: 'right' }} />
                      <span style={{ fontSize: 11, color: 'var(--txt3)' }}>h TMC</span>
                      <button onClick={() => saveMachineTmcRates(m.id, (m.tmc_rates ?? []).filter((_, i) => i !== ri))}
                        style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '0 4px' }}>✕</button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button onClick={() => saveMachineTmcRates(m.id, [...(m.tmc_rates ?? []), { kva: 0, hrs: m.tmc_hrs ?? 0 }])}
                      style={{ fontSize: 11, padding: '5px 16px', borderRadius: 7, border: '1px solid rgba(203,166,247,.4)', background: 'rgba(203,166,247,.08)', color: 'var(--purple)', cursor: 'pointer' }}>
                      + เพิ่มขนาด TMC
                    </button>
                    {(m.tmc_rates ?? []).length > 0 && (
                      <button onClick={() => saveMachineTmcRates(m.id, [])}
                        style={{ fontSize: 11, padding: '5px 16px', borderRadius: 7, border: '1px solid rgba(224,90,78,.3)', background: 'none', color: 'var(--red)', cursor: 'pointer' }}>
                        ล้าง TMC ตารางนี้
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── Per-Machine TMC Rates ────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.sectionTitle}>⏱ TMC ตามขนาด (รายเครื่อง)</span>
          <span style={{ fontSize: 10, color: 'var(--txt3)' }}>เวลาตัด Cast Resin (B=4) ตามขนาด kVA — ถ้าไม่กำหนด ใช้ค่า TMC (h) จากตารางเครื่อง</span>
        </div>
        <div style={{ padding: '10px 16px' }}>
          {/* Machine tabs */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {machines.map(m => {
              const hasTmcRates = (m.tmc_rates ?? []).length > 0
              const isActive = machineTmcTab === m.id
              return (
                <button key={m.id} onClick={() => setMachineTmcTab(isActive ? null : m.id)}
                  style={{ fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: isActive ? 700 : 400,
                    border: `1px solid ${isActive ? 'var(--purple)' : hasTmcRates ? 'rgba(203,166,247,.5)' : 'var(--bord2)'}`,
                    background: isActive ? 'rgba(203,166,247,.15)' : hasTmcRates ? 'rgba(203,166,247,.08)' : 'var(--bg3)',
                    color: isActive ? 'var(--purple)' : hasTmcRates ? 'var(--purple)' : 'var(--txt3)',
                  }}>
                  {mLabel(m)}{hasTmcRates ? ` (${(m.tmc_rates ?? []).length})` : ''}
                </button>
              )
            })}
          </div>

          {machineTmcTab !== null && (() => {
            const m = machines.find(x => x.id === machineTmcTab)
            if (!m) return null
            const tmcRates = [...(m.tmc_rates ?? [])].sort((a, b) => a.kva - b.kva)
            return (
              <div>
                {/* Machine info */}
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 8, border: '1px solid var(--bord)' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt)' }}>{mLabel(m)}</span>
                  <span style={{ fontSize: 10, color: 'var(--txt3)' }}>TMC fallback:</span>
                  <code style={{ fontSize: 11, color: 'var(--purple)', background: 'var(--bg3)', padding: '2px 8px', borderRadius: 4 }}>
                    {(m.tmc_hrs ?? 0) > 0 ? `${m.tmc_hrs}h` : 'ไม่ได้ตั้ง (ใช้ kVA rate)'}
                  </code>
                  <span style={{ fontSize: 9, color: 'var(--txt3)' }}>แก้ไข TMC (h) ได้ในตารางเครื่องด้านบน</span>
                </div>

                {/* Table header */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 10, fontWeight: 700, color: 'var(--txt3)' }}>
                  <span style={{ width: 90, textAlign: 'right' }}>ขนาด (kVA)</span>
                  <span style={{ width: 16 }} />
                  <span style={{ width: 80, textAlign: 'right' }}>TMC (h)</span>
                  <span style={{ width: 60 }} />
                </div>

                {tmcRates.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--txt3)', padding: '6px 0' }}>ยังไม่มีค่าเฉพาะ — ใช้ TMC (h) = {m.tmc_hrs ?? 0}h สำหรับทุกขนาด</div>
                )}

                {tmcRates.map((r, ri) => (
                  <div key={ri} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <input type="number" min={0} placeholder="kVA" value={r.kva || ''}
                      onChange={e => saveMachineTmcRates(m.id, tmcRates.map((x, i) => i === ri ? { ...x, kva: parseFloat(e.target.value) || 0 } : x))}
                      style={{ width: 90, fontSize: 12, padding: '4px 8px', background: 'var(--bg3)', border: '1px solid var(--bord2)', borderRadius: 6, color: 'var(--blue)', fontFamily: 'var(--mono)', fontWeight: 700, textAlign: 'right' }} />
                    <span style={{ fontSize: 11, color: 'var(--txt3)' }}>kVA →</span>
                    <input type="number" min={0} step={0.1} placeholder="h" value={r.hrs || ''}
                      onChange={e => saveMachineTmcRates(m.id, tmcRates.map((x, i) => i === ri ? { ...x, hrs: parseFloat(e.target.value) || 0 } : x))}
                      style={{ width: 80, fontSize: 12, padding: '4px 8px', background: 'var(--bg3)', border: '1px solid var(--bord2)', borderRadius: 6, color: 'var(--purple)', fontFamily: 'var(--mono)', textAlign: 'right' }} />
                    <span style={{ fontSize: 11, color: 'var(--txt3)' }}>h TMC</span>
                    <button onClick={() => saveMachineTmcRates(m.id, tmcRates.filter((_, i) => i !== ri))}
                      style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: '0 4px' }}>✕</button>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  <button onClick={() => saveMachineTmcRates(m.id, [...tmcRates, { kva: 0, hrs: m.tmc_hrs ?? 0 }])}
                    style={{ fontSize: 11, padding: '5px 16px', borderRadius: 7, border: '1px solid rgba(203,166,247,.4)', background: 'rgba(203,166,247,.08)', color: 'var(--purple)', cursor: 'pointer' }}>
                    + เพิ่มขนาด
                  </button>
                  {globalRates.length > 0 && (
                    <button
                      title="Copy kVA sizes from standard rates — pre-filled with this machine's TMC (h) value as starting point"
                      onClick={() => {
                        const existingKvas = new Set(tmcRates.map(r => r.kva))
                        const newRates = [
                          ...tmcRates,
                          ...globalRates.filter(r => !existingKvas.has(r.kva)).map(r => ({ kva: r.kva, hrs: m.tmc_hrs ?? 0 }))
                        ].sort((a, b) => a.kva - b.kva)
                        saveMachineTmcRates(m.id, newRates)
                      }}
                      style={{ fontSize: 11, padding: '5px 16px', borderRadius: 7, border: '1px solid rgba(166,227,161,.4)', background: 'rgba(166,227,161,.08)', color: 'var(--green)', cursor: 'pointer' }}>
                      📋 คัดลอกจากมาตรฐาน ({globalRates.length} ขนาด)
                    </button>
                  )}
                  {tmcRates.length > 0 && (
                    <button onClick={() => saveMachineTmcRates(m.id, [])}
                      style={{ fontSize: 11, padding: '5px 16px', borderRadius: 7, border: '1px solid rgba(224,90,78,.3)', background: 'none', color: 'var(--red)', cursor: 'pointer' }}>
                      ล้างค่า TMC
                    </button>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── Weekly plan ──────────────────────────────────── */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.sectionTitle}>แผนการตัดโลหะ — สัปดาห์</span>
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
                </div>
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
                { label: '📊 Excel (.xlsx)', fn: exportXLSX, desc: 'Formatted workbook' },
                { label: '📝 Text (.txt)', fn: exportTXT, desc: 'Plain text summary' },
                { label: '🖨 Print / PDF', fn: exportPrint, desc: 'Print dialog' },
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
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: 'var(--bg3)', border: '1px solid var(--bord2)', color: 'var(--txt2)' }}>
                {(({'daily_no_ot':'❌·📅','weekly_no_ot':'❌·🗓','fastest_no_ot':'❌·🏎','deadline_no_ot':'❌·📅วันส่ง','priority_no_ot':'❌·⭐ความสำคัญ','interweek_no_ot':'❌·🔮สัปดาห์หน้า','batch_no_ot':'❌·🔗Batch','daily_smart':'⚠️·📅','weekly_smart':'⚠️·🗓','fastest_smart':'⚠️·🏎','deadline_smart':'⚠️·📅วันส่ง','priority_smart':'⚠️·⭐ความสำคัญ','interweek_smart':'⚠️·🔮สัปดาห์หน้า','batch_smart':'⚠️·🔗Batch','daily_full':'🔥·📅','weekly_full':'🔥·🗓','fastest_full':'🔥·🏎','deadline_full':'🔥·📅วันส่ง','priority_full':'🔥·⭐ความสำคัญ','interweek_full':'🔥·🔮สัปดาห์หน้า','batch_full':'🔥·🔗Batch'}) as Record<string,string>)[balanceMode] ?? balanceMode}
              </span>
              <span style={{ fontWeight: 700 }}>{totalQtyWeek} ตัว · {weekOrders.length} orders</span>
              {includePrevCarry && prevCarryQty > 0 && (
                <span style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'rgba(137,180,250,.15)' }}>
                  ↩ {prevCarryQty} ยกมาจากสัปดาห์ก่อน · แผนใหม่ {currentWeekOrders.reduce((s,o)=>s+o.qty,0)} ตัว
                </span>
              )}
              {totalOT > 0
                ? <span className={styles.warn}>⚠ OT สูงสุด {totalOT.toFixed(1)}h/วัน</span>
                : <span className={styles.ok}>✓ เสร็จในเวลาปกติทุกวัน</span>}
            </div>

            {/* ── CARD VIEW ── */}
            {viewMode === 'cards' && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dayRows.map(row => {
                const { dStr, d, isSat, dayOrders, dayScheduledQty, dayKva, dayCarryQty, unassigned, machineCells, dayFinish, dayCapHrs, finishCol, actualQty, actualOrderCount } = row
                // Show day only if there are orders planned OR machines actually working
                const hasActualWork = machineCells.some(mc => mc.work.length > 0)
                if (dayOrders.length === 0 && !hasActualWork) return null
                const isToday = dStr === fmtISO(new Date())
                // Show planned count when all orders are being worked today;
                // show actual count when weekly pool pre-processed orders to earlier days
                const showPlanned = actualOrderCount === dayOrders.length || dayOrders.length === 0
                const displayQty = showPlanned ? dayScheduledQty : actualQty
                const displayOrders = showPlanned ? dayOrders.length : actualOrderCount
                const plannedNote = !showPlanned ? ` (แผน ${dayOrders.length} orders)` : ''

                return (
                  <div key={dStr} style={{ border: `1px solid ${isToday ? 'var(--blue)' : 'var(--bord)'}`, borderRadius: 8, overflow: 'hidden' }}>
                    {/* Day header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', background: isToday ? 'rgba(137,180,250,.08)' : 'var(--bg2)', borderBottom: '1px solid var(--bord)' }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: isToday ? 'var(--blue)' : isSat ? 'var(--txt2)' : 'var(--txt)' }}>
                        {DAY_TH[d.getDay()]} {fmtD(d)}{isToday ? ' ◀ วันนี้' : ''}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--txt3)' }}>
                        {displayQty} ตัว · {displayOrders} orders{plannedNote}
                      </span>
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
                            <div style={{ minWidth: 140, fontSize: 10, fontWeight: 700, color: 'var(--red)' }}>🔴 {mLabel(m)}</div>
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
                                {mLabel(m)}
                                {sched.hasCarryOver && <span style={{ fontSize: 9, marginLeft: 4, color: 'var(--blue)', background: 'rgba(137,180,250,.15)', padding: '1px 4px', borderRadius: 4 }}>↩ ต่อจากเมื่อวาน</span>}
                              </div>
                              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: timeCol, fontWeight: 600 }}>
                                {totalH.toFixed(1)}h / {capH}h
                                {sched.otHrs > 0 && <span style={{ color: 'var(--amber)', marginLeft: 4 }}>+OT {sched.otHrs.toFixed(1)}h</span>}
                                {sched.carriesForward && <span style={{ color: 'var(--red)', marginLeft: 4 }}>→ พรุ่งนี้</span>}
                              </div>
                            </div>
                            {/* Work items */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {sched.work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete).map((w, wi) => {
                                const kva = w.order.kva ?? products[w.order.product]?.kva ?? 0
                                const { typeCode } = decodeItemInfo(w.order.item_code ?? '')
                                const kvaCol = kva <= 400 ? 'var(--blue)' : kva <= 3500 ? 'var(--amber)' : 'var(--red)'
                                const typeLabel = typeCode === '4' ? 'CR' : ['1','2','3'].includes(typeCode) ? 'Oil' : ''
                                return (
                                  <div key={wi}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                                      {w.isCarryOver && <span style={{ fontSize: 9, color: 'var(--blue)' }}>↩</span>}
                                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt3)', fontSize: 10, minWidth: 110 }}>{w.order.sap_so || w.order.id.slice(-10)}</span>
                                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: kvaCol }}>{kva.toLocaleString()}kVA ×{w.order.qty}</span>
                                      {typeLabel && <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 4, background: typeCode === '4' ? 'rgba(250,179,135,.2)' : 'rgba(137,180,250,.15)', color: typeCode === '4' ? 'var(--amber)' : 'var(--blue)' }}>{typeLabel}</span>}
                                      {typeCode === '4' && <span title={`Cast Resin — uses TMC time: ${(m.tmc_hrs ?? 0) > 0 ? (m.tmc_hrs ?? 0) + 'h' : 'not set (using kVA rate)'}`} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(203,166,247,.2)', color: 'var(--purple)', fontWeight: 700, letterSpacing: '.02em' }}>⏱ TMC</span>}
                                      {drillPrefers(m, w.order) && <span style={{ fontSize: 10 }}>🔩</span>}
                                      {w.order.customer && <span style={{ fontSize: 10, color: 'var(--txt2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>{w.order.customer}</span>}
                                      <span style={{ color: 'var(--txt3)', marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10 }}>{w.hrsWorked.toFixed(1)}h{w.isComplete ? ' ✓' : w.carriesOver ? ' →' : ''}</span>
                                    </div>
                                    {showWireData && (w.order.raw_mat || w.order.lv || w.order.hv) && (
                                      <div style={{ display: 'flex', gap: 6, paddingLeft: 16, paddingBottom: 2, fontSize: 8, color: 'var(--txt3)', flexWrap: 'wrap', alignItems: 'center' }}>
                                        {w.order.raw_mat && (() => {
                                          const wt = detectWireType(w.order.raw_mat)
                                          const matched = wt === 'laser' ? m.laser : wt === 'm4' ? m.m4 : true
                                          const badge = wt === 'laser' ? '🔆 Laser' : wt === 'm4' ? '⬛ M-4' : ''
                                          return (
                                            <span style={{ fontWeight: 700, color: wt === 'any' ? 'var(--txt2)' : matched ? 'var(--green)' : 'var(--red)',
                                              padding: '1px 5px', borderRadius: 4, background: wt === 'any' ? 'var(--bg3)' : matched ? 'rgba(166,227,161,.15)' : 'rgba(224,90,78,.12)',
                                              border: `1px solid ${wt === 'any' ? 'var(--bord)' : matched ? 'rgba(166,227,161,.4)' : 'rgba(224,90,78,.3)'}` }}>
                                              📐 {w.order.raw_mat}{badge ? ` ${badge}` : ''}{wt !== 'any' ? (matched ? ' ✓' : ' ✕') : ''}
                                            </span>
                                          )
                                        })()}
                                        {w.order.lv && w.order.lv !== '—' && <span>LV: <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{w.order.lv}</span></span>}
                                        {w.order.hv && w.order.hv !== '—' && <span>HV: <span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)' }}>{w.order.hv}</span></span>}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                      {/* Unassigned */}
                      {unassigned.map((o, i) => {
                        const kva = o.kva ?? products[o.product]?.kva ?? 0
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
                              ⚠ OT แนะนำ: {otMachines.map(m => `${mLabel(m)} +${(weekSchedule.get(m.id)!.get(dStr)!.otNeeded).toFixed(1)}h`).join(', ')}
                            </span>
                          )}
                          {carryMachines.length > 0 && (
                            <span style={{ color: 'var(--red)' }}>
                              ↩ งานค้าง: {carryMachines.map(m => mLabel(m)).join(', ')} → ต่อวันถัดไป
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
                            <div style={{ fontWeight: 700 }}>{mLabel(m)}</div>
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
                                ⚠ {(o.kva ?? products[o.product]?.kva ?? 0).toLocaleString()}kVA ×{o.qty}
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
                                    {/* Summary line */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5, flexWrap: 'wrap' }}>
                                      {sched?.hasCarryOver && <span style={{ fontSize: 9, color: 'var(--blue)', background: 'rgba(137,180,250,.12)', padding: '1px 4px', borderRadius: 4 }}>↩ ต่อ</span>}
                                      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: col, fontWeight: 700 }}>
                                        {wall.toFixed(1)}h / {capH}h
                                      </span>
                                      {sched?.otHrs ? <span style={{ fontSize: 9, color: 'var(--amber)', fontWeight: 600 }}>+OT {sched.otHrs.toFixed(1)}h</span> : ''}
                                      {sched?.carriesForward && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 600 }}>→ พรุ่งนี้</span>}
                                    </div>
                                    {/* Order rows — always visible, no click needed */}
                                    {work.map((w, idx) => {
                                      const kva = w.order.kva ?? products[w.order.product]?.kva ?? 0
                                      const kvaCol = kva <= 400 ? 'var(--blue)' : kva <= 3500 ? 'var(--amber)' : 'var(--red)'
                                      const { typeCode: tc } = decodeItemInfo(w.order.item_code ?? '')
                                      const typeLabel = tc === '4' ? 'CR' : ['1','2','3'].includes(tc) ? 'Oil' : ''
                                      const totalH = w.order.qty * getHrsForKva(m, kva, globalRates, w.order.item_code)
                                      const wireType = detectWireType(w.order.raw_mat)
                                      const wireMatch = wireType === 'laser' ? m.laser : wireType === 'm4' ? m.m4 : true
                                      return (
                                        <div key={idx} style={{ borderBottom: idx < work.length - 1 ? '1px solid var(--bord)' : 'none', paddingBottom: 4, marginBottom: 4 }}>
                                          {/* Row 1: SAP SO + kVA + status */}
                                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10 }}>
                                            {w.isCarryOver && <span style={{ color: 'var(--blue)', fontSize: 9 }}>↩</span>}
                                            <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt3)', fontSize: 9, minWidth: 80 }}>{w.order.sap_so || w.order.id.slice(-8)}</span>
                                            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: kvaCol }}>{kva.toLocaleString()}kVA</span>
                                            <span style={{ color: 'var(--txt3)', fontSize: 9 }}>×{w.order.qty}</span>
                                            {typeLabel && <span style={{ fontSize: 9, padding: '0 3px', borderRadius: 3, background: tc === '4' ? 'rgba(250,179,135,.2)' : 'rgba(137,180,250,.12)', color: tc === '4' ? 'var(--amber)' : 'var(--blue)' }}>{typeLabel}</span>}
                                            {drillPrefers(m, w.order) && <span style={{ fontSize: 10 }}>🔩</span>}
                                            <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: w.carriesOver ? 'var(--red)' : w.isComplete ? 'var(--green)' : 'var(--amber)' }}>
                                              {w.hrsWorked.toFixed(1)}h{totalH > 0 ? `/${totalH.toFixed(1)}h` : ''}{w.isComplete ? '✓' : '→'}
                                            </span>
                                          </div>
                                          {/* Row 2: customer + wire data */}
                                          <div style={{ display: 'flex', gap: 5, fontSize: 9, color: 'var(--txt3)', marginTop: 2, flexWrap: 'wrap' }}>
                                            {w.order.customer && <span style={{ color: 'var(--txt2)', fontWeight: 600 }}>{w.order.customer}</span>}
                                            {showWireData && w.order.raw_mat && w.order.raw_mat !== '—' && (
                                              <span style={{ color: wireType === 'any' ? 'var(--txt3)' : wireMatch ? 'var(--green)' : 'var(--red)', fontWeight: wireType !== 'any' ? 600 : 400 }}>
                                                📐 {w.order.raw_mat}{wireType !== 'any' ? (wireMatch ? ' ✓' : ' ✕') : ''}
                                              </span>
                                            )}
                                            {showWireData && w.order.lv && w.order.lv !== '—' && <span>LV:<span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)', marginLeft: 2 }}>{w.order.lv}</span></span>}
                                            {showWireData && w.order.hv && w.order.hv !== '—' && <span>HV:<span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)', marginLeft: 2 }}>{w.order.hv}</span></span>}
                                          </div>
                                        </div>
                                      )
                                    })}
                                    {isSelected && (
                                      <div style={{ marginTop: 4, borderTop: '1px solid rgba(137,180,250,.3)', paddingTop: 4, fontSize: 8, color: 'var(--txt3)' }}>
                                        {work.filter(w => w.order.comment && w.order.comment !== '-').map((w, idx) => (
                                          <div key={idx} style={{ fontStyle: 'italic' }}>{w.order.sap_so}: {w.order.comment}</div>
                                        ))}
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
                          <div style={{ fontSize: 10, fontWeight: 700 }}>{mLabel(m)}</div>
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
                            const kva = seg.order.kva ?? products[seg.order.product]?.kva ?? 0
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
