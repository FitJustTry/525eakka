import React from 'react'
import type { CuttingMachine } from '../../../types'
import type { MachineDaySched } from '../scheduling/constants'
import type { MachTotals } from '../scheduling/weekData'
import { DAY_SHORT } from '../scheduling/constants'
import { fmtISO, isMachineOn, mLabel, resolveShift } from '../scheduling/utils'

interface Props {
  machines: CuttingMachine[]
  days: Date[]
  manualShiftDays: Map<number, Set<string>>
  toggleManualShift: (machineId: number, dStr: string) => void
  setManualShiftDays: React.Dispatch<React.SetStateAction<Map<number, Set<string>>>>
  shiftHrsDefault: number
  weekSchedule: Map<number, Map<string, MachineDaySched>>
  wcConfig: Record<string, { hrs: number; ot: number; sat_hrs: number; sat_ot: number }>
  mTotals: MachTotals[]
  totalShift: number
  lateOrdersSize: number
  baselineLateCount: number
}

export default function ManualShiftGrid({
  machines, days, manualShiftDays, toggleManualShift, setManualShiftDays,
  shiftHrsDefault, weekSchedule, wcConfig, mTotals, totalShift, lateOrdersSize, baselineLateCount
}: Props) {
  return (
    <div style={{ padding: '8px 16px', background: 'rgba(166,227,161,.04)', borderBottom: '1px solid var(--bord)', overflowX: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>🗓 เลือกเครื่อง + วันที่เปิดกะกลางคืน</span>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>คลิก checkbox เพื่อเพิ่ม/ลบกะในเครื่องและวันนั้น</span>
        {totalShift >= 0.05 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', background: 'rgba(137,180,250,.12)', padding: '2px 8px', borderRadius: 8 }}>
            +{totalShift.toFixed(1)}h/สัปดาห์
          </span>
        )}
        {lateOrdersSize !== baselineLateCount && (
          <span style={{ fontSize: 10, fontWeight: 700, color: baselineLateCount > lateOrdersSize ? 'var(--green)' : 'var(--red)', background: baselineLateCount > lateOrdersSize ? 'rgba(166,227,161,.15)' : 'rgba(224,90,78,.08)', padding: '2px 8px', borderRadius: 8 }}>
            🔴 ส่งช้า {baselineLateCount} → {lateOrdersSize}
            {baselineLateCount > lateOrdersSize ? ` (−${baselineLateCount - lateOrdersSize} ดีขึ้น)` : ` (+${lateOrdersSize - baselineLateCount})`}
          </span>
        )}
        <button
          onClick={() => setManualShiftDays(new Map())}
          style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt3)', cursor: 'pointer', marginLeft: 'auto' }}>
          ล้างทั้งหมด
        </button>
      </div>
      <table style={{ borderCollapse: 'collapse', fontSize: 10, width: 'auto' }}>
        <thead>
          <tr>
            <th style={{ padding: '3px 10px', textAlign: 'left', color: 'var(--txt3)', fontWeight: 600, minWidth: 120, borderBottom: '1px solid var(--bord)' }}>เครื่อง</th>
            {days.map(d => (
              <th key={fmtISO(d)} style={{ padding: '3px 10px', textAlign: 'center', borderBottom: '1px solid var(--bord)', minWidth: 54 }}>
                <div style={{ color: d.getDay() === 6 ? 'var(--amber)' : 'var(--txt2)', fontWeight: 600 }}>{DAY_SHORT[d.getDay()]}</div>
                <div style={{ color: 'var(--txt3)', fontSize: 9 }}>{String(d.getDate()).padStart(2,'0')}/{String(d.getMonth()+1).padStart(2,'0')}</div>
              </th>
            ))}
            <th style={{ padding: '3px 10px', textAlign: 'right', color: 'var(--blue)', fontWeight: 600, borderBottom: '1px solid var(--bord)', whiteSpace: 'nowrap' }}>+h/สัปดาห์</th>
          </tr>
        </thead>
        <tbody>
          {machines.map((m, mi2) => {
            const machShiftHrs = resolveShift(m, shiftHrsDefault)
            const machShiftSet = manualShiftDays.get(m.id)
            const selectedDays = days.filter(d => machShiftSet?.has(fmtISO(d)) && isMachineOn(m, d.getDay()))
            const totalAddedH = selectedDays.length * machShiftHrs * (m.count || 1)
            const t = mTotals[mi2]
            return (
              <tr key={m.id} style={{ background: mi2 % 2 === 0 ? 'transparent' : 'rgba(127,127,127,.03)' }}>
                <td style={{ padding: '4px 10px', fontWeight: 600, color: 'var(--txt)', borderBottom: '0.5px solid var(--bord)', whiteSpace: 'nowrap' }}>
                  <div>{mLabel(m)}</div>
                  {!(m.shift_enabled ?? true) && <div style={{ fontSize: 8, color: 'var(--red)' }}>🌑 กะปิด</div>}
                  {(m.shift_enabled ?? true) && <div style={{ fontSize: 8, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>{machShiftHrs}h/คืน · {t.wallHrs.toFixed(1)}h ทั้งสัปดาห์</div>}
                </td>
                {days.map(d => {
                  const dStr = fmtISO(d)
                  const machOff = !isMachineOn(m, d.getDay())
                  const shiftOff = !(m.shift_enabled ?? true)
                  const checked = machShiftSet?.has(dStr) ?? false
                  const dayWall = weekSchedule.get(m.id)?.get(dStr)
                  const wallH = dayWall ? (dayWall.regHrs + dayWall.otHrs) : 0
                  const capH = resolveShift(m, shiftHrsDefault) > 0 ? (dayWall?.regHrs ?? 0) : 0
                  return (
                    <td key={dStr} style={{ padding: '4px 6px', textAlign: 'center', borderBottom: '0.5px solid var(--bord)', borderLeft: '0.5px solid var(--bord)' }}>
                      {machOff || shiftOff ? (
                        <span title={machOff ? 'เครื่องปิดวันนี้' : 'กะปิด'} style={{ color: 'var(--txt3)', fontSize: 8, opacity: 0.5 }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleManualShift(m.id, dStr)}
                            style={{ cursor: 'pointer', accentColor: 'var(--green)', width: 14, height: 14 }} />
                          {wallH > 0 && (
                            <div title={`งาน ${wallH.toFixed(1)}h`} style={{ fontSize: 7, fontFamily: 'var(--mono)', color: wallH > capH ? 'var(--amber)' : 'var(--txt3)' }}>
                              {wallH.toFixed(1)}h
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  )
                })}
                <td style={{ padding: '4px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: totalAddedH > 0 ? 700 : 400, color: totalAddedH > 0 ? 'var(--blue)' : 'var(--txt3)', borderBottom: '0.5px solid var(--bord)', borderLeft: '1px solid var(--bord)', whiteSpace: 'nowrap' }}>
                  {totalAddedH > 0 ? `+${totalAddedH.toFixed(1)}h` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
