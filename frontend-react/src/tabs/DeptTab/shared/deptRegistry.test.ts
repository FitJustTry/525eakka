import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import {
  lookupHrs, stageIdx, orderCountsForDept, deptWindow, weekDemandByDept,
  ordersForDepts, buildAllDeptRates, getCapacityPools, DEPT_REGISTRY,
} from './deptRegistry'
import { getWeekRange, fmtISO } from '../cutting/scheduling/utils'
import { makeHorizonWeeks } from './engines/forecastEngine'
import { makeOrder, itemCode } from '../../../test/fixtures/orders'
import { wcConfig } from '../../../test/fixtures/workcenters'

const dept = (id: string) => DEPT_REGISTRY.find(d => d.id === id)!

describe('lookupHrs', () => {
  const rates = [{ kva: 100, hrs: 2 }, { kva: 250, hrs: 5 }]
  it('exact match', () => expect(lookupHrs(rates, 250, 9)).toBe(5))
  it('nearest when no exact', () => expect(lookupHrs(rates, 120, 9)).toBe(2))
  it('fallback when empty', () => expect(lookupHrs([], 250, 9)).toBe(9))
})

describe('stageIdx / orderCountsForDept', () => {
  it('stage order CUTTING < STACK < DONE', () => {
    expect(stageIdx('CUTTING')).toBeLessThan(stageIdx('STACK'))
    expect(stageIdx('STACK')).toBeLessThan(stageIdx('DONE'))
  })
  it('pipeline dept ignores orders already past its stage', () => {
    const cutting = dept('cutting')
    expect(orderCountsForDept(makeOrder({ workflow_status: 'CUTTING' }), cutting)).toBe(true)
    expect(orderCountsForDept(makeOrder({ workflow_status: 'STACK' }), cutting)).toBe(false)
  })
  it('untracked (assembly) dept counts every non-DONE order', () => {
    const asm = dept('internal-assembly')
    expect(orderCountsForDept(makeOrder({ workflow_status: 'STACK' }), asm)).toBe(true)
    expect(orderCountsForDept(makeOrder({ workflow_status: 'DONE' }), asm)).toBe(false)
  })
})

describe('deptWindow (lead-time shift)', () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T00:00:00')) })
  afterAll(() => { vi.useRealTimers() })

  it('core dept (lead 0) uses the display week itself', () => {
    const w0 = getWeekRange(0)
    expect(deptWindow(0, dept('cutting'))).toEqual({ monStr: fmtISO(w0.mon), satStr: fmtISO(w0.sat) })
  })
  it('internal assembly (lead 1) at display week 1 reads plan-week 0', () => {
    const planWeek0 = getWeekRange(0)
    expect(deptWindow(1, dept('internal-assembly'))).toEqual({ monStr: fmtISO(planWeek0.mon), satStr: fmtISO(planWeek0.sat) })
  })
})

describe('weekDemandByDept / ordersForDepts', () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T00:00:00')) })
  afterAll(() => { vi.useRealTimers() })

  it('foil order counts toward coil-foil, not coil-wire', () => {
    const weeks = makeHorizonWeeks(0, 1)
    const deptRates = buildAllDeptRates([])
    const foil = makeOrder({ kva: 160, qty: 1, item_code: itemCode('A'), plan_date: weeks[0].monStr })
    const demand = weekDemandByDept([foil], deptRates, 0)
    expect(demand.get('coil-foil')! > 0).toBe(true)
    expect(demand.get('coil-wire')).toBe(0)
  })

  it('wire order counts toward coil-wire, not coil-foil', () => {
    const weeks = makeHorizonWeeks(0, 1)
    const deptRates = buildAllDeptRates([])
    const wire = makeOrder({ kva: 250, qty: 1, item_code: itemCode('C'), plan_date: weeks[0].monStr })
    const demand = weekDemandByDept([wire], deptRates, 0)
    expect(demand.get('coil-wire')! > 0).toBe(true)
    expect(demand.get('coil-foil')).toBe(0)
  })

  it('skips orders with no plan_date, outside the window, or already DONE', () => {
    const weeks = makeHorizonWeeks(0, 1)
    const dr = buildAllDeptRates([])
    const noPlan = makeOrder({ kva: 160, item_code: itemCode('A'), plan_date: null })
    const outside = makeOrder({ kva: 160, item_code: itemCode('A'), plan_date: '2025-01-06' })
    const done = makeOrder({ kva: 160, item_code: itemCode('A'), plan_date: weeks[0].monStr, workflow_status: 'DONE' })
    const demand = weekDemandByDept([noPlan, outside, done], dr, 0)
    expect(demand.get('cutting')).toBe(0) // all three excluded
  })

  it('ordersForDepts returns contributing orders sorted by hours desc', () => {
    const weeks = makeHorizonWeeks(0, 1)
    const deptRates = buildAllDeptRates([])
    const small = makeOrder({ id: 'small', kva: 50, qty: 1, item_code: itemCode('A'), plan_date: weeks[0].monStr })
    const big = makeOrder({ id: 'big', kva: 1000, qty: 5, item_code: itemCode('A'), plan_date: weeks[0].monStr })
    const internal = [dept('internal-assembly')]
    const list = ordersForDepts([small, big], deptRates, internal, 1) // lead 1 → week-0 orders at offset 1
    expect(list[0].order.id).toBe('big')
    expect(list[0].hrs).toBeGreaterThanOrEqual(list[1].hrs)
  })
})

describe('buildAllDeptRates / getCapacityPools', () => {
  it('produces a rate set per registry dept; coil/assembly have SAP rates', () => {
    const dr = buildAllDeptRates([])
    expect(dr).toHaveLength(DEPT_REGISTRY.length)
    expect(dr.find(d => d.dept.id === 'coil-hv')!.rates.length).toBeGreaterThan(0)
    expect(dr.find(d => d.dept.id === 'internal-assembly')!.rates.length).toBeGreaterThan(0)
  })
  it('groups departments into workcenter capacity pools', () => {
    const pools = getCapacityPools(wcConfig)
    // EE3105 pool serves both shake + stack
    const shared = pools.find(p => p.wcs.join('+') === 'EE3105')
    expect(shared?.depts.map(d => d.id).sort()).toEqual(['steel-shake', 'steel-stack'])
    expect(pools.every(p => p.cap.reg >= 0)).toBe(true)
  })
})
