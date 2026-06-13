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
  stationsPath: '/no-load-stations',
  snapshotsPath: '/no-load-snapshots',
  supportsOT: false,
  supportsShift: false,
}
