import { useState, useRef, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { api } from '../../api'
import type { EmpDir } from '../../api'
import type { Order, Employee, Product } from '../../types'

type SubTab = 'masterplan' | 'coilplan' | 'employees' | 'catalog' | 'sap' | 'help'

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

function parseDate(raw: unknown, fmt: 'MM/DD' | 'DD/MM' = 'MM/DD'): string {
  const fallback = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
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
  if (!isNaN(n) && n > 40000) return new Date(new Date(1899, 11, 30).getTime() + n * 86400000).toISOString().slice(0, 10)
  const d3 = new Date(s)
  if (!isNaN(d3.getTime())) return d3.toISOString().slice(0, 10)
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
  return result
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
  const sapFileRef = useRef<HTMLInputElement>(null)

  // Coil Plan state
  const [coilDragOver, setCoilDragOver] = useState(false)
  const [coilParsed, setCoilParsed] = useState<ParsedCoilRow[]>([])
  const [coilImporting, setCoilImporting] = useState(false)
  const [coilResult, setCoilResult] = useState<string | null>(null)
  const coilFileRef = useRef<HTMLInputElement>(null)

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

  async function handleSapFile(file: File) {
    setSapRows([]); setSapHeaders([])
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
    { id: 'masterplan', label: 'Master Plan' },
    { id: 'coilplan',   label: 'Coil Plan' },
    { id: 'employees',  label: 'พนักงาน' },
    { id: 'catalog',    label: 'Catalog' },
    { id: 'sap',        label: 'SAP' },
    { id: 'help',       label: 'คู่มือ' },
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

      {/* ────────────── MASTER PLAN ────────────── */}
      {subTab === 'masterplan' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {mpParsed.length === 0 && (
            <DropZone dragOver={mpDragOver} setDragOver={setMpDragOver} fileRef={mpFileRef}
              onFile={handleMpFile} label="วางไฟล์ Excel Master Plan ที่นี่" />
          )}
          {mpResult && <ResultBanner msg={mpResult} onClear={() => setMpResult(null)} />}
          {mpParsed.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{mpParsed.length} รายการจาก Excel</div>
                <div style={{ fontSize: 11, color: 'var(--txt3)', marginRight: 'auto' }}>
                  ตรวจสอบข้อมูลก่อนกด Import
                  {mpHeaderRow > 0 && <span style={{ marginLeft: 8, color: 'var(--amber)' }}>(header แถวที่ {mpHeaderRow + 1})</span>}
                </div>
                <button onClick={() => { setMpParsed([]); setMpHeaderRow(0); setMpRawHeaders([]); setMpColMap({}) }} style={cancelBtn}>✕ ยกเลิก</button>
                <button onClick={handleMpImport} disabled={mpImporting}
                  style={{ ...importBtn, background: mpImporting ? 'var(--bord2)' : 'var(--green)' }}>
                  {mpImporting ? 'กำลังนำเข้า…' : `✓ Import ${mpParsed.length} รายการ`}
                </button>
              </div>
              {/* Week summary strip — 6 day chips */}
              {grouped.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {grouped.map(({ date, dayLabel, rows, totalQty }) => (
                    <div key={date} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'var(--bg3)', border: '1px solid var(--bord)', fontSize: 11 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue)' }}>{date.slice(5)}</span>
                      <span style={{ color: 'var(--txt3)', fontSize: 10 }}>{dayLabel}</span>
                      <span style={{ color: 'var(--txt2)' }}>{rows.length} ออเดอร์</span>
                      <span style={{ color: 'var(--txt3)' }}>·</span>
                      <span style={{ color: 'var(--amber)', fontFamily: 'var(--mono)' }}>{totalQty} ตัว</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'rgba(166,227,161,.1)', border: '1px solid rgba(166,227,161,.3)', fontSize: 11 }}>
                    <span style={{ color: 'var(--green)', fontWeight: 700 }}>รวม {grouped.length} วัน</span>
                    <span style={{ color: 'var(--txt3)' }}>·</span>
                    <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontWeight: 700 }}>{grouped.reduce((s, g) => s + g.totalQty, 0)} ตัว</span>
                  </div>
                </div>
              )}
              {/* Header mapping panel */}
              {mpRawHeaders.length > 0 && (() => {
                const FIELD_LABELS: Record<string, { label: string; col: string }> = {
                  id:        { label: 'Order ID', col: '#e09c2a' },
                  plan_date: { label: 'วันที่', col: '#89b4fa' },
                  customer:  { label: 'ลูกค้า', col: '#a6e3a1' },
                  kva:       { label: 'kVA', col: '#cba6f7' },
                  qty:       { label: 'จำนวน', col: '#89dceb' },
                  deadline:  { label: 'Deadline', col: '#f38ba8' },
                  sap_so:    { label: 'SAP SO', col: '#fab387' },
                  category:  { label: 'Category', col: '#f9e2af' },
                  item5:     { label: 'Item Code', col: '#94e2d5' },
                  comment:   { label: 'Comment', col: 'var(--txt3)' },
                }
                const colToField: Record<number, string> = {}
                Object.entries(mpColMap).forEach(([field, idx]) => {
                  if (idx >= 0) colToField[idx] = field
                })
                return (
                  <div style={{ background: 'var(--bg3)', border: '1px solid var(--bord)', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      คอลัมน์ทั้งหมด {mpRawHeaders.length} คอลัมน์ · header แถวที่ {mpHeaderRow + 1}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {mpRawHeaders.map((h, i) => {
                        const field = colToField[i]
                        const info = field ? FIELD_LABELS[field] : null
                        const isEmpty = !h.trim()
                        return (
                          <div key={i} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 8px', borderRadius: 6, fontSize: 10,
                            background: info ? info.col + '20' : isEmpty ? 'transparent' : 'var(--bg2)',
                            border: `1px solid ${info ? info.col + '60' : 'var(--bord)'}`,
                            color: info ? info.col : isEmpty ? 'var(--bord2)' : 'var(--txt3)',
                            fontWeight: info ? 700 : 400,
                          }}>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, opacity: 0.6 }}>{i + 1}</span>
                            <span>{isEmpty ? '(ว่าง)' : h}</span>
                            {info && <span style={{ fontSize: 9, background: info.col + '30', padding: '0 4px', borderRadius: 3 }}>→ {info.label}</span>}
                          </div>
                        )
                      })}
                    </div>
                    {/* Show undetected important fields */}
                    {(() => {
                      const missed = Object.entries(FIELD_LABELS).filter(([field]) => {
                        const idx = (mpColMap as Record<string, number>)[field]
                        return idx == null || idx < 0
                      }).map(([, info]) => info.label)
                      if (missed.length === 0) return null
                      return (
                        <div style={{ marginTop: 6, fontSize: 10, color: 'var(--red)' }}>
                          ⚠ ไม่พบ: {missed.join(', ')}
                        </div>
                      )
                    })()}
                  </div>
                )
              })()}
              <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      {[
                        { col: null,       label: '#',        align: 'center' as const },
                        { col: 'category', label: 'ประเภท',   align: 'center' as const },
                        { col: 'id',       label: 'Order ID', align: 'left'   as const },
                        { col: 'customer', label: 'ลูกค้า',   align: 'left'   as const },
                        { col: 'kva',      label: 'kVA',      align: 'right'  as const },
                        { col: 'qty',      label: 'จำนวน',    align: 'center' as const },
                        { col: 'deadline', label: 'Deadline', align: 'left'   as const },
                        { col: 'item_code',label: 'Item Code',align: 'left'   as const },
                        { col: 'product',  label: 'Product',  align: 'left'   as const },
                      ].map(({ col, label, align }) => (
                        <th key={label} style={{ ...thStyle, cursor: col ? 'pointer' : 'default', textAlign: align }}
                          onClick={() => col && toggleMpSort(col)}>
                          {label}{col && mpSortCol === col ? (mpSortDir > 0 ? ' ▲' : ' ▼') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map(({ date, dayLabel, rows, totalKva, totalQty }) => (
                      <>
                        {/* Date group header */}
                        <tr key={'hdr-' + date} style={{ background: 'rgba(137,180,250,.07)', borderTop: '2px solid rgba(137,180,250,.2)' }}>
                          <td colSpan={9} style={{ ...tdStyle, padding: '7px 12px' }}>
                            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12, color: 'var(--blue)' }}>
                              📅 {date}
                            </span>
                            {dayLabel && (
                              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--txt3)', fontWeight: 600 }}>{dayLabel}</span>
                            )}
                            <span style={{ marginLeft: 14, fontSize: 11, color: 'var(--txt2)' }}>
                              {rows.length} รายการ
                            </span>
                            <span style={{ marginLeft: 10, fontSize: 11, color: 'var(--txt3)' }}>
                              · {totalQty.toLocaleString()} เครื่อง
                              · {totalKva.toLocaleString()} kVA รวม
                            </span>
                          </td>
                        </tr>
                        {/* Rows within group */}
                        {rows.map((r, i) => {
                          const inSystem = orders.some(o => o.id === r.id)
                          const productOk = !!products[r.product]
                          const catColor = r.category === 'หลัก' ? 'var(--blue)' : r.category === 'เสริม' ? 'var(--green)' : r.category === 'Fast' ? 'var(--red)' : 'var(--txt3)'
                          return (
                            <tr key={r.id + i} style={{ background: inSystem ? 'rgba(249,226,175,.05)' : 'transparent', borderLeft: `3px solid ${catColor}` }}>
                              <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--txt3)', fontSize: 10, fontFamily: 'var(--mono)' }}>{i + 1}</td>
                              <td style={{ ...tdStyle, textAlign: 'center' }}>
                                {r.category ? (
                                  <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 700,
                                    background: r.category === 'หลัก' ? 'rgba(137,180,250,.18)' : r.category === 'เสริม' ? 'rgba(166,227,161,.18)' : r.category === 'Fast' ? 'rgba(224,90,78,.15)' : 'var(--bg3)',
                                    color: catColor,
                                  }}>{r.category}</span>
                                ) : <span style={{ color: 'var(--txt3)', fontSize: 10 }}>—</span>}
                              </td>
                              <td style={{ ...tdStyle, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)', whiteSpace: 'nowrap' }}>{r.id}</td>
                              <td style={{ ...tdStyle, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer || <span style={{ color: 'var(--txt3)', fontStyle: 'italic' }}>—</span>}</td>
                              <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.kva.toLocaleString()}</td>
                              <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'var(--mono)' }}>{r.qty}</td>
                              <td style={{ ...tdStyle, fontFamily: 'var(--mono)', fontSize: 10, whiteSpace: 'nowrap' }}>{r.deadline}</td>
                              <td style={{ ...tdStyle, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>{r.item_code || '—'}</td>
                              <td style={{ ...tdStyle, fontSize: 9, color: productOk ? 'var(--green)' : 'var(--amber)', whiteSpace: 'nowrap' }}>
                                {r.product || <span style={{ color: 'var(--red)' }}>ไม่ระบุ</span>}
                                {inSystem && <span style={{ marginLeft: 4, fontSize: 8, color: 'var(--amber)', opacity: 0.8 }}>[update]</span>}
                              </td>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{sapRows.length} Operations จาก SAP</div>
                <span style={{ fontSize: 11, color: 'var(--txt3)' }}>(View only — ไม่บันทึกเข้าระบบ)</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => { setSapRows([]); setSapHeaders([]) }} style={cancelBtn}>✕ ปิด</button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8 }}>
                <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                  <thead>
                    <tr>
                      {sapHeaders.map((h, i) => {
                        const isConfirm = /is.?confirm/i.test(h)
                        return (
                          <th key={i} style={{ ...thStyle, background: isConfirm ? 'rgba(166,227,161,.15)' : 'var(--bg3)', color: isConfirm ? 'var(--green)' : 'var(--txt3)' }}>
                            {h}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sapRows.slice(0, 500).map((row, ri) => {
                      const confirmed = SAP_CONFIRM_IDX >= 0 ? parseBool((row as unknown[])[SAP_CONFIRM_IDX]) : false
                      return (
                        <tr key={ri} style={{ background: confirmed ? 'rgba(166,227,161,.04)' : 'transparent' }}>
                          {sapHeaders.map((h, ci) => {
                            const isConfirmCol = /is.?confirm/i.test(h)
                            const val = String((row as unknown[])[ci] ?? '')
                            if (isConfirmCol) {
                              const b = parseBool((row as unknown[])[ci])
                              return (
                                <td key={ci} style={{ ...tdStyle, textAlign: 'center' }}>
                                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, fontWeight: 700, background: b ? 'rgba(166,227,161,.15)' : 'rgba(127,132,156,.1)', color: b ? 'var(--green)' : 'var(--txt3)' }}>
                                    {b ? '✓ Confirmed' : '○ Pending'}
                                  </span>
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
                {sapRows.length > 500 && (
                  <div style={{ padding: '8px 14px', fontSize: 10, color: 'var(--txt3)' }}>
                    แสดง 500 จาก {sapRows.length} แถว
                  </div>
                )}
              </div>
            </>
          )}
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
