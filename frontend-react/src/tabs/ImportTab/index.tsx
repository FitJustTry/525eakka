import { useState, useRef, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { api } from '../../api'
import type { EmpDir } from '../../api'
import type { Order, Employee, Product } from '../../types'

type SubTab = 'masterplan' | 'plandetail' | 'coilplan' | 'employees' | 'catalog' | 'sap' | 'routing_cr' | 'routing_hv' | 'routing_lv' | 'help'

// ── Shared styles ──
const thStyle: React.CSSProperties = {
  padding: '7px 8px', textAlign: 'left', color: 'var(--txt3)', fontSize: 10, fontWeight: 600,
  background: 'var(--bg3)', borderBottom: '1px solid var(--bord2)', whiteSpace: 'nowrap',
  userSelect: 'none', position: 'sticky', top: 0, zIndex: 2,
}
const tdStyle: React.CSSProperties = { padding: '5px 8px', borderBottom: '0.5px solid var(--bord)', fontSize: 11 }
const cancelBtn: React.CSSProperties = { fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt2)', cursor: 'pointer' }
const importBtn: React.CSSProperties = { fontSize: 12, padding: '6px 16px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#000', fontWeight: 700, cursor: 'pointer' }

// ── Master Plan helpers ──

interface ParsedOrder {
  id: string; customer: string; kva: number; qty: number; deadline: string
  plan_date: string | null
  sap_so: string; category: string; item_code: string; comment: string; product: string
  _raw: Record<string, unknown>
}

function findHeaderRow(rows: unknown[][]): number {
  const SIGNALS = [
    ['order','production order','คำสั่งผลิต','เลขที่','sap'],
    ['kva','mva','กำลัง'],
    ['qty','quantity','จำนวน'],
    ['deadline','due','delivery','กำหนด','วันส่ง'],
    ['customer','cust','ลูกค้า'],
  ]
  for (let i = 0; i < Math.min(10, rows.length - 1); i++) {
    const cells = (rows[i] as unknown[]).map(c => String(c ?? '').toLowerCase())
    const score = SIGNALS.reduce((s, keys) => s + (cells.some(c => keys.some(k => c.includes(k))) ? 1 : 0), 0)
    if (score >= 2) return i
  }
  return 0
}

const THAI_CATS = ['หลัก','เสริม','พิเศษ','กำหนดเอง','จอง','เพิ่มเติม','งานซ่อม','Fast','fast']

function detectCategoryCol(dataRows: unknown[][], totalCols: number): number {
  for (let col = 0; col < totalCols; col++) {
    let hits = 0
    for (let row = 0; row < Math.min(30, dataRows.length); row++) {
      const v = String((dataRows[row] as unknown[])[col] ?? '').trim()
      if (THAI_CATS.includes(v)) hits++
    }
    if (hits >= 2) return col
  }
  return -1
}

function guessOrderCols(headers: string[], dataRows: unknown[][]) {
  const find = (...keys: string[]) => {
    const hi = headers.map(h => h.toLowerCase())
    for (const k of keys) { const i = hi.findIndex(h => h.includes(k)); if (i >= 0) return i }
    return -1
  }
  const catByHeader = find('category','cat','หมวด','ประเภท','type')
  return {
    id:        find('production order','prod order','order no','คำสั่งผลิต','เลขที่','sap'),
    customer:  find('customer','cust','ลูกค้า','sold to'),
    kva:       find('kva','mva','capacity','กำลัง'),
    qty:       find('qty','quantity','จำนวน','ea','targetqty','target qty'),
    deadline:  find('deadline','กำหนด','วันส่ง','delivery','finish date','basicfinish','due date'),
    plan_date: find('วันที่','plan date','schedule date','planned date','start date'),
    sap_so:    find('sales order','so no','salesorder'),
    category:  catByHeader >= 0 ? catByHeader : detectCategoryCol(dataRows, Math.max(headers.length, 10)),
    item5:     find('item5','item code','item ','material','mat','รหัส','materialorder'),
    comment:   find('comment','หมายเหตุ','remark','note'),
  }
}

// Detect MM/DD vs DD/MM from the first unambiguous slash-date found in given columns.
// Returns 'MM/DD' (Excel US default) or 'DD/MM' (Thai CSV export).
function detectSlashFmt(rows: unknown[][], dateCols: number[]): 'MM/DD' | 'DD/MM' {
  for (const row of rows.slice(0, 80)) {
    for (const col of dateCols) {
      const s = String((row as unknown[])[col] ?? '').trim()
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (!m) continue
      const a = parseInt(m[1]), b = parseInt(m[2])
      if (b > 12) return 'MM/DD'   // e.g. 5/25/2026 → month first
      if (a > 12) return 'DD/MM'   // e.g. 25/5/2026 → day first
    }
  }
  return 'MM/DD'   // default: Excel US format
}

/** Format a Date as local YYYY-MM-DD (avoids UTC timezone shift from .toISOString()) */
function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function parseDate(raw: unknown, fmt: 'MM/DD' | 'DD/MM' = 'MM/DD'): string {
  const fallback = () => localISO(new Date(Date.now() + 30 * 86400000))
  if (!raw) return fallback()
  const s = String(raw).trim()
  if (!s || s === '-' || s === '—') return fallback()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slash) {
    const [, a, b, y] = slash
    const aNum = parseInt(a), bNum = parseInt(b), yNum = parseInt(y)
    const year = yNum > 2400 ? yNum - 543 : yNum
    if (bNum > 12) return `${year}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`  // unambiguous MM/DD
    if (aNum > 12) return `${year}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`  // unambiguous DD/MM
    // Ambiguous (both ≤ 12): use detected format
    if (fmt === 'DD/MM') return `${year}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`
    return `${year}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`  // MM/DD
  }
  const n = parseInt(s)
  if (!isNaN(n) && n > 40000) return localISO(new Date(new Date(1899, 11, 30).getTime() + n * 86400000))
  const d3 = new Date(s)
  if (!isNaN(d3.getTime())) return localISO(d3)
  return fallback()
}

function itemCodeToProduct(code: string): string {
  if (!code || code.length < 8) return ''
  const kvaCode = code.slice(2, 6)
  const c = parseInt(kvaCode[0]), def = parseInt(kvaCode.slice(1))
  if (isNaN(c) || isNaN(def)) return ''
  const kva = def * Math.pow(10, c) / 1000
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

// ── Plan Detail helpers ──

interface ParsedPlanDetail {
  week_start: string; plan_date: string; seq: number
  sap_so: string; item_code: string; product: string; customer: string
  kva: number; qty: number; deadline: string
  face_mm: number | null; electrical: string; hv: string; lv: string
  comment: string; category: string
}

function guessPlanDetailCols(headers: string[], dataRows: unknown[][]) {
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

function planDateToWeekStart(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  if (isNaN(d.getTime())) return isoDate
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  return localISO(d)
}

// ── Coil Plan helpers — ported from test.html processRows ──

interface ParsedCoilRow {
  plan_date: string; seq: number; importance: string
  sap_so: string; item_code: string; comment: string; plant: string
  kva: number; electrical: string; customer: string
  total_kva: number; qty: number
  enter_test: string; cable_box: string; control: string
  due_store: string; due_so: string; adjust_plan: string
  due_clamp: string; due_box_ctrl: string; raw_mat: string
  lv: string; hv: string
}

// "D/M/YYYY" or "DD/MM/YYYY" → "YYYY-MM-DD" (day-first, Thai calendar aware)
function dmyToISO(raw: string): string | null {
  if (!raw || raw === '-') return null
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const y = parseInt(raw.slice(0, 4))
    return (y > 2400 ? `${y - 543}` : raw.slice(0, 4)) + raw.slice(4, 10)
  }
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const d = parseInt(m[1]), mo = parseInt(m[2]), y = parseInt(m[3]) > 2400 ? parseInt(m[3]) - 543 : parseInt(m[3])
  return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}

function parseCoilPlan(rows: string[][]): ParsedCoilRow[] {
  // 1. Trim at section footers (same as test.html)
  const effective: string[][] = []
  for (const row of rows) {
    if ((row[0] ?? '').includes('บันทึกเพิ่มเติม') || (row[0] ?? '').includes('รวมทั้งหมด')) break
    effective.push(row)
  }
  if (effective.length === 0) throw new Error('ไม่พบข้อมูล (ไฟล์ว่างหรือไม่มีส่วนข้อมูลหลัก)')

  // 2. Find header row — must have "วันที่" in col 0 and "ลำดับ" in col 1
  let headerIdx = -1
  for (let i = 0; i < effective.length; i++) {
    if ((effective[i][0] ?? '').includes('วันที่') && (effective[i][1] ?? '').includes('ลำดับ')) {
      headerIdx = i; break
    }
  }
  if (headerIdx === -1) throw new Error('ไม่พบหัวตาราง (ต้องมี "วันที่" ในคอลัมน์แรก และ "ลำดับ" ในคอลัมน์ที่สอง)')

  // 3. Build combined headers
  //    - Two-row Excel: combine h1 + h2 sub-header, data from headerIdx+2
  //    - Single-row CSV: h2 is already data, use h1 only, data from headerIdx+1
  const h1 = effective[headerIdx]
  const h2 = effective[headerIdx + 1] ?? []
  const h2IsData = h2.length > 1 && !isNaN(parseFloat(h2[1] ?? ''))
  const dataStart = headerIdx + (h2IsData ? 1 : 2)
  const combinedHeaders: string[] = []
  const maxLen = Math.max(h1.length, h2IsData ? 0 : h2.length)
  for (let i = 0; i < Math.max(maxLen, h1.length); i++) {
    const a = (h1[i] ?? '').trim()
    const b = h2IsData ? '' : (h2[i] ?? '').trim()
    combinedHeaders.push(!a && !b ? `col_${i}` : a && b ? `${a} ${b}` : a || b)
  }

  // 4. Column finder — mirrors test.html findIndex
  const findCol = (...kws: string[]) => {
    for (let i = 0; i < combinedHeaders.length; i++) {
      const lo = combinedHeaders[i].toLowerCase()
      for (const kw of kws) if (lo.includes(kw.toLowerCase())) return i
    }
    return -1
  }

  let importanceIdx = findCol('ประเภท', 'ความสำคัญ')
  if (importanceIdx === -1) importanceIdx = 2

  const c = {
    date:       findCol('วันที่'),
    seq:        findCol('ลำดับ'),
    importance: importanceIdx,
    sap:        findCol('sap'),
    itemcode:   findCol('item 5', 'item5', 'itemcode'),
    comment:    findCol('comment'),
    plant:      findCol('plant'),
    kva:        findCol('kva'),
    elec:       findCol('ระบบไฟฟ้า'),
    customer:   findCol('ลูกค้า'),
    totalKva:   findCol('total kva'),
    qty:        findCol('จำนวน'),
    enterTest:  findCol('เข้าเทส'),
    cable:      findCol('cable'),
    control:    findCol('control'),
    dueStore:   findCol('กำหนด', 'ส่งเข้าสโตร์'),
    dueSO:      findCol('due so'),
    adjustPlan: findCol('แจ้งปรับแผนการผลิต', 'แจ้งปรับแผน'),
    dueClamp:   findCol('due clamp'),
    dueBox:     findCol('due box'),
    dueCtrlBox: findCol('due ctrl box'),
    rawMat:     findCol('raw mat'),
    lv:         findCol('lv'),
    hv:         findCol('hv'),
  }

  // 5. Process data rows — direct port of test.html inner loop
  const g = (row: string[], idx: number) => (idx >= 0 && idx < row.length) ? (row[idx] ?? '') : ''

  let currentDateDMY = ''
  const result: ParsedCoilRow[] = []

  for (const row of effective.slice(dataStart)) {
    if (!row.length || row.every(cell => !cell)) continue

    // Carry-forward date (keep as D/M/YYYY while scanning, convert to ISO for storage)
    const dateVal = g(row, c.date)
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateVal)) currentDateDMY = dateVal
    else if (/^\d{4}-\d{1,2}-\d{1,2}/.test(dateVal)) {
      const [y, mo, d] = dateVal.split('-')
      currentDateDMY = `${d}/${mo}/${y}`
    }
    if (!currentDateDMY) continue

    // ลำดับ must be numeric
    const seqVal = g(row, c.seq)
    if (!seqVal || isNaN(parseFloat(seqVal))) continue
    if (row.some(cell => cell.includes('<<<') || cell.includes('เฉลี่ย'))) continue

    const kva = parseFloat(g(row, c.kva).replace(/,/g, '')) || 0
    const qty = parseInt(g(row, c.qty).replace(/,/g, '')) || 1
    const totalKvaRaw = parseFloat(g(row, c.totalKva).replace(/,/g, ''))
    const total_kva = isNaN(totalKvaRaw) ? kva * qty : totalKvaRaw

    const dueBox = g(row, c.dueBox), dueCtrlBox = g(row, c.dueCtrlBox)
    let due_box_ctrl = ''
    if (dueBox && dueBox !== '-' && dueCtrlBox && dueCtrlBox !== '-') due_box_ctrl = `${dueBox} / ${dueCtrlBox}`
    else if (dueBox && dueBox !== '-') due_box_ctrl = dueBox
    else if (dueCtrlBox && dueCtrlBox !== '-') due_box_ctrl = dueCtrlBox

    let importance = g(row, c.importance)
    if (!importance && row.length > 2) importance = row[2] ?? ''

    result.push({
      plan_date: dmyToISO(currentDateDMY) ?? currentDateDMY,
      seq: parseFloat(seqVal), importance,
      sap_so: g(row, c.sap), item_code: g(row, c.itemcode),
      comment: g(row, c.comment), plant: g(row, c.plant),
      kva, electrical: g(row, c.elec), customer: g(row, c.customer),
      total_kva, qty,
      enter_test: g(row, c.enterTest), cable_box: g(row, c.cable),
      control: g(row, c.control), due_store: g(row, c.dueStore),
      due_so: g(row, c.dueSO), adjust_plan: g(row, c.adjustPlan),
      due_clamp: g(row, c.dueClamp), due_box_ctrl,
      raw_mat: g(row, c.rawMat), lv: g(row, c.lv), hv: g(row, c.hv),
    })
  }

  if (result.length === 0) throw new Error('ไม่พบข้อมูลที่ถูกต้อง (ไม่มีแถวที่มีลำดับเป็นตัวเลข)')
  return { rows: result, headers: combinedHeaders, colMap: c as Record<string, number> }
}

