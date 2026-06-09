import { REG_PER, OT_PER } from './constants'
import type { MachineDaySched, DayWork } from './constants'
import type { CuttingMachine, CuttingRate, Order, WCConfig } from '../../../types'
import { fmtISO, resolveHours, canMachineCut, drillPrefers, isMachineOn } from './utils'

export type { DayWork }

export interface MachineCell {
  m: CuttingMachine
  machOff: boolean
  sched: MachineDaySched | undefined
  work: DayWork[]
  wall: number
  capH: number
  grp: Record<number, { drilled: boolean; partial: boolean }>
}

export interface DayRow {
  dStr: string
  d: Date
  di: number
  dow: number
  isSat: boolean
  dayOrders: Order[]
  dayScheduledQty: number
  dayKva: number
  dayCarryQty: number
  unassigned: Order[]
  machineCells: MachineCell[]
  dayWalls: number[]
  dayFinish: number
  dayCapHrs: number
  finishCol: string
  actualQty: number
  actualOrderCount: number
}

export interface MachTotals {
  wallHrs: number
  qty: number
  regCap: number
  ot: number
  over: boolean
}

export interface WeekData {
  mTotals: MachTotals[]
  dayRows: DayRow[]
  bottleneckWall: number
  totalQtyWeek: number
  totalKvaWeek: number
  totalOT: number
  summaryStatus: 'ok' | 'warn' | 'over'
  weekDoneOrders: Order[]
  weekCarryOrders: Order[]
  weekUnscheduled: Order[]
}

export function computeWeekData({
  weekSchedule,
  weekOrders,
  machines,
  days,
  balanceMode,
  strictWire,
  requireDrill,
  products,
  wcConfig,
  globalRates: _globalRates,
  globalTmcRates: _globalTmcRates,
}: {
  weekSchedule: Map<number, Map<string, MachineDaySched>>
  weekOrders: Order[]
  machines: CuttingMachine[]
  days: Date[]
  balanceMode: string
  strictWire: boolean
  requireDrill: boolean
  products: Record<string, { kva?: number }>
  wcConfig: Record<string, WCConfig>
  globalRates: CuttingRate[]
  globalTmcRates: CuttingRate[]
}): WeekData {
  const isFastest = balanceMode.startsWith('fastest')

  // Per-machine weekly totals
  const mTotals: MachTotals[] = machines.map(m => {
    let wallHrs = 0, otSum = 0
    const completedIds = new Set<string>()
    let completedEntries = 0
    days.forEach(d => {
      const sched = weekSchedule.get(m.id)?.get(fmtISO(d))
      if (!sched) return
      wallHrs += sched.regHrs + sched.otHrs
      otSum   += sched.otHrs
      sched.work.forEach(w => {
        if (w.isComplete) { completedIds.add(w.order.id); completedEntries++ }
      })
    })
    const qty = isFastest
      ? completedEntries
      : [...completedIds].reduce((s, oid) => {
          const o = weekOrders.find(x => x.id === oid)
          return s + (o?.qty ?? 0)
        }, 0)
    return { wallHrs, qty, regCap: REG_PER, ot: otSum, over: wallHrs > REG_PER + OT_PER }
  })

  // Per-day data for each machine
  const dayRows: DayRow[] = days.map((d, di) => {
    const dStr = fmtISO(d)
    const dow = d.getDay()
    const isSat = dow === 6
    const dayOrders = weekOrders.filter(o => o.plan_date === dStr)
    const dayScheduledQty = dayOrders.reduce((a, o) => a + o.qty, 0)
    const dayKva = dayOrders.reduce((a, o) => a + ((o.total_kva ?? 0) > 0 ? (o.total_kva ?? 0) : (o.kva ?? 0) * (o.qty ?? 1)), 0)
    const unassigned = dayOrders.filter(o => machines.every(m => !canMachineCut(m, o, products, strictWire, requireDrill)))

    const machineCells: MachineCell[] = machines.map(m => {
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
    const activeMachineRef = machines.find(m => isMachineOn(m, dow)) ?? machines[0]
    const { reg: dayCapHrs } = activeMachineRef ? resolveHours(activeMachineRef, wcConfig, isSat, dow) : { reg: isSat ? 4 : 8 }
    const finishCol = dayFinish === 0 ? 'var(--txt3)' : dayFinish <= dayCapHrs ? 'var(--green)' : dayFinish <= dayCapHrs * 2 ? 'var(--amber)' : 'var(--red)'

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

  let maxDailyOT = 0
  days.forEach(d => {
    const dStr = fmtISO(d)
    machines.forEach(m => {
      const sched = weekSchedule.get(m.id)?.get(dStr)
      if (sched) maxDailyOT = Math.max(maxDailyOT, sched.otHrs)
    })
  })
  const totalOT = maxDailyOT
  const summaryStatus: 'ok' | 'warn' | 'over' = bottleneckWall > REG_PER + OT_PER ? 'over' : totalOT >= 0.05 ? 'warn' : 'ok'

  // Track last-seen completion state for each order across all machines & days
  const orderLastState = new Map<string, { isComplete: boolean; day: string }>()
  machines.forEach(m => {
    days.forEach(d => {
      const dStr = fmtISO(d)
      const sched = weekSchedule.get(m.id)?.get(dStr)
      sched?.work.forEach(w => {
        const cur = orderLastState.get(w.order.id)
        if (!cur || dStr > cur.day || (dStr === cur.day && w.isComplete)) {
          orderLastState.set(w.order.id, { isComplete: w.isComplete, day: dStr })
        }
      })
    })
  })
  const weekDoneOrders  = weekOrders.filter(o => orderLastState.get(o.id)?.isComplete === true)
  const weekCarryOrders = weekOrders.filter(o => { const s = orderLastState.get(o.id); return !!s && !s.isComplete })
  const weekUnscheduled = weekOrders.filter(o => !orderLastState.has(o.id))

  return { mTotals, dayRows, bottleneckWall, totalQtyWeek, totalKvaWeek, totalOT, summaryStatus, weekDoneOrders, weekCarryOrders, weekUnscheduled }
}
