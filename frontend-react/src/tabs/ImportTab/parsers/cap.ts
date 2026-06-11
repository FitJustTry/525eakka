export interface ParsedCapRate {
  station_type: string; section: string; kva: number
  hrs_per_unit: number; efficiency: number; machines: number
  hrs_per_day: number; working_days: number; available_hrs: number
  source_file: string
}

export function parseCapFile(
  wb: { SheetNames: string[]; Sheets: Record<string, unknown> },
  sheetToJson: (ws: unknown, opts: object) => unknown[][],
  fileName: string
): ParsedCapRate[] {
  const result: ParsedCapRate[] = []

  const foilWs = wb.Sheets['Foil']
  if (foilWs) {
    const rows = sheetToJson(foilWs, { header: 1, defval: '' }) as unknown[][]
    const efficiency = parseFloat(String(rows[4]?.[2] ?? '')) || 0
    const machines = parseInt(String(rows[5]?.[2] ?? '')) || 0
    const hrs_per_day = parseFloat(String(rows[6]?.[2] ?? '')) || 0
    const working_days = parseFloat(String(rows[7]?.[2] ?? '')) || 0
    const available_hrs = parseFloat(String(rows[8]?.[2] ?? '')) || 0
    const base = { station_type: 'LV-Foil', section: '', efficiency, machines, hrs_per_day, working_days, available_hrs, source_file: fileName }
    for (let i = 13; i < rows.length; i++) {
      const kva = parseFloat(String(rows[i]?.[0] ?? ''))
      const hrs = parseFloat(String(rows[i]?.[1] ?? ''))
      if (!kva || isNaN(kva) || !hrs || isNaN(hrs)) continue
      result.push({ ...base, kva, hrs_per_unit: hrs })
    }
  }

  const wireWs = wb.Sheets['wire']
  if (wireWs) {
    const rows = sheetToJson(wireWs, { header: 1, defval: '' }) as unknown[][]
    const efficiency = parseFloat(String(rows[4]?.[2] ?? '')) || 0
    const machines = parseInt(String(rows[5]?.[2] ?? '')) || 0
    const hrs_per_day = parseFloat(String(rows[6]?.[2] ?? '')) || 0
    const working_days = parseFloat(String(rows[7]?.[2] ?? '')) || 0
    const available_hrs = parseFloat(String(rows[8]?.[2] ?? '')) || 0
    const base = { station_type: 'LV-Wire', section: '', efficiency, machines, hrs_per_day, working_days, available_hrs, source_file: fileName }
    for (let i = 13; i < rows.length; i++) {
      const kva = parseFloat(String(rows[i]?.[0] ?? ''))
      const hrs = parseFloat(String(rows[i]?.[1] ?? ''))
      if (!kva || isNaN(kva) || !hrs || isNaN(hrs)) continue
      result.push({ ...base, kva, hrs_per_unit: hrs })
    }
  }

  const hvWs = wb.Sheets['HV']
  if (hvWs) {
    const rows = sheetToJson(hvWs, { header: 1, defval: '' }) as unknown[][]
    const efficiency = parseFloat(String(rows[3]?.[2] ?? '')) || 0
    const machines = parseInt(String(rows[4]?.[2] ?? '')) || 0
    const hrs_per_day = parseFloat(String(rows[5]?.[2] ?? '')) || 0
    const working_days = parseFloat(String(rows[6]?.[2] ?? '')) || 0
    const available_hrs = parseFloat(String(rows[7]?.[2] ?? '')) || 0
    const baseHv = { station_type: 'HV', efficiency, machines, hrs_per_day, working_days, available_hrs, source_file: fileName }
    const HV_SECTIONS: [number, number, string][] = [
      [0, 1, '22kV-L1'], [6, 7, '22kV-L2'], [12, 13, '22kV-L4'],
      [19, 20, '33kV-L1'], [25, 26, '33kV-L2'], [31, 32, '33kV-L4'],
    ]
    for (let i = 16; i < rows.length; i++) {
      for (const [kvaCol, hrsCol, section] of HV_SECTIONS) {
        const kva = parseFloat(String(rows[i]?.[kvaCol] ?? ''))
        const hrs = parseFloat(String(rows[i]?.[hrsCol] ?? ''))
        if (!kva || isNaN(kva) || !hrs || isNaN(hrs)) continue
        result.push({ ...baseHv, section, kva, hrs_per_unit: hrs })
      }
    }
  }

  return result
}
