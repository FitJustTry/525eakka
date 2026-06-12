import type { CuttingMachine, CuttingRate, Order, WCConfig } from '../../../../types'
import { DRILL_BONUS, INDEX_BONUS } from './constants'
import type { DayWork, MachineDaySched } from './constants'
import { getHrsForKva, resolveHours, resolveShift, canMachineCut, drillPrefers, wirePrefers, catRank, fmtISO, isMachineOn } from './utils'

export type ShiftMode = 'none' | 'smart' | 'every' | 'n_days' | 'manual' | 'custom'

export type { DayWork, MachineDaySched }

function weekAheadCapacity(
  m: CuttingMachine, wcConfig: Record<string, WCConfig>,
  days: Date[], fromIdx: number, lazyOt: boolean
): { regLeft: number; otLeft: number } {
  const cnt = m.count || 1
  const regLeft = days.slice(fromIdx).reduce((s, dd) => {
    const { reg } = resolveHours(m, wcConfig, dd.getDay() === 6, dd.getDay())
    return s + reg * cnt
  }, 0)
  const otLeft = lazyOt ? days.slice(fromIdx + 1).reduce((s, dd) => {
    const { ot } = resolveHours(m, wcConfig, dd.getDay() === 6, dd.getDay())
    return s + ot * cnt
  }, 0) : 0
  return { regLeft, otLeft }
}

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
 *
 * @param initWall  Starting wall time per machine (0 = daily mode, cumulative = weekly mode)
 * @param machIdx   Map of machineId → position in array (for index-based tiebreaker)
 */
