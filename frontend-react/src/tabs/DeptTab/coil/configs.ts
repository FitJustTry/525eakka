/**
 * Coil winding line configs — three parallel lines per the CAP 2025 model.
 *
 * Hours come from sap_routing (buildSapDeptRates), matching the Factory Forecast.
 * These are NOT workflow-tracked (workflowStage: null) — coil winding runs in
 * parallel with the core line — so the scheduler shows the full plan-week order
 * pool, hides the stage filter / Close-Week handoff, but keeps every other
 * feature (views, capacity, OT/Shift, utilisation, carry-over, plan snapshots).
 *
 * Default station counts come from the CAP file (machines per line); the planner
 * can adjust them under ⚙ สถานี. WC capacity (hrs/day, OT, eff) is read from
 * wcConfig via each station's wc_id.
 *
 * NOTE (LV-type data gap): an order's LV coil is either foil OR wire, but orders
 * carry no lv_type field yet, so the Foil and Wire schedulers both run over the
 * full order pool. Forecast handles this statistically (84/16 weighting); true
 * per-order LV splitting needs an lv_type field (Phase 2).
 */

import type { DeptConfig } from '../shared/types'

export const coilHvConfig: DeptConfig = {
  id: 'coil-hv',
  title: 'พันคอยล์ HV (แรงสูง)',
  icon: '🌀',
  workcenter: 'EE3201',
  rateSource: 'sap_routing',
  sapWorkcenters: ['EE3201'],
  routingOps: [],
  workflowStage: null,
  defaultStationName: 'HV Winding',
  defaultStationCount: 20,
  defaultHrsPerUnit: 4.0,
  stationsPath: '/dept-stations/coil-hv',
  snapshotsPath: '/dept-plan-snapshots/coil-hv',
  supportsOT: true,
  supportsShift: true,
}

export const coilFoilConfig: DeptConfig = {
  id: 'coil-foil',
  title: 'พันคอยล์ LV-Foil',
  icon: '🎞',
  workcenter: 'EE3203',
  rateSource: 'sap_routing',
  sapWorkcenters: ['EE3203'],
  routingOps: [],
  workflowStage: null,
  defaultStationName: 'Foil',
  defaultStationCount: 5,
  defaultHrsPerUnit: 1.5,
  stationsPath: '/dept-stations/coil-foil',
  snapshotsPath: '/dept-plan-snapshots/coil-foil',
  supportsOT: true,
  supportsShift: true,
}

export const coilWireConfig: DeptConfig = {
  id: 'coil-wire',
  title: 'พันคอยล์ LV-Wire (ลวด)',
  icon: '🧵',
  workcenter: 'EE3202',
  rateSource: 'sap_routing',
  sapWorkcenters: ['EE3202'],
  routingOps: [],
  workflowStage: null,
  defaultStationName: 'Wire',
  defaultStationCount: 6,
  defaultHrsPerUnit: 3.0,
  stationsPath: '/dept-stations/coil-wire',
  snapshotsPath: '/dept-plan-snapshots/coil-wire',
  supportsOT: true,
  supportsShift: true,
}

export const COIL_LINES: { key: string; label: string; icon: string; color: string; deptId: string; config: DeptConfig }[] = [
  { key: 'hv',   label: 'HV (แรงสูง)', icon: '🌀', color: '#f5c2e7', deptId: 'coil-hv',   config: coilHvConfig },
  { key: 'foil', label: 'LV-Foil',     icon: '🎞', color: '#f2cdcd', deptId: 'coil-foil', config: coilFoilConfig },
  { key: 'wire', label: 'LV-Wire',     icon: '🧵', color: '#eba0ac', deptId: 'coil-wire', config: coilWireConfig },
]
