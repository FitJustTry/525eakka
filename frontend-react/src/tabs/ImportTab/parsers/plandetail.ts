import { guessOrderCols } from './masterplan'

export interface ParsedPlanDetail {
  week_start: string; plan_date: string; seq: number
  sap_so: string; item_code: string; product: string; customer: string
  kva: number; qty: number; deadline: string
  face_mm: number | null; electrical: string; hv: string; lv: string
  comment: string; category: string
}

export function guessPlanDetailCols(headers: string[], dataRows: unknown[][]) {
  const base = guessOrderCols(headers, dataRows)
  const find = (...keys: string[]) => {
    const hi = headers.map(h => h.toLowerCase())
    for (const k of keys) { const i = hi.findIndex(h => h.includes(k.toLowerCase())); if (i >= 0) return i }
    return -1
  }
  return {
    ...base,
    face_mm:    find('face', 'หน้ากว้าง', 'facewidth', 'width mm', 'หน้า mm'),
    electrical: find('electrical', 'ระบบไฟ', 'volt system', 'ระบบ'),
    hv:         find('hv', 'high volt', 'แรงดันสูง', 'primary volt'),
    lv:         find('lv', 'low volt', 'แรงดันต่ำ', 'secondary volt'),
  }
}
