/**
 * Order Flow Timeline (P4 — projection, not an optimiser).
 *
 * Each active order projected across the pipeline by lead time: core+coil →
 * internal assembly (+1wk) → external+test (+2wk) → ship (+3wk). Shows where
 * orders collide and which will ship after their deadline. Read-only; computed
 * by flowEngine.
 */

import { useMemo, useState } from 'react'
import { useApp } from '../../../context/AppContext'
import { makeHorizonWeeks } from '../shared/engines/forecastEngine'
import { projectFlows, phaseLoadByWeek, FLOW_PHASES } from '../shared/engines/flowEngine'

const HORIZONS = [6, 10]
const MAX_ROWS = 100

export default function OrderFlowPage() {
  const { state } = useApp()
  const { orders } = state
  const [horizon, setHorizon] = useState(6)
  const [startOffset, setStartOffset] = useState(0)
  const [lateOnly, setLateOnly] = useState(false)

  const weeks = useMemo(() => makeHorizonWeeks(startOffset, horizon), [startOffset, horizon])
  const allRows = useMemo(() => projectFlows(orders, weeks), [orders, weeks])
  const rows = useMemo(() => (lateOnly ? allRows.filter(r => r.shipsLate) : allRows), [allRows, lateOnly])
  const phaseLoad = useMemo(() => phaseLoadByWeek(allRows, weeks.length), [allRows, weeks.length])
  const lateCount = allRows.filter(r => r.shipsLate).length
  const shown = rows.slice(0, MAX_ROWS)

  const th: React.CSSProperties = { padding: '5px 6px', textAlign: 'center', fontSize: 9, fontWeight: 600, color: 'var(--txt3)', borderBottom: '1px solid var(--bord2)', whiteSpace: 'nowrap' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>🗓 Order Flow Timeline</span>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>ประมาณการเส้นทางออเดอร์ตาม lead time (ไม่ใช่ตารางจริงระดับเครื่อง)</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: lateCount ? 'rgba(243,139,168,.12)' : 'rgba(166,227,161,.12)', color: lateCount ? 'var(--red)' : 'var(--green)' }}>
          {lateCount ? `🔴 ${lateCount} จะส่งช้ากว่า deadline` : '🟢 ทุกออเดอร์ทันกำหนด (ประมาณการ)'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setLateOnly(v => !v)} style={{ ...btn, border: `1px solid ${lateOnly ? 'var(--red)' : 'var(--bord)'}`, color: lateOnly ? 'var(--red)' : 'var(--txt3)', background: lateOnly ? 'rgba(243,139,168,.1)' : 'var(--bg3)' }}>
            เฉพาะที่ช้า
          </button>
          <button onClick={() => setStartOffset(v => v - 1)} style={btn}>‹</button>
          {startOffset !== 0 && <button onClick={() => setStartOffset(0)} style={{ ...btn, color: 'var(--blue)' }}>วันนี้</button>}
          <button onClick={() => setStartOffset(v => v + 1)} style={btn}>›</button>
          {HORIZONS.map(h => (
            <button key={h} onClick={() => setHorizon(h)} style={{ ...btn, border: `1px solid ${horizon === h ? 'var(--blue)' : 'var(--bord)'}`, color: horizon === h ? 'var(--blue)' : 'var(--txt3)', background: horizon === h ? 'rgba(137,180,250,.12)' : 'var(--bg3)' }}>{h}w</button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, fontSize: 9, color: 'var(--txt3)', flexWrap: 'wrap' }}>
        {FLOW_PHASES.map(p => (
          <span key={p.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: p.color, display: 'inline-block' }} /> {p.label} (+{p.lead}w)
          </span>
        ))}
        <span>· 🚚 ส่ง (+3w)</span>
      </div>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg3)', zIndex: 1 }}>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>SAP SO</th>
                <th style={{ ...th, textAlign: 'left' }}>ลูกค้า</th>
                <th style={th}>Deadline</th>
                {weeks.map((w, wi) => (
                  <th key={w.offset} style={th}>
                    {w.offset === 0 ? <span style={{ color: 'var(--blue)' }}>●</span> : ''}{w.label}
                    <div style={{ fontSize: 8, color: phaseLoad[wi] > 0 ? 'var(--amber)' : 'var(--txt3)' }}>{phaseLoad[wi] || ''}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={3 + weeks.length} style={{ padding: 24, textAlign: 'center', color: 'var(--txt3)', fontSize: 11 }}>
                  ไม่มีออเดอร์ที่วางแผนในช่วงนี้
                </td></tr>
              )}
              {shown.map(r => {
                const phaseAt = new Map(r.phases.map(p => [p.weekIndex, p]))
                return (
                  <tr key={r.order.id} style={{ borderBottom: '0.5px solid var(--bord)', background: r.shipsLate ? 'rgba(243,139,168,.04)' : undefined }}>
                    <td style={{ padding: '4px 6px', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)', fontSize: 9, whiteSpace: 'nowrap' }}>
                      {r.order.priority === 'rush' && '🔴'}{r.order.sap_so || r.order.id.slice(-6)}
                      <span style={{ color: 'var(--blue)', marginLeft: 4 }}>{r.order.kva}k</span>
                    </td>
                    <td style={{ padding: '4px 6px', fontSize: 9, color: 'var(--txt2)', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.order.customer || '—'}</td>
                    <td style={{ padding: '4px 6px', fontSize: 8, fontFamily: 'var(--mono)', color: r.shipsLate ? 'var(--red)' : 'var(--txt3)', whiteSpace: 'nowrap' }}>
                      {r.order.deadline?.slice(5) || '—'}{r.shipsLate ? ' ⚠' : ''}
                    </td>
                    {weeks.map((w, wi) => {
                      const p = phaseAt.get(wi)
                      const isShip = wi === r.shipWeekIndex
                      return (
                        <td key={w.offset} style={{ padding: '2px 3px', textAlign: 'center', borderLeft: '0.5px solid var(--bord)' }}>
                          {p ? (
                            <span title={p.label} style={{ display: 'inline-block', width: '100%', fontSize: 8, fontWeight: 700, padding: '2px 0', borderRadius: 3, background: `${p.color}28`, color: p.color }}>
                              {p.label.split('+')[0].slice(0, 5)}
                            </span>
                          ) : isShip ? (
                            <span title="ส่งมอบ (ประมาณการ)" style={{ fontSize: 10 }}>🚚</span>
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {rows.length > MAX_ROWS && (
          <div style={{ padding: '6px 12px', fontSize: 9, color: 'var(--txt3)' }}>แสดง {MAX_ROWS} จาก {rows.length} ออเดอร์</div>
        )}
      </div>

      <div style={{ fontSize: 9, color: 'var(--txt3)' }}>
        ประมาณการจาก lead time (แกน+คอยล์ → ประกอบใน +1 → ประกอบนอก+เทส +2 → ส่ง +3) ·
        ตัวเลขใต้หัวสัปดาห์ = จำนวนเฟสที่ตกในสัปดาห์นั้น (จุดที่งานกระจุก) ·
        ⚠ = วันส่งประมาณการช้ากว่า deadline
      </div>
    </div>
  )
}

const btn: React.CSSProperties = { fontSize: 10, padding: '4px 9px', borderRadius: 6, border: '1px solid var(--bord)', background: 'var(--bg3)', cursor: 'pointer', color: 'var(--txt2)' }
