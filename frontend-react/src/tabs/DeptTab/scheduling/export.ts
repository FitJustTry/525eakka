import * as XLSX from 'xlsx'
import type { CuttingMachine, CuttingRate } from '../../../types'
import { getHrsForKva, mLabel, fmtISO } from './utils'
import type { WeekData } from './weekData'

export interface ExportContext {
  weekData: WeekData
  machines: CuttingMachine[]
  products: Record<string, { kva?: number }>
  globalRates: CuttingRate[]
  globalTmcRates: CuttingRate[]
  weekLabel: string
  mon: Date
  sat: Date
  balanceMode: string
}

export interface PlanRow {
  day: string; date: string; machine: string; machOff: boolean
  wallHrs: number; ot: number; carryFwd: boolean
  sapSo: string; kva: number; qty: number; customer: string; rawMat: string
  hrsWorked: number; totalHrs: number; done: boolean; carryOver: boolean; isCarryIn: boolean
}

const DAY_TH_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']

export function buildPlanRows({ weekData, products, globalRates, globalTmcRates }: ExportContext): PlanRow[] {
  const planRows: PlanRow[] = []
  weekData.dayRows.forEach(row => {
    const { d, machineCells } = row
    const date = fmtISO(d)
    const day = DAY_TH_FULL[d.getDay()]
    machineCells.forEach(({ m, machOff, sched, work, wall }) => {
      if (machOff) {
        planRows.push({ day, date, machine: mLabel(m), machOff: true, wallHrs: 0, ot: 0, carryFwd: false, sapSo: '', kva: 0, qty: 0, customer: '', rawMat: '', hrsWorked: 0, totalHrs: 0, done: false, carryOver: false, isCarryIn: false })
        return
      }
      if (work.length === 0) return
      work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete).forEach(w => {
        const kva = w.order.kva ?? products[w.order.product]?.kva ?? 0
        const totalHrs = w.order.qty * getHrsForKva(m, kva, globalRates, w.order.item_code, globalTmcRates)
        planRows.push({ day, date, machine: mLabel(m), machOff: false, wallHrs: wall, ot: sched?.otHrs ?? 0, carryFwd: sched?.carriesForward ?? false, sapSo: w.order.sap_so ?? w.order.id, kva, qty: w.order.qty, customer: w.order.customer ?? '', rawMat: w.order.raw_mat ?? '', hrsWorked: w.hrsWorked, totalHrs, done: w.isComplete, carryOver: w.carriesOver, isCarryIn: w.isCarryOver })
      })
    })
  })
  return planRows
}

export function exportPlanCSV(ctx: ExportContext): void {
  const { weekData, machines, products, globalRates, globalTmcRates, weekLabel, mon, sat, balanceMode } = ctx
  const DAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const rows: string[][] = []

  rows.push([`แผนการตัดโลหะ — ${weekLabel}`])
  rows.push([`Mode: ${balanceMode}`, `Total: ${weekData.totalQtyWeek} ตัว`, `${Math.round(weekData.totalKvaWeek).toLocaleString()} kVA`, `OT: ${weekData.totalOT.toFixed(1)}h`])
  rows.push([])

  rows.push(['# เครื่อง', 'kVA Range', 'h/ตัว', '×Rate', 'TMC'])
  machines.forEach(m => {
    rows.push([mLabel(m), `${m.min_kva}–${m.max_kva >= 9999 ? '∞' : m.max_kva}`, m.hrs_per_unit.toString(), (m.time_mul ?? 1).toString(), (m.tmc_hrs ?? 0).toString()])
  })
  rows.push([])

  weekData.dayRows.forEach(row => {
    const { d, machineCells, dayFinish, actualQty, actualOrderCount: _n } = row
    if (!machineCells.some(mc => mc.work.length > 0 || mc.machOff)) return
    const dateStr = fmtISO(d)
    const totalKva = row.dayOrders.reduce((s, o) => s + ((o.total_kva ?? 0) > 0 ? (o.total_kva ?? 0) : (o.kva ?? 0) * (o.qty ?? 1)), 0)
    rows.push([`${DAY_TH_FULL[d.getDay()]} ${dateStr}`, DAY_EN[d.getDay()], `${actualQty} ตัว`, `${Math.round(totalKva).toLocaleString()} kVA`, `เสร็จใน ${dayFinish.toFixed(1)}h`])
    machineCells.forEach(({ m, machOff, sched, work, wall }) => {
      if (machOff) { rows.push(['', mLabel(m), '🔴 ปิด']); return }
      if (work.length === 0) return
      const otNote = (sched?.otHrs ?? 0) > 0 ? ` +OT ${sched!.otHrs.toFixed(1)}h` : ''
      rows.push(['', mLabel(m), `${wall.toFixed(1)}h${otNote}${sched?.carriesForward ? ' →' : ''}`])
      work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete).forEach(w => {
        const kva = w.order.kva ?? products[w.order.product]?.kva ?? 0
        const totalHrs = w.order.qty * getHrsForKva(m, kva, globalRates, w.order.item_code, globalTmcRates)
        rows.push(['', '', `${w.isCarryOver ? '↩ ' : ''}${w.order.sap_so ?? w.order.id}`, `${kva.toLocaleString()}kVA ×${w.order.qty}`, w.order.customer ?? '', `${w.hrsWorked.toFixed(1)}h / ${totalHrs.toFixed(1)}h ${w.isComplete ? '✓' : '→'}`])
      })
    })
    rows.push([])
  })

  const q = (s: string) => `"${s.replace(/"/g, '""')}"`
  const csv = rows.map(r => r.map(c => q(String(c))).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `cutting-plan-${fmtISO(mon)}_${fmtISO(sat)}.csv`; a.click()
  URL.revokeObjectURL(url)
}

