/**
 * Closed-week snapshot fixtures for the calibration engine.
 * completion_rate is a percentage (0–100) of the plan that was actually finished.
 */

import type { SnapSample } from '../../tabs/DeptTab/shared/engines/calibrationEngine'

export const SNAPSHOTS: SnapSample[] = [
  // steel-stack consistently ~85% attainment
  { dept_id: 'steel-stack', week_start: '2026-05-04', result_summary: { completion_rate: 80 } },
  { dept_id: 'steel-stack', week_start: '2026-05-11', result_summary: { completion_rate: 90 } },
  { dept_id: 'steel-stack', week_start: '2026-05-18', result_summary: { completion_rate: 85 } },
  // cutting ~100%
  { dept_id: 'cutting', week_start: '2026-05-11', result_summary: { completion_rate: 100 } },
  { dept_id: 'cutting', week_start: '2026-05-18', result_summary: { completion_rate: 98 } },
  // a row with no summary (must be ignored)
  { dept_id: 'clamp-assembly', week_start: '2026-05-18', result_summary: null },
]
