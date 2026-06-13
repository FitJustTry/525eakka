/**
 * calibrationEngine — closes the plan→actual loop.
 *
 * Standard hours and the wcConfig efficiency are static guesses. Every time a
 * week is closed, its snapshot records how much of the plan was actually
 * completed (result_summary.completion_rate). This engine turns that history
 * into a per-department "plan-attainment factor" — if a line consistently
 * finishes only 85% of its planned load, its realistic capacity is ~85% of
 * nominal. The risk forecast can then scale capacity by that factor so its
 * numbers track reality instead of the spec sheet.
 *
 * Honest framing: the available signal is plan attainment (did we complete what
 * we planned), not a labour-hour audit. It's the right learning signal from the
 * data we actually capture, and it degrades gracefully (factor 1 with no
 * history). Pure functions, no React.
 */

export interface SnapSample {
  dept_id: string
  week_start: string
  result_summary?: { completion_rate?: number } | null
}

export interface DeptCalibration {
  factor: number      // clamped realised attainment (0.5–1.10)
  samples: number
  lastRate: number | null  // most recent completion_rate %
}

export interface Calibration {
  byDept: Map<string, DeptCalibration>
  /** Factory-wide mean plan-attainment % across samples, or null if none. */
  attainment: number | null
  totalSamples: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * @param samples completed-snapshot rows ({dept_id, week_start, result_summary})
 * @param lookback keep only the most recent N samples per department
 */
export function computeCalibration(samples: SnapSample[], lookback = 8): Calibration {
  const byDeptRates = new Map<string, number[]>()
  let sum = 0, n = 0

  // newest first
  const sorted = samples
    .filter(s => s.result_summary && typeof s.result_summary.completion_rate === 'number')
    .sort((a, b) => (b.week_start ?? '').localeCompare(a.week_start ?? ''))

  for (const s of sorted) {
    const rate = s.result_summary!.completion_rate as number
    const arr = byDeptRates.get(s.dept_id) ?? []
    if (arr.length >= lookback) continue
    arr.push(rate)
    byDeptRates.set(s.dept_id, arr)
    sum += rate; n++
  }

  const byDept = new Map<string, DeptCalibration>()
  for (const [deptId, rates] of byDeptRates) {
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length
    byDept.set(deptId, {
      factor: clamp(avg / 100, 0.5, 1.10),
      samples: rates.length,
      lastRate: rates[0] ?? null,
    })
  }

  return { byDept, attainment: n ? sum / n : null, totalSamples: n }
}

/** Capacity multiplier for a pool = mean of its departments' factors (1 if none). */
export function poolFactor(cal: Calibration, deptIds: string[]): number {
  const fs = deptIds.map(id => cal.byDept.get(id)?.factor).filter((f): f is number => f != null)
  if (!fs.length) return 1
  return fs.reduce((a, b) => a + b, 0) / fs.length
}