export function exportTXT(ctx: ExportContext): void {
  const { weekData, products, globalRates, globalTmcRates, weekLabel, mon, sat } = ctx
  const lines: string[] = []
  lines.push(`แผนการตัดโลหะ — ${weekLabel}`)
  lines.push(`${weekData.totalQtyWeek} ตัว · ${Math.round(weekData.totalKvaWeek).toLocaleString()} kVA · OT ${weekData.totalOT.toFixed(1)}h`)
  lines.push('─'.repeat(60))
  weekData.dayRows.forEach(row => {
    const { d, machineCells, dayFinish, actualQty } = row
    if (!machineCells.some(mc => mc.work.length > 0 || mc.machOff)) return
    lines.push('')
    const totalKva = row.dayOrders.reduce((s, o) => s + ((o.total_kva ?? 0) > 0 ? (o.total_kva ?? 0) : (o.kva ?? 0) * (o.qty ?? 1)), 0)
    lines.push(`${DAY_TH_FULL[d.getDay()]} ${fmtISO(d)}  ${actualQty} ตัว · ${Math.round(totalKva).toLocaleString()} kVA  เสร็จใน ${dayFinish.toFixed(1)}h`)
    machineCells.forEach(({ m, machOff, sched, work, wall }) => {
      if (machOff) { lines.push(`  🔴 ${mLabel(m)} ปิด`); return }
      if (work.length === 0) return
      const ot = (sched?.otHrs ?? 0) > 0 ? ` +OT ${sched!.otHrs.toFixed(1)}h` : ''
      lines.push(`  ${mLabel(m).padEnd(18)} ${wall.toFixed(1)}h${ot}${sched?.carriesForward ? ' →' : ''}`)
      work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete).forEach(w => {
        const kva = w.order.kva ?? products[w.order.product]?.kva ?? 0
        const total = w.order.qty * getHrsForKva(m, kva, globalRates, w.order.item_code, globalTmcRates)
        const pre = w.isCarryOver ? '↩ ' : '  '
        lines.push(`    ${pre}${(w.order.sap_so ?? '').padEnd(14)} ${String(kva.toLocaleString() + 'kVA×' + w.order.qty).padEnd(12)} ${w.hrsWorked.toFixed(1)}h/${total.toFixed(1)}h ${w.isComplete ? '✓' : '→'}  ${w.order.customer ?? ''}`)
      })
    })
  })
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `cutting-plan-${fmtISO(mon)}_${fmtISO(sat)}.txt`; a.click(); URL.revokeObjectURL(url)
}

