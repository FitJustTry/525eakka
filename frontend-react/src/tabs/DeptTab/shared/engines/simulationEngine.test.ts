import { describe, it, expect } from 'vitest'
import { DEFAULT_SCENARIOS, scenarioCapacity, runScenario, runScenarios } from './simulationEngine'
import { makePool, makeWeeks } from '../../../../test/fixtures/builders'

const weeks = makeWeeks(1)
const overloaded = () => [makePool('A', 100, 40, [130])] // util 1.3 at reg

describe('scenarioCapacity', () => {
  const pool = makePool('A', 100, 40, [130])
  it('current = regular only', () => {
    expect(scenarioCapacity({ id: 'c', label: '', includeOt: false, shiftDays: 0, capacityBoostPct: 0 })(pool))
      .toEqual({ reg: 100, ot: 0 })
  })
  it('+OT folds the OT band into available capacity', () => {
    expect(scenarioCapacity({ id: 'o', label: '', includeOt: true, shiftDays: 0, capacityBoostPct: 0 })(pool).reg).toBe(140)
  })
  it('+shift adds a night-crew proxy reg×(8·days/44)', () => {
    const r = scenarioCapacity({ id: 's', label: '', includeOt: false, shiftDays: 3, capacityBoostPct: 0 })(pool).reg
    expect(r).toBeCloseTo(100 + 100 * (24 / 44), 5)
  })
  it('+capacity boost scales regular capacity', () => {
    expect(scenarioCapacity({ id: 'b', label: '', includeOt: false, shiftDays: 0, capacityBoostPct: 20 })(pool).reg).toBe(120)
  })
})

describe('runScenario metrics', () => {
  it('current scenario keeps the overload', () => {
    const r = runScenario(overloaded(), [], [], weeks, DEFAULT_SCENARIOS[0])
    expect(r.peakUtil).toBeCloseTo(1.3, 5)
    expect(r.totalOverloadHrs).toBe(30)
    expect(r.redWeeks).toBe(1)
  })
  it('+OT lowers utilisation and clears the overload', () => {
    const cur = runScenario(overloaded(), [], [], weeks, DEFAULT_SCENARIOS[0])
    const ot = runScenario(overloaded(), [], [], weeks, DEFAULT_SCENARIOS[1])
    expect(ot.peakUtil).toBeLessThan(cur.peakUtil)
    expect(ot.totalOverloadHrs).toBeLessThan(cur.totalOverloadHrs)
    expect(ot.addedCapHrs).toBeGreaterThan(0)
  })
  it('+OT+Shift is at least as good as +OT', () => {
    const ot = runScenario(overloaded(), [], [], weeks, DEFAULT_SCENARIOS[1])
    const both = runScenario(overloaded(), [], [], weeks, DEFAULT_SCENARIOS[3])
    expect(both.peakUtil).toBeLessThanOrEqual(ot.peakUtil)
  })
})

describe('runScenarios', () => {
  it('runs all default scenarios', () => {
    const results = runScenarios(overloaded(), [], [], weeks)
    expect(results).toHaveLength(DEFAULT_SCENARIOS.length)
    expect(results[0].scenario.id).toBe('current')
  })
})
