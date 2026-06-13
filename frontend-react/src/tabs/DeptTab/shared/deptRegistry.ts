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
import { buildSapDeptRates } from './sapRates'

export interface DeptRegistryEntry {
  id: string
  label: string
  icon: string
  color: string
  /**
   * Pipeline stage this department represents, or null for departments that
   * are NOT tracked as a workflow_status (the assembly departments). A pipeline
   * department only counts orders that have not yet passed its stage; a null
   * department counts every planned order that is not yet DONE.
   */
  workflowStage: WorkflowStatus | null
  /** Workcenter(s) whose capacity this department consumes */
  workcenters: string[]
  /** Where this department's hours come from (for labelling / provenance) */
  source: 'routing_cr' | 'sap_routing'
  /** Derive hours-per-kVA. routing_cr depts read the rows; sap depts ignore them. */
  getRates: (rows: RoutingCrRow[]) => CuttingRate[]
  /** Fallback hours/unit when no rate exists for a kVA */
  fallbackHrs: number
}

/** Workcenters that make up each assembly department (see Factory Forecast). */
export const INTERNAL_ASSEMBLY_WCS = ['EE3301', 'EE3302', 'EE3303', 'EE3401', 'EE3403']
export const EXTERNAL_ASSEMBLY_WCS = [
  'EE4201', 'EE4202', 'EE4204',
  'MP5101', 'MP5102', 'MP5103', 'MP5202', 'MP5304',
  'MP5401', 'MP5402', 'MP5403', 'MP5404',
  'MP5601', 'MP5602', 'MP5603',
]

export const DEPT_REGISTRY: DeptRegistryEntry[] = [
  {
    id: 'cutting',
    label: 'ตัดเหล็ก',
    icon: '✂',
    color: 'var(--amber)',
    workflowStage: 'CUTTING',
    workcenters: ['EE3102', 'EE3104'],
    source: 'routing_cr',
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
    source: 'routing_cr',
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
    source: 'routing_cr',
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
    source: 'routing_cr',
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
    source: 'routing_cr',
    getRates: rows => buildDeptRates(rows, ['0110'], 'EE3107'),
    fallbackHrs: 0.25,
  },
  // ── Assembly departments (capacity/forecast only — not workflow-tracked) ──
  // Hours come from the SAP routing export, summed across each department's
  // workcenters. workflowStage is null: demand counts every planned order not
  // yet DONE, since every order eventually needs assembly.
  {
    id: 'internal-assembly',
    label: 'ประกอบภายใน',
    icon: '🔧',
    color: '#94e2d5',
    workflowStage: null,
    workcenters: INTERNAL_ASSEMBLY_WCS,
    source: 'sap_routing',
    getRates: () => buildSapDeptRates(INTERNAL_ASSEMBLY_WCS),
    fallbackHrs: 13.7,
  },
  {
    id: 'external-assembly',
    label: 'ประกอบภายนอก',
    icon: '🏗',
    color: '#89dceb',
    workflowStage: null,
    workcenters: EXTERNAL_ASSEMBLY_WCS,
    source: 'sap_routing',
    getRates: () => buildSapDeptRates(EXTERNAL_ASSEMBLY_WCS),
    fallbackHrs: 10.3,
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
 *
 * Pipeline departments (workflowStage set): an order only counts toward a stage
 * it has NOT yet passed, so advancing workflow_status removes its load upstream.
 *
 * Untracked departments (workflowStage null — the assembly departments): every
 * planned order that is not yet DONE counts, since every order eventually needs
 * assembly. (We model this purely as forecasted load — no handoff exists yet.)
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
      if (dept.workflowStage === null) {
        if (st === 'DONE') continue
      } else if (stageIdx(st) > stageIdx(dept.workflowStage)) {
        continue
      }
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
