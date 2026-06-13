/**
 * Derive an order's LV winding type (foil vs wire) from its item code.
 *
 * The item-code characteristic (position 8, see utils/itemCodeDecode) encodes
 * both customer and LV winding type:
 *   A/E/I → Foil   (Ekarat/PEA/MEA Foil)
 *   C/F/J → Wire   (Ekarat/PEA/MEA Wire)
 *   S (Special), H/L (Aluminum), or missing → indeterminate
 *
 * A transformer has exactly one LV coil, so this lets the Foil and Wire lines
 * each schedule only their own orders instead of sharing the whole pool.
 */

import type { Order } from '../../../types'
import { decodeItemInfo } from '../../../utils/itemCodeDecode'

export type LvType = 'foil' | 'wire' | null

const FOIL_CHARS = new Set(['A', 'E', 'I'])
const WIRE_CHARS = new Set(['C', 'F', 'J'])

/** 'foil' | 'wire' from the item-code characteristic, or null when indeterminate. */
export function deriveLvType(itemCode?: string): LvType {
  const ch = decodeItemInfo(itemCode ?? '').characteristic
  if (FOIL_CHARS.has(ch)) return 'foil'
  if (WIRE_CHARS.has(ch)) return 'wire'
  return null
}

/**
 * Line membership predicates. An order belongs to the Wire line only when its
 * code clearly says wire; everything else (foil + indeterminate) falls to the
 * Foil line — so every order lands on exactly one LV line (no loss, no
 * double-count). Foil is the safe default since ~84% of LV coils are foil.
 */
export const isFoilOrder = (o: Order) => deriveLvType(o.item_code) !== 'wire'
export const isWireOrder = (o: Order) => deriveLvType(o.item_code) === 'wire'

/** Orders whose LV type couldn't be determined (defaulted to foil). */
export const isLvUnclassified = (o: Order) => deriveLvType(o.item_code) === null
