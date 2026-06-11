export interface ParsedCatalog { key: string; label: string; kva: number; std_hrs: number }

export function guessCatalogCols(headers: string[]) {
  const find = (...keys: string[]) => {
    const hi = headers.map(h => h.toLowerCase().replace(/[_\s]/g, ''))
    for (const k of keys) { const i = hi.findIndex(h => h.includes(k)); if (i >= 0) return i }
    return -1
  }
  return {
    key:     find('key', 'productkey', 'รหัส'),
    label:   find('label', 'name', 'ชื่อ', 'description', 'desc'),
    kva:     find('kva', 'mva', 'กำลัง'),
    std_hrs: find('stdhrs', 'std', 'hrs', 'ชั่วโมง'),
  }
}
