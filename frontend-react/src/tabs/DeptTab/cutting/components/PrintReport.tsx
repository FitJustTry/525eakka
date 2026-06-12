import React from 'react'
import type { CuttingMachine, Order } from '../../../types'
import type { SnapMeta } from '../hooks/usePlanSnapshots'
import type { DayRow } from '../scheduling/weekData'

interface Props {
  snap?: SnapMeta | null
  weekLabel: string
  dayRows: DayRow[]
  machines: CuttingMachine[]
  weekOrders: Order[]
  weekCarryOrders: Order[]
  weekUnscheduled: Order[]
  onClose: () => void
}

export default function PrintReport({ snap, weekLabel, dayRows, machines, weekOrders, weekCarryOrders, weekUnscheduled, onClose }: Props) {
  const totalQty = weekOrders.reduce((s, o) => s + o.qty, 0)
  const rs = snap?.result_summary

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-root { position: static !important; background: white !important; border-radius: 0 !important; max-height: none !important; overflow: visible !important; }
          .print-overlay { position: static !important; background: none !important; }
        }
      `}</style>
      <div className="print-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
        <div className="print-root" style={{ background: '#fff', borderRadius: 8, width: 900, maxWidth: '95vw', color: '#000', fontFamily: 'Arial, sans-serif' }}>
          {/* Toolbar */}
          <div className="no-print" style={{ display: 'flex', gap: 8, padding: '10px 16px', borderBottom: '1px solid #ddd', alignItems: 'center' }}>
            <button onClick={() => window.print()} style={{ padding: '6px 16px', fontSize: 12, borderRadius: 6, border: 'none', background: '#1e66f5', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>🖨️ พิมพ์ / บันทึก PDF</button>
            <button onClick={onClose} style={{ padding: '6px 12px', fontSize: 12, borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>✕ ปิด</button>
          </div>

          <div style={{ padding: 24 }}>
            {/* Header */}
            <div style={{ borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>แผนการผลิต — ฝ่ายตัดเหล็ก</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>สัปดาห์: {weekLabel}</div>
              {snap && <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>แผน: {snap.label} · สถานะ: {snap.status}</div>}
            </div>

            {/* Summary row */}
            <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                ['คำสั่งทั้งหมด', `${weekOrders.length} รายการ`],
                ['จำนวน', `${totalQty} เครื่อง`],
                ['เครื่องจักร', `${machines.length} เครื่อง`],
                ['Carry forward', `${weekCarryOrders.length} รายการ`],
                ['ยังไม่จัดตาราง', `${weekUnscheduled.length} รายการ`],
              ].map(([k, v]) => (
                <div key={k} style={{ fontSize: 11 }}>
                  <div style={{ color: '#777', fontSize: 9 }}>{k}</div>
                  <div style={{ fontWeight: 700 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Day-by-day table */}
            {dayRows.map(row => (
              <div key={row.dStr} style={{ marginBottom: 16, pageBreakInside: 'avoid' }}>
                <div style={{ fontSize: 12, fontWeight: 700, background: '#f0f0f0', padding: '4px 8px', borderRadius: 4, marginBottom: 4 }}>
                  {row.dStr} — {row.dayScheduledQty} เครื่อง · {row.dayKva.toLocaleString()} kVA total
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr style={{ background: '#e8e8e8' }}>
                      <th style={{ padding: '3px 8px', textAlign: 'left', border: '1px solid #ccc' }}>เครื่องจักร</th>
                      <th style={{ padding: '3px 8px', textAlign: 'center', border: '1px solid #ccc' }}>Reg/OT h</th>
                      <th style={{ padding: '3px 8px', textAlign: 'left', border: '1px solid #ccc' }}>งาน (SAP SO · kVA · qty)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.machineCells.filter(mc => !mc.machOff).map((mc, ci) => (
                      <tr key={mc.m.id} style={{ background: ci % 2 ? '#fafafa' : '#fff' }}>
                        <td style={{ padding: '3px 8px', border: '1px solid #ccc', fontWeight: 600 }}>{mc.m.name}</td>
                        <td style={{ padding: '3px 8px', border: '1px solid #ccc', textAlign: 'center', fontFamily: 'monospace' }}>
                          {mc.wall.toFixed(1)}/{mc.sched?.otHrs.toFixed(1) ?? '0.0'}
                        </td>
                        <td style={{ padding: '3px 8px', border: '1px solid #ccc' }}>
                          {mc.work.map((w, wi) => (
                            <span key={wi} style={{ marginRight: 8, whiteSpace: 'nowrap' }}>
                              {w.order.sap_so || w.order.id.slice(0,8)} · {w.order.kva ?? '?'}kVA × {w.order.qty}
                              {w.carriesOver ? ' →' : ''}{w.isComplete ? ' ✓' : ''}
                              {w.order.priority === 'rush' ? ' 🔴' : w.order.priority === 'high' ? ' 🟡' : ''}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {/* Carry forward list */}
            {weekCarryOrders.length > 0 && (
              <div style={{ marginTop: 12, pageBreakInside: 'avoid' }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>🔄 Carry Forward ({weekCarryOrders.length} รายการ)</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr style={{ background: '#ffe4e4' }}>
                      {['SAP SO', 'Product', 'kVA', 'Qty', 'Deadline', 'Plan Date'].map(h => (
                        <th key={h} style={{ padding: '3px 8px', textAlign: 'left', border: '1px solid #ccc' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weekCarryOrders.map((o, i) => (
                      <tr key={o.id} style={{ background: i % 2 ? '#fafafa' : '#fff' }}>
                        <td style={{ padding: '3px 8px', border: '1px solid #ccc', fontFamily: 'monospace' }}>{o.sap_so || '—'}</td>
                        <td style={{ padding: '3px 8px', border: '1px solid #ccc' }}>{o.product}</td>
                        <td style={{ padding: '3px 8px', border: '1px solid #ccc', textAlign: 'right' }}>{o.kva?.toLocaleString() ?? '—'}</td>
                        <td style={{ padding: '3px 8px', border: '1px solid #ccc', textAlign: 'center' }}>{o.qty}</td>
                        <td style={{ padding: '3px 8px', border: '1px solid #ccc' }}>{o.deadline || '—'}</td>
                        <td style={{ padding: '3px 8px', border: '1px solid #ccc' }}>{o.plan_date || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Result summary (if week is closed) */}
            {rs && (
              <div style={{ marginTop: 16, border: '1px solid #ccc', borderRadius: 6, padding: 12, pageBreakInside: 'avoid' }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>📊 ผลสรุปประจำสัปดาห์</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11 }}>
                  {[
                    ['เสร็จ', `${rs.completed_count}/${rs.planned_count} (${rs.completion_rate}%)`],
                    ['Carry', `${rs.carry_count} รายการ`],
                    ['ตรงเวลา', `${rs.on_time_count}`],
                    ['ช้า', `${rs.late_count}`],
                    ['เร็ว', `${rs.early_count}`],
                    ['ล่าช้าเฉลี่ย', `${rs.avg_delay_days?.toFixed(1) ?? '—'} วัน`],
                    ['Bottleneck', rs.bottleneck_machine || '—'],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: 9, color: '#777' }}>{k}</div>
                      <div style={{ fontWeight: 700 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 16, fontSize: 9, color: '#999', textAlign: 'right' }}>
              พิมพ์: {new Date().toLocaleString('th-TH')}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
