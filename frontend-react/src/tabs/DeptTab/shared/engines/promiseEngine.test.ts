import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { earliestShip } from './promiseEngine'
import { computeHorizon, makeHorizonWeeks, buildDeptRates } from './forecastEngine'
import { buildAllDeptRates } from '../deptRegistry'
import { wcConfig } from '../../../../test/fixtures/workcenters'
import { ROUTING_CR } from '../../../../test/fixtures/routing'
import { itemCode } from '../../../../test/fixtures/orders'

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T00:00:00')) })
afterAll(() => { vi.useRealTimers() })

describe('promiseEngine.earliestShip (ATP)', () => {
  it('with an empty book, ships in start + maxLead + 1 (lead-limited)', () => {
    const weeks = makeHorizonWeeks(0, 8)
    const deptRates = buildDeptRates(ROUTING_CR)
    const base = computeHorizon([], deptRates, wcConfig, weeks)
    const r = earliestShip(160, 1, base, deptRates, weeks, itemCode('A'))
    expect(r.feasible).toBe(true)
    expect(r.startWeekIndex).toBe(0)
    // external assembly lead 2 is the deepest stage → ship = 0 + 2 + 1
    expect(r.shipWeekIndex).toBe(3)
    expect(r.binding).not.toBeNull()
  })

  it('is deterministic (same inputs → same result)', () => {
    const weeks = makeHorizonWeeks(0, 8)
    const deptRates = buildDeptRates(ROUTING_CR)
    const base = computeHorizon([], deptRates, wcConfig, weeks)
    const a = earliestShip(250, 2, base, deptRates, weeks, itemCode('C'))
    const b = earliestShip(250, 2, base, deptRates, weeks, itemCode('C'))
    expect(a).toEqual(b)
  })

  it('reports infeasible when the horizon is shorter than the lead chain', () => {
    const weeks = makeHorizonWeeks(0, 1) // 1 week < external lead (2)
    const deptRates = buildDeptRates(ROUTING_CR)
    const base = computeHorizon([], deptRates, wcConfig, weeks)
    const r = earliestShip(160, 1, base, deptRates, weeks, itemCode('A'))
    expect(r.feasible).toBe(false)
  })

  it('infeasible (impossible quantity) still reports a binding shortfall stage', () => {
    const weeks = makeHorizonWeeks(0, 8)
    const deptRates = buildDeptRates(ROUTING_CR)
    const base = computeHorizon([], deptRates, wcConfig, weeks)
    const r = earliestShip(250, 100000, base, deptRates, weeks, itemCode('A'))
    expect(r.feasible).toBe(false)
    expect(r.binding).not.toBeNull()
    expect(r.binding!.freeHrs).toBeLessThan(r.binding!.requiredHrs)
  })

  it('every required stage has a plan with hours', () => {
    const weeks = makeHorizonWeeks(0, 8)
    const deptRates = buildDeptRates(ROUTING_CR)
    const base = computeHorizon([], deptRates, wcConfig, weeks)
    const r = earliestShip(160, 1, base, deptRates, weeks, itemCode('A'))
    expect(r.stages.length).toBeGreaterThan(0)
    expect(r.stages.every(s => s.requiredHrs > 0)).toBe(true)
  })
})
