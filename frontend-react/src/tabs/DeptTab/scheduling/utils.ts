import type { CuttingMachine, CuttingRate, WCConfig } from '../../../types'
import { decodeItemInfo } from '../../../utils/itemCodeDecode'

/** Lookup cutting hours for a kVA.
 * useNearestKva=false (default): exact match only; falls back to m.hrs_per_unit.
 * useNearestKva=true:            if no exact match, use the closest available kVA entry.
 */
export function getHrsForKva(
  m: CuttingMachine, kva: number, globalRates: CuttingRate[],
  itemCode?: string, globalTmcRates?: CuttingRate[], useNearestKva = false
): number {
  const pick = (rates: CuttingRate[]): CuttingRate | undefined => {
    const exact = rates.find(r => r.kva === kva)
    if (exact) return exact
    if (useNearestKva && rates.length)
      return rates.reduce((best, r) => Math.abs(r.kva - kva) < Math.abs(best.kva - kva) ? r : best)
    return undefined
  }

  // Cast Resin (item code position 1 = '4') — use TMC rate table first, then tmc_hrs fallback
  if (itemCode && itemCode[1] === '4') {
    const tmcMatch = pick(m.tmc_rates ?? [])
    if (tmcMatch) return tmcMatch.hrs
    const globalTmcMatch = pick(globalTmcRates ?? [])
    if (globalTmcMatch) return globalTmcMatch.hrs
    // No TMC rate entry → fall through to normal rate + tmc_hrs addition
  }
  // Priority: machine-specific rate → global rate → hrs_per_unit
  const machineMatch = pick(m.rates ?? [])
  if (machineMatch) return machineMatch.hrs * (m.time_mul ?? 1) + (m.tmc_hrs ?? 0)
  const globalMatch = pick(globalRates)
  const base = globalMatch ? globalMatch.hrs : m.hrs_per_unit
  return base * (m.time_mul ?? 1) + (m.tmc_hrs ?? 0)
}

/** Returns true if the machine is scheduled to run on this day of week (1=Mon … 6=Sat) */
export function isMachineOn(m: CuttingMachine, dayOfWeek: number): boolean {
  return !(m.off_days ?? []).includes(dayOfWeek)
}

/** Effective hours from WC Config (if wc_id set) or machine's own reg_hrs/ot_hrs */
export function resolveHours(m: CuttingMachine, wcConfig: Record<string, WCConfig>, isSat: boolean, dayOfWeek?: number) {
  if (dayOfWeek !== undefined && !isMachineOn(m, dayOfWeek)) return { reg: 0, ot: 0 }
  const wc = m.wc_id ? wcConfig[m.wc_id] : null
  if (wc) return {
    reg: isSat ? (wc.sat_hrs ?? 0) : (wc.hrs ?? 8),
    ot:  isSat ? (wc.sat_ot ?? 0) : (wc.ot  ?? 4),
  }
  return {
    reg: isSat ? (m.reg_hrs ?? 8) / 2 : (m.reg_hrs ?? 8),
    ot:  isSat ? (m.ot_hrs  ?? 4) / 2 : (m.ot_hrs  ?? 4),
  }
}

/** Detect required cutting type from raw_mat field:
 *  'laser' = LS steel (LS0.70, LS0.80) → needs laser=true
 *  'm4'    = M-4 silicon steel         → needs m4=true
 *  'any'   = unknown / not specified   → no constraint
 */
export function detectWireType(rawMat?: string): 'laser' | 'm4' | 'any' {
  if (!rawMat || rawMat === '—' || rawMat.trim() === '') return 'any'
  const r = rawMat.toUpperCase().trim()
  if (r.startsWith('LS')) return 'laser'
  if (r.includes('M - 4') || r.includes('M-4') || r === 'M4') return 'm4'
  return 'any'
}

/** Hard constraint: kVA range only. max_kva ≥ 9999 = ไม่จำกัด (no upper limit). */
export function canMachineCut(
  m: CuttingMachine,
  o: { product?: string; kva?: number | null; raw_mat?: string },
  products: Record<string, { kva?: number }> = {},
  strictWire = false,
  requireDrill = false
): boolean {
  const kva = o.kva ?? products[o.product ?? '']?.kva ?? 0
  if (kva < m.min_kva) return false
  if (m.max_kva < 9999 && kva > m.max_kva) return false
  if (strictWire) {
    const wt = detectWireType(o.raw_mat)
    if (wt === 'laser' && !m.laser) return false
    if (wt === 'm4'    && !m.m4)    return false
  }
  if (requireDrill && kva >= 315 && !m.drill_8mm && !m.drill_22mm) return false
  return true
}

/** Returns true if this machine prefers this order (drill type matches). */
export function drillPrefers(m: CuttingMachine, o: { item_code?: string }): boolean {
  if (!m.drill_8mm && !m.drill_22mm) return false
  const { typeCode } = decodeItemInfo(o.item_code ?? '')
  if (typeCode === '4') return m.drill_22mm
  if (['1','2','3'].includes(typeCode)) return m.drill_8mm
  return false
}

/** Soft wire preference: LS raw_mat prefers laser machine, M-4 raw_mat prefers m4 machine. Tiebreaker only. */
export function wirePrefers(m: CuttingMachine, o: { raw_mat?: string }): boolean {
  const wt = detectWireType(o.raw_mat)
  if (wt === 'laser') return m.laser
  if (wt === 'm4')    return m.m4
  return false
}

/** Display name: uses stored name if it contains a digit, else appends #id so unnamed machines are identifiable. */
export function mLabel(m: { id: number; name: string }): string {
  return m.name && /\d/.test(m.name) ? m.name : `${m.name || 'เครื่องตัด'} #${m.id}`
}

export function machineTypeLabel(m: CuttingMachine): { label: string; color: string } {
  if (m.drill_8mm && m.drill_22mm) return { label: '🔩 เจาะ 8+22mm',   color: 'var(--purple)' }
  if (m.drill_8mm)                 return { label: '🔩 เจาะ 8mm (Oil)', color: 'var(--blue)'   }
  if (m.drill_22mm)                return { label: '🔩 เจาะ 22mm (CR)', color: 'var(--amber)'  }
  return                                  { label: '✂ ตัดเท่านั้น',      color: 'var(--txt3)'  }
}

export function fmtISO(d: Date) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
}

export function getWeekRange(offset: number) {
  const today = new Date()
  const dow = today.getDay()
  const toMon = dow === 0 ? -6 : 1 - dow
  const mon = new Date(today)
  mon.setDate(today.getDate() + toMon + offset * 7)
  mon.setHours(0, 0, 0, 0)
  const sat = new Date(mon)
  sat.setDate(mon.getDate() + 5)
  sat.setHours(23, 59, 59, 999)
  return { mon, sat }
}

/** Priority rank: หลัก=1, Fast=2, เสริม=3, other=4 */
export function catRank(o: { category: string }): number {
  if (o.category === 'หลัก') return 1
  if (o.category === 'Fast')  return 2
  if (o.category === 'เสริม') return 3
  return 4
}
