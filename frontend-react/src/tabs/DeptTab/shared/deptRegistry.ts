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

import type { CuttingRate, RoutingCrRow } from '../../../types'
import type { WorkflowStatus } from './types'
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
