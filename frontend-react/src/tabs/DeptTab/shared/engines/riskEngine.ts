/**
 * riskEngine — turns raw load/capacity into risk levels, bottlenecks, and a
 * capacity-based carry-forward estimate. Pure functions, no React.
 *
 * Risk thresholds (utilisation = demand / regular capacity):
 *   green  < 90%      yellow 90–110%     red 110–130%     critical > 130%
 */

import type { Order } from '../../../../types'
import type { OrderContribution } from '../deptRegistry'
import type { PoolHorizon, HorizonWeek, DeptRates } from './forecastEngine'
import { poolWeekOrders } from './forecastEngine'

export type RiskLevel = 'green' | 'yellow' | 'red' | 'critical'

export const RISK_META: Record<RiskLevel, { label: string; dot: string; color: string; bg: string }> = {
  green:    { label: 'ปกติ',     dot: '🟢', color: 'var(--green)', bg: 'rgba(166,227,161,.10)' },
  yellow:   { label: 'เฝ้าระวัง', dot: '🟡', color: 'var(--amber)', bg: 'rgba(249,226,175,.12)' },
  red:      { label: 'เกินกำลัง', dot: '🔴', color: 'var(--red)',   bg: 'rgba(243,139,168,.14)' },
  critical: { label: 'วิกฤต',    dot: '🛑', color: '#e64553',      bg: 'rgba(230,69,83,.20)' },
}

export function riskLevel(util: number): RiskLevel {
  if (util > 1.30) return 'critical'
  if (util > 1.10) return 'red'
  if (util >= 0.90) return 'yellow'
  return 'green'
}

export interface CellRisk { util: number; level: RiskLevel; overloadHrs: number }

/** Risk for one pool-week cell (overload measured against regular capacity). */
export function cellRisk(demand: number, regCap: number): CellRisk {
  const util = regCap > 0 ? demand / regCap : 0
  return { util, level: riskLevel(util), overloadHrs: Math.max(0, demand - regCap) }
}

export interface Bottleneck {
  poolKey: string
  label: string
  icon: string
  weekIndex: number
  util: number
  level: RiskLevel
  overloadHrs: number
}

/** The single worst pool-week across the whole horizon. */
export function worstBottleneck(pools: PoolHorizon[]): Bottleneck | null {
  let worst: Bottleneck | null = null
  for (const pool of pools) {
    pool.weeks.forEach((w, wi) => {
      if (w.regCap <= 0) return
      if (!worst || w.util > worst.util) {
        worst = { poolKey: pool.key, label: pool.label, icon: pool.icon, weekIndex: wi, util: w.util, level: riskLevel(w.util), overloadHrs: Math.max(0, w.demand - w.regCap) }
      }
    })
  }
  return worst
}

/** The worst pool in a specific week (bottleneck of that week). */
export function bottleneckForWeek(pools: PoolHorizon[], weekIndex: number): Bottleneck | null {
  let worst: Bottleneck | null = null
  for (const pool of pools) {
    const w = pool.weeks[weekIndex]
    if (!w || w.regCap <= 0) continue
    if (!worst || w.util > worst.util) {
      worst = { poolKey: pool.key, label: pool.label, icon: pool.icon, weekIndex, util: w.util, level: riskLevel(w.util), overloadHrs: Math.max(0, w.demand - w.regCap) }
    }
  }
  return worst
}

export interface HorizonSummary {
  redWeeks: number
  criticalWeeks: number
  totalOverloadHrs: number
  bottleneck: Bottleneck | null
}

export function summarize(pools: PoolHorizon[]): HorizonSummary {
  let redWeeks = 0, criticalWeeks = 0, totalOverloadHrs = 0
  for (const pool of pools) {
    for (const w of pool.weeks) {
      if (w.regCap <= 0) continue
      const lvl = riskLevel(w.util)
      if (lvl === 'red') redWeeks++
      if (lvl === 'critical') criticalWeeks++
      totalOverloadHrs += Math.max(0, w.demand - w.regCap)
    }
  }
  return { redWeeks, criticalWeeks, totalOverloadHrs, bottleneck: worstBottleneck(pools) }
}

/**
 * Capacity-based carry-forward estimate. For a pool-week whose demand exceeds
 * `capHours`, keep the highest-priority / earliest-deadline orders until
 * capacity is full; the remainder is "at risk of carrying over". Returns the
 * count of distinct at-risk orders across the whole horizon.
 *
 * capMode 'reg' = do-nothing; 'regot' = even with full OT.
 */
function keepRank(c: OrderContribution): number {
  const pr = c.order.priority === 'rush' ? 0 : c.order.priority === 'high' ? 1 : 2
  return pr // earlier-deadline tiebreak applied in sort
}

export function carryRiskOrders(
  orders: Order[],
  deptRates: DeptRates,
  pools: PoolHorizon[],
  weeks: HorizonWeek[],
  capMode: 'reg' | 'regot' = 'reg',
): Set<string> {
  const atRisk = new Set<string>()
  for (const pool of pools) {
    pool.weeks.forEach((wl, wi) => {
      const cap = capMode === 'regot' ? wl.regCap + wl.otCap : wl.regCap
      if (cap <= 0 || wl.demand <= cap) return
      const contribs = poolWeekOrders(orders, deptRates, pool, weeks[wi])
        .slice()
        .sort((a, b) => keepRank(a) - keepRank(b) || (a.order.deadline ?? '').localeCompare(b.order.deadline ?? ''))
      let used = 0
      for (const c of contribs) {
        if (used + c.hrs <= cap) { used += c.hrs; continue }
        // this order overflows capacity → at risk (keep filling with its hrs anyway)
        used += c.hrs
        atRisk.add(c.order.id)
      }
    })
  }
  return atRisk
}
