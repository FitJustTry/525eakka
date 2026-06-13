import { describe, it, expect } from 'vitest'
import { parseReadyDate, classifyComponent, classifyOrder, materialRiskOrders } from './materialEngine'
import { makeOrder } from '../../../../test/fixtures/orders'

describe('parseReadyDate', () => {
  it('parses DD/MM/YYYY', () => { expect(parseReadyDate('15/06/2026')).toBe('2026-06-15') })
  it('parses ISO', () => { expect(parseReadyDate('2026-06-15')).toBe('2026-06-15') })
  it('converts Buddhist-era years', () => { expect(parseReadyDate('15/06/2569')).toBe('2026-06-15') })
  it('returns null for empty / dash / non-date text', () => {
    expect(parseReadyDate('')).toBeNull()
    expect(parseReadyDate('-')).toBeNull()
    expect(parseReadyDate('LS0.70')).toBeNull()
  })
})

describe('classifyComponent', () => {
  it('late when due after plan date', () => {
    expect(classifyComponent('20/06/2026', '2026-06-15')).toEqual({ status: 'late', dueDate: '2026-06-20' })
  })
  it('ready when due on/before plan date', () => {
    expect(classifyComponent('10/06/2026', '2026-06-15').status).toBe('ready')
    expect(classifyComponent('15/06/2026', '2026-06-15').status).toBe('ready')
  })
  it('info for non-date text, none for empty', () => {
    expect(classifyComponent('M-4', '2026-06-15').status).toBe('info')
    expect(classifyComponent('', '2026-06-15').status).toBe('none')
  })
})

describe('classifyOrder / materialRiskOrders', () => {
  it('flags an order whose component is due after production', () => {
    const o = makeOrder({ plan_date: '2026-06-15', due_clamp: '25/06/2026' })
    const r = classifyOrder(o)
    expect(r.atRisk).toBe(true)
    expect(r.lateComponents.map(c => c.key)).toContain('clamp')
  })
  it('not at risk when all dated components are ready', () => {
    const o = makeOrder({ plan_date: '2026-06-15', due_clamp: '01/06/2026', due_store: '02/06/2026' })
    expect(classifyOrder(o).atRisk).toBe(false)
  })
  it('materialRiskOrders excludes DONE and undated orders, sorts worst first', () => {
    const ok = makeOrder({ id: 'ok', plan_date: '2026-06-15' })
    const done = makeOrder({ id: 'done', plan_date: '2026-06-15', due_clamp: '25/06/2026', workflow_status: 'DONE' })
    const one = makeOrder({ id: 'one', plan_date: '2026-06-15', due_clamp: '25/06/2026' })
    const two = makeOrder({ id: 'two', plan_date: '2026-06-15', due_clamp: '25/06/2026', due_store: '26/06/2026' })
    const risk = materialRiskOrders([ok, done, one, two])
    expect(risk.map(r => r.order.id)).toEqual(['two', 'one']) // two has more late components
  })
})
