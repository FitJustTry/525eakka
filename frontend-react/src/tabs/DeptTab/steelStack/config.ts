import type { DeptConfig } from '../shared/types'

export const steelStackConfig: DeptConfig = {
  id: 'steel-stack',
  title: 'เรียงเหล็ก (Steel Stack)',
  icon: '🔩',
  workcenter: 'EE3105',
  routingOps: ['0070', '0080'],
  workflowStage: 'STACK',
  defaultStationName: 'เรียงเหล็ก',
  defaultHrsPerUnit: 5.0,
  stationsPath: '/dept-stations/steel-stack',
  snapshotsPath: '/dept-plan-snapshots/steel-stack',
  supportsOT: true,
  supportsShift: true,
}
