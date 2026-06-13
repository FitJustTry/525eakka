/**
 * Workcenter capacity fixtures.
 *
 * `wcConfig` reuses the real DEFAULT_WC_CONFIG so pool capacity in tests matches
 * production. `simpleWc` gives round numbers when a test needs exact capacity:
 *   reg = workers × (hrs×5 + sat_hrs) × eff/100
 */

import type { WCConfig } from '../../types'
import { DEFAULT_WC_CONFIG } from '../../data/wcConfig'

export const wcConfig: Record<string, WCConfig> = DEFAULT_WC_CONFIG

/** 10 workers × (8×5+0) × 1.0 = 400h reg, 10×(2×5+0)×1.0 = 100h OT. */
export const simpleWc: Record<string, WCConfig> = {
  EE3105: { name: 'test', workers: 10, hrs: 8, ot: 2, sat_hrs: 0, sat_ot: 0, eff: 100 },
}
