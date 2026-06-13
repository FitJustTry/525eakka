import type { DeptConfig } from '../shared/types'

export const steelShakeConfig: DeptConfig = {
  id: 'steel-shake',
  title: 'เขย่าเหล็ก (Steel Shake)',
  icon: '🌀',
  workcenter: 'EE3105',
  routingOps: ['0055'],
  workflowStage: 'SHAKE',
  defaultStationName: 'เขย่าเหล็ก',
  defaultHrsPerUnit: 2.0,
  stationsPath: '/dept-stations/steel-shake',
  snapshotsPath: '/dept-plan-snapshots/steel-shake',
  supportsOT: true,
  supportsShift: true,
}