export function exportXLSX(ctx: ExportContext): void {
  const { weekData, machines, weekLabel, mon, sat, balanceMode } = ctx
  const wb = XLSX.utils.book_new()

  const schedRows: (string | number)[][] = [
    [`แผนการตัดโลหะ — ${weekLabel}`],
    [`${weekData.totalQtyWeek} ตัว`, `${Math.round(weekData.totalKvaWeek).toLocaleString()} kVA`, `OT: ${weekData.totalOT.toFixed(1)}h`, `Mode: ${balanceMode}`],
    [],
    ['วัน', 'วันที่', 'เครื่อง', 'SAP SO', 'kVA', 'จำนวน', 'ลูกค้า', 'Raw Mat', 'ชม.ทำงาน', 'ชม.รวม', 'สถานะ', 'ค้าง'],
  ]
  buildPlanRows(ctx).forEach(r => {
    if (r.machOff) { schedRows.push([r.day, r.date, r.machine, '🔴 ปิด']); return }
    schedRows.push([r.day, r.date, r.machine, r.sapSo, r.kva, r.qty, r.customer, r.rawMat, +r.hrsWorked.toFixed(2), +r.totalHrs.toFixed(2), r.done ? '✓ Done' : '→ In Prog', r.carryOver ? '→' : ''])
  })
  const ws = XLSX.utils.aoa_to_sheet(schedRows)
  ws['!cols'] = [10, 12, 16, 14, 8, 6, 18, 10, 10, 10, 12, 6].map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, ws, 'Schedule')

  const sumRows: (string | number)[][] = [['เครื่อง', 'kVA Range', 'h/ตัว', '×Rate', 'TMC', 'ตัว/สัปดาห์', 'ชม.รวม', 'OT']]
  machines.forEach((m, i) => {
    const t = weekData.mTotals[i]
    sumRows.push([mLabel(m), `${m.min_kva}–${m.max_kva >= 9999 ? '∞' : m.max_kva}`, m.hrs_per_unit, m.time_mul ?? 1, m.tmc_hrs ?? 0, t.qty, +t.wallHrs.toFixed(1), +t.ot.toFixed(1)])
  })
  const ws2 = XLSX.utils.aoa_to_sheet(sumRows)
  ws2['!cols'] = [18, 14, 8, 8, 8, 14, 10, 10].map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, ws2, 'Machines')

  XLSX.writeFile(wb, `cutting-plan-${fmtISO(mon)}_${fmtISO(sat)}.xlsx`)
}

export function exportJSON(ctx: ExportContext): void {
  const { weekData, machines, weekLabel, mon, sat } = ctx
  const data = {
    week: weekLabel,
    generated: new Date().toISOString(),
    summary: { qty: weekData.totalQtyWeek, kva: weekData.totalKvaWeek, ot: weekData.totalOT, bottleneck: weekData.bottleneckWall },
    machines: machines.map((m, i) => ({ ...m, weekly: weekData.mTotals[i] })),
    schedule: buildPlanRows(ctx),
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `cutting-plan-${fmtISO(mon)}_${fmtISO(sat)}.json`; a.click(); URL.revokeObjectURL(url)
}

/** Machine-first XLSX: each machine gets its own sheet showing its full week */
export function exportMachineXLSX(ctx: ExportContext): void {
  const { weekData, machines, products, globalRates, globalTmcRates, weekLabel, mon, sat } = ctx
  const wb = XLSX.utils.book_new()

  machines.forEach((m, mi) => {
    const total = weekData.mTotals[mi]
    const rows: (string | number)[][] = [
      [`${mLabel(m)}  —  ${weekLabel}`],
      [`${m.min_kva}–${m.max_kva >= 9999 ? '∞' : m.max_kva} kVA`, `${m.hrs_per_unit}h/ตัว`, `×${m.time_mul ?? 1}`, `TMC +${m.tmc_hrs ?? 0}h`],
      [`${total.qty} ตัว`, `${total.wallHrs.toFixed(1)}h / ${total.regCap}h reg`, `OT: ${total.ot.toFixed(1)}h`],
      [],
      ['วันที่', 'วัน', 'รวม(h)', 'OT(h)', 'SAP SO', 'kVA', 'จำนวน', 'ลูกค้า', 'Raw Mat', 'ทำ(h)', 'รวมคิว(h)', 'สถานะ'],
    ]

    weekData.dayRows.forEach(row => {
      const { d } = row
      const mc = row.machineCells[mi]
      const dStr = fmtISO(d)

      if (mc.machOff) {
        rows.push([dStr, DAY_TH_FULL[d.getDay()], '', '', '🔴 ปิด'])
        return
      }

      const work = mc.work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete)
      if (work.length === 0) {
        rows.push([dStr, DAY_TH_FULL[d.getDay()], '—'])
        return
      }

      work.forEach((w, wi) => {
        const kva = w.order.kva ?? products[w.order.product]?.kva ?? 0
        const totalHrs = w.order.qty * getHrsForKva(m, kva, globalRates, w.order.item_code, globalTmcRates)
        rows.push([
          wi === 0 ? dStr : '',
          wi === 0 ? DAY_TH_FULL[d.getDay()] : '',
          wi === 0 ? +mc.wall.toFixed(1) : '',
          wi === 0 ? +(mc.sched?.otHrs ?? 0).toFixed(1) || '' : '',
          `${w.isCarryOver ? '↩ ' : ''}${w.order.sap_so ?? w.order.id}`,
          kva, w.order.qty, w.order.customer ?? '', w.order.raw_mat ?? '',
          +w.hrsWorked.toFixed(2), +totalHrs.toFixed(2),
          w.isComplete ? '✓' : (w.carriesOver ? '→ ต่อ' : '→'),
        ])
      })
    })

    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [12, 10, 8, 6, 16, 6, 6, 18, 10, 8, 10, 10].map(w => ({ wch: w }))
    const sheetName = mLabel(m).replace(/[:\\/?*[\]]/g, '').substring(0, 31)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  })

  XLSX.writeFile(wb, `cutting-plan-by-machine-${fmtISO(mon)}_${fmtISO(sat)}.xlsx`)
}

