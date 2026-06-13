import type { DeptConfig } from '../shared/types'

export const clampAssemblyConfig: DeptConfig = {
  id: 'clamp-assembly',
  title: 'ประกบแคลมป์ (Clamp Assembly)',
  icon: '🔨',
  workcenter: 'EE3106',
  routingOps: ['0090', '0100'],
  workflowStage: 'CLAMP',
  defaultStationName: 'แคลมป์',
  defaultHrsPerUnit: 1.5,
  stationsPath: '/dept-stations/clamp-assembly',
  snapshotsPath: '/dept-plan-snapshots/clamp-assembly',
  supportsOT: true,
  supportsShift: true,
}
