export interface ParsedEmployee {
  wc: string; id: string; name: string; title: string; dept: string
  is_active: boolean; is_head: boolean
}

export function guessEmpCols(headers: string[]) {
  const find = (...keys: string[]) => {
    const hi = headers.map(h => h.toLowerCase().replace(/[_\s\-]/g, ''))
    for (const k of keys) { const i = hi.findIndex(h => h.includes(k)); if (i >= 0) return i }
    return -1
  }
  return {
    wc:        find('wcid', 'workcenter', 'wc', 'สถานีงาน', 'workstation'),
    id:        find('empid', 'employeeid', 'รหัสพนักงาน', 'รหัส', 'เลขที่'),
    name:      find('empname', 'fullname', 'ชื่อนามสกุล', 'ชื่อสกุล', 'ชื่อ', 'name'),
    title:     find('title', 'ตำแหน่ง', 'คำนำหน้า', 'position'),
    dept:      find('dept', 'department', 'แผนก', 'ฝ่าย'),
    is_active: find('isactive', 'active', 'สถานะ', 'ปฏิบัติงาน'),
    is_head:   find('ishead', 'หน.', 'หัวหน้า', 'head'),
  }
}

export function parseBool(v: unknown): boolean {
  if (v == null) return true
  const s = String(v).toLowerCase().trim()
  return s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === 'active' || s === 'จริง'
}
