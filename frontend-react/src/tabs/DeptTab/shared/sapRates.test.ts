import { describe, it, expect } from 'vitest'
import { kvaFromDesc, buildSapDeptRates } from './sapRates'
import { COIL_HV_WCS, COIL_FOIL_WCS } from './deptRegistry'

describe('kvaFromDesc', () => {
  it('extracts kVA from a material description', () => {
    expect(kvaFromDesc('tr.160KVA 3ph Dyn11')).toBe(160)
    expect(kvaFromDesc('tr.1,000KVA Oil')).toBe(1000)
  })
  it('returns 0 when no kVA present', () => {
    expect(kvaFromDesc('Cast resin mould')).toBe(0)
  })
})

describe('buildSapDeptRates (bundled SAP routing)', () => {
  it('builds non-empty, ascending rates for HV winding', () => {
    const rates = buildSapDeptRates(COIL_HV_WCS)
    expect(rates.length).toBeGreaterThan(0)
    expect(rates.every(r => r.hrs > 0)).toBe(true)
    expect(rates.map(r => r.kva)).toEqual([...rates.map(r => r.kva)].sort((a, b) => a - b))
  })
  it('foil and HV lines produce distinct rate tables', () => {
    expect(buildSapDeptRates(COIL_FOIL_WCS)).not.toEqual(buildSapDeptRates(COIL_HV_WCS))
  })
  it('unknown workcenter → empty', () => {
    expect(buildSapDeptRates(['ZZ9999'])).toEqual([])
  })
})
