/**
 * materialEngine — component/material readiness gating.
 *
 * Most missed deliveries are material, not capacity: a line can be wide open
 * while the steel, coils, clamp, or tank aren't in. The master-plan import
 * already carries per-order component fields, so we classify each against the
 * order's plan_date:
 *
 *   a component whose due-date parses and falls AFTER plan_date  → 🔴 late
 *   a component whose due-date is on/before plan_date            → 🟢 ready
 *   non-empty, non-date text (e.g. a material code / note)       → ℹ info
 *   empty / "-"                                                   → — none
 *
 * Honest scope: these fields are free text entered by planners, so gating only
 * fires where a real date is present; everything else is shown, not judged.
 * Pure, page-free.
 */

import type { Order } from '../../../../types'

export interface ComponentDef { key: string; label: string; field: keyof Order }

export const COMPONENTS: ComponentDef[] = [
  { key: 'raw',   label: 'วัตถุดิบ (Raw)', field: 'raw_mat' },
  { key: 'hv',    label: 'คอยล์ HV',       field: 'hv' },
  { key: 'lv',    label: 'คอยล์ LV',       field: 'lv' },
  { key: 'clamp', label: 'แคลมป์',         field: 'due_clamp' },
  { key: 'box',   label: 'ถัง/คอนโทรล',    field: 'due_box_ctrl' },
  { key: 'store', label: 'เข้าสโตร์',      field: 'due_store' },
]

export type CompStatus = 'late' | 'ready' | 'info' | 'none'

/** Extract an ISO date from free text (DD/MM/YYYY or YYYY-MM-DD; Buddhist year → CE). */
export function parseReadyDate(raw: string): string | null {
  const s = (raw ?? '').trim()
  if (!s || s === '-') return null
  let y = 0, mo = 0, d = 0
  let m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3] }
  else { m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) { y = +m[1]; mo = +m[2]; d = +m[3] } }
  if (!y) return null
  if (y > 2500) y -= 543 // Buddhist Era → CE
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export interface CompResult { def: ComponentDef; raw: string; status: CompStatus; dueDate: string | null }

export function classifyComponent(raw: string, planDate: string | null): { status: CompStatus; dueDate: string | null } {
  const v = (raw ?? '').trim()
  if (!v || v === '-') return { status: 'none', dueDate: null }
  const date = parseReadyDate(v)
  if (date) {
    if (planDate && date > planDate) return { status: 'late', dueDate: date }
    return { status: 'ready', dueDate: date }
  }
  return { status: 'info', dueDate: null }
}

export interface OrderReadiness {
  order: Order
  components: CompResult[]
  lateComponents: ComponentDef[]
  atRisk: boolean
}

export function classifyOrder(order: Order): OrderReadiness {
  const components: CompResult[] = COMPONENTS.map(def => {
    const raw = String((order[def.field] as string | undefined) ?? '')
    const { status, dueDate } = classifyComponent(raw, order.plan_date)
    return { def, raw, status, dueDate }
  })
  const lateComponents = components.filter(c => c.status === 'late').map(c => c.def)
  return { order, components, lateComponents, atRisk: lateComponents.length > 0 }
}

/** Active orders whose components aren't ready in time, worst (most-late) first. */
export function materialRiskOrders(orders: Order[]): OrderReadiness[] {
  return orders
    .filter(o => o.workflow_status !== 'DONE' && o.plan_date)
    .map(classifyOrder)
    .filter(r => r.atRisk)
    .sort((a, b) => b.lateComponents.length - a.lateComponents.length || (a.order.deadline ?? '').localeCompare(b.order.deadline ?? ''))
}
