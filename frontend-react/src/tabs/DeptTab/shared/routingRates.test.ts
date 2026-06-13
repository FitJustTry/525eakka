import { describe, it, expect } from 'vitest'
import { buildDeptRates } from './routingRates'
import { ROUTING_CR } from '../../../test/fixtures/routing'

describe('buildDeptRates', () => {
  it('sums operation std_hrs per kVA for a workcenter', () => {
    const rates = buildDeptRates(ROUTING_CR, ['0070', '0080'], 'EE3105')
    const r160 = rates.find(r => r.kva === 160)!
    const r250 = rates.find(r => r.kva === 250)!
    expect(r160.hrs).toBeCloseTo(5.0, 5)  // 0.5 + 4.5
    expect(r250.hrs).toBeCloseTo(7.0, 5)  // 0.5 + 6.5
  })

  it('returns rates sorted ascending by kVA', () => {
    const rates = buildDeptRates(ROUTING_CR, ['0070', '0080'], 'EE3105')
    expect(rates.map(r => r.kva)).toEqual([...rates.map(r => r.kva)].sort((a, b) => a - b))
  })

  it('only includes the requested operations and workcenter', () => {
    const clamp = buildDeptRates(ROUTING_CR, ['0090', '0100'], 'EE3106')
    expect(clamp.find(r => r.kva === 160)!.hrs).toBeCloseTo(1.5, 5) // 1.0 + 0.5
  })

  it('no matching rows → empty', () => {
    expect(buildDeptRates(ROUTING_CR, ['9999'], 'EE9999')).toEqual([])
  })
})