// ── Employees helpers ──

interface ParsedEmployee {
  wc: string; id: string; name: string; title: string; dept: string
  is_active: boolean; is_head: boolean
}

function guessEmpCols(headers: string[]) {
  const find = (...keys: string[]) => {
    const hi = headers.map(h => h.toLowerCase().replace(/[_\s\-]/g, ''))
    for (const k of keys) { const i = hi.findIndex(h => h.includes(k)); if (i >= 0) return i }
    return -1
  }
  return {
    wc:        find('wcid','workcenter','wc','สถานีงาน','workstation'),
    id:        find('empid','employeeid','รหัสพนักงาน','รหัส','เลขที่'),
    name:      find('empname','fullname','ชื่อนามสกุล','ชื่อสกุล','ชื่อ','name'),
    title:     find('title','ตำแหน่ง','คำนำหน้า','position'),
    dept:      find('dept','department','แผนก','ฝ่าย'),
    is_active: find('isactive','active','สถานะ','ปฏิบัติงาน'),
    is_head:   find('ishead','หน.','หัวหน้า','head'),
  }
}

function parseBool(v: unknown): boolean {
  if (v == null) return true
  const s = String(v).toLowerCase().trim()
  return s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === 'active' || s === 'จริง'
}

// ── Catalog helpers ──

interface ParsedCatalog { key: string; label: string; kva: number; std_hrs: number }

function guessCatalogCols(headers: string[]) {
  const find = (...keys: string[]) => {
    const hi = headers.map(h => h.toLowerCase().replace(/[_\s]/g, ''))
    for (const k of keys) { const i = hi.findIndex(h => h.includes(k)); if (i >= 0) return i }
    return -1
  }
  return {
    key:     find('key','productkey','รหัส'),
    label:   find('label','name','ชื่อ','description','desc'),
    kva:     find('kva','mva','กำลัง'),
    std_hrs: find('stdhrs','std','hrs','ชั่วโมง'),
  }
}

// ── Routing CR (เหล็กแกน) helpers ──

interface ParsedRoutingCrRow {
  sheet_name: string
  size_label: string
  size_kva: number
  routing_group: string
  operation: string
  wc_id: string
  description: string
  qty_per_op: number
  unit: string
  std_hrs: number
}

function parseSizeKva(raw: unknown): number {
  if (!raw && raw !== 0) return 0
  const s = String(raw).trim()
  const m = s.match(/(\d[\d,]*)/)
  if (!m) return 0
  return parseInt(m[1].replace(/,/g, '')) || 0
}

function parseRoutingCr(wb: { SheetNames: string[]; Sheets: Record<string, unknown> }, sheetToJson: (ws: unknown, opts: object) => unknown[][]): ParsedRoutingCrRow[] {
  const result: ParsedRoutingCrRow[] = []
  const dataSheets = wb.SheetNames.filter(n => n.trim().toLowerCase() !== 'sheet2' && n.trim() !== '')
  for (const sheetName of dataSheets) {
    const ws = wb.Sheets[sheetName]
    const rows: unknown[][] = sheetToJson(ws, { header: 1, defval: '' })
    if (rows.length < 2) continue
    let currentSizeLabel = ''
    let currentSizeKva = 0
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as unknown[]
      const sizeRaw = row[0]
      const routingGroup = String(row[1] ?? '').trim()
      const operation = String(row[2] ?? '').trim()
      const wcId = String(row[3] ?? '').trim()
      const description = String(row[4] ?? '').trim()
      const qtyRaw = parseFloat(String(row[5] ?? '').replace(/,/g, '')) || 1
      const unit = String(row[6] ?? '').trim()
      const stdHrs = parseFloat(String(row[7] ?? '').replace(/,/g, '')) || 0

      if (sizeRaw !== '' && sizeRaw !== null && sizeRaw !== undefined) {
        currentSizeLabel = String(sizeRaw).trim()
        currentSizeKva = parseSizeKva(sizeRaw)
      }
      if (!routingGroup || !operation || !wcId) continue
      result.push({
        sheet_name: sheetName,
        size_label: currentSizeLabel,
        size_kva: currentSizeKva,
        routing_group: routingGroup,
        operation,
        wc_id: wcId,
        description,
        qty_per_op: qtyRaw,
        unit,
        std_hrs: stdHrs,
      })
    }
  }
  return result
}

// ── Main Component ──

