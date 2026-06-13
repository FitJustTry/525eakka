import { describe, it, expect } from 'vitest'
import { recommendations } from './recommendationEngine'
import { makePool } from '../../../../test/fixtures/builders'

describe('recommendationEngine', () => {
  it('no recommendation for pools under the threshold', () => {
    const recs = recommendations([makePool('A', 100, 40, [80, 100, 90])])
    expect(recs).toHaveLength(0)
  })

  it('overloaded pool gets OT, shift and move actions', () => {
    const recs = recommendations([makePool('A', 100, 40, [80, 130, 90], { label: 'Core', icon: '✂' })])
    expect(recs).toHaveLength(1)
    const r = recs[0]
    expect(r.peakWeekIndex).toBe(1)
    expect(r.overloadHrs).toBe(30)
    const kinds = r.actions.map(a => a.kind)
    expect(kinds).toContain('ot')
    expect(kinds).toContain('shift')
    expect(kinds).toContain('move')
    // OT projection: 130 / (100+40) ≈ 0.929
    const ot = r.actions.find(a => a.kind === 'ot')!
    expect(ot.projectedUtil).toBeCloseTo(130 / 140, 5)
  })

  it('adds a capacity action only when even OT cannot clear the overload', () => {
    const tight = recommendations([makePool('A', 100, 40, [160])]) // 160 > reg+ot 140
    expect(tight[0].actions.map(a => a.kind)).toContain('capacity')
    const okWithOt = recommendations([makePool('B', 100, 40, [130])]) // 130 < 140
    expect(okWithOt[0].actions.map(a => a.kind)).not.toContain('capacity')
  })

  it('sorts worst pool first', () => {
    const recs = recommendations([
      makePool('mild', 100, 40, [120]),
      makePool('severe', 100, 40, [180]),
    ])
    expect(recs[0].poolKey).toBe('severe')
  })
})
