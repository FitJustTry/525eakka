import { describe, it, expect } from 'vitest'
import { deriveLvType, isFoilOrder, isWireOrder, isLvUnclassified } from './lvType'
import { makeOrder, itemCode } from '../../../test/fixtures/orders'

describe('LV type derivation (critical business rule)', () => {
  it('A/E/I = Foil', () => {
    for (const ch of ['A', 'E', 'I']) expect(deriveLvType(itemCode(ch))).toBe('foil')
  })
  it('C/F/J = Wire', () => {
    for (const ch of ['C', 'F', 'J']) expect(deriveLvType(itemCode(ch))).toBe('wire')
  })
  it('other characteristics are indeterminate (null)', () => {
    for (const ch of ['S', 'H', 'L']) expect(deriveLvType(itemCode(ch))).toBeNull()
  })
  it('missing / too-short codes are null', () => {
    expect(deriveLvType(undefined)).toBeNull()
    expect(deriveLvType('')).toBeNull()
  })
})

describe('line membership (every order on exactly one LV line)', () => {
  it('wire only for clearly-wire; foil gets foil + indeterminate', () => {
    const wire = makeOrder({ item_code: itemCode('C') })
    const foil = makeOrder({ item_code: itemCode('A') })
    const unknown = makeOrder({ item_code: itemCode('S') })
    expect(isWireOrder(wire)).toBe(true)
    expect(isFoilOrder(wire)).toBe(false)

    expect(isFoilOrder(foil)).toBe(true)
    expect(isFoilOrder(unknown)).toBe(true)   // indeterminate defaults to foil
    expect(isWireOrder(unknown)).toBe(false)

    // partition: never both
    for (const o of [wire, foil, unknown]) {
      expect(isFoilOrder(o) && isWireOrder(o)).toBe(false)
      expect(isFoilOrder(o) || isWireOrder(o)).toBe(true)
    }
  })
  it('isLvUnclassified marks indeterminate codes', () => {
    expect(isLvUnclassified(makeOrder({ item_code: itemCode('S') }))).toBe(true)
    expect(isLvUnclassified(makeOrder({ item_code: itemCode('A') }))).toBe(false)
  })
})
