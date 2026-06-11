import type { CuttingRate, CuttingMachine, Order, WCConfig } from '../../../../types'

export type { CuttingRate, CuttingMachine, Order, WCConfig }

export const DAY_TH    = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
export const DAY_SHORT = ['อา','จ','อ','พ','พฤ','ศ','ส']
export const REG_PER   = 5 * 8 + 1 * 4   // 44h/week regular
export const OT_PER    = 5 * 4            // 20h max OT
export const SHIFT_PER = 5 * 9            // 45h/week max shift (5 nights × 9h default)

// Standard Cast Resin (B=4) kVA sizes — 23 IEC sizes
export const CR_STANDARD_SIZES = [50, 100, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3000, 3150, 4000, 5000, 6300, 8000, 10000, 12500]

export const DRILL_BONUS = 0.0001   // soft drill preference — yields to any real load difference
export const INDEX_BONUS = 1e-10    // reverse-index tiebreaker: higher machine index wins ties

export interface DayWork {
  order: Order
  hrsWorked: number    // hours used today
  isComplete: boolean  // order fully done
  isCarryOver: boolean // started on a previous day
  carriesOver: boolean // not finished — continues tomorrow
}

export interface MachineDaySched {
  regHrs: number; otHrs: number; shiftHrs: number; otNeeded: number
  work: DayWork[]; hasCarryOver: boolean; carriesForward: boolean
}