export function assignOrders(
  dayOrders: Order[],
  machines: CuttingMachine[],
  products: Record<string, { kva?: number }>,
  globalRates: CuttingRate[],
  initWall: Map<number, number> = new Map(),
  machIdx: Map<number, number> = new Map(),
  strictWire = false,
  requireDrill = false,
  globalTmcRates: CuttingRate[] = [],
  batchKva = false,
  useNearestKva = false,
  routingRates = false,
): Map<number, Order[]> {
  const assigned = new Map<number, Order[]>()
  const wall     = new Map<number, number>()
  machines.forEach((m, i) => {
    assigned.set(m.id, [])
    wall.set(m.id, initWall.get(m.id) ?? 0)
    if (!machIdx.has(m.id)) machIdx.set(m.id, i)
  })

  const kvaOf = (o: Order) => o.kva ?? products[o.product ?? '']?.kva ?? 0
  const el = (o: Order) => machines.filter(m => canMachineCut(m, o, products, strictWire, requireDrill))

  // Exclusive load per machine — hours only that machine can handle
  const machExcl = new Map<number, number>()
  machines.forEach(m => machExcl.set(m.id, 0))
  for (const o of dayOrders) {
    const oe = el(o)
    if (oe.length === 1) {
      const h = o.qty * getHrsForKva(oe[0], kvaOf(o), globalRates, o.item_code, globalTmcRates, useNearestKva, routingRates)
      machExcl.set(oe[0].id, (machExcl.get(oe[0].id) ?? 0) + h)
    }
  }
  // Sort: exclusive-first, then pressure-tiebreak within same tier, then LPT.
  // Pressure = max exclusive load on any eligible machine. High-pressure groups go first
  // so their shared machines fill up before flexible groups compete for them.
  const prRankA = (o: Order) => o.priority === 'rush' ? 0 : o.priority === 'high' ? 1 : 2
  const sorted = [...dayOrders].sort((a, b) => {
    const pa = prRankA(a), pb = prRankA(b)
    if (pa !== pb) return pa - pb
    const ae = el(a), be = el(b)
    if (ae.length !== be.length) return ae.length - be.length
    const ap = ae.length ? Math.max(...ae.map(m => machExcl.get(m.id) ?? 0)) : 0
    const bp = be.length ? Math.max(...be.map(m => machExcl.get(m.id) ?? 0)) : 0
    if (Math.abs(bp - ap) > 0.001) return bp - ap
    return b.qty * (be[0]?.hrs_per_unit ?? 1) - a.qty * (ae[0]?.hrs_per_unit ?? 1)
  })

  for (const o of sorted) {
    let eligible = el(o)
    if (eligible.length === 0) {
      // Constraint relaxation: drop wire match → drop drill → drop both
      if (strictWire)  eligible = machines.filter(m => canMachineCut(m, o, products, false, requireDrill))
      if (!eligible.length && requireDrill) eligible = machines.filter(m => canMachineCut(m, o, products, strictWire, false))
      if (!eligible.length) eligible = machines.filter(m => canMachineCut(m, o, products, false, false))
      if (!eligible.length) continue
    }

    // Score = wall_time − drill_bonus − wire_bonus − index_bonus + kva_over_qualified_penalty
    // Lower score = better candidate.
    // batchKva: penalise machines whose max_kva greatly exceeds order.kva (route small→small, large→large)
    const KVA_WT = 1.0  // up to 1h preference weight for kVA-matched machine
    const best = eligible.reduce((a, m) => {
      const pref  = (mc: CuttingMachine) => (drillPrefers(mc, o) ? DRILL_BONUS : 0) + (wirePrefers(mc, o) ? DRILL_BONUS : 0)
      const kvaP  = (mc: CuttingMachine) => {
        const k = kvaOf(o); if (!batchKva || k <= 0 || mc.max_kva >= 9999) return 0
        return Math.max(0, (mc.max_kva - k) / mc.max_kva) * KVA_WT
      }
      const sa = (wall.get(a.id) ?? 0) - pref(a) + kvaP(a) - (machIdx.get(a.id) ?? 0) * INDEX_BONUS
      const sm = (wall.get(m.id) ?? 0) - pref(m) + kvaP(m) - (machIdx.get(m.id) ?? 0) * INDEX_BONUS
      return sm < sa ? m : a
    })

    assigned.get(best.id)!.push(o)
    const kva = o.kva ?? products[o.product ?? '']?.kva ?? 0
    wall.set(best.id, (wall.get(best.id) ?? 0) + (o.qty * getHrsForKva(best, kva, globalRates, o.item_code, globalTmcRates, useNearestKva, routingRates)) / (best.count || 1))
  }
  return assigned
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
export function scheduleFastest(
  weekOrders: Order[],
  machines: CuttingMachine[],
  products: Record<string, { kva?: number }>,
  globalRates: CuttingRate[],
  wcConfig: Record<string, WCConfig>,
  days: Date[],
  otPolicy: 'none' | 'smart' | 'full',
  strictWire = false,
  requireDrill = false,
  stickyOrders = true,
  lazyOt = true,
  globalTmcRates: CuttingRate[] = [],
  useNearestKva = false,
  shiftMode: ShiftMode = 'none',
  shiftNDays = 0,
  shiftHrsDefault = 9,
  manualShiftDays: Map<number, Set<string>> = new Map(),
  routingRates = false,
  manualOtDays: Map<number, Set<string>> = new Map(),
  customShiftHrs: Map<number, Map<string, number>> = new Map(),
  customOtHrs: Map<number, Map<string, number>> = new Map(),
  downtimeDays: Map<number, Set<string>> = new Map(),
): Map<number, Map<string, MachineDaySched>> {
  const result = new Map<number, Map<string, MachineDaySched>>()
  if (!machines.length || !weekOrders.length) return result

  // ═══════════════════════════════════════════════════════════
  //  PHASE 1 — Expand orders → individual units, sorted LPT
  // ═══════════════════════════════════════════════════════════
  interface Unit { order: Order; unitIndex: number }
  const pool: Unit[] = []
  for (const o of weekOrders)
    for (let ui = 0; ui < o.qty; ui++)
      pool.push({ order: o, unitIndex: ui })

  // Rate helper per (machine, unit)
  const uHrs = (m: CuttingMachine, u: Unit) =>
    getHrsForKva(m, u.order.kva ?? products[u.order.product]?.kva ?? 0, globalRates, u.order.item_code, globalTmcRates, useNearestKva, routingRates)

  // LPT sort: use the fastest eligible machine's rate as the ordering key
  const refMach = (u: Unit) =>
    machines.find(m => canMachineCut(m, u.order, products, strictWire, requireDrill)) ?? machines[0]
  pool.sort((a, b) => uHrs(refMach(b), b) - uHrs(refMach(a), a))

  // Exclusive-pressure map: total hours of work only each machine can do.
  // Units competing for a machine with high exclusive load are assigned before
  // units with a less-constrained eligible set — prevents flexible units from
  // grabbing a bottleneck machine before its exclusive load is visible in wall time.
  const machExclusive = new Map<number, number>()
  machines.forEach(m => machExclusive.set(m.id, 0))
  for (const u of pool) {
    const uel = machines.filter(m => canMachineCut(m, u.order, products, strictWire, requireDrill))
    if (uel.length === 1)
      machExclusive.set(uel[0].id, (machExclusive.get(uel[0].id) ?? 0) + uHrs(uel[0], u))
  }
  // Re-sort pool: exclusive-first, pressure DESC, then LPT (used by split mode)
  pool.sort((a, b) => {
    const ae = machines.filter(m => canMachineCut(m, a.order, products, strictWire, requireDrill))
    const be = machines.filter(m => canMachineCut(m, b.order, products, strictWire, requireDrill))
    if (ae.length !== be.length) return ae.length - be.length
    const ap = ae.length ? Math.max(...ae.map(m => machExclusive.get(m.id) ?? 0)) : 0
    const bp = be.length ? Math.max(...be.map(m => machExclusive.get(m.id) ?? 0)) : 0
    if (Math.abs(bp - ap) > 0.001) return bp - ap
    return uHrs(refMach(b), b) - uHrs(refMach(a), a)
  })

  // ═══════════════════════════════════════════════════════════
  //  PHASE 2 — Pre-assign every unit to a machine globally
  //
  //  Two strategies depending on stickyOrders:
  //
  //  stickyOrders=true  (🔗 ครบต่อเครื่อง):
  //    Assign WHOLE ORDERS at once, sorted exclusive-first then LPT.
  //    "Exclusive" = only 1 eligible machine given active constraints.
  //    Locking exclusive orders in first prevents a non-exclusive order
  //    from grabbing the only machine that can handle a constrained order,
  //    which was the root cause of 🔒+🔩+🔗 being the SLOWEST mode.
  //
  //  stickyOrders=false (🔀 แยกเครื่องได้):
  //    Assign individual units (LPT), each unit independently to the
  //    least-loaded eligible machine.  No ordering bias.
  // ═══════════════════════════════════════════════════════════
  const machLoad  = new Map<number, number>()
  const machQueue = new Map<number, Unit[]>()
  machines.forEach(m => { machLoad.set(m.id, 0); machQueue.set(m.id, []) })

  if (stickyOrders) {
    // ── Whole-order assignment: exclusive-first, then LPT ──────
    const ordEl  = (o: Order) => machines.filter(m => canMachineCut(m, o, products, strictWire, requireDrill))
    const ordHrs = (m: CuttingMachine, o: Order) =>
      o.qty * getHrsForKva(m, o.kva ?? products[o.product ?? '']?.kva ?? 0, globalRates, o.item_code, globalTmcRates, useNearestKva, routingRates)

    const sortedOrders = [...weekOrders].sort((a, b) => {
      const ae = ordEl(a), be = ordEl(b)
      if (ae.length !== be.length) return ae.length - be.length
      const ap = ae.length ? Math.max(...ae.map(m => machExclusive.get(m.id) ?? 0)) : 0
      const bp = be.length ? Math.max(...be.map(m => machExclusive.get(m.id) ?? 0)) : 0
      if (Math.abs(bp - ap) > 0.001) return bp - ap
      const ra = ae[0] ?? machines[0], rb = be[0] ?? machines[0]
      return ordHrs(rb, b) - ordHrs(ra, a)
    })

    for (const o of sortedOrders) {
      let eligible = ordEl(o)
      if (!eligible.length) {
        // Constraint relaxation fallback: drop wire match, then drill, then both
        if (strictWire)    eligible = machines.filter(m => canMachineCut(m, o, products, false, requireDrill))
        if (!eligible.length && requireDrill)
                           eligible = machines.filter(m => canMachineCut(m, o, products, strictWire, false))
        if (!eligible.length)
                           eligible = machines.filter(m => canMachineCut(m, o, products, false, false))
        if (!eligible.length) continue
      }
      const pref = (mc: CuttingMachine) => (drillPrefers(mc, o) ? DRILL_BONUS : 0) + (wirePrefers(mc, o) ? DRILL_BONUS : 0)
      const target = eligible.reduce((a, m) =>
        (machLoad.get(m.id) ?? 0) - pref(m) < (machLoad.get(a.id) ?? 0) - pref(a) ? m : a
      )
      const units = pool.filter(u => u.order.id === o.id)
      machQueue.get(target.id)!.push(...units)
      machLoad.set(target.id, (machLoad.get(target.id) ?? 0) + ordHrs(target, o))
    }
  } else {
    // ── Unit-by-unit LPT (stickyOrders=false) ──────────────────
    for (const u of pool) {
      const eligible = machines.filter(m => canMachineCut(m, u.order, products, strictWire, requireDrill))
      if (!eligible.length) continue
      const upref = (mc: CuttingMachine) => (drillPrefers(mc, u.order) ? DRILL_BONUS : 0) + (wirePrefers(mc, u.order) ? DRILL_BONUS : 0)
      const target = eligible.reduce((a, m) =>
        (machLoad.get(m.id) ?? 0) - upref(m) < (machLoad.get(a.id) ?? 0) - upref(a) ? m : a
      )
      machLoad.set(target.id, (machLoad.get(target.id) ?? 0) + uHrs(target, u))
      machQueue.get(target.id)!.push(u)
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  PHASE 3 — Simulate each machine's pre-assigned queue
  //
  //  No claiming, no pool competition — each machine just runs
  //  through its queue day by day.  Smart OT looks ahead at the
  //  full remaining queue vs remaining reg capacity for the week.
  // ═══════════════════════════════════════════════════════════
  for (const m of machines) {
    const mMap = new Map<string, MachineDaySched>()
    result.set(m.id, mMap)
    const queue  = machQueue.get(m.id)!
    let qi       = 0              // next unit index in queue
    let rem      = 0              // hours left on current unit
    let isCarry  = false
    let curUnit: Unit | null = null

    // ── Pre-compute active shift days for this machine ──────────
    const activeShiftDays = new Set<string>()
    if (shiftMode === 'every') {
      days.forEach(d => { if (isMachineOn(m, d.getDay())) activeShiftDays.add(fmtISO(d)) })
    } else if (shiftMode === 'n_days' && shiftNDays > 0) {
      // Quick pre-pass (copy of queue state) to estimate actual daily load without shift
      const dayLoads = new Map<string, number>()
      let pr = 0, pqi = 0
      for (const d of days) {
        const dow = d.getDay(); const dStr = fmtISO(d)
        if (!isMachineOn(m, dow)) continue
        const { reg, ot } = resolveHours(m, wcConfig, dow === 6, dow)
        let pa = (reg + ot) * (m.count || 1), pu = 0
        while (pa > 0.001) {
          if (pr <= 0.001) { if (pqi >= queue.length) break; pr = uHrs(m, queue[pqi++]) }
          const ph = Math.min(pr, pa); pa -= ph; pr -= ph; pu += ph
          if (pr <= 0.001) pr = 0
        }
        dayLoads.set(dStr, pu)
      }
      ;[...dayLoads.entries()].sort((a, b) => b[1] - a[1]).slice(0, shiftNDays).forEach(([d]) => activeShiftDays.add(d))
    }

    for (let di = 0; di < days.length; di++) {
      const d = days[di]; const dow = d.getDay(); const isSat = dow === 6
      const dStr = fmtISO(d)
      const { reg, ot } = resolveHours(m, wcConfig, isSat, dow)
      const regCap = reg * (m.count || 1)
      const otCap  = ot  * (m.count || 1)

      if (regCap === 0 && otCap === 0) {
        mMap.set(dStr, { regHrs: 0, otHrs: 0, shiftHrs: 0, otNeeded: 0, work: [], hasCarryOver: false,
          carriesForward: rem > 0.001 || qi < queue.length })
        continue
      }
      if (downtimeDays.get(m.id)?.has(dStr)) {
        mMap.set(dStr, { regHrs: 0, otHrs: 0, shiftHrs: 0, otNeeded: 0, work: [], hasCarryOver: false,
          carriesForward: rem > 0.001 || qi < queue.length, isDowntime: true })
        continue
      }

      // Smart OT:
      //   lazyOt=true  (new) — subtract future OT capacity; defers OT to end of week
      //   lazyOt=false (old) — fire OT whenever queue > remaining regular hours
      let effectiveOtCap = 0
      if (otPolicy === 'full') {
        effectiveOtCap = otCap
      } else if (otPolicy === 'smart') {
        const { regLeft, otLeft } = weekAheadCapacity(m, wcConfig, days, di, lazyOt)
        const queueHrs = queue.slice(qi).reduce((s, u) => s + uHrs(m, u), 0)
        effectiveOtCap = Math.min(otCap, Math.max(0, rem + queueHrs - regLeft - otLeft))
      }

      if (manualOtDays.size > 0 && !(manualOtDays.get(m.id)?.has(dStr) ?? false)) effectiveOtCap = 0
      const customOtVal = customOtHrs.get(m.id)?.get(dStr)
      if (customOtVal !== undefined) effectiveOtCap = Math.min(otCap, customOtVal * (m.count || 1))

      // ── NEW: Shift tier — entirely independent from OT logic ──
      const shiftCap = resolveShift(m, shiftHrsDefault) * (m.count || 1)
      let effectiveShiftCap = 0
      if (shiftMode === 'custom') {
        effectiveShiftCap = (customShiftHrs.get(m.id)?.get(dStr) ?? 0) * (m.count || 1)
      } else if (shiftCap > 0 && shiftMode !== 'none') {
        if (activeShiftDays.has(dStr)) {
          effectiveShiftCap = shiftCap
        } else if (shiftMode === 'smart') {
          const weekRegOtLeft = days.slice(di).reduce((s, dd) => {
            const { reg: r, ot: o } = resolveHours(m, wcConfig, dd.getDay() === 6, dd.getDay())
            return s + (r + o) * (m.count || 1)
          }, 0)
          const qHrs = queue.slice(qi).reduce((s, u) => s + uHrs(m, u), 0)
          effectiveShiftCap = (rem + qHrs > weekRegOtLeft) ? shiftCap : 0
        } else if (shiftMode === 'manual') {
          effectiveShiftCap = (manualShiftDays.get(m.id)?.has(dStr) ?? false) ? shiftCap : 0
        }
      }

      const work: DayWork[] = []
      let avail     = regCap + effectiveOtCap + effectiveShiftCap
      let regUsed   = 0; let otUsed = 0; let shiftUsed = 0

      while (avail > 0.001) {
        if (rem <= 0.001) {
          rem = 0
          if (qi >= queue.length) break
          curUnit = queue[qi++]
          rem     = uHrs(m, curUnit)
          isCarry = false
        }
        const h         = Math.min(rem, avail)
        const regPart   = Math.min(h, regCap - regUsed)
        const otPart    = Math.min(h - regPart, effectiveOtCap - otUsed)
        const shiftPart = h - regPart - otPart
        regUsed   += regPart; otUsed += otPart; shiftUsed += shiftPart
        avail -= h; rem -= h
        const done = rem <= 0.001
        if (done) rem = 0
        const lastW = work[work.length - 1]
        if (lastW && lastW.order.id === curUnit!.order.id && !lastW.isComplete) {
          lastW.hrsWorked += h; lastW.isComplete = done; lastW.carriesOver = !done && avail <= 0.001
        } else {
          work.push({ order: curUnit!.order, hrsWorked: h, isComplete: done, isCarryOver: isCarry, carriesOver: !done && avail <= 0.001 })
        }
        if (done) { isCarry = false } else { isCarry = true; break }
      }

      mMap.set(dStr, {
        regHrs: regUsed, otHrs: otUsed, shiftHrs: shiftUsed, otNeeded: otUsed,
        work, hasCarryOver: work.some(w => w.isCarryOver),
        carriesForward: rem > 0.001 || qi < queue.length,
      })
    }
  }
  return result
}

/** Sort shared pool by strategy */
export function sortPool(
  orders: Order[], strategy: string,
  products: Record<string, { kva?: number }>, globalRates: CuttingRate[], machines: CuttingMachine[],
  nextWeekOrders: Order[] = [], globalTmcRates: CuttingRate[] = [],
  interweekThreshold = 0.5, thisMachine?: CuttingMachine,
  useNearestKva = false, routingRates = false
): Order[] {
  const m0 = thisMachine ?? machines[0]
  const hrs = (o: Order) => m0 ? o.qty * getHrsForKva(m0, o.kva ?? products[o.product]?.kva ?? 0, globalRates, o.item_code, globalTmcRates, useNearestKva, routingRates) : 0
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
    const nextWeekHeavy = nextWeekLargeHrs > thisWeekAvgHrs * orders.length * interweekThreshold
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
  pool.sort((a, b) => {
    const pd = (a.plan_date ?? '').localeCompare(b.plan_date ?? '')
    return pd !== 0 ? pd : hrs(b) - hrs(a)
  })
  // Stable post-sort: rush → high → normal, preserving relative strategy order within each tier
  const prRank = (o: Order) => o.priority === 'rush' ? 0 : o.priority === 'high' ? 1 : 2
  return pool.sort((a, b) => prRank(a) - prRank(b))
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
export function scheduleMode(
  weekOrders: Order[],
  dailyAssignments: { dStr: string; asgn: Map<number, Order[]> }[],
  machines: CuttingMachine[],
  products: Record<string, { kva?: number }>,
  globalRates: CuttingRate[],
  wcConfig: Record<string, WCConfig>,
  days: Date[],
  _machIdx: Map<number, number>,
  approach: 'daily' | 'weekly',
  otPolicy: 'none' | 'smart' | 'full',
  sortStrategy = 'plan_date',
  nextWeekOrders: Order[] = [],
  strictWire = false,
  requireDrill = false,
  stickyOrders = true,   // false → expand each order into qty individual 1-unit orders
  lazyOt = true,
  globalTmcRates: CuttingRate[] = [],
  interweekThreshold = 0.5,
  useNearestKva = false,
  shiftMode: ShiftMode = 'none',
  shiftNDays = 0,
  shiftHrsDefault = 9,
  manualShiftDays: Map<number, Set<string>> = new Map(),
  routingRates = false,
  manualOtDays: Map<number, Set<string>> = new Map(),
  customShiftHrs: Map<number, Map<string, number>> = new Map(),
  customOtHrs: Map<number, Map<string, number>> = new Map(),
  downtimeDays: Map<number, Set<string>> = new Map(),
): Map<number, Map<string, MachineDaySched>> {
  const result = new Map<number, Map<string, MachineDaySched>>()

  // ── Build per-machine queues ─────────────────────────────────
  type QItem = { order: Order; remainingHrs: number; isCarryOver: boolean }
  const machineQueues = new Map<number, QItem[]>()

  if (approach === 'weekly') {
    // ── PRE-ASSIGN orders globally using LPT load balancing ────
    const machIdxLocal = new Map<number, number>()
    machines.forEach((m, i) => machIdxLocal.set(m.id, i))
    // stickyOrders=false: expand each order into qty individual 1-unit orders so units can split across machines
    const ordersToAssign = stickyOrders
      ? weekOrders
      : weekOrders.flatMap(o => Array.from({length: o.qty}, (_, ui) => ({...o, id: `${o.id}__u${ui}`, qty: 1})))
    const isBatch = sortStrategy === 'batch_kva'
    const asgn = assignOrders(ordersToAssign, machines, products, globalRates, new Map(), machIdxLocal, strictWire, requireDrill, globalTmcRates, isBatch, useNearestKva)

    // ── Simulate each machine's pre-assigned queue independently ─
    // Week-ahead smart OT: only add OT on a day when total remaining work
    // exceeds total remaining reg capacity for this machine's queue.
    // No per-order OT extension — avoids using full OT from Day 1.
    for (const m of machines) {
      const mMap = new Map<string, MachineDaySched>()
      result.set(m.id, mMap)

      const assignedOrders = sortPool(asgn.get(m.id) ?? [], sortStrategy, products, globalRates, machines, nextWeekOrders, globalTmcRates, interweekThreshold, m, useNearestKva, routingRates)
      const queue: QItem[] = assignedOrders.map(o => ({
        order: o,
        remainingHrs: o.qty * getHrsForKva(m, o.kva ?? products[o.product ?? '']?.kva ?? 0, globalRates, o.item_code, globalTmcRates, useNearestKva, routingRates),
        isCarryOver: false,
      }))

      let qi  = 0
      let cur: QItem | null = null   // in-progress order (carry-over between days)

      // ── Pre-compute active shift days ──────────────────────────
      const activeShiftDaysW = new Set<string>()
      if (shiftMode === 'every') {
        days.forEach(d => { if (isMachineOn(m, d.getDay())) activeShiftDaysW.add(fmtISO(d)) })
      } else if (shiftMode === 'n_days' && shiftNDays > 0) {
        const dayLoads = new Map<string, number>()
        let prem = 0, pqi = 0, pcur: QItem | null = null
        for (const d of days) {
          const dow = d.getDay(); const dStr = fmtISO(d)
          if (!isMachineOn(m, dow)) continue
          const { reg, ot } = resolveHours(m, wcConfig, dow === 6, dow)
          let pa = (reg + ot) * (m.count || 1), pu = 0
          while (pa > 0.001) {
            if (!pcur || pcur.remainingHrs <= 0.001) {
              if (pqi >= queue.length) break
              pcur = { ...queue[pqi++] }
            }
            const ph = Math.min(pcur.remainingHrs, pa); pa -= ph; pu += ph; pcur.remainingHrs -= ph
            if (pcur.remainingHrs <= 0.001) pcur = null
          }
          dayLoads.set(dStr, pu)
        }
        ;[...dayLoads.entries()].sort((a, b) => b[1] - a[1]).slice(0, shiftNDays).forEach(([d]) => activeShiftDaysW.add(d))
      }

      for (let di = 0; di < days.length; di++) {
        const d = days[di]; const dow = d.getDay(); const isSat = dow === 6
        const dStr = fmtISO(d)
        const { reg, ot } = resolveHours(m, wcConfig, isSat, dow)
        const regCap = reg * (m.count || 1); const otCap = ot * (m.count || 1)

        if (regCap === 0 && otCap === 0) {
          mMap.set(dStr, { regHrs: 0, otHrs: 0, shiftHrs: 0, otNeeded: 0, work: [], hasCarryOver: false,
            carriesForward: (cur?.remainingHrs ?? 0) > 0.001 || qi < queue.length })
          continue
        }
        if (downtimeDays.get(m.id)?.has(dStr)) {
          mMap.set(dStr, { regHrs: 0, otHrs: 0, shiftHrs: 0, otNeeded: 0, work: [], hasCarryOver: false,
            carriesForward: (cur?.remainingHrs ?? 0) > 0.001 || qi < queue.length, isDowntime: true })
          continue
        }

        // Week-ahead OT:
        //   lazyOt=true  — subtract future OT; defers OT to end of week
        //   lazyOt=false — fire OT whenever queue > remaining regular hours
        let effectiveOtCap = 0
        if (otPolicy === 'full') {
          effectiveOtCap = otCap
        } else if (otPolicy === 'smart') {
          const { regLeft, otLeft } = weekAheadCapacity(m, wcConfig, days, di, lazyOt)
          const curRem   = cur?.remainingHrs ?? 0
          const queueHrs = queue.slice(qi).reduce((s, item) => s + item.remainingHrs, 0)
          effectiveOtCap = Math.min(otCap, Math.max(0, curRem + queueHrs - regLeft - otLeft))
        }

        if (manualOtDays.size > 0 && !(manualOtDays.get(m.id)?.has(dStr) ?? false)) effectiveOtCap = 0
        const customOtValW = customOtHrs.get(m.id)?.get(dStr)
        if (customOtValW !== undefined) effectiveOtCap = Math.min(otCap, customOtValW * (m.count || 1))

        // ── NEW: Shift tier ──────────────────────────────────────
        const shiftCap = resolveShift(m, shiftHrsDefault) * (m.count || 1)
        let effectiveShiftCap = 0
        if (shiftMode === 'custom') {
          effectiveShiftCap = (customShiftHrs.get(m.id)?.get(dStr) ?? 0) * (m.count || 1)
        } else if (shiftCap > 0 && shiftMode !== 'none') {
          if (activeShiftDaysW.has(dStr)) {
            effectiveShiftCap = shiftCap
          } else if (shiftMode === 'smart') {
            const weekRegOtLeft = days.slice(di).reduce((s, dd) => {
              const { reg: r, ot: o } = resolveHours(m, wcConfig, dd.getDay() === 6, dd.getDay())
              return s + (r + o) * (m.count || 1)
            }, 0)
            const curRem2  = cur?.remainingHrs ?? 0
            const queueHrs2 = queue.slice(qi).reduce((s, item) => s + item.remainingHrs, 0)
            effectiveShiftCap = (curRem2 + queueHrs2 > weekRegOtLeft) ? shiftCap : 0
          } else if (shiftMode === 'manual') {
            effectiveShiftCap = (manualShiftDays.get(m.id)?.has(dStr) ?? false) ? shiftCap : 0
          }
        }

        const work: DayWork[] = []
        let avail = regCap + effectiveOtCap + effectiveShiftCap
        let regUsed = 0; let otUsed = 0; let shiftUsed = 0

        while (avail > 0.001) {
          if (!cur || cur.remainingHrs <= 0.001) {
            if (qi >= queue.length) break
            cur = { ...queue[qi++], isCarryOver: false }
          }
          const h         = Math.min(cur.remainingHrs, avail)
          const regPart   = Math.min(h, regCap - regUsed)
          const otPart    = Math.min(h - regPart, effectiveOtCap - otUsed)
          const shiftPart = h - regPart - otPart
          regUsed += regPart; otUsed += otPart; shiftUsed += shiftPart
          avail -= h; cur.remainingHrs -= h
          const done = cur.remainingHrs <= 0.001
          if (done) cur.remainingHrs = 0
          const lastW = work[work.length - 1]
          if (lastW && lastW.order.id === cur.order.id && !lastW.isComplete) {
            lastW.hrsWorked += h; lastW.isComplete = done; lastW.carriesOver = !done && avail <= 0.001
          } else {
            work.push({ order: cur.order, hrsWorked: h, isComplete: done, isCarryOver: cur.isCarryOver, carriesOver: !done && avail <= 0.001 })
          }
          if (done) { cur = null } else { if (cur) cur.isCarryOver = true; break }
        }

        mMap.set(dStr, {
          regHrs: regUsed, otHrs: otUsed, shiftHrs: shiftUsed, otNeeded: otUsed,
          work, hasCarryOver: work.some(w => w.isCarryOver),
          carriesForward: (cur?.remainingHrs ?? 0) > 0.001 || qi < queue.length,
        })
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

    // ── Pre-compute active shift days (daily) ──────────────────
    const activeShiftDaysD = new Set<string>()
    if (shiftMode === 'every') {
      days.forEach(d => { if (isMachineOn(m, d.getDay())) activeShiftDaysD.add(fmtISO(d)) })
    } else if (shiftMode === 'n_days' && shiftNDays > 0) {
      const dayLoads = new Map<string, number>()
      let pCarry: { remainingHrs: number }[] = []
      for (let di = 0; di < days.length; di++) {
        const d = days[di]; const dow = d.getDay(); const dStr = fmtISO(d)
        if (!isMachineOn(m, dow)) continue
        const { reg, ot } = resolveHours(m, wcConfig, dow === 6, dow)
        let pa = (reg + ot) * (m.count || 1), pu = 0
        const todayEst = (dailyAssignments[di]?.asgn.get(m.id) ?? []).map(o => ({
          remainingHrs: o.qty * getHrsForKva(m, o.kva ?? products[o.product]?.kva ?? 0, globalRates, o.item_code, globalTmcRates, useNearestKva, routingRates)
        }))
        const all = [...pCarry, ...todayEst]; pCarry = []
        for (const item of all) {
          if (pa <= 0.001) { pCarry.push(item); continue }
          const ph = Math.min(item.remainingHrs, pa); pa -= ph; pu += ph
          const r2 = item.remainingHrs - ph
          if (r2 > 0.001) pCarry.push({ remainingHrs: r2 })
        }
        dayLoads.set(dStr, pu)
      }
      ;[...dayLoads.entries()].sort((a, b) => b[1] - a[1]).slice(0, shiftNDays).forEach(([d]) => activeShiftDaysD.add(d))
    }

    for (let di = 0; di < days.length; di++) {
      const d = days[di]
      const dStr = fmtISO(d)
      const dow = d.getDay(); const isSat = dow === 6
      const { reg, ot } = resolveHours(m, wcConfig, isSat, dow)
      const regCap = reg * (m.count || 1)
      const otCap  = ot  * (m.count || 1)

      {
        const isOffDay = regCap === 0 && otCap === 0
        const isDtDay  = downtimeDays.get(m.id)?.has(dStr) ?? false
        if (isOffDay || isDtDay) {
          const todayOrders = dailyAssignments[di]?.asgn.get(m.id) ?? []
          carryItems.push(...todayOrders.map(o => ({
            order: o,
            remainingHrs: o.qty * getHrsForKva(m, o.kva ?? products[o.product]?.kva ?? 0, globalRates, o.item_code, globalTmcRates, useNearestKva, routingRates),
            isCarryOver: true,
          })))
          mMap.set(dStr, { regHrs: 0, otHrs: 0, shiftHrs: 0, otNeeded: 0, work: [], hasCarryOver: false,
            carriesForward: carryItems.length > 0, ...(isDtDay ? { isDowntime: true } : {}) })
          continue
        }
      }

      // ── Compute effective OT cap ───────────────────────────
      let effectiveOtCap = 0
      if (otPolicy === 'full') {
        effectiveOtCap = otCap
      } else if (otPolicy === 'smart') {
        // Week-ahead look: OT fires only when total remaining work (carry + all future assigned orders)
        // exceeds total remaining reg capacity + future OT capacity — defers OT to end of week.
        const { regLeft, otLeft } = weekAheadCapacity(m, wcConfig, days, di, lazyOt)
        const carryHrs  = carryItems.reduce((s, c) => s + c.remainingHrs, 0)
        const futureHrs = days.slice(di).reduce((s, _dd, i) =>
          s + (dailyAssignments[di + i]?.asgn.get(m.id) ?? [])
            .reduce((ss, o) => ss + o.qty * getHrsForKva(m, o.kva ?? products[o.product]?.kva ?? 0, globalRates, o.item_code, globalTmcRates, useNearestKva, routingRates), 0)
        , 0)
        effectiveOtCap = Math.min(otCap, Math.max(0, carryHrs + futureHrs - regLeft - otLeft))
      }

      // ── NEW: Shift tier ──────────────────────────────────────
      const shiftCap = resolveShift(m, shiftHrsDefault) * (m.count || 1)
      let effectiveShiftCap = 0
      if (shiftCap > 0 && shiftMode !== 'none') {
        if (activeShiftDaysD.has(dStr)) {
          effectiveShiftCap = shiftCap
        } else if (shiftMode === 'smart') {
          const weekRegOtLeft = days.slice(di).reduce((s, dd) => {
            const { reg: r, ot: o } = resolveHours(m, wcConfig, dd.getDay() === 6, dd.getDay())
            return s + (r + o) * (m.count || 1)
          }, 0)
          const carryHrs2 = carryItems.reduce((s, c) => s + c.remainingHrs, 0)
          const futureHrs2 = days.slice(di).reduce((s, _dd, i) =>
            s + (dailyAssignments[di + i]?.asgn.get(m.id) ?? [])
              .reduce((ss, o) => ss + o.qty * getHrsForKva(m, o.kva ?? products[o.product]?.kva ?? 0, globalRates, o.item_code, globalTmcRates, useNearestKva, routingRates), 0)
          , 0)
          effectiveShiftCap = (carryHrs2 + futureHrs2 > weekRegOtLeft) ? shiftCap : 0
        } else if (shiftMode === 'manual') {
          effectiveShiftCap = (manualShiftDays.get(m.id)?.has(dStr) ?? false) ? shiftCap : 0
        }
      }

      const work: DayWork[] = []
      let regUsed = 0; let otUsed = 0; let shiftUsed = 0
      let avail = regCap + effectiveOtCap + effectiveShiftCap

      {
        // ── Daily: carry queue + today's new orders ───────────
        const todayOrders = dailyAssignments[di]?.asgn.get(m.id) ?? []
        const todayItems: QItem[] = todayOrders.map(o => ({
          order: o, remainingHrs: o.qty * getHrsForKva(m, o.kva ?? products[o.product]?.kva ?? 0, globalRates, o.item_code, globalTmcRates, useNearestKva, routingRates), isCarryOver: false
        }))
        const fullQueue = [...carryItems, ...todayItems]
        carryItems = []
        for (const item of fullQueue) {
          if (avail <= 0.001) { carryItems.push({ ...item, isCarryOver: true }); continue }
          const h         = Math.min(item.remainingHrs, avail)
          const regPart   = Math.min(h, regCap - regUsed)
          const otPart    = Math.min(h - regPart, effectiveOtCap - otUsed)
          const shiftPart = h - regPart - otPart
          regUsed += regPart; otUsed += otPart; shiftUsed += shiftPart; avail -= h
          const rem = item.remainingHrs - h
          const done = rem <= 0.001
          work.push({ order: item.order, hrsWorked: h, isComplete: done, isCarryOver: item.isCarryOver, carriesOver: !done })
          if (!done) carryItems.push({ order: item.order, remainingHrs: rem, isCarryOver: true })
        }
      }

      mMap.set(dStr, {
        regHrs: regUsed, otHrs: otUsed, shiftHrs: shiftUsed, otNeeded: otUsed,
        work, hasCarryOver: work.some(w => w.isCarryOver),
        carriesForward: carryItems.length > 0,
      })
    }
  }
  return result
}
