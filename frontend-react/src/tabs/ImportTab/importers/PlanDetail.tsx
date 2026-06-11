import { useState, useRef } from 'react'
import { DropZone, ResultBanner, cancelBtn, importBtn, thStyle, tdStyle } from '../shared'
import { findHeaderRow, itemCodeToProduct } from '../parsers/masterplan'
import { guessPlanDetailCols, type ParsedPlanDetail } from '../parsers/plandetail'
import { parseDate, detectSlashFmt, planDateToWeekStart } from '../parsers/dates'

export default function PlanDetail() {
  const [dragOver, setDragOver] = useState(false)
  const [parsed, setParsed] = useState<ParsedPlanDetail[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setResult(null); setParsed([])
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
        result.push({
          week_start: planDateToWeekStart(lastPlanDate),
          plan_date: lastPlanDate, seq: seq++, sap_so: id, item_code: itemCode,
          product: itemCodeToProduct(itemCode) || (kva <= 160 ? 'tr.160kVA' : kva <= 630 ? 'tr.630kVA' : kva <= 1600 ? 'tr.1600kVA' : 'tr.4000kVA'),
          customer: cols.customer >= 0 ? String(row[cols.customer] ?? '').trim() : '',
          kva, qty: cols.qty >= 0 ? parseInt(String(row[cols.qty] ?? '').replace(/,/g, '')) || 1 : 1,
          deadline: parseDate(cols.deadline >= 0 ? row[cols.deadline] : undefined, dateFmt),
          face_mm: rawFaceMm ? parseInt(rawFaceMm) || null : null,
          electrical: cols.electrical >= 0 ? String(row[cols.electrical] ?? '').trim() : '',
          hv: cols.hv >= 0 ? String(row[cols.hv] ?? '').trim() : '',
          lv: cols.lv >= 0 ? String(row[cols.lv] ?? '').trim() : '',
          comment: cols.comment >= 0 ? String(row[cols.comment] ?? '').trim() : '',
          category: cols.category >= 0 ? String(row[cols.category] ?? '').trim() : '',
        })
      }
      if (result.length === 0) { setParsed([]); setResult('❌ ไม่พบข้อมูล — ตรวจสอบชื่อคอลัมน์'); return }
      setParsed(result)
    } catch (e) { alert('อ่านไฟล์ไม่ได้: ' + (e instanceof Error ? e.message : String(e))) }
  }

  async function handleImport() {
    if (parsed.length === 0) return
    setImporting(true)
    try {
      const res = await fetch('/api/plan-orders/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed) })
      if (!res.ok) throw new Error(await res.text())
      const { inserted } = await res.json()
      const weeks = [...new Set(parsed.map(r => r.week_start))].sort()
      const totalQty = parsed.reduce((s, r) => s + r.qty, 0)
      setResult(`✅ นำเข้าสำเร็จ — ${inserted} รายการ · ${totalQty} เครื่อง · ${weeks.length} สัปดาห์`)
      setParsed([])
    } catch (e) {
      setResult('❌ เกิดข้อผิดพลาด: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setImporting(false) }
  }

  const weeks = [...new Set(parsed.map(r => r.week_start))].sort()
  const totalQty = parsed.reduce((s, r) => s + r.qty, 0)
  const totalKva = parsed.reduce((s, r) => s + r.kva * r.qty, 0)

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {parsed.length === 0 && (
        <DropZone dragOver={dragOver} setDragOver={setDragOver} fileRef={fileRef}
          onFile={handleFile} label="วางไฟล์ Excel Master Plan (รายละเอียด) ที่นี่" />
      )}
      {result && <ResultBanner msg={result} onClear={() => setResult(null)} />}
      {parsed.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{parsed.length} รายการ</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginRight: 'auto' }}>
              {totalQty} ตัว · {totalKva.toLocaleString()} kVA รวม · {weeks.length} สัปดาห์ — ตรวจสอบก่อนกด Import
            </div>
            <button onClick={() => setParsed([])} style={cancelBtn}>✕ ยกเลิก</button>
            <button onClick={handleImport} disabled={importing}
              style={{ ...importBtn, background: importing ? 'var(--bord2)' : 'var(--green)' }}>
              {importing ? 'กำลังนำเข้า…' : `✓ Import ${parsed.length} รายการ`}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {weeks.map(w => {
              const wRows = parsed.filter(r => r.week_start === w)
              return (
                <div key={w} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'var(--bg3)', border: '1px solid var(--bord)', fontSize: 11 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue)' }}>{w}</span>
                  <span style={{ color: 'var(--txt2)' }}>{wRows.length} ออเดอร์</span>
                  <span style={{ color: 'var(--amber)', fontFamily: 'var(--mono)' }}>{wRows.reduce((s, r) => s + r.qty, 0)} ตัว</span>
                  <span style={{ color: 'var(--txt3)', fontSize: 10 }}>{wRows.reduce((s, r) => s + r.kva * r.qty, 0).toLocaleString()} kVA</span>
                </div>
              )
            })}
          </div>
          <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
              <thead><tr>
                {['สัปดาห์','วันที่','SAP SO','Item Code','ลูกค้า','kVA','จำนวน','Deadline','หน้ากว้าง (mm)','ระบบไฟฟ้า','HV','LV','ประเภท','Comment'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {parsed.map((r, i) => (
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
      )}
    </div>
  )
}
