import { describe, it, expect } from 'vitest'
import { computeKpis } from './kpiEngine'
import { makeOrder } from '../../../../test/fixtures/orders'

const today = '2026-06-01'

describe('computeKpis', () => {
  it('OTD = on-time completions / total completions', () => {
    const orders = [
      makeOrder({ id: '1', done_at: '2026-05-10T08:00:00Z', deadline: '2026-05-12' }), // on time
      makeOrder({ id: '2', done_at: '2026-05-20T08:00:00Z', deadline: '2026-05-15' }), // 5 days late
      makeOrder({ id: '3', done_at: '2026-05-14T08:00:00Z', deadline: '2026-05-14' }), // exactly on time
    ]
    const k = computeKpis(orders, today)
    expect(k.totalCompleted).toBe(3)
    expect(k.otdOverall).toBeCloseTo(2 / 3, 5)
    expect(k.avgLatenessDays).toBeCloseTo(5, 5) // only order 2 is late
  })

  it('counts open overdue (active, past deadline, not done)', () => {
    const orders = [
      makeOrder({ id: 'a', deadline: '2026-05-01', workflow_status: 'CLAMP' }), // overdue, not done
      makeOrder({ id: 'b', deadline: '2026-07-01', workflow_status: 'CLAMP' }), // future
      makeOrder({ id: 'c', deadline: '2026-05-01', done_at: '2026-04-30T00:00:00Z' }), // done → not counted
    ]
    expect(computeKpis(orders, today).openOverdue).toBe(1)
  })

  it('aggregates throughput (units + kVA) from completions', () => {
    const orders = [
      makeOrder({ done_at: '2026-05-10T00:00:00Z', deadline: '2026-05-20', qty: 3, kva: 100 }),
      makeOrder({ done_at: '2026-05-11T00:00:00Z', deadline: '2026-05-20', qty: 2, kva: 250 }),
    ]
    const k = computeKpis(orders, today)
    expect(k.throughputUnits).toBe(5)
    expect(k.throughputKva).toBe(3 * 100 + 2 * 250)
  })

  it('builds an ascending monthly trend with per-month OTD', () => {
    const orders = [
      makeOrder({ done_at: '2026-04-10T00:00:00Z', deadline: '2026-04-09' }), // Apr late
      makeOrder({ done_at: '2026-05-10T00:00:00Z', deadline: '2026-05-20' }), // May on-time
    ]
    const k = computeKpis(orders, today)
    expect(k.months.map(m => m.month)).toEqual(['2026-04', '2026-05'])
    expect(k.months[0].otd).toBe(0)
    expect(k.months[1].otd).toBe(1)
  })

  it('orders without a deadline count as on-time', () => {
    const k = computeKpis([makeOrder({ done_at: '2026-05-10T00:00:00Z', deadline: '' })], today)
    expect(k.otdOverall).toBe(1)
  })

  it('completions older than the lookback are in totals but not the monthly trend', () => {
    const k = computeKpis([makeOrder({ done_at: '2025-01-10T00:00:00Z', deadline: '2025-01-20' })], today, 6)
    expect(k.totalCompleted).toBe(1)
    expect(k.months).toHaveLength(0)
  })

  it('no completions → null OTD, empty trend', () => {
    const k = computeKpis([makeOrder({ workflow_status: 'CUTTING' })], today)
    expect(k.otdOverall).toBeNull()
    expect(k.months).toHaveLength(0)
  })
})
