import { localISO, dmyToISO } from './dates'

export interface ParsedOrder {
  id: string; customer: string; kva: number; qty: number; deadline: string
  plan_date: string | null
  sap_so: string; category: string; item_code: string; comment: string; product: string
  _raw: Record<string, unknown>
}

export interface ParsedCoilRow {
  plan_date: string; seq: number; importance: string
  sap_so: string; item_code: string; comment: string; plant: string
  kva: number; electrical: string; customer: string
  total_kva: number; qty: number
  enter_test: string; cable_box: string; control: string
  due_store: string; due_so: string; adjust_plan: string
  due_clamp: string; due_box_ctrl: string; raw_mat: string
  lv: string; hv: string
}

const SIGNALS = [
  ['order', 'production order', 'คำสั่งผลิต', 'เลขที่', 'sap'],
  ['kva', 'mva', 'กำลัง'],
  ['qty', 'quantity', 'จำนวน'],
  ['deadline', 'due', 'delivery', 'กำหนด', 'วันส่ง'],
  ['customer', 'cust', 'ลูกค้า'],
]

export function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(10, rows.length - 1); i++) {
    const cells = (rows[i] as unknown[]).map(c => String(c ?? '').toLowerCase())
    const score = SIGNALS.reduce((s, keys) => s + (cells.some(c => keys.some(k => c.includes(k))) ? 1 : 0), 0)
    if (score >= 2) return i
  }
  return 0
}

const THAI_CATS = ['หลัก', 'เสริม', 'พิเศษ', 'กำหนดเอง', 'จอง', 'เพิ่มเติม', 'งานซ่อม', 'Fast', 'fast']

export function detectCategoryCol(dataRows: unknown[][], totalCols: number): number {
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

export function guessOrderCols(headers: string[], dataRows: unknown[][]) {
  const find = (...keys: string[]) => {
    const hi = headers.map(h => h.toLowerCase())
    for (const k of keys) { const i = hi.findIndex(h => h.includes(k)); if (i >= 0) return i }
    return -1
  }
  const catByHeader = find('category', 'cat', 'หมวด', 'ประเภท', 'type')
  return {
    id:        find('production order', 'prod order', 'order no', 'คำสั่งผลิต', 'เลขที่', 'sap'),
    customer:  find('customer', 'cust', 'ลูกค้า', 'sold to'),
    kva:       find('kva', 'mva', 'capacity', 'กำลัง'),
    qty:       find('qty', 'quantity', 'จำนวน', 'ea', 'targetqty', 'target qty'),
    deadline:  find('deadline', 'กำหนด', 'วันส่ง', 'delivery', 'finish date', 'basicfinish', 'due date'),
    plan_date: find('วันที่', 'plan date', 'schedule date', 'planned date', 'start date'),
    sap_so:    find('sales order', 'so no', 'salesorder'),
    category:  catByHeader >= 0 ? catByHeader : detectCategoryCol(dataRows, Math.max(headers.length, 10)),
    item5:     find('item5', 'item code', 'item ', 'material', 'mat', 'รหัส', 'materialorder'),
    comment:   find('comment', 'หมายเหตุ', 'remark', 'note'),
  }
}

export function itemCodeToProduct(code: string): string {
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

export function parseCoilPlan(rows: string[][]): { rows: ParsedCoilRow[]; headers: string[]; colMap: Record<string, number> } {
  const effective: string[][] = []
  for (const row of rows) {
    if ((row[0] ?? '').includes('บันทึกเพิ่มเติม') || (row[0] ?? '').includes('รวมทั้งหมด')) break
    effective.push(row)
  }
  if (effective.length === 0) throw new Error('ไม่พบข้อมูล (ไฟล์ว่างหรือไม่มีส่วนข้อมูลหลัก)')

  let headerIdx = -1
  for (let i = 0; i < effective.length; i++) {
    if ((effective[i][0] ?? '').includes('วันที่') && (effective[i][1] ?? '').includes('ลำดับ')) {
      headerIdx = i; break
    }
  }
  if (headerIdx === -1) throw new Error('ไม่พบหัวตาราง (ต้องมี "วันที่" ในคอลัมน์แรก และ "ลำดับ" ในคอลัมน์ที่สอง)')

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
    date: findCol('วันที่'), seq: findCol('ลำดับ'), importance: importanceIdx,
    sap: findCol('sap'), itemcode: findCol('item 5', 'item5', 'itemcode'),
    comment: findCol('comment'), plant: findCol('plant'), kva: findCol('kva'),
    elec: findCol('ระบบไฟฟ้า'), customer: findCol('ลูกค้า'), totalKva: findCol('total kva'),
    qty: findCol('จำนวน'), enterTest: findCol('เข้าเทส'), cable: findCol('cable'),
    control: findCol('control'), dueStore: findCol('กำหนด', 'ส่งเข้าสโตร์'),
    dueSO: findCol('due so'), adjustPlan: findCol('แจ้งปรับแผนการผลิต', 'แจ้งปรับแผน'),
    dueClamp: findCol('due clamp'), dueBox: findCol('due box'),
    dueCtrlBox: findCol('due ctrl box'), rawMat: findCol('raw mat'),
    lv: findCol('lv'), hv: findCol('hv'),
  }

  const g = (row: string[], idx: number) => (idx >= 0 && idx < row.length) ? (row[idx] ?? '') : ''
  let currentDateDMY = ''
  const result: ParsedCoilRow[] = []

  for (const row of effective.slice(dataStart)) {
    if (!row.length || row.every(cell => !cell)) continue
    const dateVal = g(row, c.date)
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateVal)) currentDateDMY = dateVal
    else if (/^\d{4}-\d{1,2}-\d{1,2}/.test(dateVal)) {
      const [y, mo, d] = dateVal.split('-')
      currentDateDMY = `${d}/${mo}/${y}`
    }
    if (!currentDateDMY) continue
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