export default function ImportTab() {
  const { state, dispatch } = useApp()
  const { orders, products } = state

  const [subTab, setSubTab] = useState<SubTab>('masterplan')

  // Master Plan state
  const [mpDragOver, setMpDragOver] = useState(false)
  const [mpParsed, setMpParsed] = useState<ParsedOrder[]>([])
  const [mpImporting, setMpImporting] = useState(false)
  const [mpResult, setMpResult] = useState<string | null>(null)
  const [mpSortCol, setMpSortCol] = useState('deadline')
  const [mpSortDir, setMpSortDir] = useState(1)
  const [mpHeaderRow, setMpHeaderRow] = useState(0)
  const [mpRawHeaders, setMpRawHeaders] = useState<string[]>([])
  const [mpColMap, setMpColMap] = useState<Record<string, number>>({})
  const mpFileRef = useRef<HTMLInputElement>(null)

  // Employees state
  const [empDragOver, setEmpDragOver] = useState(false)
  const [empParsed, setEmpParsed] = useState<ParsedEmployee[]>([])
  const [empResult, setEmpResult] = useState<string | null>(null)
  const [empHeaders, setEmpHeaders] = useState<string[]>([])
  const [empColMap, setEmpColMap] = useState<Record<string, number>>({})
  const [empRawRows, setEmpRawRows] = useState<unknown[][]>([])
  const empFileRef = useRef<HTMLInputElement>(null)

  // Catalog state
  const [catDragOver, setCatDragOver] = useState(false)
  const [catParsed, setCatParsed] = useState<ParsedCatalog[]>([])
  const [catResult, setCatResult] = useState<string | null>(null)
  const catFileRef = useRef<HTMLInputElement>(null)

  // SAP state
  const [sapDragOver, setSapDragOver] = useState(false)
  const [sapHeaders, setSapHeaders] = useState<string[]>([])
  const [sapRows, setSapRows] = useState<unknown[][]>([])
  const [sapImporting, setSapImporting] = useState(false)
  const [sapResult, setSapResult] = useState<string | null>(null)
  const [sapShowLimit, setSapShowLimit] = useState<number>(100)
  const sapFileRef = useRef<HTMLInputElement>(null)

  // Coil Plan state
  const [coilDragOver, setCoilDragOver] = useState(false)
  const [coilParsed, setCoilParsed] = useState<ParsedCoilRow[]>([])
  const [coilImporting, setCoilImporting] = useState(false)
  const [coilResult, setCoilResult] = useState<string | null>(null)
  const coilFileRef = useRef<HTMLInputElement>(null)

  // Plan Detail state
  const [pdDragOver, setPdDragOver] = useState(false)
  const [pdParsed, setPdParsed] = useState<ParsedPlanDetail[]>([])
  const [pdImporting, setPdImporting] = useState(false)
  const [pdResult, setPdResult] = useState<string | null>(null)
  const pdFileRef = useRef<HTMLInputElement>(null)

  // Routing CR state
  const [crDragOver, setCrDragOver] = useState(false)
  const [crParsed, setCrParsed] = useState<ParsedRoutingCrRow[]>([])
  const [crImporting, setCrImporting] = useState(false)
  const [crResult, setCrResult] = useState<string | null>(null)
  const crFileRef = useRef<HTMLInputElement>(null)

  // Routing HV state
  const [hvDragOver, setHvDragOver] = useState(false)
  const [hvParsed, setHvParsed] = useState<ParsedRoutingCrRow[]>([])
  const [hvImporting, setHvImporting] = useState(false)
  const [hvResult, setHvResult] = useState<string | null>(null)
  const hvFileRef = useRef<HTMLInputElement>(null)

  // Routing LV state
  const [lvDragOver, setLvDragOver] = useState(false)
  const [lvParsed, setLvParsed] = useState<ParsedRoutingCrRow[]>([])
  const [lvImporting, setLvImporting] = useState(false)
  const [lvResult, setLvResult] = useState<string | null>(null)
  const lvFileRef = useRef<HTMLInputElement>(null)

  // Master Plan (coil-format) state
  const [mpCoilDragOver, setMpCoilDragOver] = useState(false)
  const [mpCoilParsed, setMpCoilParsed] = useState<ParsedCoilRow[]>([])
  const [mpCoilImporting, setMpCoilImporting] = useState(false)
  const [mpCoilResult, setMpCoilResult] = useState<string | null>(null)
  const [mpCoilHeaders, setMpCoilHeaders] = useState<string[]>([])
  const [mpCoilColMap, setMpCoilColMap] = useState<Record<string, number>>({})
  const [mpCoilActiveDay, setMpCoilActiveDay] = useState<string | null>(null)
  const [mpCoilMapOpen, setMpCoilMapOpen] = useState(false)
  const mpCoilFileRef = useRef<HTMLInputElement>(null)

  // ── Routing HV handlers ──

  async function handleHvFile(file: File) {
    setHvResult(null); setHvParsed([])
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      if (wb.SheetNames.length === 0) { alert('ไม่พบ Sheet ในไฟล์'); return }
      const result = parseRoutingCr(wb as unknown as { SheetNames: string[]; Sheets: Record<string, unknown> }, XLSX.utils.sheet_to_json.bind(XLSX.utils) as (ws: unknown, opts: object) => unknown[][])
      if (result.length === 0) { setHvResult('❌ ไม่พบข้อมูล — ตรวจสอบโครงสร้างไฟล์ (ต้องมี Routing Group, Operation, Work Center)'); return }
      setHvParsed(result)
    } catch (e) { alert('อ่านไฟล์ไม่ได้: ' + (e instanceof Error ? e.message : String(e))) }
  }

  async function handleHvImport() {
    if (hvParsed.length === 0) return
    setHvImporting(true)
    try {
      const { inserted } = await api.routingHv.batch(hvParsed)
      const sheets = [...new Set(hvParsed.map(r => r.sheet_name))]
      const wcCount = new Set(hvParsed.map(r => r.wc_id)).size
      setHvResult(`✅ นำเข้าสำเร็จ — ${inserted} operations · ${sheets.length} ประเภท · ${wcCount} Work Centers`)
      setHvParsed([])
    } catch (e) {
      setHvResult('❌ เกิดข้อผิดพลาด: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setHvImporting(false) }
  }

  // ── Routing LV handlers ──

  async function handleLvFile(file: File) {
    setLvResult(null); setLvParsed([])
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      if (wb.SheetNames.length === 0) { alert('ไม่พบ Sheet ในไฟล์'); return }
      const result = parseRoutingCr(wb as unknown as { SheetNames: string[]; Sheets: Record<string, unknown> }, XLSX.utils.sheet_to_json.bind(XLSX.utils) as (ws: unknown, opts: object) => unknown[][])
      if (result.length === 0) { setLvResult('❌ ไม่พบข้อมูล — ตรวจสอบโครงสร้างไฟล์ (ต้องมี Routing Group, Operation, Work Center)'); return }
      setLvParsed(result)
    } catch (e) { alert('อ่านไฟล์ไม่ได้: ' + (e instanceof Error ? e.message : String(e))) }
  }

  async function handleLvImport() {
    if (lvParsed.length === 0) return
    setLvImporting(true)
    try {
      const { inserted } = await api.routingLv.batch(lvParsed)
      const sheets = [...new Set(lvParsed.map(r => r.sheet_name))]
      const wcCount = new Set(lvParsed.map(r => r.wc_id)).size
      setLvResult(`✅ นำเข้าสำเร็จ — ${inserted} operations · ${sheets.length} ประเภท · ${wcCount} Work Centers`)
      setLvParsed([])
    } catch (e) {
      setLvResult('❌ เกิดข้อผิดพลาด: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setLvImporting(false) }
  }

  // ── Routing CR handlers ──

  async function handleCrFile(file: File) {
    setCrResult(null); setCrParsed([])
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      if (wb.SheetNames.length === 0) { alert('ไม่พบ Sheet ในไฟล์'); return }
      const result = parseRoutingCr(wb as unknown as { SheetNames: string[]; Sheets: Record<string, unknown> }, XLSX.utils.sheet_to_json.bind(XLSX.utils) as (ws: unknown, opts: object) => unknown[][])
      if (result.length === 0) { setCrResult('❌ ไม่พบข้อมูล — ตรวจสอบโครงสร้างไฟล์ (ต้องมี Routing Group, Operation, Work Center)'); return }
      setCrParsed(result)
    } catch (e) { alert('อ่านไฟล์ไม่ได้: ' + (e instanceof Error ? e.message : String(e))) }
  }

  async function handleCrImport() {
    if (crParsed.length === 0) return
    setCrImporting(true)
    try {
      const { inserted } = await api.routingCr.batch(crParsed)
      const sheets = [...new Set(crParsed.map(r => r.sheet_name))]
      const wcCount = new Set(crParsed.map(r => r.wc_id)).size
      setCrResult(`✅ นำเข้าสำเร็จ — ${inserted} operations · ${sheets.length} ประเภท · ${wcCount} Work Centers`)
      setCrParsed([])
    } catch (e) {
      setCrResult('❌ เกิดข้อผิดพลาด: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setCrImporting(false) }
  }

  // ── Master Plan handlers ──

  async function handleMpFile(file: File) {
    setMpResult(null); setMpParsed([]); setMpRawHeaders([]); setMpColMap({})
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { cellDates: false, raw: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
      if (rows.length < 2) { alert('ไม่พบข้อมูลในไฟล์'); return }

      // Find the real header row (skip title rows)
      const headerRowIdx = findHeaderRow(rows)
      setMpHeaderRow(headerRowIdx)
      const headers = (rows[headerRowIdx] as unknown[]).map(h => String(h ?? '').trim())
      const dataRows = rows.slice(headerRowIdx + 1)
      const cols = guessOrderCols(headers, dataRows)
      setMpRawHeaders(headers)
      setMpColMap(cols as unknown as Record<string, number>)

      // Auto-detect MM/DD vs DD/MM from unambiguous dates in plan_date + deadline cols
      const dateFmt = detectSlashFmt(dataRows, [cols.plan_date, cols.deadline].filter(c => c >= 0))

      const result: ParsedOrder[] = []
      let lastPlanDate: string | null = null   // carry-forward for merged วันที่ cells
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i] as unknown[]
        if (row.every(v => !v || String(v).trim() === '')) continue
        const raw: Record<string, unknown> = {}
        headers.forEach((h, j) => { raw[h] = row[j] })

        // Carry forward วันที่ (merged cells leave subsequent rows empty)
        const rawPlanDate = cols.plan_date >= 0 ? String(row[cols.plan_date] ?? '').trim() : ''
        if (rawPlanDate) lastPlanDate = parseDate(rawPlanDate, dateFmt)

        // Only collect rows that belong to a valid วันที่ (Mon–Sat)
        if (!lastPlanDate) continue
        const _pd = new Date(lastPlanDate + 'T00:00:00')
        if (_pd.getDay() === 0) continue   // skip Sunday (not a plan day)

        const id = cols.id >= 0 ? String(row[cols.id] ?? '').trim() : ''
        // Skip: empty, dates (5/25/2026), descriptive text, formatted numbers, row-counters, Thai text
        if (!id) continue
        if (id.includes('/')) continue      // dates like 5/25/2026
        if (id.includes(' ')) continue      // descriptive text
        if (id.includes(',')) continue      // formatted numbers like 1,000 or 8,500
        if (/^\d{1,3}$/.test(id)) continue  // row sequence numbers 1-999
        if (/^[฀-๿]/.test(id)) continue    // starts with Thai character
        const kva = cols.kva >= 0 ? parseFloat(String(row[cols.kva] ?? '').replace(/,/g, '')) || 0 : 0
        const itemCode = cols.item5 >= 0 ? String(row[cols.item5] ?? '').trim() : ''
        result.push({
          id,
          customer: cols.customer >= 0 ? String(row[cols.customer] ?? '').trim() : '',
          kva,
          qty: cols.qty >= 0 ? parseInt(String(row[cols.qty] ?? '').replace(/,/g, '')) || 1 : 1,
          deadline: parseDate(cols.deadline >= 0 ? row[cols.deadline] : undefined, dateFmt),
          plan_date: lastPlanDate,
          sap_so: cols.sap_so >= 0 ? String(row[cols.sap_so] ?? '').trim() : '',
          category: cols.category >= 0 ? String(row[cols.category] ?? '').trim() : '',
          item_code: itemCode,
          comment: cols.comment >= 0 ? String(row[cols.comment] ?? '').trim() : '',
          product: itemCodeToProduct(itemCode) || (
            kva <= 50   ? 'tr.50kVA'   : kva <= 160  ? 'tr.160kVA'  :
            kva <= 300  ? 'tr.300KVA'  : kva <= 630  ? 'tr.630kVA'  :
            kva <= 1000 ? 'tr.1000kVA' : kva <= 2000 ? 'tr.2000kVA' :
            kva <= 3500 ? 'tr.3500kVA' : kva <= 7000 ? 'tr.7000kVA' : 'tr.16000kVA'
          ),
          _raw: raw,
        })
      }
      if (result.length === 0) {
        setMpResult('❌ ไม่พบข้อมูล — ตรวจสอบชื่อคอลัมน์ในไฟล์ (ต้องมี Order No, kVA, Deadline)')
        return
      }
      setMpParsed(result)
    } catch (e) { alert('อ่านไฟล์ไม่ได้: ' + (e instanceof Error ? e.message : String(e))) }
  }

  async function handleMpImport() {
    if (mpParsed.length === 0) return
    setMpImporting(true)
    try {
      const newOrders: Order[] = mpParsed.map(r => ({
        id: r.id, product: r.product, qty: r.qty, deadline: r.deadline,
        customer: r.customer, kva: r.kva, category: r.category, sap_so: r.sap_so,
        plan_date: r.plan_date, comment: r.comment, item_code: r.item_code || undefined,
      }))
      const existing = new Set(orders.map(o => o.id))
      const toAdd = newOrders.filter(o => !existing.has(o.id))
      const toUpdate = newOrders.filter(o => existing.has(o.id))
      const merged = [...orders]
      toUpdate.forEach(o => { const idx = merged.findIndex(m => m.id === o.id); if (idx >= 0) merged[idx] = o })
      toAdd.forEach(o => merged.push(o))
      dispatch({ type: 'SET_ORDERS', orders: merged })
      await api.orders.batch(merged)
      // Build per-day summary for success message
      const dayMap = new Map<string, number>()
      newOrders.forEach(o => { const d = o.plan_date || '(ไม่ระบุ)'; dayMap.set(d, (dayMap.get(d) ?? 0) + 1) })
      const daySummary = [...dayMap.entries()].sort().map(([d, n]) => `${d.slice(5)} (${n})`).join(' · ')
      const totalQty = newOrders.reduce((s, o) => s + o.qty, 0)
      setMpResult(`✅ นำเข้าสำเร็จ — ${toAdd.length} ใหม่ · ${toUpdate.length} อัปเดต · ${totalQty} เครื่อง รวม\n${daySummary}`)
      setMpParsed([])
    } catch (e) {
      setMpResult('❌ เกิดข้อผิดพลาด: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setMpImporting(false) }
  }

  // ── Master Plan (coil-format) handlers ──

  async function handleMpCoilFile(file: File) {
    setMpCoilResult(null); setMpCoilParsed([]); setMpCoilActiveDay(null); setMpCoilMapOpen(false)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rawRows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const rows: string[][] = rawRows.map(row =>
        (row as unknown[]).map(cell => {
          if (cell == null) return ''
          if (cell instanceof Date) return `${cell.getDate()}/${cell.getMonth() + 1}/${cell.getFullYear()}`
          if (typeof cell === 'number' && cell > 40000 && cell < 50000) {
            type SSFMod = { parse_date_code?: (n: number) => { d: number; m: number; y: number } }
            const ssf = (XLSX as Record<string, unknown>).SSF as SSFMod | undefined
            const d = ssf?.parse_date_code?.(cell)
            if (d) return `${d.d}/${d.m}/${d.y}`
          }
          return String(cell).trim()
        })
      )
      if (rows.length < 2) { alert('ไม่พบข้อมูลในไฟล์'); return }
      const { rows: result, headers, colMap } = parseCoilPlan(rows)
      setMpCoilParsed(result)
      setMpCoilHeaders(headers)
      setMpCoilColMap(colMap)
    } catch (e) { setMpCoilResult('❌ ' + (e instanceof Error ? e.message : String(e))) }
  }

  async function handleMpCoilImport() {
    if (mpCoilParsed.length === 0) return
    setMpCoilImporting(true)
    try {
      const newOrders: Order[] = mpCoilParsed.map((r, idx) => {
        const deadline = dmyToISO(r.due_so) || dmyToISO(r.enter_test) || r.plan_date || localISO(new Date(Date.now() + 30 * 86400000))
        const id = `${r.plan_date}_${String(idx).padStart(4, '0')}_${r.sap_so || 'x'}`
        const d = new Date(r.plan_date + 'T00:00:00')
        const dow = d.getDay()
        d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
        const week_start = localISO(d)
        return {
          id,
          product: itemCodeToProduct(r.item_code) || (r.kva <= 160 ? 'tr.160kVA' : r.kva <= 630 ? 'tr.630kVA' : r.kva <= 2000 ? 'tr.2000kVA' : 'tr.4000kVA'),
          qty: r.qty || 1,
          deadline: deadline!,
          customer: r.customer,
          kva: r.kva,
          category: r.importance || '',
          sap_so: r.sap_so,
          plan_date: r.plan_date,
          comment: r.comment,
          item_code: r.item_code,
          week_start,
          seq: r.seq || idx,
          plant: r.plant,
          electrical: r.electrical,
          total_kva: r.total_kva,
          enter_test: r.enter_test,
          cable_box: r.cable_box,
          control: r.control,
          due_store: r.due_store,
          due_so: r.due_so,
          adjust_plan: r.adjust_plan,
          due_clamp: r.due_clamp,
          due_box_ctrl: r.due_box_ctrl,
          raw_mat: r.raw_mat,
          lv: r.lv,
          hv: r.hv,
        }
      })
      const existing = new Set(orders.map(o => o.id))
      const toAdd = newOrders.filter(o => !existing.has(o.id))
      const toUpdate = newOrders.filter(o => existing.has(o.id))
      const merged = [...orders]
      toUpdate.forEach(o => { const i = merged.findIndex(m => m.id === o.id); if (i >= 0) merged[i] = o })
      toAdd.forEach(o => merged.push(o))
      dispatch({ type: 'SET_ORDERS', orders: merged })
      await api.orders.batch(merged)
      const dayMap = new Map<string, number>()
      newOrders.forEach(o => { const d = o.plan_date || '(ไม่ระบุ)'; dayMap.set(d, (dayMap.get(d) ?? 0) + 1) })
      const daySummary = [...dayMap.entries()].sort().map(([d, n]) => `${d.slice(5)} (${n})`).join(' · ')
      const totalQty = newOrders.reduce((s, o) => s + o.qty, 0)
      setMpCoilResult(`✅ นำเข้าสำเร็จ — ${toAdd.length} ใหม่ · ${toUpdate.length} อัปเดต · ${totalQty} เครื่อง\n${daySummary}`)
      setMpCoilParsed([])
    } catch (e) {
      setMpCoilResult('❌ เกิดข้อผิดพลาด: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setMpCoilImporting(false) }
  }

  // ── Plan Detail handlers ──

  async function handlePdFile(file: File) {
    setPdResult(null); setPdParsed([])
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { cellDates: false, raw: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
      if (rows.length < 2) { alert('ไม่พบข้อมูลในไฟล์'); return }
      const headerRowIdx = findHeaderRow(rows)
      const headers = (rows[headerRowIdx] as unknown[]).map(h => String(h ?? '').trim())
      const dataRows = rows.slice(headerRowIdx + 1)
      const cols = guessPlanDetailCols(headers, dataRows)
      const dateFmt = detectSlashFmt(dataRows, [cols.plan_date, cols.deadline].filter(c => c >= 0))
      const result: ParsedPlanDetail[] = []
      let lastPlanDate: string | null = null
      let seq = 0
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i] as unknown[]
        if (row.every(v => !v || String(v).trim() === '')) continue
        const rawPlanDate = cols.plan_date >= 0 ? String(row[cols.plan_date] ?? '').trim() : ''
        if (rawPlanDate) { lastPlanDate = parseDate(rawPlanDate, dateFmt); seq = 0 }
        if (!lastPlanDate) continue
        const d = new Date(lastPlanDate + 'T00:00:00')
        if (isNaN(d.getTime()) || d.getDay() === 0) continue
        const id = cols.id >= 0 ? String(row[cols.id] ?? '').trim() : ''
        if (!id || id.includes('/') || id.includes(' ') || id.includes(',') || /^\d{1,3}$/.test(id) || /^[฀-๿]/.test(id)) continue
        const kva = cols.kva >= 0 ? parseFloat(String(row[cols.kva] ?? '').replace(/,/g, '')) || 0 : 0
        const itemCode = cols.item5 >= 0 ? String(row[cols.item5] ?? '').trim() : ''
        const rawFaceMm = cols.face_mm >= 0 ? String(row[cols.face_mm] ?? '').replace(/,/g, '').trim() : ''
        const faceMm = rawFaceMm ? parseInt(rawFaceMm) || null : null
        result.push({
          week_start: planDateToWeekStart(lastPlanDate),
          plan_date: lastPlanDate,
          seq: seq++,
          sap_so: id,
          item_code: itemCode,
          product: itemCodeToProduct(itemCode) || (kva <= 160 ? 'tr.160kVA' : kva <= 630 ? 'tr.630kVA' : kva <= 1600 ? 'tr.1600kVA' : 'tr.4000kVA'),
          customer: cols.customer >= 0 ? String(row[cols.customer] ?? '').trim() : '',
          kva,
          qty: cols.qty >= 0 ? parseInt(String(row[cols.qty] ?? '').replace(/,/g, '')) || 1 : 1,
          deadline: parseDate(cols.deadline >= 0 ? row[cols.deadline] : undefined, dateFmt),
          face_mm: faceMm,
          electrical: cols.electrical >= 0 ? String(row[cols.electrical] ?? '').trim() : '',
          hv: cols.hv >= 0 ? String(row[cols.hv] ?? '').trim() : '',
          lv: cols.lv >= 0 ? String(row[cols.lv] ?? '').trim() : '',
          comment: cols.comment >= 0 ? String(row[cols.comment] ?? '').trim() : '',
          category: cols.category >= 0 ? String(row[cols.category] ?? '').trim() : '',
        })
      }
      if (result.length === 0) { setPdResult('❌ ไม่พบข้อมูล — ตรวจสอบชื่อคอลัมน์ (ต้องมี Order No, kVA, Deadline)'); return }
      setPdParsed(result)
    } catch (e) { alert('อ่านไฟล์ไม่ได้: ' + (e instanceof Error ? e.message : String(e))) }
  }

  async function handlePdImport() {
    if (pdParsed.length === 0) return
    setPdImporting(true)
    try {
      const res = await fetch('/api/plan-orders/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pdParsed),
      })
      if (!res.ok) throw new Error(await res.text())
      const { inserted } = await res.json()
      const weeks = [...new Set(pdParsed.map(r => r.week_start))].sort()
      const totalQty = pdParsed.reduce((s, r) => s + r.qty, 0)
      setPdResult(`✅ นำเข้าสำเร็จ — ${inserted} รายการ · ${totalQty} เครื่อง · ${weeks.length} สัปดาห์ (${weeks.join(', ')})`)
      setPdParsed([])
    } catch (e) {
      setPdResult('❌ เกิดข้อผิดพลาด: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setPdImporting(false) }
  }

  function toggleMpSort(col: string) {
    if (mpSortCol === col) setMpSortDir(d => -d)
    else { setMpSortCol(col); setMpSortDir(1) }
  }

  const sortedMp = [...mpParsed].sort((a, b) => {
    const av = (a as unknown as Record<string, unknown>)[mpSortCol] ?? ''
    const bv = (b as unknown as Record<string, unknown>)[mpSortCol] ?? ''
    return String(av).localeCompare(String(bv)) * mpSortDir
  })

  const DAY_TH = ['อา','จ','อ','พ','พฤ','ศ','ส']
  const grouped = useMemo(() => {
    const map = new Map<string, ParsedOrder[]>()
    for (const r of mpParsed) {
      const key = r.plan_date || '(ไม่ระบุวัน)'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, rows]) => {
      const d = new Date(date + 'T00:00:00')
      const dayLabel = isNaN(d.getTime()) ? '' : DAY_TH[d.getDay()]
      const sorted = [...rows].sort((a, b) => {
        const av = (a as unknown as Record<string, unknown>)[mpSortCol] ?? ''
        const bv = (b as unknown as Record<string, unknown>)[mpSortCol] ?? ''
        return String(av).localeCompare(String(bv)) * mpSortDir
      })
      return { date, dayLabel, rows: sorted, totalKva: rows.reduce((s, r) => s + r.kva * r.qty, 0), totalQty: rows.reduce((s, r) => s + r.qty, 0) }
    })
  }, [mpParsed, mpSortCol, mpSortDir])

  // ── Employees handlers ──

  async function handleEmpFile(file: File) {
    setEmpResult(null); setEmpParsed([]); setEmpRawRows([]); setEmpHeaders([])
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { cellDates: false, raw: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
      if (rows.length < 2) { alert('ไม่พบข้อมูลในไฟล์'); return }

      const headerRowIdx = findHeaderRow(rows)
      const headers = (rows[headerRowIdx] as unknown[]).map(h => String(h ?? '').trim())
      const cols = guessEmpCols(headers)
      setEmpHeaders(headers)
      setEmpColMap(cols as Record<string, number>)
      setEmpRawRows(rows.slice(headerRowIdx + 1).filter(r => (r as unknown[]).some(v => v != null && String(v).trim() !== '')))

      const result: ParsedEmployee[] = []
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i] as unknown[]
        if (row.every(v => !v || String(v).trim() === '')) continue
        const name = cols.name >= 0 ? String(row[cols.name] ?? '').trim() : ''
        const id = cols.id >= 0 ? String(row[cols.id] ?? '').trim() : ''
        if (!name && !id) continue   // skip rows with neither name nor id
        result.push({
          wc:        cols.wc        >= 0 ? String(row[cols.wc] ?? '').trim() : '',
          id:        id || `EMP-${i}`,
          name,
          title:     cols.title     >= 0 ? String(row[cols.title] ?? '').trim() : '',
          dept:      cols.dept      >= 0 ? String(row[cols.dept] ?? '').trim() : '',
          is_active: cols.is_active >= 0 ? parseBool(row[cols.is_active]) : true,
          is_head:   cols.is_head   >= 0 ? parseBool(row[cols.is_head]) : false,
        })
      }
      if (result.length === 0) {
        setEmpResult('❌ ไม่พบข้อมูลพนักงาน — ตรวจสอบชื่อคอลัมน์ในไฟล์')
        return
      }
      setEmpParsed(result)
    } catch (e) { alert('อ่านไฟล์ไม่ได้: ' + (e instanceof Error ? e.message : String(e))) }
  }

  async function handleEmpLoad() {
    if (empParsed.length === 0) return
    // Build EmpDir format for backend: { wc_id: { dept, employees[] } }
    const empDir: EmpDir = {}
    empParsed.forEach(e => {
      const wc = e.wc || 'UNKNOWN'
      if (!empDir[wc]) empDir[wc] = { dept: e.dept, employees: [] }
      empDir[wc].employees.push({ id: e.id, name: e.name, title: e.title, dept: e.dept, wc, is_active: e.is_active, is_head: e.is_head })
    })
    // Local state: flatten to Record<string, Employee[]>
    const empState: Record<string, Employee[]> = {}
    Object.entries(empDir).forEach(([wc, { employees: list }]) => { empState[wc] = list })
    dispatch({ type: 'SET_EMPLOYEES', employees: empState })
    setEmpParsed([]); setEmpRawRows([]); setEmpHeaders([])
    // Save to backend
    try {
      await api.employees.batch(empDir)
      setEmpResult(`โหลดสำเร็จ — ${Object.values(empDir).reduce((s, d) => s + d.employees.length, 0)} คน จาก ${Object.keys(empDir).length} Work Centers`)
    } catch {
      setEmpResult(`โหลดเข้าระบบแล้ว แต่บันทึก DB ไม่ได้ (ตรวจสอบ backend)`)
    }
  }

  // ── Catalog handlers ──

  async function handleCatFile(file: File) {
    setCatResult(null); setCatParsed([])
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false })
      if (rows.length < 2) { alert('ไม่พบข้อมูลในไฟล์'); return }
      const headers = (rows[0] as string[]).map(h => String(h ?? ''))
      const cols = guessCatalogCols(headers)
      const result: ParsedCatalog[] = []
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] as unknown[]
        if ((row as unknown[]).every(v => !v)) continue
        const key = cols.key >= 0 ? String(row[cols.key] ?? '').trim() : `PROD-${i}`
        if (!key) continue
        result.push({
          key,
          label:   cols.label   >= 0 ? String(row[cols.label] ?? '').trim() : key,
          kva:     cols.kva     >= 0 ? parseFloat(String(row[cols.kva] ?? '0')) || 0 : 0,
          std_hrs: cols.std_hrs >= 0 ? parseFloat(String(row[cols.std_hrs] ?? '0')) || 0 : 0,
        })
      }
      setCatParsed(result)
    } catch (e) { alert('อ่านไฟล์ไม่ได้: ' + (e instanceof Error ? e.message : String(e))) }
  }

  function handleCatLoad() {
    if (catParsed.length === 0) return
    const newProds: Record<string, Product> = {}
    catParsed.forEach(c => {
      newProds[c.key] = { label: c.label || c.key, kva: c.kva, std_hrs: c.std_hrs, ops: products[c.key]?.ops ?? [] }
    })
    dispatch({ type: 'SET_PRODUCTS', products: newProds })
    setCatResult(`โหลดสำเร็จ — ${catParsed.length} รุ่นเข้า Catalog`)
    setCatParsed([])
  }

  // ── SAP handlers ──

  function guessSapCols(headers: string[]) {
    const lo = headers.map(h => h.toLowerCase().replace(/[\s_\-]/g, ''))
    const find = (...keys: string[]) => { for (const k of keys) { const i = lo.findIndex(h => h.includes(k)); if (i >= 0) return i } return -1 }
    return {
      order_no:      find('ordernumber','orderno','order','aufnr','materialdocument'),
      material_code: find('materialorder','material','matnr','itemcode','item5'),
      wc_id:         find('workcenter','workctr','arbpl'),
      operation:     find('optext','operation','activity','ltxa1','description'),
      std_hrs:       find('stdactivitytype3','stdhrs','standardhours','standardlabor','planarbeit','arbeit'),
      is_confirmed:  find('isconfirm','isconfirmed','confirmed','bestaetig'),
      plant:         find('plant','werk'),
    }
  }

  async function handleSapFile(file: File) {
    setSapRows([]); setSapHeaders([]); setSapResult(null)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false })
      if (rows.length < 2) { alert('ไม่พบข้อมูลในไฟล์'); return }
      setSapHeaders((rows[0] as string[]).map(h => String(h ?? '')))
      setSapRows(rows.slice(1).filter(r => (r as unknown[]).some(v => v != null && v !== '')))
    } catch (e) { alert('อ่านไฟล์ไม่ได้: ' + (e instanceof Error ? e.message : String(e))) }
  }

  async function handleSapImport() {
    if (sapRows.length === 0) return
    setSapImporting(true); setSapResult(null)
    try {
      const cols = guessSapCols(sapHeaders)
      const knownIdxSet = new Set(Object.values(cols).filter(i => i >= 0))
      const g = (row: unknown[], idx: number) => idx >= 0 ? String((row[idx] as unknown) ?? '').trim() : ''
      const payload = sapRows.map(row => {
        const extra: Record<string, string> = {}
        sapHeaders.forEach((h, i) => {
          if (!knownIdxSet.has(i) && h) extra[h] = String((row as unknown[])[i] ?? '').trim()
        })
        return {
          order_no:      g(row as unknown[], cols.order_no),
          material_code: g(row as unknown[], cols.material_code),
          wc_id:         g(row as unknown[], cols.wc_id),
          operation:     g(row as unknown[], cols.operation),
          std_hrs:       cols.std_hrs >= 0 ? parseFloat(String((row as unknown[])[cols.std_hrs] ?? '0').replace(/,/g,'')) || 0 : 0,
          is_confirmed:  cols.is_confirmed >= 0 ? parseBool((row as unknown[])[cols.is_confirmed]) : false,
          plant:         g(row as unknown[], cols.plant),
          extra,
        }
      })
      const res = await fetch('/api/sap-routing/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      const { inserted } = await res.json()
      const wcCount = new Set(payload.map(r => r.wc_id).filter(Boolean)).size
      const orderCount = new Set(payload.map(r => r.order_no).filter(Boolean)).size
      setSapResult(`✅ บันทึกสำเร็จ — ${inserted} operations · ${orderCount} orders · ${wcCount} WC`)
    } catch (e) {
      setSapResult('❌ ' + (e instanceof Error ? e.message : String(e)))
    } finally { setSapImporting(false) }
  }

  // ── Coil Plan handlers ──

  async function handleCoilFile(file: File) {
    setCoilResult(null); setCoilParsed([])
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      // Mirrors test.html readExcelFile exactly: { type:'array' } default options
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rawRows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      // Convert each cell to string — same logic as test.html
      const rows: string[][] = rawRows.map(row =>
        (row as unknown[]).map(cell => {
          if (cell == null) return ''
          if (cell instanceof Date)
            return `${cell.getDate()}/${cell.getMonth() + 1}/${cell.getFullYear()}`
          if (typeof cell === 'number' && cell > 40000 && cell < 50000) {
            type SSFMod = { parse_date_code?: (n: number) => { d: number; m: number; y: number } }
            const ssf = (XLSX as Record<string, unknown>).SSF as SSFMod | undefined
            const d = ssf?.parse_date_code?.(cell)
            if (d) return `${d.d}/${d.m}/${d.y}`
          }
          return String(cell).trim()
        })
      )
      if (rows.length < 2) { alert('ไม่พบข้อมูลในไฟล์'); return }
      const result = parseCoilPlan(rows)
      setCoilParsed(result)
    } catch (e) { setCoilResult('❌ ' + (e instanceof Error ? e.message : String(e))) }
  }

  async function handleCoilImport() {
    if (coilParsed.length === 0) return
    setCoilImporting(true)
    try {
      const weekStart = coilParsed.reduce((min, r) => r.plan_date < min ? r.plan_date : min, coilParsed[0].plan_date)
      const { inserted } = await api.coilPlan.batch(coilParsed, weekStart)
      const dayMap = new Map<string, number>()
      coilParsed.forEach(r => { const d = r.plan_date; dayMap.set(d, (dayMap.get(d) ?? 0) + 1) })
      const daySummary = [...dayMap.entries()].sort().map(([d, n]) => `${d.slice(5)} (${n})`).join(' · ')
      setCoilResult(`✅ นำเข้าสำเร็จ — ${inserted} รายการ\n${daySummary}`)
      setCoilParsed([])
    } catch (e) {
      setCoilResult('❌ ' + (e instanceof Error ? e.message : String(e)))
    } finally { setCoilImporting(false) }
  }

  const coilGrouped = useMemo(() => {
    const map = new Map<string, ParsedCoilRow[]>()
    for (const r of coilParsed) {
      if (!map.has(r.plan_date)) map.set(r.plan_date, [])
      map.get(r.plan_date)!.push(r)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, rows]) => {
      const d = new Date(date + 'T00:00:00')
      return { date, dayLabel: isNaN(d.getTime()) ? '' : DAY_TH[d.getDay()], rows, totalQty: rows.reduce((s, r) => s + r.qty, 0), totalKva: rows.reduce((s, r) => s + r.total_kva, 0) }
    })
  }, [coilParsed])

  const SAP_CONFIRM_IDX = sapHeaders.findIndex(h => /is.?confirm/i.test(h))
  const SAP_WC_IDX      = sapHeaders.findIndex(h => /workcenter|work.center/i.test(h))
  const SAP_ORDER_IDX   = sapHeaders.findIndex(h => /ordernumber|order.?no|^order$/i.test(h))

  // ── Render ──

  const SUB_TABS: { id: SubTab; label: string }[] = [
    { id: 'masterplan',  label: 'Master Plan' },
    { id: 'plandetail',  label: '🗂 Plan (Legacy)' },
    { id: 'coilplan',    label: 'Coil Plan' },
    { id: 'employees',   label: 'พนักงาน' },
    { id: 'catalog',     label: 'Catalog' },
    { id: 'sap',         label: 'SAP' },
    { id: 'routing_cr',  label: 'Routing CR' },
    { id: 'routing_hv',  label: 'Routing HV' },
    { id: 'routing_lv',  label: 'Routing LV' },
    { id: 'help',        label: 'คู่มือ' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', padding: '1.25rem 1.5rem' }}>
      {/* Header + sub-tab buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>📥 Import Data</div>
          <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 2 }}>นำเข้าข้อมูลจาก Excel / CSV</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {SUB_TABS.map(s => (
            <button key={s.id} onClick={() => setSubTab(s.id)}
              style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: '1px solid var(--bord2)', background: subTab === s.id ? 'var(--blue)' : 'var(--bg3)', color: subTab === s.id ? '#000' : 'var(--txt2)', cursor: 'pointer', fontWeight: subTab === s.id ? 700 : 400 }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ────────────── MASTER PLAN (coil format) ────────────── */}
      {subTab === 'masterplan' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {mpCoilParsed.length === 0 && (
            <DropZone dragOver={mpCoilDragOver} setDragOver={setMpCoilDragOver} fileRef={mpCoilFileRef}
              onFile={handleMpCoilFile} label="วางไฟล์ Excel Master Plan (รูปแบบเดียวกับ Coil Plan) ที่นี่" />
          )}
          {mpCoilResult && <ResultBanner msg={mpCoilResult} onClear={() => setMpCoilResult(null)} />}
          {mpCoilParsed.length > 0 && (() => {
            const DAY_TH = ['อา','จ','อ','พ','พฤ','ศ','ส']
            const dayMap = new Map<string, ParsedCoilRow[]>()
            mpCoilParsed.forEach(r => { if (!dayMap.has(r.plan_date)) dayMap.set(r.plan_date, []); dayMap.get(r.plan_date)!.push(r) })
            const days = [...dayMap.entries()].sort((a,b) => a[0].localeCompare(b[0])).map(([date, rows]) => {
              const d = new Date(date + 'T00:00:00')
              return { date, dayLabel: isNaN(d.getTime()) ? '' : DAY_TH[d.getDay()], rows, totalQty: rows.reduce((s,r)=>s+r.qty,0), totalKva: rows.reduce((s,r)=>s+r.kva*r.qty,0) }
            })
            const activeDay = mpCoilActiveDay
            const visibleDays = activeDay ? days.filter(d => d.date === activeDay) : days
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{mpCoilParsed.length} รายการ</div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)', marginRight: 'auto' }}>
                    {days.reduce((s,d)=>s+d.totalQty,0)} เครื่อง · {days.reduce((s,d)=>s+d.totalKva,0).toLocaleString()} kVA · ตรวจสอบก่อนกด Import
                  </div>
                  <button onClick={() => setMpCoilParsed([])} style={cancelBtn}>✕ ยกเลิก</button>
                  <button onClick={handleMpCoilImport} disabled={mpCoilImporting}
                    style={{ ...importBtn, background: mpCoilImporting ? 'var(--bord2)' : 'var(--green)' }}>
                    {mpCoilImporting ? 'กำลังนำเข้า…' : `✓ Import ${mpCoilParsed.length} รายการ`}
                  </button>
                </div>
                {/* Day filter chips — click to filter table, click again to show all */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, flexShrink: 0 }}>
                  {days.map(({ date, dayLabel, rows, totalQty, totalKva }) => {
                    const isActive = activeDay === date
                    return (
                      <button key={date} onClick={() => setMpCoilActiveDay(isActive ? null : date)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                          background: isActive ? 'rgba(137,180,250,.2)' : 'var(--bg3)',
                          border: `1px solid ${isActive ? 'rgba(137,180,250,.5)' : 'var(--bord)'}`,
                          fontSize: 11, outline: 'none' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue)' }}>{date.slice(5)}</span>
                        <span style={{ color: 'var(--txt3)', fontSize: 10 }}>{dayLabel}</span>
                        <span style={{ color: 'var(--txt2)', fontWeight: isActive ? 700 : 400 }}>{rows.length} รายการ</span>
                        <span style={{ color: 'var(--txt3)' }}>·</span>
                        <span style={{ color: 'var(--amber)', fontFamily: 'var(--mono)' }}>{totalQty} ตัว</span>
                        <span style={{ color: 'var(--txt3)' }}>·</span>
                        <span style={{ color: 'var(--txt3)', fontSize: 10 }}>{totalKva.toLocaleString()} kVA</span>
                      </button>
                    )
                  })}
                  {activeDay && <button onClick={() => setMpCoilActiveDay(null)} style={{ ...cancelBtn, fontSize: 10, padding: '3px 8px', borderRadius: 14 }}>✕ ทั้งหมด</button>}
                </div>
                {/* Column mapping panel — collapsible */}
                {mpCoilHeaders.length > 0 && (() => {
                  const FIELD_LABEL: Record<string, string> = {
                    date:'Plan Date', seq:'Sequence', importance:'Importance',
                    sap:'SAP SO', itemcode:'Item Code ⭐', comment:'Comment',
                    plant:'Plant', kva:'kVA', elec:'Electrical', customer:'Customer',
                    totalKva:'Total kVA', qty:'Quantity', enterTest:'Enter Test',
                    cable:'Cable Box', control:'Control', dueStore:'Due Store',
                    dueSO:'Due SO', adjustPlan:'Adjust Plan', dueClamp:'Due Clamp',
                    dueBox:'Due Box', dueCtrlBox:'Due Ctrl Box', rawMat:'Raw Mat',
                    lv:'LV', hv:'HV',
                  }
                  const colToField: Record<number, string> = {}
                  for (const [field, idx] of Object.entries(mpCoilColMap)) {
                    if (idx >= 0) colToField[idx] = FIELD_LABEL[field] ?? field
                  }
                  const collected = Object.values(mpCoilColMap).filter(i => i >= 0).length
                  return (
                    <div style={{ marginBottom: 8, border: '1px solid var(--bord)', borderRadius: 8, flexShrink: 0, overflow: 'hidden' }}>
                      <button onClick={() => setMpCoilMapOpen(v => !v)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--bg2)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Column Mapping — {collected} / {mpCoilHeaders.length} collected
                        </span>
                        <span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 'auto' }}>{mpCoilMapOpen ? '▲' : '▼'}</span>
                      </button>
                      {mpCoilMapOpen && (
                        <div style={{ padding: '6px 12px 10px', display: 'flex', flexWrap: 'wrap', gap: 5, background: 'var(--bg2)' }}>
                          {mpCoilHeaders.map((h, i) => {
                            const field = colToField[i]
                            const isKey = field?.includes('⭐')
                            return (
                              <div key={i} style={{
                                fontSize: 10, padding: '3px 8px', borderRadius: 6,
                                background: field ? (isKey ? 'rgba(250,179,135,.2)' : 'rgba(166,227,161,.15)') : 'var(--bg3)',
                                border: `1px solid ${field ? (isKey ? 'rgba(250,179,135,.4)' : 'rgba(166,227,161,.3)') : 'var(--bord)'}`,
                                color: field ? (isKey ? 'var(--amber)' : 'var(--green)') : 'var(--txt3)',
                              }}>
                                <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{h || `col${i}`}</span>
                                {field && <span style={{ marginLeft: 4, opacity: 0.8 }}>→ {field}</span>}
                                {!field && <span style={{ marginLeft: 4, opacity: 0.5 }}>not collected</span>}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })()}
                {/* Preview table */}
                <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8 }}>
                  <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                    <thead>
                      <tr>
                        {([
                          ['ลำดับ','center'],['ความสำคัญ','center'],['SAP SO','left'],
                          ['Item Code','left'],['Comment','left'],['Plant','left'],
                          ['kVA','right'],['ระบบไฟฟ้า','center'],['ลูกค้า','left'],
                          ['Total kVA','right'],['จำนวน','center'],['เข้าเทส','left'],
                          ['Cable Box','left'],['Control','left'],['กำหนดส่งสโตร์','left'],
                          ['DUE SO','left'],['แจ้งปรับแผน','left'],['Due Clamp','left'],
                          ['Due BOX/CTRL','left'],['Raw Mat','left'],['LV','left'],['HV','left'],
                        ] as [string,string][]).map(([label, align]) => (
                          <th key={label} style={{ ...thStyle, textAlign: align as 'left'|'center'|'right' }}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleDays.map(({ date, dayLabel, rows, totalQty, totalKva }) => (
                        <>
                          <tr key={'hdr-'+date} style={{ background: 'rgba(137,180,250,.07)', borderTop: '2px solid rgba(137,180,250,.2)' }}>
                            <td colSpan={22} style={{ ...tdStyle, padding: '7px 12px' }}>
                              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12, color: 'var(--blue)' }}>📅 {date}</span>
                              {dayLabel && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--txt3)', fontWeight: 600 }}>{dayLabel}</span>}
                              <span style={{ marginLeft: 14, fontSize: 11, color: 'var(--txt2)' }}>{rows.length} รายการ · {totalQty} ตัว · {Math.round(totalKva).toLocaleString()} kVA</span>
                            </td>
                          </tr>
                          {rows.map((r, i) => {
                            const catColor = r.importance === 'หลัก' ? 'var(--blue)' : r.importance === 'เสริม' ? 'var(--green)' : 'var(--txt3)'
                            const dim: React.CSSProperties = { ...tdStyle, fontSize: 10, whiteSpace: 'nowrap' }
                            const mono: React.CSSProperties = { ...dim, fontFamily: 'var(--mono)' }
                            return (
                              <tr key={date+i} style={{ borderLeft: `3px solid ${catColor}` }}>
                                <td style={{ ...mono, textAlign: 'center', color: 'var(--txt3)' }}>{r.seq}</td>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                  {r.importance ? (
                                    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                                      background: r.importance === 'หลัก' ? 'rgba(137,180,250,.18)' : r.importance === 'เสริม' ? 'rgba(166,227,161,.18)' : 'var(--bg3)',
                                      color: catColor }}>{r.importance}</span>
                                  ) : <span style={{ color: 'var(--txt3)', fontSize: 10 }}>—</span>}
                                </td>
                                <td style={{ ...mono, fontWeight: 700, color: 'var(--amber)' }}>{r.sap_so || '—'}</td>
                                <td style={{ ...mono, color: 'var(--blue)', fontSize: 10 }}>{r.item_code || '—'}</td>
                                <td style={{ ...dim, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.comment || '—'}</td>
                                <td style={{ ...dim, color: 'var(--txt3)' }}>{r.plant || '—'}</td>
                                <td style={{ ...mono, textAlign: 'right', color: 'var(--blue)', fontWeight: 700 }}>{r.kva.toLocaleString()}</td>
                                <td style={{ ...dim, textAlign: 'center' }}>{r.electrical || '—'}</td>
                                <td style={{ ...dim, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customer || '—'}</td>
                                <td style={{ ...mono, textAlign: 'right' }}>{r.total_kva.toLocaleString()}</td>
                                <td style={{ ...mono, textAlign: 'center', fontWeight: 700 }}>{r.qty}</td>
                                <td style={mono}>{r.enter_test || '—'}</td>
                                <td style={dim}>{r.cable_box || '—'}</td>
                                <td style={dim}>{r.control || '—'}</td>
                                <td style={mono}>{r.due_store || '—'}</td>
                                <td style={{ ...mono, color: 'var(--amber)' }}>{r.due_so || '—'}</td>
                                <td style={mono}>{r.adjust_plan || '—'}</td>
                                <td style={mono}>{r.due_clamp || '—'}</td>
                                <td style={mono}>{r.due_box_ctrl || '—'}</td>
                                <td style={{ ...dim, color: 'var(--txt2)' }}>{r.raw_mat || '—'}</td>
                                <td style={{ ...dim, color: 'var(--txt2)' }}>{r.lv || '—'}</td>
                                <td style={{ ...dim, color: 'var(--txt2)' }}>{r.hv || '—'}</td>
                              </tr>
                            )
                          })}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ────────────── PLAN ORDERS (DETAIL) ────────────── */}
      {subTab === 'plandetail' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {pdParsed.length === 0 && (
            <DropZone dragOver={pdDragOver} setDragOver={setPdDragOver} fileRef={pdFileRef}
              onFile={handlePdFile} label="วางไฟล์ Excel Master Plan (รายละเอียด) ที่นี่" />
          )}
          {pdResult && <ResultBanner msg={pdResult} onClear={() => setPdResult(null)} />}
          {pdParsed.length > 0 && (() => {
            const weeks = [...new Set(pdParsed.map(r => r.week_start))].sort()
            const totalQty = pdParsed.reduce((s, r) => s + r.qty, 0)
            const totalKva = pdParsed.reduce((s, r) => s + r.kva * r.qty, 0)
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{pdParsed.length} รายการ</div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)', marginRight: 'auto' }}>
                    {totalQty} ตัว · {totalKva.toLocaleString()} kVA รวม · {weeks.length} สัปดาห์ — ตรวจสอบก่อนกด Import
                  </div>
                  <button onClick={() => setPdParsed([])} style={cancelBtn}>✕ ยกเลิก</button>
                  <button onClick={handlePdImport} disabled={pdImporting}
                    style={{ ...importBtn, background: pdImporting ? 'var(--bord2)' : 'var(--green)' }}>
                    {pdImporting ? 'กำลังนำเข้า…' : `✓ Import ${pdParsed.length} รายการ`}
                  </button>
                </div>

                {/* Week summary */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {weeks.map(w => {
                    const wRows = pdParsed.filter(r => r.week_start === w)
                    return (
                      <div key={w} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'var(--bg3)', border: '1px solid var(--bord)', fontSize: 11 }}>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue)' }}>{w}</span>
                        <span style={{ color: 'var(--txt2)' }}>{wRows.length} ออเดอร์</span>
                        <span style={{ color: 'var(--txt3)' }}>·</span>
                        <span style={{ color: 'var(--amber)', fontFamily: 'var(--mono)' }}>{wRows.reduce((s,r)=>s+r.qty,0)} ตัว</span>
                        <span style={{ color: 'var(--txt3)' }}>·</span>
                        <span style={{ color: 'var(--txt3)', fontSize: 10 }}>{wRows.reduce((s,r)=>s+r.kva*r.qty,0).toLocaleString()} kVA</span>
                      </div>
                    )
                  })}
                </div>

                {/* Preview table */}
                <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
                    <thead><tr>
                      {['สัปดาห์','วันที่','SAP SO','Item Code','ลูกค้า','kVA','จำนวน','Deadline','หน้ากว้าง (mm)','ระบบไฟฟ้า','HV','LV','ประเภท','Comment'].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {pdParsed.map((r, i) => (
                        <tr key={i} style={{ background: i % 2 ? 'var(--bg3)' : undefined }}>
                          <td style={{ ...tdStyle, fontFamily: 'var(--mono)', color: 'var(--blue)', fontWeight: 700 }}>{r.week_start}</td>
                          <td style={{ ...tdStyle, fontFamily: 'var(--mono)', color: 'var(--txt2)' }}>{r.plan_date}</td>
                          <td style={{ ...tdStyle, fontFamily: 'var(--mono)', color: 'var(--amber)' }}>{r.sap_so}</td>
                          <td style={{ ...tdStyle, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--txt3)' }}>{r.item_code || '—'}</td>
                          <td style={tdStyle}>{r.customer || '—'}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.kva}</td>
                          <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'var(--mono)' }}>{r.qty}</td>
                          <td style={{ ...tdStyle, fontFamily: 'var(--mono)', fontSize: 10 }}>{r.deadline}</td>
                          <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'var(--mono)', color: r.face_mm ? 'var(--green)' : 'var(--txt3)' }}>{r.face_mm ?? '—'}</td>
                          <td style={{ ...tdStyle, fontSize: 10 }}>{r.electrical || '—'}</td>
                          <td style={{ ...tdStyle, fontSize: 10 }}>{r.hv || '—'}</td>
                          <td style={{ ...tdStyle, fontSize: 10 }}>{r.lv || '—'}</td>
                          <td style={{ ...tdStyle, fontSize: 10 }}>{r.category || '—'}</td>
                          <td style={{ ...tdStyle, color: 'var(--txt3)' }}>{r.comment || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ────────────── COIL PLAN ────────────── */}
      {subTab === 'coilplan' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {coilParsed.length === 0 && (
            <DropZone dragOver={coilDragOver} setDragOver={setCoilDragOver} fileRef={coilFileRef}
              onFile={handleCoilFile} label="วางไฟล์ Excel แผนลงคอยล์" />
          )}
          {coilResult && <ResultBanner msg={coilResult} onClear={() => setCoilResult(null)} />}
          {coilParsed.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{coilParsed.length} รายการ Coil Plan</div>
                <div style={{ fontSize: 11, color: 'var(--txt3)', marginRight: 'auto' }}>ตรวจสอบข้อมูลก่อนกด Import</div>
                <button onClick={() => setCoilParsed([])} style={cancelBtn}>✕ ยกเลิก</button>
                <button onClick={handleCoilImport} disabled={coilImporting}
                  style={{ ...importBtn, background: coilImporting ? 'var(--bord2)' : 'var(--blue)' }}>
                  {coilImporting ? 'กำลังนำเข้า…' : `✓ Import ${coilParsed.length} รายการ`}
                </button>
              </div>
              {/* Week summary */}
              {coilGrouped.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {coilGrouped.map(({ date, dayLabel, rows, totalQty }) => (
                    <div key={date} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'var(--bg3)', border: '1px solid var(--bord)', fontSize: 11 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue)' }}>{date.slice(5)}</span>
                      <span style={{ color: 'var(--txt3)', fontSize: 10 }}>{dayLabel}</span>
                      <span style={{ color: 'var(--txt2)' }}>{rows.length} ออเดอร์</span>
                      <span style={{ color: 'var(--amber)', fontFamily: 'var(--mono)' }}>{totalQty} ตัว</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'rgba(137,180,250,.1)', border: '1px solid rgba(137,180,250,.3)', fontSize: 11 }}>
                    <span style={{ color: 'var(--blue)', fontWeight: 700 }}>รวม {coilGrouped.length} วัน · {coilGrouped.reduce((s, g) => s + g.totalQty, 0)} ตัว</span>
                  </div>
                </div>
              )}
              {/* Preview table — all 23 columns */}
              <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8 }}>
                <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                  <thead>
                    <tr>
                      {([
                        ['ลำดับ','center'],['ความสำคัญ','center'],['SAPSO','left'],
                        ['Itemcode','left'],['Comment','left'],['Plant','left'],
                        ['KVA','right'],['ระบบไฟฟ้า','center'],['ลูกค้า','left'],
                        ['Total KVA','right'],['จำนวน','center'],['เข้าเทส','left'],
                        ['CableBox','left'],['Control','left'],['กำหนดส่งเข้าสโตร์','left'],
                        ['DUE SO','left'],['แจ้งปรับแผนการผลิต','left'],['Due Clamp','left'],
                        ['Due BOX/CTRL BOX','left'],['Raw Mat','left'],['LV','left'],['HV','left'],
                      ] as [string,string][]).map(([label, align]) => (
                        <th key={label} style={{ ...thStyle, textAlign: align as 'left'|'center'|'right' }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {coilGrouped.map(({ date, dayLabel, rows, totalQty, totalKva }) => (
                      <>
                        <tr key={'hdr-' + date} style={{ background: 'rgba(137,180,250,.07)', borderTop: '2px solid rgba(137,180,250,.2)' }}>
                          <td colSpan={22} style={{ ...tdStyle, padding: '7px 12px' }}>
                            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12, color: 'var(--blue)' }}>📅 {date}</span>
                            {dayLabel && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--txt3)', fontWeight: 600 }}>{dayLabel}</span>}
                            <span style={{ marginLeft: 14, fontSize: 11, color: 'var(--txt2)' }}>{rows.length} รายการ · {totalQty} ตัว · {Math.round(totalKva).toLocaleString()} kVA</span>
                          </td>
                        </tr>
                        {rows.map((r, i) => {
                          const catColor = r.importance === 'หลัก' ? 'var(--blue)' : r.importance === 'เสริม' ? 'var(--green)' : 'var(--txt3)'
                          const dim: React.CSSProperties = { ...tdStyle, fontSize: 10, whiteSpace: 'nowrap' }
                          const mono: React.CSSProperties = { ...dim, fontFamily: 'var(--mono)' }
                          return (
                            <tr key={date + i} style={{ borderLeft: `3px solid ${catColor}` }}>
                              <td style={{ ...mono, textAlign: 'center', color: 'var(--txt3)' }}>{r.seq}</td>
                              <td style={{ ...tdStyle, textAlign: 'center' }}>
                                {r.importance ? (
                                  <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                                    background: r.importance === 'หลัก' ? 'rgba(137,180,250,.18)' : r.importance === 'เสริม' ? 'rgba(166,227,161,.18)' : 'var(--bg3)',
                                    color: catColor }}>{r.importance}</span>
                                ) : <span style={{ color: 'var(--txt3)', fontSize: 10 }}>—</span>}
                              </td>
                              <td style={{ ...mono, fontWeight: 700, color: 'var(--amber)' }}>{r.sap_so || '—'}</td>
                              <td style={{ ...mono, color: 'var(--txt3)' }}>{r.item_code || '—'}</td>
                              <td style={{ ...dim, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.comment || '—'}</td>
                              <td style={{ ...dim, color: 'var(--txt3)' }}>{r.plant || '—'}</td>
                              <td style={{ ...mono, textAlign: 'right', color: 'var(--blue)', fontWeight: 700 }}>{r.kva.toLocaleString()}</td>
                              <td style={{ ...dim, textAlign: 'center' }}>{r.electrical || '—'}</td>
                              <td style={{ ...dim, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customer || '—'}</td>
                              <td style={{ ...mono, textAlign: 'right' }}>{r.total_kva.toLocaleString()}</td>
                              <td style={{ ...mono, textAlign: 'center', fontWeight: 700 }}>{r.qty}</td>
                              <td style={mono}>{r.enter_test || '—'}</td>
                              <td style={dim}>{r.cable_box || '—'}</td>
                              <td style={dim}>{r.control || '—'}</td>
                              <td style={mono}>{r.due_store || '—'}</td>
                              <td style={{ ...mono, color: 'var(--amber)' }}>{r.due_so || '—'}</td>
                              <td style={mono}>{r.adjust_plan || '—'}</td>
                              <td style={mono}>{r.due_clamp || '—'}</td>
                              <td style={mono}>{r.due_box_ctrl || '—'}</td>
                              <td style={{ ...dim, color: 'var(--txt2)' }}>{r.raw_mat || '—'}</td>
                              <td style={{ ...dim, color: 'var(--txt2)' }}>{r.lv || '—'}</td>
                              <td style={{ ...dim, color: 'var(--txt2)' }}>{r.hv || '—'}</td>
                            </tr>
                          )
                        })}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ────────────── EMPLOYEES ────────────── */}
      {subTab === 'employees' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {empParsed.length === 0 && empRawRows.length === 0 && (
            <DropZone dragOver={empDragOver} setDragOver={setEmpDragOver} fileRef={empFileRef}
              onFile={handleEmpFile} label="วางไฟล์ Excel ข้อมูลพนักงาน" />
          )}
          {empResult && <ResultBanner msg={empResult} onClear={() => setEmpResult(null)} />}
          {empParsed.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <KpiCard label="พนักงานทั้งหมด" val={empParsed.length} col="var(--blue)" />
                <KpiCard label="Work Centers" val={new Set(empParsed.map(e => e.wc).filter(Boolean)).size} col="var(--amber)" />
                <KpiCard label="Active" val={empParsed.filter(e => e.is_active).length} col="var(--green)" />
                <KpiCard label="หัวหน้า" val={empParsed.filter(e => e.is_head).length} col="var(--txt2)" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>ตรวจสอบข้อมูลพนักงาน {empParsed.length} คน</div>
                <div style={{ fontSize: 10, color: 'var(--txt3)' }}>คอลัมน์ที่ตรงจะ highlight สีน้ำเงิน</div>
                <div style={{ flex: 1 }} />
                <button onClick={() => { setEmpParsed([]); setEmpRawRows([]); setEmpHeaders([]) }} style={cancelBtn}>✕ ยกเลิก</button>
                <button onClick={handleEmpLoad} style={importBtn}>✓ โหลด {empParsed.length} คน เข้าระบบ</button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      {empHeaders.map((h, hi) => {
                        const isMapped = Object.values(empColMap).includes(hi)
                        return (
                          <th key={hi} style={{ ...thStyle, background: isMapped ? 'rgba(137,180,250,.2)' : 'var(--bg3)', color: isMapped ? 'var(--blue)' : 'var(--txt3)' }}>
                            {h}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {empRawRows.slice(0, 200).map((row, ri) => (
                      <tr key={ri}>
                        {empHeaders.map((_, ci) => {
                          const isMapped = Object.values(empColMap).includes(ci)
                          return (
                            <td key={ci} style={{ ...tdStyle, fontSize: 10, background: isMapped ? 'rgba(137,180,250,.04)' : 'transparent', fontFamily: isMapped ? 'var(--mono)' : 'inherit' }}>
                              {String((row as unknown[])[ci] ?? '')}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {empRawRows.length > 200 && (
                  <div style={{ padding: '8px 14px', fontSize: 10, color: 'var(--txt3)' }}>
                    แสดง 200 จาก {empRawRows.length} แถว
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ────────────── CATALOG ────────────── */}
      {subTab === 'catalog' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {catParsed.length === 0 && (
            <DropZone dragOver={catDragOver} setDragOver={setCatDragOver} fileRef={catFileRef}
              onFile={handleCatFile} label="วางไฟล์ Excel Catalog Transformer" />
          )}
          {catResult && <ResultBanner msg={catResult} onClear={() => setCatResult(null)} />}
          {catParsed.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <KpiCard label="รุ่นทั้งหมด" val={catParsed.length} col="var(--blue)" />
                <KpiCard label="kVA ต่ำสุด" val={Math.min(...catParsed.map(c => c.kva))} col="var(--txt2)" />
                <KpiCard label="kVA สูงสุด" val={Math.max(...catParsed.map(c => c.kva))} col="var(--amber)" />
                <KpiCard label="STD hrs เฉลี่ย" val={parseFloat((catParsed.reduce((s, c) => s + c.std_hrs, 0) / catParsed.length).toFixed(1))} col="var(--green)" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>ตรวจสอบ Catalog {catParsed.length} รุ่น</div>
                <div style={{ flex: 1 }} />
                <button onClick={() => setCatParsed([])} style={cancelBtn}>✕ ยกเลิก</button>
                <button onClick={handleCatLoad} style={importBtn}>✓ โหลด {catParsed.length} รุ่น เข้า Catalog</button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      {['Key / ID', 'Label', 'kVA', 'STD hrs', 'สถานะ'].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {catParsed.map((c, i) => {
                      const exists = !!products[c.key]
                      return (
                        <tr key={i}>
                          <td style={{ ...tdStyle, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' }}>{c.key}</td>
                          <td style={tdStyle}>{c.label}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)' }}>{c.kva.toLocaleString()}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)' }}>{c.std_hrs.toFixed(1)}</td>
                          <td style={{ ...tdStyle, fontSize: 10, color: exists ? 'var(--amber)' : 'var(--green)' }}>
                            {exists ? '⟳ อัปเดต' : '+ เพิ่มใหม่'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ────────────── SAP ────────────── */}
      {subTab === 'sap' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {sapRows.length === 0 && (
            <DropZone dragOver={sapDragOver} setDragOver={setSapDragOver} fileRef={sapFileRef}
              onFile={handleSapFile} label="วางไฟล์ Excel SAP Production Orders" />
          )}
          {sapRows.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <KpiCard label="Operations" val={sapRows.length} col="var(--blue)" />
                <KpiCard label="Orders" val={SAP_ORDER_IDX >= 0 ? new Set(sapRows.map(r => String((r as unknown[])[SAP_ORDER_IDX] ?? ''))).size : sapRows.length} col="var(--amber)" />
                <KpiCard label="Work Centers" val={SAP_WC_IDX >= 0 ? new Set(sapRows.map(r => String((r as unknown[])[SAP_WC_IDX] ?? ''))).size : 0} col="var(--txt2)" />
                {SAP_CONFIRM_IDX >= 0 && <>
                  <KpiCard label="Confirmed" val={sapRows.filter(r => parseBool((r as unknown[])[SAP_CONFIRM_IDX])).length} col="var(--green)" />
                  <KpiCard label="Pending" val={sapRows.filter(r => !parseBool((r as unknown[])[SAP_CONFIRM_IDX])).length} col="var(--red)" />
                </>}
              </div>
              {sapResult && <ResultBanner msg={sapResult} onClear={() => setSapResult(null)} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{sapRows.length} Operations จาก SAP</div>
                <span style={{ fontSize: 11, color: 'var(--txt3)' }}>ตรวจสอบคอลัมน์ที่ highlight แล้วกด Import</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => { setSapRows([]); setSapHeaders([]); setSapResult(null) }} style={cancelBtn}>✕ ปิด</button>
                <button onClick={handleSapImport} disabled={sapImporting}
                  style={{ ...importBtn, background: sapImporting ? 'var(--bord2)' : 'var(--green)' }}>
                  {sapImporting ? 'กำลังบันทึก…' : `✓ Save ${sapRows.length} rows to DB`}
                </button>
              </div>
              {/* SAP Column mapping panel */}
              {sapHeaders.length > 0 && (() => {
                const sapCols = guessSapCols(sapHeaders)
                const SAP_FIELD_LABEL: Record<string, string> = {
                  order_no:'Order No', material_code:'Material Code ⭐',
                  wc_id:'Work Center ⭐', operation:'Operation',
                  std_hrs:'Std Hours ⭐', is_confirmed:'Confirmed', plant:'Plant',
                }
                const colToField: Record<number, string> = {}
                const knownIdxSet = new Set(Object.values(sapCols).filter(i => i >= 0))
                for (const [field, idx] of Object.entries(sapCols)) {
                  if (idx >= 0) colToField[idx] = SAP_FIELD_LABEL[field] ?? field
                }
                const extraCount = sapHeaders.filter((h, i) => h && !knownIdxSet.has(i)).length
                return (
                  <div style={{ marginBottom: 8, border: '1px solid var(--bord)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ padding: '6px 12px', background: 'var(--bg2)', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                      Column Mapping — {knownIdxSet.size} core fields · {extraCount} extra → all {sapHeaders.length} columns collected
                    </div>
                    <div style={{ padding: '6px 12px 10px', display: 'flex', flexWrap: 'wrap', gap: 5, background: 'var(--bg2)' }}>
                      {sapHeaders.map((h, i) => {
                        const field = colToField[i]
                        const isKey = field?.includes('⭐')
                        const isExtra = !field && h
                        return (
                          <div key={i} style={{
                            fontSize: 10, padding: '3px 8px', borderRadius: 6,
                            background: field ? (isKey ? 'rgba(250,179,135,.2)' : 'rgba(166,227,161,.15)') : isExtra ? 'rgba(137,180,250,.08)' : 'var(--bg3)',
                            border: `1px solid ${field ? (isKey ? 'rgba(250,179,135,.4)' : 'rgba(166,227,161,.3)') : isExtra ? 'rgba(137,180,250,.2)' : 'var(--bord)'}`,
                            color: field ? (isKey ? 'var(--amber)' : 'var(--green)') : isExtra ? 'var(--txt2)' : 'var(--txt3)',
                          }}>
                            <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{h || `col${i}`}</span>
                            {field && <span style={{ marginLeft: 4, opacity: 0.8 }}>→ {field}</span>}
                            {isExtra && <span style={{ marginLeft: 4, opacity: 0.6 }}>→ extra</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
              {/* Row range controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--txt3)' }}>Show rows:</span>
                {[50, 100, 500, 1000].map(n => (
                  <button key={n} onClick={() => setSapShowLimit(n)}
                    style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--bord2)', cursor: 'pointer',
                      background: sapShowLimit === n ? 'var(--blue)' : 'var(--bg3)',
                      color: sapShowLimit === n ? '#000' : 'var(--txt2)', fontWeight: sapShowLimit === n ? 700 : 400 }}>
                    {n}
                  </button>
                ))}
                <button onClick={() => setSapShowLimit(Infinity)}
                  style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--bord2)', cursor: 'pointer',
                    background: sapShowLimit === Infinity ? 'var(--amber)' : 'var(--bg3)',
                    color: sapShowLimit === Infinity ? '#000' : 'var(--txt2)', fontWeight: sapShowLimit === Infinity ? 700 : 400 }}>
                  All ({sapRows.length.toLocaleString()})
                </button>
                <span style={{ fontSize: 10, color: 'var(--txt3)', marginLeft: 6 }}>
                  Showing {Math.min(sapShowLimit, sapRows.length).toLocaleString()} / {sapRows.length.toLocaleString()} rows
                </span>
              </div>

              <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8 }}>
                <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, textAlign: 'center' }}>#</th>
                      {sapHeaders.map((h, i) => {
                        const isConfirm = /is.?confirm/i.test(h)
                        const isStdHrs  = /stdactivitytype3|stdhrs|standardhour|planarbeit/i.test(h)
                        const isWC      = /workcenter|workctr|arbpl/i.test(h)
                        const isOrder   = /ordernumber|orderno|^order$|aufnr/i.test(h)
                        const isMat     = /materialorder|material|matnr|itemcode/i.test(h)
                        const hi = isStdHrs ? { bg:'rgba(224,156,42,.15)', col:'var(--amber)' }
                                 : isConfirm ? { bg:'rgba(166,227,161,.15)', col:'var(--green)' }
                                 : isWC      ? { bg:'rgba(137,180,250,.15)', col:'var(--blue)' }
                                 : isOrder   ? { bg:'rgba(180,101,232,.12)', col:'var(--purple)' }
                                 : isMat     ? { bg:'rgba(137,180,250,.08)', col:'var(--blue)' }
                                 : { bg:'var(--bg3)', col:'var(--txt3)' }
                        return (
                          <th key={i} style={{ ...thStyle, background: hi.bg, color: hi.col }}>
                            {h}
                            {isStdHrs && <div style={{ fontSize: 8, marginTop: 2, color: 'var(--amber)' }}>⭐ std hrs</div>}
                            {isWC     && <div style={{ fontSize: 8, marginTop: 2, color: 'var(--blue)' }}>WC</div>}
                            {isOrder  && <div style={{ fontSize: 8, marginTop: 2, color: 'var(--purple)' }}>Order</div>}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sapRows.slice(0, sapShowLimit === Infinity ? sapRows.length : sapShowLimit).map((row, ri) => {
                      const confirmed = SAP_CONFIRM_IDX >= 0 ? parseBool((row as unknown[])[SAP_CONFIRM_IDX]) : false
                      return (
                        <tr key={ri} style={{ background: confirmed ? 'rgba(166,227,161,.04)' : ri % 2 ? 'var(--bg3)' : 'transparent' }}>
                          <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--txt3)', fontSize: 9, fontFamily: 'var(--mono)' }}>{ri + 1}</td>
                          {sapHeaders.map((h, ci) => {
                            const isConfirmCol = /is.?confirm/i.test(h)
                            const isStdHrsCol  = /stdactivitytype3|stdhrs|standardhour|planarbeit/i.test(h)
                            const val = String((row as unknown[])[ci] ?? '')
                            if (isConfirmCol) {
                              const b = parseBool((row as unknown[])[ci])
                              return (
                                <td key={ci} style={{ ...tdStyle, textAlign: 'center' }}>
                                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, fontWeight: 700, background: b ? 'rgba(166,227,161,.15)' : 'rgba(127,132,156,.1)', color: b ? 'var(--green)' : 'var(--txt3)' }}>
                                    {b ? '✓' : '○'}
                                  </span>
                                </td>
                              )
                            }
                            if (isStdHrsCol) {
                              const n = parseFloat(val.replace(/,/g,''))
                              return (
                                <td key={ci} style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)', fontSize: 11 }}>
                                  {isNaN(n) ? val : n.toFixed(2)}
                                </td>
                              )
                            }
                            return <td key={ci} style={{ ...tdStyle, fontFamily: 'var(--mono)', fontSize: 10, whiteSpace: 'nowrap' }}>{val}</td>
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {sapRows.length > (sapShowLimit === Infinity ? sapRows.length : sapShowLimit) && (
                  <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--txt3)', textAlign: 'center', borderTop: '1px solid var(--bord)' }}>
                    Showing {(sapShowLimit === Infinity ? sapRows.length : sapShowLimit).toLocaleString()} of {sapRows.length.toLocaleString()} rows —
                    <button onClick={() => setSapShowLimit(Infinity)}
                      style={{ marginLeft: 8, fontSize: 11, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                      Show all
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ────────────── ROUTING CR (เหล็กแกน) ────────────── */}
      {subTab === 'routing_cr' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {crParsed.length === 0 && (
            <DropZone dragOver={crDragOver} setDragOver={setCrDragOver} fileRef={crFileRef}
              onFile={handleCrFile} label="วางไฟล์ Excel Routing CR (เหล็กแกน) ที่นี่" />
          )}
          {crResult && <ResultBanner msg={crResult} onClear={() => setCrResult(null)} />}
          {crParsed.length > 0 && (() => {
            const sheets = [...new Set(crParsed.map(r => r.sheet_name))]
            const wcCount = new Set(crParsed.map(r => r.wc_id)).size
            const routingGroups = new Set(crParsed.map(r => r.routing_group)).size
            const grouped = sheets.map(sheet => {
              const rows = crParsed.filter(r => r.sheet_name === sheet)
              const sizes = [...new Set(rows.map(r => r.size_label))]
              return { sheet, rows, sizes }
            })
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{crParsed.length} Operations</div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)', marginRight: 'auto' }}>
                    {sheets.length} ประเภท · {routingGroups} Routing Groups · {wcCount} Work Centers — ตรวจสอบก่อนกด Import
                  </div>
                  <button onClick={() => setCrParsed([])} style={cancelBtn}>✕ ยกเลิก</button>
                  <button onClick={handleCrImport} disabled={crImporting}
                    style={{ ...importBtn, background: crImporting ? 'var(--bord2)' : 'var(--green)' }}>
                    {crImporting ? 'กำลังนำเข้า…' : `✓ Import ${crParsed.length} Operations`}
                  </button>
                </div>
                {/* Sheet summary chips */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, flexShrink: 0 }}>
                  {grouped.map(({ sheet, rows, sizes }) => (
                    <div key={sheet} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'var(--bg3)', border: '1px solid var(--bord)', fontSize: 11 }}>
                      <span style={{ fontWeight: 700, color: 'var(--blue)' }}>{sheet}</span>
                      <span style={{ color: 'var(--txt3)' }}>·</span>
                      <span style={{ color: 'var(--txt2)' }}>{sizes.length} ขนาด</span>
                      <span style={{ color: 'var(--txt3)' }}>·</span>
                      <span style={{ color: 'var(--amber)', fontFamily: 'var(--mono)' }}>{rows.length} ops</span>
                    </div>
                  ))}
                </div>
                {/* Preview table */}
                <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8 }}>
                  <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                    <thead>
                      <tr>
                        {(['ประเภท', 'ขนาด', 'Routing Group', 'Operation', 'Work Center', 'Description', 'Qty', 'Unit', 'Std Hrs'] as string[]).map(h => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.map(({ sheet, rows }) => (
                        <>
                          <tr key={'hdr-' + sheet} style={{ background: 'rgba(137,180,250,.07)', borderTop: '2px solid rgba(137,180,250,.2)' }}>
                            <td colSpan={9} style={{ ...tdStyle, padding: '7px 12px' }}>
                              <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--blue)' }}>{sheet}</span>
                              <span style={{ marginLeft: 10, fontSize: 11, color: 'var(--txt2)' }}>{rows.length} operations</span>
                            </td>
                          </tr>
                          {rows.map((r, i) => {
                            const mono: React.CSSProperties = { ...tdStyle, fontFamily: 'var(--mono)', fontSize: 10, whiteSpace: 'nowrap' }
                            return (
                              <tr key={sheet + i} style={{ background: i % 2 ? 'var(--bg3)' : undefined }}>
                                <td style={{ ...tdStyle, fontSize: 10, color: 'var(--txt3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sheet_name}</td>
                                <td style={{ ...mono, color: 'var(--amber)', fontWeight: 700 }}>{r.size_label}</td>
                                <td style={{ ...mono, color: 'var(--blue)' }}>{r.routing_group}</td>
                                <td style={{ ...mono, color: 'var(--txt2)' }}>{r.operation}</td>
                                <td style={{ ...mono, color: 'var(--green)', fontWeight: 700 }}>{r.wc_id}</td>
                                <td style={{ ...tdStyle, fontSize: 10 }}>{r.description}</td>
                                <td style={{ ...mono, textAlign: 'right' }}>{r.qty_per_op}</td>
                                <td style={{ ...mono, color: 'var(--txt3)' }}>{r.unit}</td>
                                <td style={{ ...mono, textAlign: 'right', color: 'var(--amber)', fontWeight: 700 }}>{r.std_hrs.toFixed(2)}</td>
                              </tr>
                            )
                          })}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ────────────── ROUTING HV (พันคอยล์แรงสูง) ────────────── */}
      {subTab === 'routing_hv' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {hvParsed.length === 0 && (
            <DropZone dragOver={hvDragOver} setDragOver={setHvDragOver} fileRef={hvFileRef}
              onFile={handleHvFile} label="วางไฟล์ Excel Routing HV (พันคอยล์แรงสูง) ที่นี่" />
          )}
          {hvResult && <ResultBanner msg={hvResult} onClear={() => setHvResult(null)} />}
          {hvParsed.length > 0 && (() => {
            const sheets = [...new Set(hvParsed.map(r => r.sheet_name))]
            const wcCount = new Set(hvParsed.map(r => r.wc_id)).size
            const routingGroups = new Set(hvParsed.map(r => r.routing_group)).size
            const grouped = sheets.map(sheet => {
              const rows = hvParsed.filter(r => r.sheet_name === sheet)
              const sizes = [...new Set(rows.map(r => r.size_label))]
              return { sheet, rows, sizes }
            })
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{hvParsed.length} Operations</div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)', marginRight: 'auto' }}>
                    {sheets.length} ประเภท · {routingGroups} Routing Groups · {wcCount} Work Centers — ตรวจสอบก่อนกด Import
                  </div>
                  <button onClick={() => setHvParsed([])} style={cancelBtn}>✕ ยกเลิก</button>
                  <button onClick={handleHvImport} disabled={hvImporting}
                    style={{ ...importBtn, background: hvImporting ? 'var(--bord2)' : 'var(--amber)' }}>
                    {hvImporting ? 'กำลังนำเข้า…' : `✓ Import ${hvParsed.length} Operations`}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, flexShrink: 0 }}>
                  {grouped.map(({ sheet, rows, sizes }) => (
                    <div key={sheet} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'var(--bg3)', border: '1px solid var(--bord)', fontSize: 11 }}>
                      <span style={{ fontWeight: 700, color: 'var(--amber)' }}>{sheet}</span>
                      <span style={{ color: 'var(--txt3)' }}>·</span>
                      <span style={{ color: 'var(--txt2)' }}>{sizes.length} ขนาด</span>
                      <span style={{ color: 'var(--txt3)' }}>·</span>
                      <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)' }}>{rows.length} ops</span>
                    </div>
                  ))}
                </div>
                <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8 }}>
                  <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                    <thead>
                      <tr>
                        {(['ประเภท', 'ขนาด', 'Routing Group', 'Operation', 'Work Center', 'Description', 'Qty', 'Unit', 'Std Hrs'] as string[]).map(h => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.map(({ sheet, rows }) => (
                        <>
                          <tr key={'hdr-' + sheet} style={{ background: 'rgba(249,226,175,.07)', borderTop: '2px solid rgba(249,226,175,.2)' }}>
                            <td colSpan={9} style={{ ...tdStyle, padding: '7px 12px' }}>
                              <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--amber)' }}>{sheet}</span>
                              <span style={{ marginLeft: 10, fontSize: 11, color: 'var(--txt2)' }}>{rows.length} operations</span>
                            </td>
                          </tr>
                          {rows.map((r, i) => {
                            const mono: React.CSSProperties = { ...tdStyle, fontFamily: 'var(--mono)', fontSize: 10, whiteSpace: 'nowrap' }
                            return (
                              <tr key={sheet + i} style={{ background: i % 2 ? 'var(--bg3)' : undefined }}>
                                <td style={{ ...tdStyle, fontSize: 10, color: 'var(--txt3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sheet_name}</td>
                                <td style={{ ...mono, color: 'var(--amber)', fontWeight: 700 }}>{r.size_label}</td>
                                <td style={{ ...mono, color: 'var(--amber)' }}>{r.routing_group}</td>
                                <td style={{ ...mono, color: 'var(--txt2)' }}>{r.operation}</td>
                                <td style={{ ...mono, color: 'var(--green)', fontWeight: 700 }}>{r.wc_id}</td>
                                <td style={{ ...tdStyle, fontSize: 10 }}>{r.description}</td>
                                <td style={{ ...mono, textAlign: 'right' }}>{r.qty_per_op}</td>
                                <td style={{ ...mono, color: 'var(--txt3)' }}>{r.unit}</td>
                                <td style={{ ...mono, textAlign: 'right', color: 'var(--amber)', fontWeight: 700 }}>{r.std_hrs.toFixed(2)}</td>
                              </tr>
                            )
                          })}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ────────────── ROUTING LV (พันคอยล์แรงต่ำ) ────────────── */}
      {subTab === 'routing_lv' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {lvParsed.length === 0 && (
            <DropZone dragOver={lvDragOver} setDragOver={setLvDragOver} fileRef={lvFileRef}
              onFile={handleLvFile} label="วางไฟล์ Excel Routing LV (พันคอยล์แรงต่ำ) ที่นี่" />
          )}
          {lvResult && <ResultBanner msg={lvResult} onClear={() => setLvResult(null)} />}
          {lvParsed.length > 0 && (() => {
            const sheets = [...new Set(lvParsed.map(r => r.sheet_name))]
            const wcCount = new Set(lvParsed.map(r => r.wc_id)).size
            const routingGroups = new Set(lvParsed.map(r => r.routing_group)).size
            const grouped = sheets.map(sheet => {
              const rows = lvParsed.filter(r => r.sheet_name === sheet)
              const sizes = [...new Set(rows.map(r => r.size_label))]
              return { sheet, rows, sizes }
            })
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{lvParsed.length} Operations</div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)', marginRight: 'auto' }}>
                    {sheets.length} ประเภท · {routingGroups} Routing Groups · {wcCount} Work Centers — ตรวจสอบก่อนกด Import
                  </div>
                  <button onClick={() => setLvParsed([])} style={cancelBtn}>✕ ยกเลิก</button>
                  <button onClick={handleLvImport} disabled={lvImporting}
                    style={{ ...importBtn, background: lvImporting ? 'var(--bord2)' : '#89b4fa' }}>
                    {lvImporting ? 'กำลังนำเข้า…' : `✓ Import ${lvParsed.length} Operations`}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, flexShrink: 0 }}>
                  {grouped.map(({ sheet, rows, sizes }) => (
                    <div key={sheet} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'var(--bg3)', border: '1px solid var(--bord)', fontSize: 11 }}>
                      <span style={{ fontWeight: 700, color: '#89b4fa' }}>{sheet}</span>
                      <span style={{ color: 'var(--txt3)' }}>·</span>
                      <span style={{ color: 'var(--txt2)' }}>{sizes.length} ขนาด</span>
                      <span style={{ color: 'var(--txt3)' }}>·</span>
                      <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)' }}>{rows.length} ops</span>
                    </div>
                  ))}
                </div>
                <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8 }}>
                  <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                    <thead>
                      <tr>
                        {(['ประเภท', 'ขนาด', 'Routing Group', 'Operation', 'Work Center', 'Description', 'Qty', 'Unit', 'Std Hrs'] as string[]).map(h => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.map(({ sheet, rows }) => (
                        <>
                          <tr key={'hdr-' + sheet} style={{ background: 'rgba(137,180,250,.07)', borderTop: '2px solid rgba(137,180,250,.2)' }}>
                            <td colSpan={9} style={{ ...tdStyle, padding: '7px 12px' }}>
                              <span style={{ fontWeight: 700, fontSize: 12, color: '#89b4fa' }}>{sheet}</span>
                              <span style={{ marginLeft: 10, fontSize: 11, color: 'var(--txt2)' }}>{rows.length} operations</span>
                            </td>
                          </tr>
                          {rows.map((r, i) => {
                            const mono: React.CSSProperties = { ...tdStyle, fontFamily: 'var(--mono)', fontSize: 10, whiteSpace: 'nowrap' }
                            return (
                              <tr key={sheet + i} style={{ background: i % 2 ? 'var(--bg3)' : undefined }}>
                                <td style={{ ...tdStyle, fontSize: 10, color: 'var(--txt3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sheet_name}</td>
                                <td style={{ ...mono, color: 'var(--amber)', fontWeight: 700 }}>{r.size_label}</td>
                                <td style={{ ...mono, color: '#89b4fa' }}>{r.routing_group}</td>
                                <td style={{ ...mono, color: 'var(--txt2)' }}>{r.operation}</td>
                                <td style={{ ...mono, color: 'var(--green)', fontWeight: 700 }}>{r.wc_id}</td>
                                <td style={{ ...tdStyle, fontSize: 10 }}>{r.description}</td>
                                <td style={{ ...mono, textAlign: 'right' }}>{r.qty_per_op}</td>
                                <td style={{ ...mono, color: 'var(--txt3)' }}>{r.unit}</td>
                                <td style={{ ...mono, textAlign: 'right', color: 'var(--amber)', fontWeight: 700 }}>{r.std_hrs.toFixed(2)}</td>
                              </tr>
                            )
                          })}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ────────────── HELP ────────────── */}
      {subTab === 'help' && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, padding: '1.25rem', overflowY: 'auto', flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>📖 คู่มือการนำเข้าข้อมูล</div>
          {([
            ['Master Plan', 'ไฟล์ Excel Production Orders', [
              'คอลัมน์จำเป็น: Production Order (หรือ Order No), kVA, Deadline',
              'คอลัมน์เสริม: Customer, Qty, SAP SO, Category, Item Code, Comment',
              'ระบบจะหา column อัตโนมัติจากชื่อหัวตาราง',
              'Item Code EN-T-001 format จะถูกถอดเป็น Product type อัตโนมัติ',
              'Orders ที่มี ID ซ้ำจะถูกอัปเดต ไม่ใช่เพิ่มซ้ำ',
            ]],
            ['พนักงาน (Employees)', 'ไฟล์ Excel ข้อมูลพนักงาน', [
              'คอลัมน์: WC_ID, EMP_ID, EMP_Name, Title, Dept, Is_Active, Is_Head',
              'คอลัมน์ที่ตรงจะถูก highlight สีน้ำเงินในตาราง preview',
              'ข้อมูลจะถูกจัดกลุ่มตาม Work Center',
              'บันทึกเฉพาะใน Session (ไม่ sync database)',
            ]],
            ['Catalog', 'ไฟล์ Excel รายการ Transformer', [
              'คอลัมน์: Key/ID (product key เช่น tr.160kVA), Label, kVA, STD hrs',
              'ถ้า Key มีอยู่แล้วจะอัปเดต label/kVA/STD hrs',
              'Operations (Routing) ของ product เดิมจะไม่ถูกลบ',
            ]],
            ['SAP Production Orders', 'ไฟล์ Excel จาก SAP', [
              'รองรับ Excel ทุก format — ระบบอ่าน column อัตโนมัติ',
              'Column Is_Confirm จะแสดงเป็น Confirmed / Pending',
              'ข้อมูล SAP เป็น View Only — ไม่บันทึกเข้า Database',
              'แสดงสูงสุด 500 แถว',
            ]],
          ] as [string, string, string[]][]).map(([title, desc, items]) => (
            <div key={title} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 11, color: 'var(--txt2)', marginBottom: 6 }}>{desc}</div>
              <ul style={{ paddingLeft: 18, fontSize: 11, color: 'var(--txt2)', lineHeight: 1.8 }}>
                {items.map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Shared sub-components ──

function DropZone({ dragOver, setDragOver, fileRef, onFile, label }: {
  dragOver: boolean
  setDragOver: (v: boolean) => void
  fileRef: React.MutableRefObject<HTMLInputElement | null>
  onFile: (f: File) => void
  label: string
}) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
      onClick={() => fileRef.current?.click()}
      style={{ border: `2px dashed ${dragOver ? 'var(--blue)' : 'var(--bord2)'}`, borderRadius: 12, padding: '3rem', textAlign: 'center', cursor: 'pointer', transition: 'border-color .2s', background: dragOver ? 'rgba(137,180,250,.05)' : 'transparent', marginBottom: 12 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt2)' }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>หรือคลิกเพื่อเลือกไฟล์ (.xlsx, .xls, .csv)</div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </div>
  )
}

function ResultBanner({ msg, onClear }: { msg: string; onClear?: () => void }) {
  const isErr = msg.startsWith('❌')
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: 8, marginBottom: 10, fontSize: 12, background: isErr ? 'rgba(224,90,78,.08)' : 'rgba(166,227,161,.08)', border: `1px solid ${isErr ? 'rgba(224,90,78,.3)' : 'rgba(166,227,161,.3)'}`, color: isErr ? 'var(--red)' : 'var(--green)' }}>
      <span style={{ flex: 1 }}>{msg}</span>
      {onClear && <button onClick={onClear} style={{ background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>}
    </div>
  )
}

function KpiCard({ label, val, col }: { label: string; val: number; col: string }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8, padding: '8px 12px', minWidth: 90 }}>
      <div style={{ fontSize: 9, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--mono)', color: col }}>{val.toLocaleString()}</div>
    </div>
  )
}
