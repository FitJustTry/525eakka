import type { DeptConfig } from '../shared/types'

export const noLoadConfig: DeptConfig = {
  id: 'no-load',
  title: 'No Load Test',
  icon: '⚡',
  workcenter: 'EE3107',
  routingOps: ['0110'],
  workflowStage: 'NOLOAD',
  defaultStationName: 'No Load',
  defaultHrsPerUnit: 0.25,
  stationsPath: '/dept-stations/no-load',
  snapshotsPath: '/dept-plan-snapshots/no-load',
  supportsOT: false,
  supportsShift: false,
}
