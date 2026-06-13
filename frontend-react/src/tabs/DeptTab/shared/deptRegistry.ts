/**
 * Central registry of every production department in the factory pipeline.
 *
 * One source of truth for cross-department features (Factory Forecast, WIP,
 * future dashboards).  Each entry knows how to derive its hours-per-kVA from
 * the shared routing_cr data and which workcenter owns its capacity.
 *
 * The per-department scheduler pages still own their own DeptConfig (which adds
 * station/snapshot API paths); this registry is the lighter, read-only view
 * used by aggregate screens.
 */

import type { CuttingRate, RoutingCrRow, WCConfig, Order } from '../../../types'
import type { WorkflowStatus } from './types'
import { WORKFLOW_SEQUENCE } from './types'
import { buildDeptRates } from './routingRates'
import { buildRoutingCrRates } from '../cutting/scheduling/routingRates'

export interface DeptRegistryEntry {
  id: string
  label: string
  icon: string
  color: string
  workflowStage: WorkflowStatus
  /** Workcenter(s) whose capacity this department consumes */
  workcenters: string[]
  /** Derive hours-per-kVA from raw routing rows */
  getRates: (rows: RoutingCrRow[]) => CuttingRate[]
  /** Fallback hours/unit when routing has no entry for a kVA */
  fallbackHrs: number
}

export const DEPT_REGISTRY: DeptRegistryEntry[] = [
  {
    id: 'cutting',
    label: 'ตัดเหล็ก',
    icon: '✂',
    color: 'var(--amber)',
    workflowStage: 'CUTTING',
    workcenters: ['EE3102', 'EE3104'],
    getRates: rows => buildRoutingCrRates(rows).normalRates,
    fallbackHrs: 2.5,
  },
  {
    id: 'steel-shake',
    label: 'เขย่าเหล็ก',
    icon: '🌀',
    color: '#cba6f7',
    workflowStage: 'SHAKE',
    workcenters: ['EE3105'],
    getRates: rows => buildDeptRates(rows, ['0055'], 'EE3105'),
    fallbackHrs: 2.0,
  },
  {
    id: 'steel-stack',
    label: 'เรียงเหล็ก',
    icon: '🔩',
    color: 'var(--blue)',
    workflowStage: 'STACK',
    workcenters: ['EE3105'],
    getRates: rows => buildDeptRates(rows, ['0070', '0080'], 'EE3105'),
    fallbackHrs: 5.0,
  },
  {
    id: 'clamp-assembly',
    label: 'ประกบแคลมป์',
    icon: '🔨',
    color: '#fab387',
    workflowStage: 'CLAMP',
    workcenters: ['EE3106'],
    getRates: rows => buildDeptRates(rows, ['0090', '0100'], 'EE3106'),
    fallbackHrs: 1.5,
  },
  {
    id: 'no-load',
    label: 'No Load Test',
    icon: '⚡',
    color: 'var(--green)',
    workflowStage: 'NOLOAD',
    workcenters: ['EE3107'],
    getRates: rows => buildDeptRates(rows, ['0110'], 'EE3107'),
    fallbackHrs: 0.25,
  },
]

/** Exact-kVA lookup, falling back to nearest available rate, then a default. */
export function lookupHrs(rates: CuttingRate[], kva: number, fallback: number): number {
  if (!rates.length) return fallback
  const exact = rates.find(r => r.kva === kva)
  if (exact) return exact.hrs
  const nearest = rates.reduce((best, r) =>
    Math.abs(r.kva - kva) < Math.abs(best.kva - kva) ? r : best
  )
  return nearest.hrs
}

export const stageIdx = (s: WorkflowStatus) => WORKFLOW_SEQUENCE.indexOf(s)

/** Pre-compute each department's rate table from raw routing rows. */
export function buildAllDeptRates(rows: RoutingCrRow[]): { dept: DeptRegistryEntry; rates: CuttingRate[] }[] {
  return DEPT_REGISTRY.map(d => ({ dept: d, rates: d.getRates(rows) }))
}

/**
 * Hours of work each department needs for orders planned in [monStr, satStr].
 * An order only counts toward a department it has NOT yet passed, so advancing
 * an order's workflow_status removes its load from upstream stages.
 */
export function weekDemandByDept(
  orders: Order[],
  deptRates: { dept: DeptRegistryEntry; rates: CuttingRate[] }[],
  monStr: string,
  satStr: string,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const { dept, rates } of deptRates) {
    let hrs = 0
    for (const o of orders) {
      if (!o.plan_date || o.plan_date < monStr || o.plan_date > satStr) continue
      const st = (o.workflow_status as WorkflowStatus) || 'CUTTING'
      if (stageIdx(st) > stageIdx(dept.workflowStage)) continue
      hrs += (o.qty ?? 1) * lookupHrs(rates, o.kva ?? 0, dept.fallbackHrs)
    }
    out.set(dept.id, hrs)
  }
  return out
}

export interface CapacityPool {
  key: string
  wcs: string[]
  depts: DeptRegistryEntry[]
  cap: { reg: number; ot: number }
}

function wcWeeklyCapacity(wc: WCConfig | undefined): { reg: number; ot: number } {
  if (!wc) return { reg: 0, ot: 0 }
  const eff = (wc.eff ?? 90) / 100
  return {
    reg: wc.workers * (wc.hrs * 5 + (wc.sat_hrs ?? 0)) * eff,
    ot:  wc.workers * ((wc.ot ?? 0) * 5 + (wc.sat_ot ?? 0)) * eff,
  }
}

/**
 * Group departments into capacity pools by shared workcenter signature
 * (EE3105 is shared by Shake + Stack) and compute each pool's weekly capacity.
 */
export function getCapacityPools(wcConfig: Record<string, WCConfig>): CapacityPool[] {
  const byKey = new Map<string, { key: string; wcs: string[]; depts: DeptRegistryEntry[] }>()
  for (const d of DEPT_REGISTRY) {
    const key = d.workcenters.join('+')
    if (!byKey.has(key)) byKey.set(key, { key, wcs: d.workcenters, depts: [] })
    byKey.get(key)!.depts.push(d)
  }
  return [...byKey.values()].map(pool => ({
    ...pool,
    cap: pool.wcs.reduce(
      (acc, wc) => {
        const c = wcWeeklyCapacity(wcConfig[wc])
        return { reg: acc.reg + c.reg, ot: acc.ot + c.ot }
      },
      { reg: 0, ot: 0 },
    ),
  }))
}
