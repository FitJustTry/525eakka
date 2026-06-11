export interface ParsedRoutingCrRow {
  sheet_name: string; size_label: string; size_kva: number
  routing_group: string; operation: string; wc_id: string
  description: string; qty_per_op: number; unit: string; std_hrs: number
}

export function parseSizeKva(raw: unknown): number {
  if (!raw && raw !== 0) return 0
  const s = String(raw).trim()
  const m = s.match(/(\d[\d,]*)/)
  if (!m) return 0
  return parseInt(m[1].replace(/,/g, '')) || 0
}

export function parseRoutingCr(
  wb: { SheetNames: string[]; Sheets: Record<string, unknown> },
  sheetToJson: (ws: unknown, opts: object) => unknown[][]
): ParsedRoutingCrRow[] {
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
      result.push({ sheet_name: sheetName, size_label: currentSizeLabel, size_kva: currentSizeKva, routing_group: routingGroup, operation, wc_id: wcId, description, qty_per_op: qtyRaw, unit, std_hrs: stdHrs })
    }
  }
  return result
}

export function parseRoutingHvLv(
  wb: { SheetNames: string[]; Sheets: Record<string, unknown> },
  sheetToJson: (ws: unknown, opts: object) => unknown[][]
): ParsedRoutingCrRow[] {
  if (wb.SheetNames.length < 2) return []
  const result: ParsedRoutingCrRow[] = []

  const kvMap = new Map<string, number>()
  const s1rows: unknown[][] = sheetToJson(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
  for (let i = 3; i < s1rows.length; i++) {
    const row = s1rows[i] as unknown[]
    const kva = parseFloat(String(row[3] ?? ''))
    if (!kva || isNaN(kva)) continue
    for (let c = 4; c < row.length; c++) {
      const grp = String(row[c] ?? '').trim()
      if (grp && grp !== '-') kvMap.set(grp, kva)
    }
  }

  const HV_TYPE: Record<string, string> = { A: 'Layer 1 Section', B: 'Layer 2 Section', C: 'Disc Continuous', D: 'Disc 4 Section', H: 'Class-H', T: 'Tap' }
  const LV_TYPE: Record<string, string> = { F: 'Foil', W: 'Wound', H: 'Class-H' }
  function coilType(code: string): string {
    const up = code.toUpperCase()
    if (up.startsWith('THV')) return `Coil HV ${HV_TYPE[up[3]] ?? up[3]}`
    if (up.startsWith('TLV')) return `Coil LV ${LV_TYPE[up[3]] ?? up[3]}`
    return code
  }

  const s2rows: unknown[][] = sheetToJson(wb.Sheets[wb.SheetNames[1]], { header: 1, defval: '' })
  if (s2rows.length < 2) return result

  const headers = (s2rows[0] as unknown[]).map(h => String(h ?? '').trim().replace(/[\r\n]+/g, ' ').toLowerCase())
  const fpos = (keys: string[], fallback: number) => {
    const i = headers.findIndex(h => keys.some(k => h.includes(k)))
    return i >= 0 ? i : fallback
  }
  const RG   = fpos(['routing group', 'กลุ่ม'], 0)
  const OP   = fpos(['operation', 'op '], 1)
  const WC   = fpos(['work center', 'ศูนย์งาน'], 2)
  const DESC = fpos(['description', 'รายละเอียด'], 3)
  const QTY  = fpos(['จำนวน', 'qty', 'base qty'], 4)
  const UNIT = fpos(['หน่วย', 'unit'], 5)
  const STD  = fpos(['standard', 'std', 'ชม'], 6)

  let currentRg = ''
  for (let i = 1; i < s2rows.length; i++) {
    const row = s2rows[i] as unknown[]
    const rg = String(row[RG] ?? '').trim()
    if (rg) currentRg = rg
    const op = String(row[OP] ?? '').trim()
    const wc = String(row[WC] ?? '').trim()
    if (!currentRg || !op || !wc) continue
    const kva = kvMap.get(currentRg) ?? 0
    result.push({
      sheet_name: coilType(currentRg),
      size_label: kva ? String(kva) : currentRg,
      size_kva: kva, routing_group: currentRg, operation: op, wc_id: wc,
      description: String(row[DESC] ?? '').trim(),
      qty_per_op: parseFloat(String(row[QTY] ?? '').replace(/,/g, '')) || 1,
      unit: String(row[UNIT] ?? '').trim(),
      std_hrs: parseFloat(String(row[STD] ?? '').replace(/,/g, '')) || 0,
    })
  }
  return result
}
