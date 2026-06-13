import { describe, it, expect } from 'vitest'
import {
  riskLevel, cellRisk, summarize, worstBottleneck, bottleneckForWeek, RISK_META, carryRiskOrders,
} from './riskEngine'
import { makePool, makeWeeks } from '../../../../test/fixtures/builders'
import { buildAllDeptRates, getCapacityPools } from '../deptRegistry'
import { computeHorizon, makeHorizonWeeks } from './forecastEngine'
import { makeOrder, itemCode } from '../../../../test/fixtures/orders'
import { wcConfig } from '../../../../test/fixtures/workcenters'
import { vi, beforeAll, afterAll } from 'vitest'

describe('riskLevel thresholds (must never drift)', () => {
  it('green below 90%', () => {
    expect(riskLevel(0)).toBe('green')
    expect(riskLevel(0.5)).toBe('green')
    expect(riskLevel(0.8999)).toBe('green')
  })
  it('yellow 90–110% inclusive', () => {
    expect(riskLevel(0.90)).toBe('yellow')
    expect(riskLevel(1.0)).toBe('yellow')
    expect(riskLevel(1.10)).toBe('yellow')
  })
  it('red just above 110% up to 130%', () => {
    expect(riskLevel(1.1001)).toBe('red')
    expect(riskLevel(1.25)).toBe('red')
    expect(riskLevel(1.30)).toBe('red')
  })
  it('critical above 130%', () => {
    expect(riskLevel(1.3001)).toBe('critical')
    expect(riskLevel(2)).toBe('critical')
  })
  it('every level has display metadata', () => {
    for (const l of ['green', 'yellow', 'red', 'critical'] as const) {
      expect(RISK_META[l].color).toBeTruthy()
      expect(RISK_META[l].dot).toBeTruthy()
    }
  })
})

describe('cellRisk', () => {
  it('computes util, level and overload hours', () => {
    expect(cellRisk(120, 100)).toEqual({ util: 1.2, level: 'red', overloadHrs: 20 })
    expect(cellRisk(80, 100)).toEqual({ util: 0.8, level: 'green', overloadHrs: 0 })
  })
  it('no capacity → util 0', () => {
    expect(cellRisk(50, 0).util).toBe(0)
  })
})

describe('summarize / bottleneck', () => {
  const pools = [
    makePool('A', 100, 40, [80, 120, 90]),   // wk1 red
    makePool('B', 100, 40, [50, 200, 60]),    // wk1 critical (2.0)
    makePool('C', 0, 0, [0, 0, 0]),           // no capacity → ignored
  ]
  it('counts red and critical pool-weeks and total overload', () => {
    const s = summarize(pools)
    expect(s.redWeeks).toBe(1)        // A wk1
    expect(s.criticalWeeks).toBe(1)   // B wk1
    expect(s.totalOverloadHrs).toBe(20 + 100) // A:120-100, B:200-100
  })
  it('worst bottleneck is the highest utilisation cell', () => {
    expect(worstBottleneck(pools)?.poolKey).toBe('B')
    expect(worstBottleneck(pools)?.weekIndex).toBe(1)
  })
  it('per-week bottleneck picks worst pool in that week', () => {
    expect(bottleneckForWeek(pools, 1)?.poolKey).toBe('B')
    expect(bottleneckForWeek(pools, 0)?.poolKey).toBe('A') // 0.8 vs 0.5
  })
  it('returns null when no pools have capacity', () => {
    expect(worstBottleneck([makePool('Z', 0, 0, [10])])).toBeNull()
  })
})

describe('carryRiskOrders (integration, real depts)', () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T00:00:00')) })
  afterAll(() => { vi.useRealTimers() })

  it('flags orders beyond capacity in an overloaded week', () => {
    const weeks = makeHorizonWeeks(0, 4)
    const deptRates = buildAllDeptRates([])
    // many large orders in week 0 to overload a downstream pool
    const orders = Array.from({ length: 40 }, (_, i) =>
      makeOrder({ id: `o${i}`, kva: 1000, qty: 3, item_code: itemCode('A'), plan_date: weeks[0].monStr }))
    const base = computeHorizon(orders, deptRates, wcConfig, weeks)
    const atRisk = carryRiskOrders(orders, deptRates, base, weeks, 'reg')
    expect(atRisk.size).toBeGreaterThan(0)
  })

  it('no carry risk when capacity is ample', () => {
    const weeks = makeHorizonWeeks(0, 4)
    const deptRates = buildAllDeptRates([])
    const orders = [makeOrder({ kva: 50, qty: 1, item_code: itemCode('A'), plan_date: weeks[0].monStr })]
    const base = computeHorizon(orders, deptRates, wcConfig, weeks)
    expect(carryRiskOrders(orders, deptRates, base, weeks, 'reg').size).toBe(0)
  })

  it('getCapacityPools yields real capacity for configured WCs', () => {
    const pools = getCapacityPools(wcConfig)
    expect(pools.length).toBeGreaterThan(0)
    expect(pools.some(p => p.cap.reg > 0)).toBe(true)
  })
})
