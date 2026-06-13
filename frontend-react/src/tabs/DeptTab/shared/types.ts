import type { Order } from '../../../types'

/** Workflow pipeline — every order moves through these stages in order. */
export type WorkflowStatus = 'CUTTING' | 'SHAKE' | 'STACK' | 'CLAMP' | 'NOLOAD' | 'DONE'

export const WORKFLOW_SEQUENCE: WorkflowStatus[] = [
  'CUTTING', 'SHAKE', 'STACK', 'CLAMP', 'NOLOAD', 'DONE',
]

export const WORKFLOW_NEXT: Record<WorkflowStatus, WorkflowStatus | null> = {
  CUTTING: 'SHAKE',
  SHAKE:   'STACK',
  STACK:   'CLAMP',
  CLAMP:   'NOLOAD',
  NOLOAD:  'DONE',
  DONE:    null,
}

export const WORKFLOW_LABELS: Record<WorkflowStatus, string> = {
  CUTTING: '✂ ตัดเหล็ก',
  SHAKE:   '🌀 เขย่าเหล็ก',
  STACK:   '🔩 เรียงเหล็ก',
  CLAMP:   '🔨 แคลมป์',
  NOLOAD:  '⚡ No Load Test',
  DONE:    '✅ เสร็จสิ้น',
}

/**
 * Configuration object that fully describes one downstream production department.
 *
 * Each department folder exports one of these as `config`.
 * DeptSchedulerPage reads the config and builds the full scheduling UI.
 * Adding a new department = new folder + new config (< 30 min).
 */
export interface DeptConfig {
  /** Kebab-case identifier used in API paths and analytics, e.g. 'steel-stack' */
  id: string

  /** Thai/English display title shown in the page header */
  title: string

  /** Single emoji icon shown next to the title */
  icon: string

  /** SAP Workcenter code, e.g. 'EE3105' */
  workcenter: string

  /**
   * Routing operation codes to sum for hours-per-unit.
   * e.g. ['0070', '0080'] → 0.50 + 4.50 = 5.00 hr/unit for Steel Stack
   */
  routingOps: string[]

  /** The workflow stage this department represents */
  workflowStage: WorkflowStatus

  /** Prefix for auto-generated station names, e.g. 'เรียงเหล็ก' */
  defaultStationName: string

  /** Fallback hours/unit when routing data has no entry for this kVA */
  defaultHrsPerUnit: number

  /** API path (after /api) for station CRUD, e.g. '/steel-stack-stations' */
  stationsPath: string

  /** API path (after /api) for plan snapshots, e.g. '/steel-stack-snapshots' */
  snapshotsPath: string

  /** Whether OT scheduling controls are shown (default true) */
  supportsOT?: boolean

  /** Whether Shift scheduling controls are shown (default true) */
  supportsShift?: boolean

  /**
   * Optional extra filter applied on top of the standard plan_date filter.
   * Example: Steel Shake excludes orders that went through drilling machines.
   */
  orderFilter?: (order: Order) => boolean
}
