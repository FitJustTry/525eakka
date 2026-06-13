/**
 * Builders for hand-constructed horizons — give risk/recommendation/simulation
 * tests exact, deterministic capacity and demand without touching the calendar.
 */

import type { PoolHorizon, HorizonWeek } from '../../tabs/DeptTab/shared/engines/forecastEngine'

export function makeWeeks(n: number, startOffset = 0): HorizonWeek[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    offset: startOffset + i,
    monStr: `W${i}-mon`,
    satStr: `W${i}-sat`,
    label: `W${i}`,
  }))
}

/**
 * Build a pool with fixed reg/OT capacity and an explicit demand-per-week array.
 * depts default to [] (fine for riskLevel/cellRisk/summarise/recommendations,
 * which only read pool.weeks + label/icon).
 */
export function makePool(
  key: string,
  reg: number,
  ot: number,
  demands: number[],
  extra: Partial<Pick<PoolHorizon, 'label' | 'icon' | 'wcs' | 'depts'>> = {},
): PoolHorizon {
  return {
    key,
    label: extra.label ?? key,
    icon: extra.icon ?? '•',
    wcs: extra.wcs ?? [key],
    depts: extra.depts ?? [],
    cap: { reg, ot },
    weeks: demands.map(d => ({ demand: d, regCap: reg, otCap: ot, util: reg > 0 ? d / reg : 0 })),
  }
}
