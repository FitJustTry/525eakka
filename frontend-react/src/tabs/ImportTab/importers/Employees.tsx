import { useState, useRef } from 'react'
import { useApp } from '../../../context/AppContext'
import { api } from '../../../api'
import type { EmpDir } from '../../../api'
import type { Employee } from '../../../types'
import { DropZone, ResultBanner, KpiCard, cancelBtn, importBtn, thStyle, tdStyle } from '../shared'
import { findHeaderRow } from '../parsers/masterplan'
import { guessEmpCols, parseBool, type ParsedEmployee } from '../parsers/employees'

export default function Employees() {
  const { dispatch } = useApp()
  const [dragOver, setDragOver] = useState(false)
  const [parsed, setParsed] = useState<ParsedEmployee[]>([])
  const [result, setResult] = useState<string | null>(null)
  const [empHeaders, setEmpHeaders] = useState<string[]>([])
  const [empColMap, setEmpColMap] = useState<Record<string, number>>({})
  const [rawRows, setRawRows] = useState<unknown[][]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setResult(null); setParsed([]); setRawRows([]); setEmpHeaders([])
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
      setEmpHeaders(headers); setEmpColMap(cols as Record<string, number>)
      setRawRows(rows.slice(headerRowIdx + 1).filter(r => (r as unknown[]).some(v => v != null && String(v).trim() !== '')))
      const result: ParsedEmployee[] = []
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i] as unknown[]
        if (row.every(v => !v || String(v).trim() === '')) continue
        const name = cols.name >= 0 ? String(row[cols.name] ?? '').trim() : ''
        const id = cols.id >= 0 ? String(row[cols.id] ?? '').trim() : ''
        if (!name && !id) continue
        result.push({
          wc: cols.wc >= 0 ? String(row[cols.wc] ?? '').trim() : '',
          id: id || `EMP-${i}`, name,
          title: cols.title >= 0 ? String(row[cols.title] ?? '').trim() : '',
          dept: cols.dept >= 0 ? String(row[cols.dept] ?? '').trim() : '',
          is_active: cols.is_active >= 0 ? parseBool(row[cols.is_active]) : true,
          is_head: cols.is_head >= 0 ? parseBool(row[cols.is_head]) : false,
        })
      }
      if (result.length === 0) { setResult('❌ ไม่พบข้อมูลพนักงาน — ตรวจสอบชื่อคอลัมน์'); return }
      setParsed(result)
    } catch (e) { alert('อ่านไฟล์ไม่ได้: ' + (e instanceof Error ? e.message : String(e))) }
  }

  async function handleLoad() {
    if (parsed.length === 0) return
    const empDir: EmpDir = {}
    parsed.forEach(e => {
      const wc = e.wc || 'UNKNOWN'
      if (!empDir[wc]) empDir[wc] = { dept: e.dept, employees: [] }
      empDir[wc].employees.push({ id: e.id, name: e.name, title: e.title, dept: e.dept, wc, is_active: e.is_active, is_head: e.is_head })
    })
    const empState: Record<string, Employee[]> = {}
    Object.entries(empDir).forEach(([wc, { employees: list }]) => { empState[wc] = list })
    dispatch({ type: 'SET_EMPLOYEES', employees: empState })
    setParsed([]); setRawRows([]); setEmpHeaders([])
    try {
      await api.employees.batch(empDir)
      setResult(`โหลดสำเร็จ — ${Object.values(empDir).reduce((s, d) => s + d.employees.length, 0)} คน จาก ${Object.keys(empDir).length} Work Centers`)
    } catch {
      setResult('โหลดเข้าระบบแล้ว แต่บันทึก DB ไม่ได้ (ตรวจสอบ backend)')
    }
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {parsed.length === 0 && rawRows.length === 0 && (
        <DropZone dragOver={dragOver} setDragOver={setDragOver} fileRef={fileRef}
          onFile={handleFile} label="วางไฟล์ Excel ข้อมูลพนักงาน" />
      )}
      {result && <ResultBanner msg={result} onClear={() => setResult(null)} />}
      {parsed.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <KpiCard label="พนักงานทั้งหมด" val={parsed.length} col="var(--blue)" />
            <KpiCard label="Work Centers" val={new Set(parsed.map(e => e.wc).filter(Boolean)).size} col="var(--amber)" />
            <KpiCard label="Active" val={parsed.filter(e => e.is_active).length} col="var(--green)" />
            <KpiCard label="หัวหน้า" val={parsed.filter(e => e.is_head).length} col="var(--txt2)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>ตรวจสอบข้อมูลพนักงาน {parsed.length} คน</div>
            <div style={{ fontSize: 10, color: 'var(--txt3)' }}>คอลัมน์ที่ตรงจะ highlight สีน้ำเงิน</div>
            <div style={{ flex: 1 }} />
            <button onClick={() => { setParsed([]); setRawRows([]); setEmpHeaders([]) }} style={cancelBtn}>✕ ยกเลิก</button>
            <button onClick={handleLoad} style={importBtn}>✓ โหลด {parsed.length} คน เข้าระบบ</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {empHeaders.map((h, hi) => {
                    const isMapped = Object.values(empColMap).includes(hi)
                    return <th key={hi} style={{ ...thStyle, background: isMapped ? 'rgba(137,180,250,.2)' : 'var(--bg3)', color: isMapped ? 'var(--blue)' : 'var(--txt3)' }}>{h}</th>
                  })}
                </tr>
              </thead>
              <tbody>
                {rawRows.slice(0, 200).map((row, ri) => (
                  <tr key={ri}>
                    {empHeaders.map((_, ci) => {
                      const isMapped = Object.values(empColMap).includes(ci)
                      return <td key={ci} style={{ ...tdStyle, fontSize: 10, background: isMapped ? 'rgba(137,180,250,.04)' : 'transparent', fontFamily: isMapped ? 'var(--mono)' : 'inherit' }}>{String((row as unknown[])[ci] ?? '')}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {rawRows.length > 200 && <div style={{ padding: '8px 14px', fontSize: 10, color: 'var(--txt3)' }}>แสดง 200 จาก {rawRows.length} แถว</div>}
          </div>
        </>
      )}
    </div>
  )
}