/** Machine-first Print: one assignment card per machine — hand to floor workers */
export function exportMachinePrint(ctx: ExportContext): void {
  const { weekData, machines, products, globalRates, globalTmcRates, weekLabel, balanceMode } = ctx

  let html = `<html><head><meta charset="utf-8"><title>แผนต่อเครื่อง ${weekLabel}</title><style>
    body{font-family:sans-serif;font-size:11px;margin:10px}
    .card{page-break-after:always;margin-bottom:16px}
    .card:last-child{page-break-after:auto}
    .mname{font-size:14px;font-weight:700;margin:0 0 2px}
    .mspec{color:#666;font-size:10px;margin:0 0 3px}
    .mtot{font-size:11px;margin:0 0 6px;color:#333}
    .week{color:#888;font-size:10px}
    table{border-collapse:collapse;width:100%}
    th{background:#e8e8e8;font-size:10px;font-weight:600;padding:3px 5px;text-align:left;border:1px solid #ccc}
    td{border:1px solid #ddd;padding:2px 5px;font-size:10px;vertical-align:top}
    td.date{background:#f5f5f5;font-weight:600;white-space:nowrap}
    td.wall{text-align:right;white-space:nowrap}
    td.ot{color:#fe640b;text-align:right}
    .done{color:#40a02b;font-weight:700}.carry{color:#fe640b}
    .dayoff{color:#e0534a}
    @media print{body{margin:5mm}.card{page-break-after:always}}
  </style></head><body>`

  html += `<div class="week">แผนการตัดโลหะ — ${weekLabel} · Mode: ${balanceMode}</div>`

  machines.forEach((m, mi) => {
    const total = weekData.mTotals[mi]
    html += `<div class="card">`
    html += `<div class="mname">${mLabel(m)}</div>`
    html += `<div class="mspec">${m.min_kva}–${m.max_kva >= 9999 ? '∞' : m.max_kva} kVA &nbsp;·&nbsp; ${m.hrs_per_unit}h/ตัว &nbsp;·&nbsp; ×${m.time_mul ?? 1}${(m.tmc_hrs ?? 0) > 0 ? ` +${m.tmc_hrs}h TMC` : ''}</div>`
    html += `<div class="mtot">${total.qty} ตัว &nbsp;·&nbsp; ${total.wallHrs.toFixed(1)}h / ${total.regCap}h reg &nbsp;·&nbsp; OT ${total.ot.toFixed(1)}h</div>`
    html += `<table><tr><th>วันที่</th><th>วัน</th><th style="text-align:right">ชม.</th><th style="text-align:right">OT</th><th>SAP SO</th><th>kVA</th><th>Qty</th><th>ลูกค้า</th><th>ทำ</th><th>สถานะ</th></tr>`

    weekData.dayRows.forEach(row => {
      const { d } = row
      const mc = row.machineCells[mi]
      if (mc.machOff) {
        html += `<tr><td class="date">${fmtISO(d)}</td><td>${DAY_TH_FULL[d.getDay()]}</td><td colspan="8" class="dayoff">🔴 ปิด</td></tr>`
        return
      }
      const work = mc.work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete)
      if (work.length === 0) {
        html += `<tr><td class="date">${fmtISO(d)}</td><td>${DAY_TH_FULL[d.getDay()]}</td><td colspan="8" style="color:#aaa">—</td></tr>`
        return
      }
      work.forEach((w, wi) => {
        const kva = w.order.kva ?? products[w.order.product]?.kva ?? 0
        const totalHrs = w.order.qty * getHrsForKva(m, kva, globalRates, w.order.item_code, globalTmcRates)
        const status = w.isComplete ? `<span class="done">✓</span>` : `<span class="carry">→</span>`
        const otHrs = mc.sched?.otHrs ?? 0
        html += `<tr>
          <td class="date">${wi === 0 ? fmtISO(d) : ''}</td>
          <td>${wi === 0 ? DAY_TH_FULL[d.getDay()] : ''}</td>
          <td class="wall">${wi === 0 ? mc.wall.toFixed(1) + 'h' : ''}</td>
          <td class="ot">${wi === 0 && otHrs > 0 ? '+' + otHrs.toFixed(1) + 'h' : ''}</td>
          <td>${w.isCarryOver ? '↩ ' : ''}${w.order.sap_so ?? w.order.id}</td>
          <td>${kva.toLocaleString()}</td>
          <td>×${w.order.qty}</td>
          <td>${w.order.customer ?? ''}</td>
          <td style="white-space:nowrap">${w.hrsWorked.toFixed(1)}/${totalHrs.toFixed(1)}h</td>
          <td>${status}</td>
        </tr>`
      })
    })

    html += `</table></div>`
  })

  html += '<script>window.onload=function(){window.print()}<\/script></body></html>'
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export function exportPrint(ctx: ExportContext): void {
  const { weekData, products, globalRates, globalTmcRates, weekLabel, balanceMode } = ctx
  let html = `<html><head><meta charset="utf-8"><title>แผนการตัดโลหะ ${weekLabel}</title><style>
    body{font-family:sans-serif;font-size:11px;margin:12px}
    h2{font-size:13px;margin:0 0 4px}
    .sum{color:#666;margin-bottom:10px}
    .day{font-weight:700;font-size:12px;background:#eee;padding:3px 6px;margin:8px 0 3px;border-radius:3px}
    .mach{font-weight:600;padding:2px 4px;margin:2px 0;color:#333}
    .moff{color:#e0534a;padding:2px 4px}
    table{border-collapse:collapse;width:100%;margin-bottom:2px}
    td{border:1px solid #ddd;padding:2px 5px;font-size:10px}
    td.h{background:#f5f5f5;font-weight:600}
    .done{color:#40a02b}.carry{color:#fe640b}
    @media print{body{margin:6mm}}
  </style></head><body>`
  html += `<h2>แผนการตัดโลหะ — ${weekLabel}</h2>`
  html += `<div class="sum">${weekData.totalQtyWeek} ตัว · ${Math.round(weekData.totalKvaWeek).toLocaleString()} kVA · OT ${weekData.totalOT.toFixed(1)}h · Mode: ${balanceMode}</div>`
  weekData.dayRows.forEach(row => {
    const { d, machineCells, dayFinish, actualQty } = row
    if (!machineCells.some(mc => mc.work.length > 0 || mc.machOff)) return
    const totalKva = row.dayOrders.reduce((s, o) => s + ((o.total_kva ?? 0) > 0 ? (o.total_kva ?? 0) : (o.kva ?? 0) * (o.qty ?? 1)), 0)
    html += `<div class="day">${DAY_TH_FULL[d.getDay()]} ${fmtISO(d)} &nbsp; ${actualQty} ตัว · ${Math.round(totalKva).toLocaleString()} kVA &nbsp; เสร็จใน ${dayFinish.toFixed(1)}h</div>`
    machineCells.forEach(({ m, machOff, sched, work, wall }) => {
      if (machOff) { html += `<div class="moff">🔴 ${mLabel(m)} ปิด</div>`; return }
      if (work.length === 0) return
      const ot = (sched?.otHrs ?? 0) > 0 ? ` <span style="color:#fe640b">+OT ${sched!.otHrs.toFixed(1)}h</span>` : ''
      html += `<div class="mach">${mLabel(m)} &nbsp; ${wall.toFixed(1)}h${ot}${sched?.carriesForward ? ' <span class="carry">→</span>' : ''}</div>`
      html += `<table><tr><td class="h">SAP SO</td><td class="h">kVA</td><td class="h">Qty</td><td class="h">ลูกค้า</td><td class="h">Raw Mat</td><td class="h">ชม.</td><td class="h">สถานะ</td></tr>`
      work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete).forEach(w => {
        const kva = w.order.kva ?? products[w.order.product]?.kva ?? 0
        const total = w.order.qty * getHrsForKva(m, kva, globalRates, w.order.item_code, globalTmcRates)
        const st = w.isComplete ? `<span class="done">✓</span>` : `<span class="carry">→</span>`
        html += `<tr><td>${w.isCarryOver ? '↩ ' : ''}${w.order.sap_so ?? ''}</td><td>${kva.toLocaleString()}</td><td>×${w.order.qty}</td><td>${w.order.customer ?? ''}</td><td>${w.order.raw_mat ?? ''}</td><td>${w.hrsWorked.toFixed(1)}/${total.toFixed(1)}h</td><td>${st}</td></tr>`
      })
      html += '</table>'
    })
  })
  html += '</body></html>'
  const win = window.open('', '_blank')
  if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 400) }
}
