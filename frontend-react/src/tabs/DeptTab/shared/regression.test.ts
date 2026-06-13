/**
 * Regression guards for business rules that must NOT change accidentally.
 * If one of these fails, a shared calculation was altered — review intentionally.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { deriveLvType } from './lvType'
import { riskLevel } from './engines/riskEngine'
import { earliestShip } from './engines/promiseEngine'
import { computeHorizon, makeHorizonWeeks, buildDeptRates } from './engines/forecastEngine'
import { buildAllDeptRates } from './deptRegistry'
import { wcConfig } from '../../../test/fixtures/workcenters'
import { ROUTING_CR } from '../../../test/fixtures/routing'
import { makeOrder, itemCode } from '../../../test/fixtures/orders'

describe('REGRESSION: Foil/Wire classification', () => {
  it('Foil = A,E,I  ·  Wire = C,F,J', () => {
    expect(['A', 'E', 'I'].map(c => deriveLvType(itemCode(c)))).toEqual(['foil', 'foil', 'foil'])
    expect(['C', 'F', 'J'].map(c => deriveLvType(itemCode(c)))).toEqual(['wire', 'wire', 'wire'])
  })
})

describe('REGRESSION: Risk thresholds (90 / 110 / 130)', () => {
  it('boundaries are locked', () => {
    expect(riskLevel(0.899)).toBe('green')
    expect(riskLevel(0.90)).toBe('yellow')
    expect(riskLevel(1.10)).toBe('yellow')
    expect(riskLevel(1.1001)).toBe('red')
    expect(riskLevel(1.30)).toBe('red')
    expect(riskLevel(1.3001)).toBe('critical')
  })
})

describe('REGRESSION: lead-time demand placement', () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T00:00:00')) })
  afterAll(() => { vi.useRealTimers() })

  it('external assembly demand for a week-0 order appears in display week 2', () => {
    const weeks = makeHorizonWeeks(0, 5)
    const order = makeOrder({ kva: 250, qty: 1, item_code: itemCode('A'), plan_date: weeks[0].monStr })
    const pools = computeHorizon([order], buildDeptRates(ROUTING_CR), wcConfig, weeks)
    const external = pools.find(p => p.depts.some(d => d.id === 'external-assembly'))!
    expect(external.weeks[0].demand).toBe(0)
    expect(external.weeks[1].demand).toBe(0)
    expect(external.weeks[2].demand).toBeGreaterThan(0) // lead 2
  })
})

describe('REGRESSION: ATP is deterministic', () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T00:00:00')) })
  afterAll(() => { vi.useRealTimers() })

  it('same inputs always yield the same promise', () => {
    const weeks = makeHorizonWeeks(0, 8)
    const dr = buildAllDeptRates(ROUTING_CR)
    const base = computeHorizon([], dr, wcConfig, weeks)
    const run = () => earliestShip(160, 2, base, dr, weeks, itemCode('A'))
    expect(run()).toEqual(run())
  })
})
