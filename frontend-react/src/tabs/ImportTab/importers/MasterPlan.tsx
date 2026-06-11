import { useState, useRef, useMemo } from 'react'
import { useApp } from '../../../context/AppContext'
import { api } from '../../../api'
import type { Order } from '../../../types'
import { DropZone, ResultBanner, cancelBtn, importBtn, thStyle, tdStyle, DAY_TH } from '../shared'
import { parseCoilPlan, itemCodeToProduct, type ParsedCoilRow } from '../parsers/masterplan'
import { dmyToISO, localISO } from '../parsers/dates'

export default function MasterPlan() {
  const { state, dispatch } = useApp()
  const { orders } = state

  const [dragOver, setDragOver] = useState(false)
  const [parsed, setParsed] = useState<ParsedCoilRow[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [colMap, setColMap] = useState<Record<string, number>>({})
  const [activeDay, setActiveDay] = useState<string | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setResult(null); setParsed([]); setActiveDay(null); setMapOpen(false)
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
      const { rows: r, headers: h, colMap: cm } = parseCoilPlan(rows)
      setParsed(r); setHeaders(h); setColMap(cm)
    } catch (e) { setResult('❌ ' + (e instanceof Error ? e.message : String(e))) }
  }

  async function handleImport() {
    if (parsed.length === 0) return
    setImporting(true)
    try {
      const newOrders: Order[] = parsed.map((r, idx) => {
        const deadline = dmyToISO(r.due_so) || dmyToISO(r.enter_test) || r.plan_date || localISO(new Date(Date.now() + 30 * 86400000))
        const id = `${r.plan_date}_${String(idx).padStart(4, '0')}_${r.sap_so || 'x'}`
        const d = new Date(r.plan_date + 'T00:00:00')
        const dow = d.getDay()
        d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
        const week_start = localISO(d)
        return {
          id, product: itemCodeToProduct(r.item_code) || (r.kva <= 160 ? 'tr.160kVA' : r.kva <= 630 ? 'tr.630kVA' : r.kva <= 2000 ? 'tr.2000kVA' : 'tr.4000kVA'),
          qty: r.qty || 1, deadline: deadline!, customer: r.customer, kva: r.kva,
          category: r.importance || '', sap_so: r.sap_so, plan_date: r.plan_date,
          comment: r.comment, item_code: r.item_code, week_start, seq: r.seq || idx,
          plant: r.plant, electrical: r.electrical, total_kva: r.total_kva,
          enter_test: r.enter_test, cable_box: r.cable_box, control: r.control,
          due_store: r.due_store, due_so: r.due_so, adjust_plan: r.adjust_plan,
          due_clamp: r.due_clamp, due_box_ctrl: r.due_box_ctrl, raw_mat: r.raw_mat,
          lv: r.lv, hv: r.hv,
        }
      })
      const existing = new Set(orders.map(o => o.id))
      const toAdd = newOrders.filter(o => !existing.has(o.id))
      const toUpdate = newOrders.filter(o => existing.has(o.id))
      const merged = [...orders]
      toUpdate.forEach(o => { const i = merged.findIndex(m => m.id === o.id); if (i >= 0) merged[i] = o })
      toAdd.forEach(o => merged.push(o))
      dispatch({ type: 'SET_ORDERS', orders: merged })
      await api.orders.batch(merged)
      const dayMap = new Map<string, number>()
      newOrders.forEach(o => { const d = o.plan_date || '(ไม่ระบุ)'; dayMap.set(d, (dayMap.get(d) ?? 0) + 1) })
      const daySummary = [...dayMap.entries()].sort().map(([d, n]) => `${d.slice(5)} (${n})`).join(' · ')
      const totalQty = newOrders.reduce((s, o) => s + o.qty, 0)
      setResult(`✅ นำเข้าสำเร็จ — ${toAdd.length} ใหม่ · ${toUpdate.length} อัปเดต · ${totalQty} เครื่อง\n${daySummary}`)
      setParsed([])
    } catch (e) {
      setResult('❌ เกิดข้อผิดพลาด: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setImporting(false) }
  }

  const days = useMemo(() => {
    const map = new Map<string, ParsedCoilRow[]>()
    parsed.forEach(r => { if (!map.has(r.plan_date)) map.set(r.plan_date, []); map.get(r.plan_date)!.push(r) })
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, rows]) => {
      const d = new Date(date + 'T00:00:00')
      return { date, dayLabel: isNaN(d.getTime()) ? '' : DAY_TH[d.getDay()], rows, totalQty: rows.reduce((s, r) => s + r.qty, 0), totalKva: rows.reduce((s, r) => s + r.kva * r.qty, 0) }
    })
  }, [parsed])

  const visibleDays = activeDay ? days.filter(d => d.date === activeDay) : days

  const FIELD_LABEL: Record<string, string> = {
    date: 'Plan Date', seq: 'Sequence', importance: 'Importance', sap: 'SAP SO',
    itemcode: 'Item Code ⭐', comment: 'Comment', plant: 'Plant', kva: 'kVA',
    elec: 'Electrical', customer: 'Customer', totalKva: 'Total kVA', qty: 'Quantity',
    enterTest: 'Enter Test', cable: 'Cable Box', control: 'Control', dueStore: 'Due Store',
    dueSO: 'Due SO', adjustPlan: 'Adjust Plan', dueClamp: 'Due Clamp',
    dueBox: 'Due Box', dueCtrlBox: 'Due Ctrl Box', rawMat: 'Raw Mat', lv: 'LV', hv: 'HV',
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {parsed.length === 0 && (
        <DropZone dragOver={dragOver} setDragOver={setDragOver} fileRef={fileRef}
          onFile={handleFile} label="วางไฟล์ Excel Master Plan (รูปแบบเดียวกับ Coil Plan) ที่นี่" />
      )}
      {result && <ResultBanner msg={result} onClear={() => setResult(null)} />}
      {parsed.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{parsed.length} รายการ</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginRight: 'auto' }}>
              {days.reduce((s, d) => s + d.totalQty, 0)} เครื่อง · {days.reduce((s, d) => s + d.totalKva, 0).toLocaleString()} kVA · ตรวจสอบก่อนกด Import
            </div>
            <button onClick={() => setParsed([])} style={cancelBtn}>✕ ยกเลิก</button>
            <button onClick={handleImport} disabled={importing}
              style={{ ...importBtn, background: importing ? 'var(--bord2)' : 'var(--green)' }}>
              {importing ? 'กำลังนำเข้า…' : `✓ Import ${parsed.length} รายการ`}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, flexShrink: 0 }}>
            {days.map(({ date, dayLabel, rows, totalQty, totalKva }) => {
              const isActive = activeDay === date
              return (
                <button key={date} onClick={() => setActiveDay(isActive ? null : date)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', background: isActive ? 'rgba(137,180,250,.2)' : 'var(--bg3)', border: `1px solid ${isActive ? 'rgba(137,180,250,.5)' : 'var(--bord)'}`, fontSize: 11, outline: 'none' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue)' }}>{date.slice(5)}</span>
                  <span style={{ color: 'var(--txt3)', fontSize: 10 }}>{dayLabel}</span>
                  <span style={{ color: 'var(--txt2)', fontWeight: isActive ? 700 : 400 }}>{rows.length} รายการ</span>
                  <span style={{ color: 'var(--txt3)' }}>·</span>
                  <span style={{ color: 'var(--amber)', fontFamily: 'var(--mono)' }}>{totalQty} ตัว</span>
                  <span style={{ color: 'var(--txt3)' }}>·</span>
                  <span style={{ color: 'var(--txt3)', fontSize: 10 }}>{totalKva.toLocaleString()} kVA</span>
                </button>
              )
            })}
            {activeDay && <button onClick={() => setActiveDay(null)} style={{ ...cancelBtn, fontSize: 10, padding: '3px 8px', borderRadius: 14 }}>✕ ทั้งหมด</button>}
          </div>
          {headers.length > 0 && (
            <div style={{ marginBottom: 8, border: '1px solid var(--bord)', borderRadius: 8, flexShrink: 0, overflow: 'hidden' }}>
              <button onClick={() => setMapOpen(v => !v)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--bg2)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Column Mapping — {Object.values(colMap).filter(i => i >= 0).length} / {headers.length} collected
                </span>
                <span style={{ fontSize: 9, color: 'var(--txt3)', marginLeft: 'auto' }}>{mapOpen ? '▲' : '▼'}</span>
              </button>
              {mapOpen && (
                <div style={{ padding: '6px 12px 10px', display: 'flex', flexWrap: 'wrap', gap: 5, background: 'var(--bg2)' }}>
                  {headers.map((h, i) => {
                    const colToField: Record<number, string> = {}
                    for (const [field, idx] of Object.entries(colMap)) { if (idx >= 0) colToField[idx] = FIELD_LABEL[field] ?? field }
                    const field = colToField[i]
                    const isKey = field?.includes('⭐')
                    return (
                      <div key={i} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: field ? (isKey ? 'rgba(250,179,135,.2)' : 'rgba(166,227,161,.15)') : 'var(--bg3)', border: `1px solid ${field ? (isKey ? 'rgba(250,179,135,.4)' : 'rgba(166,227,161,.3)') : 'var(--bord)'}`, color: field ? (isKey ? 'var(--amber)' : 'var(--green)') : 'var(--txt3)' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{h || `col${i}`}</span>
                        {field && <span style={{ marginLeft: 4, opacity: 0.8 }}>→ {field}</span>}
                        {!field && <span style={{ marginLeft: 4, opacity: 0.5 }}>not collected</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 8 }}>
            <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
              <thead>
                <tr>
                  {([['ลำดับ','center'],['ความสำคัญ','center'],['SAP SO','left'],['Item Code','left'],['Comment','left'],['Plant','left'],['kVA','right'],['ระบบไฟฟ้า','center'],['ลูกค้า','left'],['Total kVA','right'],['จำนวน','center'],['เข้าเทส','left'],['Cable Box','left'],['Control','left'],['กำหนดส่งสโตร์','left'],['DUE SO','left'],['แจ้งปรับแผน','left'],['Due Clamp','left'],['Due BOX/CTRL','left'],['Raw Mat','left'],['LV','left'],['HV','left']] as [string,string][]).map(([label, align]) => (
                    <th key={label} style={{ ...thStyle, textAlign: align as 'left'|'center'|'right' }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleDays.map(({ date, dayLabel, rows, totalQty, totalKva }) => (
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
                          <td style={{ ...mono, color: 'var(--blue)', fontSize: 10 }}>{r.item_code || '—'}</td>
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
