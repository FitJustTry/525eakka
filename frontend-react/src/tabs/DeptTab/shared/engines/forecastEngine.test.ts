import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { makeHorizonWeeks, buildDeptRates, computeHorizon, rescaleHorizon, poolWeekOrders } from './forecastEngine'
import { buildAllDeptRates } from '../deptRegistry'
import { makeOrder, itemCode } from '../../../../test/fixtures/orders'
import { wcConfig } from '../../../../test/fixtures/workcenters'
import { ROUTING_CR } from '../../../../test/fixtures/routing'

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T00:00:00')) })
afterAll(() => { vi.useRealTimers() })

describe('makeHorizonWeeks', () => {
  it('builds N consecutive weeks with correct offsets', () => {
    const w = makeHorizonWeeks(0, 4)
    expect(w).toHaveLength(4)
    expect(w.map(x => x.offset)).toEqual([0, 1, 2, 3])
    expect(w[0].monStr <= w[0].satStr).toBe(true)
    expect(w[1].monStr > w[0].satStr).toBe(true) // strictly later week
  })
  it('honours a start offset', () => {
    expect(makeHorizonWeeks(2, 3).map(x => x.offset)).toEqual([2, 3, 4])
  })
})

describe('computeHorizon — demand placement & utilisation', () => {
  it('places core demand in the order plan-week and assembly one week later (lead-time)', () => {
    const weeks = makeHorizonWeeks(0, 5)
    const deptRates = buildDeptRates(ROUTING_CR)
    const order = makeOrder({ kva: 160, qty: 2, item_code: itemCode('A'), plan_date: weeks[0].monStr })
    const pools = computeHorizon([order], deptRates, wcConfig, weeks)

    const cutting = pools.find(p => p.key.includes('EE3102'))!
    const internal = pools.find(p => p.depts.some(d => d.id === 'internal-assembly'))!

    // core (lead 0): load in display week 0, none in week 1
    expect(cutting.weeks[0].demand).toBeGreaterThan(0)
    // internal assembly (lead 1): nothing in week 0, load in week 1
    expect(internal.weeks[0].demand).toBe(0)
    expect(internal.weeks[1].demand).toBeGreaterThan(0)
  })

  it('utilisation = demand / regCap and capacity comes from wcConfig', () => {
    const weeks = makeHorizonWeeks(0, 2)
    const deptRates = buildDeptRates(ROUTING_CR)
    const order = makeOrder({ kva: 160, qty: 1, item_code: itemCode('A'), plan_date: weeks[0].monStr })
    const pools = computeHorizon([order], deptRates, wcConfig, weeks)
    for (const p of pools) for (const w of p.weeks) {
      if (w.regCap > 0) expect(w.util).toBeCloseTo(w.demand / w.regCap, 6)
    }
  })

  it('an empty order book yields zero demand everywhere', () => {
    const weeks = makeHorizonWeeks(0, 3)
    const pools = computeHorizon([], buildDeptRates([]), wcConfig, weeks)
    expect(pools.every(p => p.weeks.every(w => w.demand === 0))).toBe(true)
  })
})

describe('rescaleHorizon', () => {
  it('doubling capacity halves utilisation, reusing demand', () => {
    const weeks = makeHorizonWeeks(0, 2)
    const deptRates = buildDeptRates(ROUTING_CR)
    const order = makeOrder({ kva: 160, qty: 5, item_code: itemCode('A'), plan_date: weeks[0].monStr })
    const base = computeHorizon([order], deptRates, wcConfig, weeks)
    const scaled = rescaleHorizon(base, p => ({ reg: p.cap.reg * 2, ot: p.cap.ot * 2 }))
    base.forEach((p, i) => p.weeks.forEach((w, wi) => {
      expect(scaled[i].weeks[wi].demand).toBe(w.demand)           // demand unchanged
      if (w.regCap > 0) expect(scaled[i].weeks[wi].util).toBeCloseTo(w.util / 2, 6)
    }))
  })
})

describe('poolWeekOrders', () => {
  it('returns the orders contributing to a pool-week', () => {
    const weeks = makeHorizonWeeks(0, 3)
    const deptRates = buildDeptRates(ROUTING_CR)
    const order = makeOrder({ id: 'X', kva: 160, qty: 1, item_code: itemCode('A'), plan_date: weeks[0].monStr })
    const pools = computeHorizon([order], deptRates, wcConfig, weeks)
    const cutting = pools.find(p => p.key.includes('EE3102'))!
    const contribs = poolWeekOrders([order], deptRates, cutting, weeks[0])
    expect(contribs.map(c => c.order.id)).toContain('X')
    expect(contribs[0].hrs).toBeGreaterThan(0)
  })
})

describe('computeHorizon capacityFn override & rescale edges', () => {
  it('capacityFn overrides pool capacity', () => {
    const weeks = makeHorizonWeeks(0, 1)
    const dr = buildDeptRates(ROUTING_CR)
    const o = makeOrder({ kva: 160, qty: 1, item_code: itemCode('A'), plan_date: weeks[0].monStr })
    const pools = computeHorizon([o], dr, wcConfig, weeks, () => ({ reg: 1, ot: 0 }))
    expect(pools.every(p => p.cap.reg === 1)).toBe(true)
  })
  it('rescale to zero capacity yields util 0', () => {
    const weeks = makeHorizonWeeks(0, 1)
    const dr = buildDeptRates(ROUTING_CR)
    const o = makeOrder({ kva: 160, qty: 1, item_code: itemCode('A'), plan_date: weeks[0].monStr })
    const base = computeHorizon([o], dr, wcConfig, weeks)
    const z = rescaleHorizon(base, () => ({ reg: 0, ot: 0 }))
    expect(z.every(p => p.weeks.every(w => w.util === 0))).toBe(true)
  })
})
