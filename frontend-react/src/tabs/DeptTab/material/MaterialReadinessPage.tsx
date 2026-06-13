/**
 * Material / Component Readiness (P3).
 *
 * Flags orders that are capacity-feasible but material-blocked — a component
 * whose due-date falls after the order's production plan-date. Answers the
 * question capacity dashboards can't: "which orders will slip because of
 * material, not machines?"
 */

import { useMemo, useState } from 'react'
import { useApp } from '../../../context/AppContext'
import { COMPONENTS, classifyOrder, type CompStatus } from '../shared/engines/materialEngine'

const STATUS_META: Record<CompStatus, { color: string; bg: string }> = {
  late:  { color: 'var(--red)',   bg: 'rgba(243,139,168,.15)' },
  ready: { color: 'var(--green)', bg: 'rgba(166,227,161,.12)' },
  info:  { color: 'var(--txt2)',  bg: 'var(--bg3)' },
  none:  { color: 'var(--txt3)',  bg: 'transparent' },
}

export default function MaterialReadinessPage() {
  const { state } = useApp()
  const { orders } = state
  const [onlyRisk, setOnlyRisk] = useState(true)

  const rows = useMemo(() => {
    const active = orders.filter(o => o.workflow_status !== 'DONE' && o.plan_date)
    const classified = active.map(classifyOrder)
      .sort((a, b) => b.lateComponents.length - a.lateComponents.length
        || (a.order.deadline ?? '').localeCompare(b.order.deadline ?? ''))
    return onlyRisk ? classified.filter(r => r.atRisk) : classified
  }, [orders, onlyRisk])

  const riskCount = useMemo(
    () => orders.filter(o => o.workflow_status !== 'DONE' && o.plan_date).map(classifyOrder).filter(r => r.atRisk).length,
    [orders]
  )

  const td: React.CSSProperties = { padding: '5px 9px', borderBottom: '0.5px solid var(--bord)', fontSize: 10, whiteSpace: 'nowrap' }
  const th: React.CSSProperties = { padding: '6px 9px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--txt3)', borderBottom: '1px solid var(--bord2)', whiteSpace: 'nowrap' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>🧱 ความพร้อมวัตถุดิบ / ชิ้นส่วน</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: riskCount ? 'rgba(243,139,168,.12)' : 'rgba(166,227,161,.12)', color: riskCount ? 'var(--red)' : 'var(--green)' }}>
          {riskCount ? `🔴 ${riskCount} ออเดอร์เสี่ยงขาดวัตถุดิบ` : '🟢 ไม่มีออเดอร์ติดวัตถุดิบ'}
        </span>
        <button onClick={() => setOnlyRisk(v => !v)}
          style={{ marginLeft: 'auto', fontSize: 10, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${onlyRisk ? 'var(--red)' : 'var(--bord)'}`, background: onlyRisk ? 'rgba(243,139,168,.1)' : 'var(--bg3)', color: onlyRisk ? 'var(--red)' : 'var(--txt3)' }}>
          {onlyRisk ? 'เฉพาะที่เสี่ยง' : 'แสดงทั้งหมด'}
        </button>
      </div>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg3)' }}>
              <tr>
                <th style={th}>SAP SO</th>
                <th style={th}>ลูกค้า</th>
                <th style={th}>kVA×จำนวน</th>
                <th style={th}>วันผลิต</th>
                {COMPONENTS.map(c => <th key={c.key} style={{ ...th, textAlign: 'center' }}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={4 + COMPONENTS.length} style={{ ...td, textAlign: 'center', color: 'var(--txt3)', padding: 24 }}>
                  {onlyRisk ? '🎉 ไม่มีออเดอร์ที่เสี่ยงขาดวัตถุดิบ' : 'ไม่มีออเดอร์'}
                </td></tr>
              )}
              {rows.map(r => (
                <tr key={r.order.id} style={{ background: r.atRisk ? 'rgba(243,139,168,.04)' : undefined }}>
                  <td style={{ ...td, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' }}>
                    {r.order.priority === 'rush' && <span style={{ marginRight: 3 }}>🔴</span>}
                    {r.order.sap_so || r.order.id.slice(-8)}
                  </td>
                  <td style={{ ...td, color: 'var(--txt2)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.order.customer || '—'}</td>
                  <td style={{ ...td, fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{r.order.kva}×{r.order.qty}</td>
                  <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--txt3)' }}>{r.order.plan_date}</td>
                  {r.components.map(c => {
                    const m = STATUS_META[c.status]
                    return (
                      <td key={c.def.key} style={{ ...td, textAlign: 'center' }}>
                        {c.status === 'none' ? (
                          <span style={{ color: 'var(--txt3)' }}>—</span>
                        ) : (
                          <span title={c.raw} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 5, background: m.bg, color: m.color, fontWeight: c.status === 'late' ? 700 : 400 }}>
                            {c.status === 'late' ? `🔴 ${c.dueDate?.slice(5)}` : c.status === 'ready' ? `🟢 ${c.dueDate?.slice(5)}` : c.raw.length > 10 ? c.raw.slice(0, 10) : c.raw}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 9, color: 'var(--txt3)', lineHeight: 1.6 }}>
        🔴 = กำหนดพร้อมของชิ้นส่วนช้ากว่าวันผลิต (เสี่ยงขาด) · 🟢 = พร้อมก่อน/ทันวันผลิต · ข้อความ = ข้อมูลดิบ (เช่น รหัสวัตถุดิบ) ·
        วันที่อ่านจากแผนหลัก (master plan); ช่องที่ไม่ใช่วันที่จะไม่ตัดสินสถานะ
      </div>
    </div>
  )
}
