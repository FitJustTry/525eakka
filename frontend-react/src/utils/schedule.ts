import type { Order, Product, WCConfig } from '../types'
import { isWorkDay, nextWorkDay, fmtISO } from './dates'
import { effectiveHrs } from './capacity'

const ORDER_COLORS = [
  '#5b8ef0','#e09c2a','#4caf7d','#9b7fe8','#e05a4e',
  '#26c6da','#ef9f27','#66bb6a','#ab47bc','#ec407a',
]

function getDayCapacityHours(wc: string, d: Date, wcConfig: Record<string, WCConfig>, holidays: Record<string, string>, factoryHolidays: Record<string, string>): number {
  if (!isWorkDay(d, holidays, factoryHolidays)) return 0
  const cfg = wcConfig[wc] ?? { workers: 3, hrs: 8, sat_hrs: 4 }
  const dayHours = d.getDay() === 6 ? (cfg.sat_hrs ?? 0) : (cfg.hrs ?? 0)
  return Math.max(0, (cfg.workers ?? 0) * dayHours)
}

function getDayShiftHours(wc: string, d: Date, wcConfig: Record<string, WCConfig>): number {
  const cfg = wcConfig[wc] ?? { hrs: 8, sat_hrs: 4 }
  return Math.max(0, d.getDay() === 6 ? (cfg.sat_hrs ?? 0) : (cfg.hrs ?? 0))
}

export interface ScheduledOp {
  wc: string; wcName: string; name: string
  effHrs: number; startDate: Date; endDate: Date
}

export interface ScheduledOrder {
  id: string; product: string; customer: string; kva: number
  category: string; qty: number; deadline: Date
  orderStart: Date; orderEnd: Date; isLate: boolean; lateDays: number
  ops: ScheduledOp[]; color: string
}

export interface ScheduleResult {
  orders: ScheduledOrder[]
  wcTimeline: Record<string, Array<ScheduledOp & { orderId: string; color: string }>>
  spanDays: number
}

export function scheduleOrders(
  accepted: Order[],
  products: Record<string, Product>,
  wcConfig: Record<string, WCConfig>,
  holidays: Record<string, string>,
  factoryHolidays: Record<string, string>,
): ScheduleResult {
  if (accepted.length === 0) return { orders: [], wcTimeline: {}, spanDays: 60 }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const wcFree: Record<string, number> = {}
  const catPrio: Record<string, number> = { 'Fast': 0, 'หลัก': 1, 'เสริม': 2 }

  const toSchedule = [...accepted].sort((a, b) => {
    const pdA = a.plan_date || a.deadline
    const pdB = b.plan_date || b.deadline
    if (pdA < pdB) return -1
    if (pdA > pdB) return 1
    const ca = catPrio[a.category] ?? 1
    const cb = catPrio[b.category] ?? 1
    if (ca !== cb) return ca - cb
    return (a.deadline || '') < (b.deadline || '') ? -1 : 1
  })

  const scheduled = toSchedule.map((order, oi): ScheduledOrder | null => {
    const product = products[order.product]
    if (!product) return null

    let prevEnd = today.getTime()
    const ops: ScheduledOp[] = []

    const mergedOps: Array<{ wc: string; name: string; effHrs: number }> = []
    for (const op of product.ops) {
      if (op.hrs <= 0) continue
      const effH = effectiveHrs(op.wc, op.hrs, wcConfig) * order.qty
      const last = mergedOps[mergedOps.length - 1]
      if (last && last.wc === op.wc) {
        last.effHrs += effH
        last.name += '+' + op.name.split('(')[0].trim()
      } else {
        mergedOps.push({ wc: op.wc, name: op.name, effHrs: effH })
      }
    }

    for (const op of mergedOps) {
      const wcFreeTime = wcFree[op.wc] ?? today.getTime()
      let startMs = Math.max(prevEnd, wcFreeTime)
      let startDate = new Date(startMs); startDate.setHours(8, 0, 0, 0)
      if (!isWorkDay(startDate, holidays, factoryHolidays)) {
        startDate = nextWorkDay(startDate, holidays, factoryHolidays)
      }

      let hrsLeft = op.effHrs
      let cur = new Date(startDate)
      let endDate = new Date(cur)
      let guard = 0

      while (hrsLeft > 0 && guard < 730) {
        const avail = getDayCapacityHours(op.wc, cur, wcConfig, holidays, factoryHolidays)
        if (avail > 0) {
          const used = Math.min(hrsLeft, avail)
          hrsLeft -= used
          endDate = new Date(cur)
          const shiftHours = getDayShiftHours(op.wc, cur, wcConfig)
          const clockHrs   = avail > 0 ? shiftHours * used / avail : shiftHours
          endDate.setHours(8 + clockHrs, 0, 0, 0)
        }
        if (hrsLeft > 0) cur.setDate(cur.getDate() + 1)
        guard++
      }

      ops.push({
        wc: op.wc, wcName: wcConfig[op.wc]?.name ?? op.wc, name: op.name,
        effHrs: Math.round(op.effHrs * 10) / 10,
        startDate: new Date(startDate), endDate: new Date(endDate),
      })

      prevEnd = endDate.getTime() + 86400000
      wcFree[op.wc] = endDate.getTime() + 86400000
    }

    const orderStart = ops[0]?.startDate ?? today
    const orderEnd   = ops[ops.length - 1]?.endDate ?? today
    const dl         = new Date(order.deadline)
    const isLate     = orderEnd > dl

    return {
      id: order.id,
      product: products[order.product]?.label.split('—')[0].trim() ?? order.product,
      customer: order.customer ?? '',
      kva: order.kva ?? 0,
      category: order.category ?? '',
      qty: order.qty,
      deadline: dl, orderStart, orderEnd, isLate,
      lateDays: isLate ? Math.round((orderEnd.getTime() - dl.getTime()) / 86400000) : 0,
      ops,
      color: ORDER_COLORS[oi % ORDER_COLORS.length],
    }
  }).filter(Boolean) as ScheduledOrder[]

  const allEnds = scheduled.map(o => o.orderEnd.getTime())
  const maxEnd  = new Date(Math.max(...allEnds, today.getTime() + 30 * 86400000))
  const spanDays = Math.ceil((maxEnd.getTime() - today.getTime()) / 86400000) + 5

  const wcTimeline: ScheduleResult['wcTimeline'] = {}
  for (const order of scheduled) {
    for (const op of order.ops) {
      if (!wcTimeline[op.wc]) wcTimeline[op.wc] = []
      wcTimeline[op.wc].push({ orderId: order.id, color: order.color, ...op })
    }
  }

  return { orders: scheduled, wcTimeline, spanDays }
}

export { fmtISO }
