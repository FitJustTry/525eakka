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
  stationsPath: '/steel-shake-stations',
  snapshotsPath: '/steel-shake-snapshots',
  supportsOT: true,
  supportsShift: true,
}
