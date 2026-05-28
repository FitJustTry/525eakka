export function decodeKva(itemCode: string): number {
  if (!itemCode || itemCode.length < 6) return 0
  const c = parseInt(itemCode[2])
  const def = parseInt(itemCode.slice(3, 6))
  if (isNaN(c) || isNaN(def)) return 0
  return def * Math.pow(10, c) / 1000
}

export function kvaToProductKey(kva: number): string {
  if (kva <= 0) return ''
  if (kva <= 50) return 'tr.50kVA'
  if (kva <= 160) return 'tr.160kVA'
  if (kva <= 300) return 'tr.300KVA'
  if (kva <= 630) return 'tr.630kVA'
  if (kva <= 1000) return 'tr.1000kVA'
  if (kva <= 2000) return 'tr.2000kVA'
  if (kva <= 3500) return 'tr.3500kVA'
  if (kva <= 7000) return 'tr.7000kVA'
  return 'tr.16000kVA'
}

export function resolveProductKey(itemCode: string, fallbackKva: number): string {
  const kva = decodeKva(itemCode) || fallbackKva
  return kvaToProductKey(kva)
}

const TYPE_NAME: Record<string, string> = {
  '1': 'Conservator', 'C': 'Conservator',
  '2': 'N2 Sealed',   'N': 'N2 Sealed',
  '3': 'Hermetic',    'F': 'Hermetic',
  '4': 'Cast Resin',  '5': 'Pad Mounted',
  '6': 'Dry Type',    '8': 'Special',    '9': '1-Phase',
}

const CHAR_NAME: Record<string, string> = {
  'A': 'Ekarat Foil', 'C': 'Ekarat Wire',
  'E': 'PEA Foil',    'F': 'PEA Wire',
  'I': 'MEA Foil',    'J': 'MEA Wire',
  'S': 'Special',     'H': 'Al(HV)',     'L': 'Al(HV+LV)',
}

const HV_LABEL: Record<string, string> = {
  '01': '≤1kV', '11': '11kV', '19': '19kV',
  '22': '22kV', '33': '33kV', '40': '11/22kV',
}

export interface ItemCodeInfo {
  kva: number
  typeCode: string
  typeName: string
  hvCode: string
  hvLabel: string
  characteristic: string
  charLabel: string
  isSpecial: boolean
  isAluminum: boolean
}

export function decodeItemInfo(itemCode: string): ItemCodeInfo {
  const empty: ItemCodeInfo = { kva: 0, typeCode: '', typeName: '', hvCode: '', hvLabel: '', characteristic: '', charLabel: '', isSpecial: false, isAluminum: false }
  if (!itemCode || itemCode.length < 8) return empty
  const kva = decodeKva(itemCode)
  const typeCode = itemCode[1] ?? ''
  const hvCode = itemCode.slice(6, 8)
  const characteristic = (itemCode[8] ?? '').toUpperCase()
  return {
    kva,
    typeCode,
    typeName: TYPE_NAME[typeCode] ?? typeCode,
    hvCode,
    hvLabel: HV_LABEL[hvCode] ?? `${hvCode}kV`,
    characteristic,
    charLabel: CHAR_NAME[characteristic] ?? characteristic,
    isSpecial: characteristic === 'S',
    isAluminum: characteristic === 'H' || characteristic === 'L',
  }
}

export function planDateToWeekStart(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  if (isNaN(d.getTime())) return isoDate
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  return d.toISOString().slice(0, 10)
}
