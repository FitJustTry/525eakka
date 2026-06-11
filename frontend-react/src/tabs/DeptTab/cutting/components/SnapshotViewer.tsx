import React from 'react'
import { DAY_TH, DAY_SHORT } from '../scheduling/constants'
import { mLabel } from '../scheduling/utils'

interface SavedCell {
  machineId: number; machineName: string; machOff: boolean; wall: number; capH: number
  otHrs: number; carriesForward: boolean
  work: { sap_so: string; customer: string; kva: number; qty: number; hrsWorked: number; isComplete: boolean; carriesOver: boolean }[]
}
interface SavedDay { dStr: string; dayScheduledQty: number; dayKva: number; dayFinish: number; machineCells: SavedCell[] }
interface SavedMachine { id: number; name: string; count: number; min_kva: number; max_kva: number; hrs_per_unit: number; laser: boolean; m4: boolean; min_face_mm: number; max_face_mm: number; drill_8mm: boolean; drill_22mm: boolean; reg_hrs: number; ot_hrs: number; off_days: number[]; wc_id: string }
interface SavedRate { kva: number; hrs: number }

interface Props {
  viewSnap: Record<string, unknown>
  setViewSnap: (v: null) => void
}

export default function SnapshotViewer({ viewSnap, setViewSnap }: Props) {
  const snap = viewSnap
  const snapMachines = snap.machines as SavedMachine[]
  const snapRates = snap.cutting_rates as SavedRate[]
  const snapDays = snap.dayRows as SavedDay[]
  const snapSummary = snap.summary as { totalQtyWeek: number; totalKvaWeek: number; bottleneckWall: number; totalOT: number }
  const snapBalance = snap.balanceMode as string
  const modeLabel = snapBalance === 'pull' ? '⏩ เติมเต็ม' : snapBalance === 'smart' ? '⚡ Smart OT' : snapBalance === 'weekly' ? '📆 สัปดาห์' : '📅 รายวัน'

  return (
    <div style={{ border: '2px solid var(--blue)', borderRadius: 10, margin: '0 0 12px', overflow: 'hidden' }}>
      <div style={{ background: 'rgba(137,180,250,.1)', padding: '10px 16px', borderBottom: '1px solid var(--bord)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--blue)' }}>📋 {String(snap._label || snap._week)}</span>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{String(snap._week)}</span>
        <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, background: 'rgba(137,180,250,.2)', color: 'var(--blue)' }}>{modeLabel}</span>
        <span style={{ fontSize: 10, color: 'var(--txt3)', marginLeft: 'auto' }}>บันทึก: {String(snap._saved_at || '').slice(0,16)}</span>
        <button onClick={() => setViewSnap(null)} style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', marginLeft: 8 }}>✕ ปิด</button>
      </div>

      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--bord)', background: 'var(--bg2)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>พารามิเตอร์ที่ใช้คำนวณ</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 400px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>เครื่องตัด</div>
            <table style={{ borderCollapse: 'collapse', fontSize: 9, width: '100%' }}>
              <thead><tr style={{ background: 'var(--bg3)' }}>
                {['เครื่อง','จำนวน','kVA','h/ตัว','Laser','M4','8mm','22mm','Reg h','OT h','วันปิด'].map(h => (
                  <th key={h} style={{ padding: '3px 5px', textAlign: 'center', color: 'var(--txt3)', borderBottom: '1px solid var(--bord)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {snapMachines?.map(m => (
                  <tr key={m.id}>
                    <td style={{ padding: '2px 5px', fontWeight: 700 }}>{mLabel(m)}</td>
                    <td style={{ padding: '2px 5px', textAlign: 'center' }}>{m.count}</td>
                    <td style={{ padding: '2px 5px', fontFamily: 'var(--mono)', fontSize: 8 }}>{m.min_kva}–{m.max_kva >= 9999 ? '∞' : m.max_kva}</td>
                    <td style={{ padding: '2px 5px', textAlign: 'center', color: 'var(--amber)', fontFamily: 'var(--mono)' }}>{m.hrs_per_unit}</td>
                    <td style={{ padding: '2px 5px', textAlign: 'center' }}>{m.laser ? '✅' : '❌'}</td>
                    <td style={{ padding: '2px 5px', textAlign: 'center' }}>{m.m4 ? '✅' : '❌'}</td>
                    <td style={{ padding: '2px 5px', textAlign: 'center' }}>{m.drill_8mm ? '✅' : '❌'}</td>
                    <td style={{ padding: '2px 5px', textAlign: 'center' }}>{m.drill_22mm ? '✅' : '❌'}</td>
                    <td style={{ padding: '2px 5px', textAlign: 'center', color: 'var(--green)', fontFamily: 'var(--mono)' }}>{m.reg_hrs}h</td>
                    <td style={{ padding: '2px 5px', textAlign: 'center', color: 'var(--amber)', fontFamily: 'var(--mono)' }}>{m.ot_hrs}h</td>
                    <td style={{ padding: '2px 5px', textAlign: 'center', color: m.off_days?.length ? 'var(--red)' : 'var(--txt3)', fontSize: 8 }}>
                      {m.off_days?.length ? m.off_days.map(d => DAY_SHORT[d]).join(' ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ flex: '1 1 150px', minWidth: 120 }}>
            <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>⏱ เวลาตัดตามขนาด</div>
            {!snapRates?.length ? <div style={{ fontSize: 9, color: 'var(--txt3)' }}>ใช้ h/ตัว default</div> : snapRates.map((r, i) => (
              <div key={i} style={{ fontSize: 9, fontFamily: 'var(--mono)' }}>
                <span style={{ color: 'var(--blue)' }}>{r.kva.toLocaleString()}kVA</span> → <span style={{ color: 'var(--amber)' }}>{r.hrs}h</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap', fontSize: 10 }}>
          <span style={{ fontWeight: 700 }}>ผลการคำนวณ</span>
          <span style={{ color: 'var(--txt3)' }}>{snapSummary?.totalQtyWeek} ตัว · {snapSummary?.totalKvaWeek?.toLocaleString()} kVA</span>
          {(snapSummary?.totalOT ?? 0) > 0 && <span style={{ color: 'var(--amber)' }}>⚠ OT {snapSummary.totalOT.toFixed(1)}h</span>}
          <span style={{ color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>เสร็จสุด {snapSummary?.bottleneckWall?.toFixed(1)}h</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {snapDays?.map(r => {
            const dt = new Date(r.dStr + 'T00:00:00')
            return (
              <div key={r.dStr} style={{ border: '1px solid var(--bord)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: 'var(--bg2)', borderBottom: '1px solid var(--bord)', fontSize: 10 }}>
                  <span style={{ fontWeight: 700 }}>{DAY_TH[dt.getDay()]} {r.dStr.slice(5)}</span>
                  <span style={{ color: 'var(--txt3)' }}>{r.dayScheduledQty} ตัว · {r.dayKva?.toLocaleString()} kVA</span>
                  <span style={{ fontFamily: 'var(--mono)', color: r.dayFinish <= 8 ? 'var(--green)' : 'var(--amber)', marginLeft: 'auto' }}>เสร็จใน {r.dayFinish?.toFixed(1)}h</span>
                </div>
                <div style={{ padding: '4px 0' }}>
                  {r.machineCells?.map((mc, mi) => mc.machOff ? (
                    <div key={mi} style={{ padding: '2px 10px', fontSize: 9, color: 'var(--red)', opacity: 0.6 }}>🔴 {mc.machineName} ปิด</div>
                  ) : mc.work.length === 0 ? null : (
                    <div key={mi} style={{ display: 'flex', padding: '3px 10px', gap: 8, fontSize: 9 }}>
                      <span style={{ minWidth: 100, fontWeight: 700 }}>{mc.machineName}</span>
                      <span style={{ fontFamily: 'var(--mono)', color: mc.wall <= mc.capH ? 'var(--green)' : 'var(--amber)' }}>{mc.wall?.toFixed(1)}h</span>
                      <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {mc.work.map((w, wi) => (
                          <span key={wi} style={{ fontFamily: 'var(--mono)', color: (w.kva ?? 0) <= 400 ? 'var(--blue)' : (w.kva ?? 0) <= 3500 ? 'var(--amber)' : 'var(--red)' }}>
                            {w.sap_so || '—'} {(w.kva??0).toLocaleString()}kVA×{w.qty} {w.hrsWorked?.toFixed(1)}h{w.isComplete ? '✓' : '→'}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
