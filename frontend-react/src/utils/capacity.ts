import type { Order, Product, WCConfig } from '../types'

const WEEKDAYS = 5
const SAT_DAYS = 1

export interface WeeklyCapacity {
  normal: number; ot: number; total: number
  weekday_normal: number; weekday_ot: number
  sat_normal: number; sat_ot: number
  daily_weekday: number; daily_sat: number
}

export function getWeeklyCapacity(wc: string, wcConfig: Record<string, WCConfig>): WeeklyCapacity {
  const cfg = wcConfig[wc] ?? { workers: 3, hrs: 8, ot: 4, sat_hrs: 4, sat_ot: 0, eff: 90, name: wc }
  const weekday_normal = cfg.workers * cfg.hrs * WEEKDAYS
  const weekday_ot     = cfg.workers * cfg.ot  * WEEKDAYS
  const sat_normal     = cfg.workers * cfg.sat_hrs * SAT_DAYS
  const sat_ot         = cfg.workers * cfg.sat_ot  * SAT_DAYS
  return {
    normal: weekday_normal + sat_normal,
    ot: weekday_ot + sat_ot,
    total: weekday_normal + sat_normal + weekday_ot + sat_ot,
    weekday_normal, weekday_ot, sat_normal, sat_ot,
    daily_weekday: cfg.workers * cfg.hrs,
    daily_sat:     cfg.workers * cfg.sat_hrs,
  }
}

export function effectiveHrs(wc: string, stdHrs: number, wcConfig: Record<string, WCConfig>): number {
  const eff = (wcConfig[wc]?.eff ?? 90) / 100
  return stdHrs / eff
}

export function getCommittedLoadMap(
  orders: Order[],
  products: Record<string, Product>,
  wcConfig: Record<string, WCConfig>,
  openLoad: Record<string, number>,
): Record<string, number> {
  const loadMap: Record<string, number> = { ...openLoad }
  for (const order of orders) {
    const product = products[order.product]
    if (!product) continue
    for (const op of product.ops) {
      loadMap[op.wc] = (loadMap[op.wc] ?? 0) + effectiveHrs(op.wc, op.hrs, wcConfig) * order.qty
    }
  }
  return loadMap
}

export interface LoadInfo {
  load: number; cap: WeeklyCapacity; pct: number; freehrs: number
}

export function getLoadInfo(
  wc: string,
  loadMap: Record<string, number>,
  wcConfig: Record<string, WCConfig>,
): LoadInfo {
  const cap  = getWeeklyCapacity(wc, wcConfig)
  const load = loadMap[wc] ?? 0
  return { load, cap, pct: Math.round(load / cap.normal * 100), freehrs: Math.max(0, cap.normal - load) }
}

export function loadColor(pct: number): string {
  return pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : 'var(--green)'
}

export function loadBadge(pct: number): string {
  return pct >= 100 ? 'b-red' : pct >= 80 ? 'b-warn' : 'b-ok'
}
