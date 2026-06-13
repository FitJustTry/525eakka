/**
 * Shared test fixtures — realistic transformer orders.
 *
 * itemCode(ch): builds a valid item code whose characteristic (index 8) drives
 * LV-type derivation — A/E/I = Foil, C/F/J = Wire, others = indeterminate.
 */

import type { Order } from '../../types'

/** Item code with a given LV-type characteristic at position 9 (index 8). */
export function itemCode(ch: string): string {
  return '14315002' + ch // length 9; index 8 = ch; decodes kva≈150
}

let _seq = 0
export function makeOrder(p: Partial<Order> = {}): Order {
  _seq++
  return {
    id: p.id ?? `ord-${_seq}`,
    product: p.product ?? 'tr',
    qty: p.qty ?? 1,
    deadline: p.deadline ?? '2026-12-31',
    customer: p.customer ?? 'PEA',
    kva: p.kva ?? 250,
    category: p.category ?? 'หลัก',
    sap_so: p.sap_so ?? `SO${1000 + _seq}`,
    plan_date: p.plan_date ?? null,
    comment: p.comment ?? '',
    item_code: p.item_code,
    done_qty: p.done_qty,
    done_at: p.done_at ?? null,
    priority: p.priority,
    workflow_status: p.workflow_status,
    raw_mat: p.raw_mat,
    hv: p.hv,
    lv: p.lv,
    due_clamp: p.due_clamp,
    due_box_ctrl: p.due_box_ctrl,
    due_store: p.due_store,
  }
}

/** A small mixed book used by several engine tests. */
export const SAMPLE_ORDERS: Order[] = [
  makeOrder({ id: 'a', kva: 160, qty: 2, item_code: itemCode('A'), plan_date: '2026-06-15' }), // foil
  makeOrder({ id: 'b', kva: 500, qty: 1, item_code: itemCode('C'), plan_date: '2026-06-15' }), // wire
  makeOrder({ id: 'c', kva: 50,  qty: 4, item_code: itemCode('E'), plan_date: '2026-06-22' }), // foil
  makeOrder({ id: 'd', kva: 1000, qty: 1, item_code: itemCode('F'), plan_date: '2026-06-22' }), // wire
  makeOrder({ id: 'e', kva: 315, qty: 1, item_code: itemCode('S'), plan_date: '2026-06-29' }), // unclassified
]
