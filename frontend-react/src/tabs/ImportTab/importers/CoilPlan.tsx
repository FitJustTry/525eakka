import { useState, useRef, useMemo } from 'react'
import { api } from '../../../api'
import { DropZone, ResultBanner, cancelBtn, importBtn, thStyle, tdStyle, DAY_TH } from '../shared'
import { parseCoilPlan, type ParsedCoilRow } from '../parsers/masterplan'

export default function CoilPlan() {
  const [dragOver, setDragOver] = useState(false)
  const [parsed, setParsed] = useState<ParsedCoilRow[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setResult(null); setParsed([])
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
      const { rows: r } = parseCoilPlan(rows)
      setParsed(r)
    } catch (e) { setResult('❌ ' + (e instanceof Error ? e.message : String(e))) }
  }

  async function handleImport() {
    if (parsed.length === 0) return
    setImporting(true)
    try {
      const weekStart = parsed.reduce((min, r) => r.plan_date < min ? r.plan_date : min, parsed[0].plan_date)
      const { inserted } = await api.coilPlan.batch(parsed, weekStart)
      const dayMap = new Map<string, number>()
      parsed.forEach(r => { dayMap.set(r.plan_date, (dayMap.get(r.plan_date) ?? 0) + 1) })
      const daySummary = [...dayMap.entries()].sort().map(([d, n]) => `${d.slice(5)} (${n})`).join(' · ')
      setResult(`✅ นำเข้าสำเร็จ — ${inserted} รายการ\n${daySummary}`)
      setParsed([])
    } catch (e) {
      setResult('❌ ' + (e instanceof Error ? e.message : String(e)))
    } finally { setImporting(false) }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, ParsedCoilRow[]>()
    for (const r of parsed) { if (!map.has(r.plan_date)) map.set(r.plan_date, []); map.get(r.plan_date)!.push(r) }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, rows]) => {
      const d = new Date(date + 'T00:00:00')
      return { date, dayLabel: isNaN(d.getTime()) ? '' : DAY_TH[d.getDay()], rows, totalQty: rows.reduce((s, r) => s + r.qty, 0), totalKva: rows.reduce((s, r) => s + r.total_kva, 0) }
    })
  }, [parsed])

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {parsed.length === 0 && (
        <DropZone dragOver={dragOver} setDragOver={setDragOver} fileRef={fileRef}
          onFile={handleFile} label="วางไฟล์ Excel แผนลงคอยล์" />
      )}
      {result && <ResultBanner msg={result} onClear={() => setResult(null)} />}
      {parsed.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{parsed.length} รายการ Coil Plan</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginRight: 'auto' }}>ตรวจสอบข้อมูลก่อนกด Import</div>
            <button onClick={() => setParsed([])} style={cancelBtn}>✕ ยกเลิก</button>
            <button onClick={handleImport} disabled={importing}
              style={{ ...importBtn, background: importing ? 'var(--bord2)' : 'var(--blue)' }}>
              {importing ? 'กำลังนำเข้า…' : `✓ Import ${parsed.length} รายการ`}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {grouped.map(({ date, dayLabel, rows, totalQty }) => (
              <div key={date} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'var(--bg3)', border: '1px solid var(--bord)', fontSize: 11 }}>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue)' }}>{date.slice(5)}</span>
                <span style={{ color: 'var(--txt3)', fontSize: 10 }}>{dayLabel}</span>
                <span style={{ color: 'var(--txt2)' }}>{rows.length} ออเดอร์</span>
                <span style={{ color: 'var(--amber)', fontFamily: 'var(--mono)' }}>{totalQty} ตัว</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'rgba(137,180,250,.1)', border: '1px solid rgba(137,180,250,.3)', fontSize: 11 }}>
              <span style={{ color: 'var(--blue)', fontWeight: 700 }}>รวม {grouped.length} วัน · {grouped.reduce((s, g) => s + g.totalQty, 0)} ตัว</span>
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8 }}>
            <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
              <thead>
                <tr>
                  {([['ลำดับ','center'],['ความสำคัญ','center'],['SAPSO','left'],['Itemcode','left'],['Comment','left'],['Plant','left'],['KVA','right'],['ระบบไฟฟ้า','center'],['ลูกค้า','left'],['Total KVA','right'],['จำนวน','center'],['เข้าเทส','left'],['CableBox','left'],['Control','left'],['กำหนดส่งเข้าสโตร์','left'],['DUE SO','left'],['แจ้งปรับแผนการผลิต','left'],['Due Clamp','left'],['Due BOX/CTRL BOX','left'],['Raw Mat','left'],['LV','left'],['HV','left']] as [string,string][]).map(([label, align]) => (
                    <th key={label} style={{ ...thStyle, textAlign: align as 'left'|'center'|'right' }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped.map(({ date, dayLabel, rows, totalQty, totalKva }) => (
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
                            {r.importance ? <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, fontWeight: 700, background: r.importance === 'หลัก' ? 'rgba(137,180,250,.18)' : r.importance === 'เสริม' ? 'rgba(166,227,161,.18)' : 'var(--bg3)', color: catColor }}>{r.importance}</span> : <span style={{ color: 'var(--txt3)', fontSize: 10 }}>—</span>}
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
  )
}
