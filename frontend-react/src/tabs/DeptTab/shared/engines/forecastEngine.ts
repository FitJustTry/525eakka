/**
 * forecastEngine — pure, page-free multi-week demand vs capacity computation.
 *
 * Wraps the shared deptRegistry helpers (weekDemandByDept, getCapacityPools,
 * buildAllDeptRates, ordersForDepts) into a horizon model that the risk,
 * recommendation, and simulation engines all build on. No React, no fetching.
 */

import type { Order, RoutingCrRow, WCConfig, CuttingRate } from '../../../../types'
import { getWeekRange, fmtISO, fmtD } from '../../cutting/scheduling/utils'
import {
  buildAllDeptRates, weekDemandByDept, getCapacityPools, ordersForDepts,
  type DeptRegistryEntry, type CapacityPool, type OrderContribution,
} from '../deptRegistry'

export interface HorizonWeek {
  index: number
  offset: number
  monStr: string
  satStr: string
  label: string
}

export interface PoolWeekLoad {
  demand: number
  regCap: number
  otCap: number
  /** demand / regCap (Infinity-safe: 0 when no capacity) */
  util: number
}

export interface PoolHorizon {
  key: string
  label: string
  icon: string
  wcs: string[]
  depts: DeptRegistryEntry[]
  cap: { reg: number; ot: number }
  weeks: PoolWeekLoad[]
}

/** Recompute utilisation/capacity for a new capacity function, reusing demand. */
export function rescaleHorizon(
  pools: PoolHorizon[],
  capacityFn: (pool: PoolHorizon) => { reg: number; ot: number },
): PoolHorizon[] {
  return pools.map(pool => {
    const cap = capacityFn(pool)
    return {
      ...pool,
      cap,
      weeks: pool.weeks.map(w => ({ ...w, regCap: cap.reg, otCap: cap.ot, util: cap.reg > 0 ? w.demand / cap.reg : 0 })),
    }
  })
}

export type DeptRates = { dept: DeptRegistryEntry; rates: CuttingRate[] }[]

/** Build N consecutive week columns starting at startOffset (0 = current week). */
export function makeHorizonWeeks(startOffset: number, count: number): HorizonWeek[] {
  return Array.from({ length: count }, (_, i) => {
    const offset = startOffset + i
    const { mon, sat } = getWeekRange(offset)
    return { index: i, offset, monStr: fmtISO(mon), satStr: fmtISO(sat), label: `${fmtD(mon)}–${fmtD(sat)}` }
  })
}

export function buildDeptRates(routingRows: RoutingCrRow[]): DeptRates {
  return buildAllDeptRates(routingRows)
}

/**
 * Per capacity pool, per week: demand hours, regular & OT capacity, utilisation.
 * `capacityFn` optionally overrides a pool's capacity (used by the simulation
 * engine for what-if scenarios). Returns pools in registry order.
 */
export function computeHorizon(
  orders: Order[],
  deptRates: DeptRates,
  wcConfig: Record<string, WCConfig>,
  weeks: HorizonWeek[],
  capacityFn?: (pool: CapacityPool) => { reg: number; ot: number },
): PoolHorizon[] {
  const pools = getCapacityPools(wcConfig)
  // demand[deptId][weekIndex]
  const demand = new Map<string, number[]>()
  deptRates.forEach(({ dept }) => demand.set(dept.id, weeks.map(() => 0)))
  weeks.forEach((w, wi) => {
    const wk = weekDemandByDept(orders, deptRates, w.offset)
    wk.forEach((hrs, deptId) => { const row = demand.get(deptId); if (row) row[wi] = hrs })
  })

  return pools.map(pool => {
    const cap = capacityFn ? capacityFn(pool) : pool.cap
    const weekLoads: PoolWeekLoad[] = weeks.map((_, wi) => {
      const d = pool.depts.reduce((s, dept) => s + (demand.get(dept.id)?.[wi] ?? 0), 0)
      return { demand: d, regCap: cap.reg, otCap: cap.ot, util: cap.reg > 0 ? d / cap.reg : 0 }
    })
    return {
      key: pool.key,
      label: pool.depts.map(d => d.label).join(' + '),
      icon: pool.depts[0]?.icon ?? '•',
      wcs: pool.wcs,
      depts: pool.depts,
      cap,
      weeks: weekLoads,
    }
  })
}

/** Orders contributing to a pool's load in a given week (for carry-source / drill). */
export function poolWeekOrders(
  orders: Order[],
  deptRates: DeptRates,
  pool: PoolHorizon,
  week: HorizonWeek,
): OrderContribution[] {
  return ordersForDepts(orders, deptRates, pool.depts, week.offset)
}
