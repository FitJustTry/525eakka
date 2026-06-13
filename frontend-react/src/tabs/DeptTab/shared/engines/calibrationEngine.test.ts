import { describe, it, expect } from 'vitest'
import { computeCalibration, poolFactor } from './calibrationEngine'
import { SNAPSHOTS } from '../../../../test/fixtures/snapshots'

describe('computeCalibration', () => {
  const cal = computeCalibration(SNAPSHOTS)

  it('averages completion rate per department into a factor', () => {
    expect(cal.byDept.get('steel-stack')!.factor).toBeCloseTo(0.85, 5) // (80+90+85)/3 /100
    expect(cal.byDept.get('steel-stack')!.samples).toBe(3)
    expect(cal.byDept.get('cutting')!.factor).toBeCloseTo(0.99, 5)
  })

  it('ignores rows without a completion_rate', () => {
    expect(cal.byDept.has('clamp-assembly')).toBe(false)
  })

  it('reports factory attainment and sample count', () => {
    expect(cal.totalSamples).toBe(5)
    expect(cal.attainment).toBeCloseTo((80 + 90 + 85 + 100 + 98) / 5, 5)
  })

  it('clamps the factor to [0.5, 1.10]', () => {
    const c = computeCalibration([
      { dept_id: 'x', week_start: '2026-05-01', result_summary: { completion_rate: 200 } },
      { dept_id: 'y', week_start: '2026-05-01', result_summary: { completion_rate: 10 } },
    ])
    expect(c.byDept.get('x')!.factor).toBe(1.10)
    expect(c.byDept.get('y')!.factor).toBe(0.5)
  })

  it('respects the lookback window (most recent N)', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      dept_id: 'd', week_start: `2026-0${1 + Math.floor(i / 4)}-${String((i % 4) + 1).padStart(2, '0')}`,
      result_summary: { completion_rate: 50 },
    }))
    expect(computeCalibration(many, 8).byDept.get('d')!.samples).toBe(8)
  })

  it('empty history → null attainment, no factors', () => {
    const c = computeCalibration([])
    expect(c.attainment).toBeNull()
    expect(c.totalSamples).toBe(0)
  })
})

describe('poolFactor', () => {
  const cal = computeCalibration(SNAPSHOTS)
  it('averages member-department factors', () => {
    expect(poolFactor(cal, ['steel-stack'])).toBeCloseTo(0.85, 5)
  })
  it('defaults to 1 when no department has history', () => {
    expect(poolFactor(cal, ['unknown-dept'])).toBe(1)
  })
})
