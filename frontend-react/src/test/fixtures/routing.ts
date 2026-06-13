/**
 * Routing fixtures (routing_cr shape). Enough rows to exercise buildDeptRates
 * (downstream core ops) and buildRoutingCrRates (cutting sheets).
 */

import type { RoutingCrRow } from '../../types'

let _id = 0
const row = (p: Partial<RoutingCrRow>): RoutingCrRow => ({
  id: ++_id,
  sheet_name: p.sheet_name ?? '',
  size_label: p.size_label ?? '',
  size_kva: p.size_kva ?? 0,
  routing_group: p.routing_group ?? 'G1',
  operation: p.operation ?? '0010',
  wc_id: p.wc_id ?? '',
  description: p.description ?? '',
  qty_per_op: p.qty_per_op ?? 1,
  unit: p.unit ?? 'UN',
  std_hrs: p.std_hrs ?? 0,
})

/** Steel-stack ops (EE3105 0070+0080) at 160 & 250 kVA. */
export const ROUTING_CR: RoutingCrRow[] = [
  // 160 kVA stack: 0070 (0.5) + 0080 (4.5) = 5.0
  row({ wc_id: 'EE3105', operation: '0070', size_kva: 160, routing_group: 'S160', std_hrs: 0.5 }),
  row({ wc_id: 'EE3105', operation: '0080', size_kva: 160, routing_group: 'S160', std_hrs: 4.5 }),
  // 250 kVA stack: 0070 (0.5) + 0080 (6.5) = 7.0
  row({ wc_id: 'EE3105', operation: '0070', size_kva: 250, routing_group: 'S250', std_hrs: 0.5 }),
  row({ wc_id: 'EE3105', operation: '0080', size_kva: 250, routing_group: 'S250', std_hrs: 6.5 }),
  // shake op 0055
  row({ wc_id: 'EE3105', operation: '0055', size_kva: 160, routing_group: 'S160', std_hrs: 2.0 }),
  // clamp EE3106 0090+0100
  row({ wc_id: 'EE3106', operation: '0090', size_kva: 160, routing_group: 'C160', std_hrs: 1.0 }),
  row({ wc_id: 'EE3106', operation: '0100', size_kva: 160, routing_group: 'C160', std_hrs: 0.5 }),
  // cutting sheets (EE3102) — normal + cast resin
  row({ wc_id: 'EE3102', operation: '0010', size_kva: 160, sheet_name: 'Core Oil Type', routing_group: 'O160', std_hrs: 2.0 }),
  row({ wc_id: 'EE3102', operation: '0020', size_kva: 160, sheet_name: 'Core Oil Type', routing_group: 'O160', std_hrs: 0.6 }),
  row({ wc_id: 'EE3102', operation: '0010', size_kva: 160, sheet_name: 'Core Dry Type Cast Resin', routing_group: 'CR160', std_hrs: 3.0 }),
]
