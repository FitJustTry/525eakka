/**
 * Management KPIs (P5) — the Operations-Director view.
 *
 * On-Time Delivery, throughput, lateness (from actual completions) + plan
 * attainment (from closed-week calibration). Read-only, computed by kpiEngine /
 * calibrationEngine. Graceful when there's no completion history yet.
 */

import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../../context/AppContext'
import { api } from '../../../api'
import { computeKpis } from '../shared/engines/kpiEngine'
import { computeCalibration, type SnapSample } from '../shared/engines/calibrationEngine'

const todayStr = () => new Date().toISOString().slice(0, 10)
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`)

export default function ManagementKpiPage() {
  const { state } = useApp()
  const { orders } = state
  const [calSamples, setCalSamples] = useState<SnapSample[]>([])

  useEffect(() => {
    Promise.all([api.deptSnapshotsAll().catch(() => []), api.cuttingSnapshots().catch(() => [])])
      .then(([dept, cutting]) => {
        const d = (dept as Record<string, unknown>[]).map(r => ({ dept_id: String(r.dept_id), week_start: String(r.week_start), result_summary: r.result_summary as SnapSample['result_summary'] }))
        const c = (cutting as Record<string, unknown>[]).filter(r => r.status === 'completed').map(r => ({ dept_id: 'cutting', week_start: String(r.week_start), result_summary: r.result_summary as SnapSample['result_summary'] }))
        setCalSamples([...d, ...c])
      }).catch(() => {})
  }, [])

  const today = todayStr()
  const kpis = useMemo(() => computeKpis(orders, today), [orders, today])
  const cal = useMemo(() => computeCalibration(calSamples), [calSamples])

  const otdColor = kpis.otdOverall == null ? 'var(--txt3)' : kpis.otdOverall >= 0.9 ? 'var(--green)' : kpis.otdOverall >= 0.75 ? 'var(--amber)' : 'var(--red)'
  const maxMonth = Math.max(1, ...kpis.months.map(m => m.completed))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>📊 KPI ผู้บริหาร — Delivery & Throughput</span>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>จากผลผลิตจริง (done) เทียบ deadline</span>
      </div>

      {kpis.totalCompleted === 0 && (
        <div style={{ fontSize: 11, color: 'var(--amber)', background: 'rgba(249,226,175,.1)', border: '1px solid rgba(249,226,175,.3)', borderRadius: 8, padding: '8px 12px' }}>
          ยังไม่มีออเดอร์ที่ปิดงาน (done) — KPI จะแสดงเมื่อมีการบันทึกผลผลิตจริง
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Kpi label="On-Time Delivery" value={pct(kpis.otdOverall)} color={otdColor} sub={`${kpis.totalCompleted} งานที่ส่งแล้ว`} big />
        <Kpi label="เกินกำหนด (ค้าง)" value={kpis.openOverdue} color={kpis.openOverdue ? 'var(--red)' : 'var(--green)'} sub="ยังไม่ส่ง · เลย deadline" />
        <Kpi label="ส่งช้าเฉลี่ย" value={kpis.avgLatenessDays == null ? '—' : `${Math.round(kpis.avgLatenessDays)} วัน`} color="var(--amber)" sub="เฉพาะงานที่ช้า" />
        <Kpi label="Throughput" value={kpis.throughputUnits} color="var(--blue)" sub={`${Math.round(kpis.throughputKva).toLocaleString()} kVA รวม`} />
        <Kpi label="Plan Attainment" value={cal.attainment == null ? '—' : `${Math.round(cal.attainment)}%`} color={cal.attainment == null ? 'var(--txt3)' : cal.attainment >= 90 ? 'var(--green)' : 'var(--amber)'} sub={`${cal.totalSamples} สัปดาห์ที่ปิด`} />
      </div>

      {/* Monthly OTD trend */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--bord)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--bord)', fontSize: 11, fontWeight: 700, color: 'var(--txt2)' }}>
          แนวโน้มรายเดือน — On-Time Delivery & Throughput
        </div>
        <div style={{ padding: 12 }}>
          {kpis.months.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--txt3)' }}>ยังไม่มีข้อมูลรายเดือน</div>
          ) : (
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10 }}>
              <thead>
                <tr style={{ color: 'var(--txt3)' }}>
                  <th style={th}>เดือน</th><th style={th}>ส่งแล้ว</th><th style={th}>ตรงเวลา</th>
                  <th style={th}>ช้า</th><th style={th}>OTD</th><th style={{ ...th, width: '40%' }}>ปริมาณงาน</th>
                </tr>
              </thead>
              <tbody>
                {kpis.months.map(m => {
                  const c = m.otd >= 0.9 ? 'var(--green)' : m.otd >= 0.75 ? 'var(--amber)' : 'var(--red)'
                  return (
                    <tr key={m.month} style={{ borderTop: '0.5px solid var(--bord)' }}>
                      <td style={td}>{m.month}</td>
                      <td style={{ ...td, textAlign: 'center', fontFamily: 'var(--mono)' }}>{m.completed}</td>
                      <td style={{ ...td, textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--green)' }}>{m.onTime}</td>
                      <td style={{ ...td, textAlign: 'center', fontFamily: 'var(--mono)', color: m.late ? 'var(--red)' : 'var(--txt3)' }}>{m.late}</td>
                      <td style={{ ...td, textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 700, color: c }}>{Math.round(m.otd * 100)}%</td>
                      <td style={td}>
                        <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 3 }}>
                          <div style={{ width: `${(m.completed / maxMonth) * 100}%`, height: '100%', background: c, borderRadius: 3 }} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={{ fontSize: 9, color: 'var(--txt3)' }}>
        OTD = งานที่ done ภายใน/ก่อน deadline ÷ งานที่ส่งทั้งหมด · Plan attainment = % ของแผนที่ทำได้จริงจากสัปดาห์ที่ปิด (Close Week)
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '5px 8px', textAlign: 'left', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '5px 8px', fontSize: 10 }

function Kpi({ label, value, color, sub, big }: { label: string; value: number | string; color: string; sub?: string; big?: boolean }) {
  return (
    <div style={{ background: 'var(--bg2)', border: `1px solid ${color}33`, borderRadius: 10, padding: '10px 16px', minWidth: 130, flex: big ? 1.4 : 1 }}>
      <div style={{ fontSize: 9, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: big ? 28 : 22, fontWeight: 800, fontFamily: 'var(--mono)', color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}
