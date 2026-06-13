import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { projectFlows, phaseLoadByWeek, FLOW_PHASES } from './flowEngine'
import { makeHorizonWeeks } from './forecastEngine'
import { makeOrder } from '../../../../test/fixtures/orders'

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-15T00:00:00')) })
afterAll(() => { vi.useRealTimers() })

describe('projectFlows', () => {
  it('places phases at core week + lead and projects ship at +3', () => {
    const weeks = makeHorizonWeeks(0, 8)
    const o = makeOrder({ id: 'x', plan_date: weeks[0].monStr, deadline: '2026-12-31' })
    const [row] = projectFlows([o], weeks)
    expect(row.coreWeekIndex).toBe(0)
    expect(row.phases.map(p => p.weekIndex)).toEqual(FLOW_PHASES.map(p => p.lead)) // 0,1,2
    expect(row.shipWeekIndex).toBe(3)
    expect(row.shipsLate).toBe(false)
  })

  it('flags ships-late when projected ship is past the deadline', () => {
    const weeks = makeHorizonWeeks(0, 8)
    const o = makeOrder({ id: 'late', plan_date: weeks[0].monStr, deadline: '2026-06-16' }) // ~this week, ship +3wk
    const [row] = projectFlows([o], weeks)
    expect(row.shipsLate).toBe(true)
  })

  it('skips DONE orders and orders outside the horizon', () => {
    const weeks = makeHorizonWeeks(0, 2)
    const done = makeOrder({ plan_date: weeks[0].monStr, workflow_status: 'DONE' })
    const outside = makeOrder({ plan_date: '2025-01-06' }) // long past horizon
    expect(projectFlows([done, outside], weeks)).toHaveLength(0)
  })

  it('phaseLoadByWeek counts phases landing in each week', () => {
    const weeks = makeHorizonWeeks(0, 6)
    const o = makeOrder({ plan_date: weeks[0].monStr })
    const rows = projectFlows([o], weeks)
    const load = phaseLoadByWeek(rows, weeks.length)
    // one order → one phase in weeks 0,1,2
    expect(load[0]).toBe(1)
    expect(load[1]).toBe(1)
    expect(load[2]).toBe(1)
    expect(load[3]).toBe(0)
  })

  it('phaseLoadByWeek ignores phases beyond the week count', () => {
    const weeks = makeHorizonWeeks(0, 6)
    const o = makeOrder({ plan_date: weeks[0].monStr })
    const load = phaseLoadByWeek(projectFlows([o], weeks), 2) // phases at 0,1,2 → index 2 out of range
    expect(load).toHaveLength(2)
    expect(load[0]).toBe(1)
    expect(load[1]).toBe(1)
  })
})
