import React from 'react'
import type { CuttingMachine } from '../../../types'
import type { MachineDaySched } from '../scheduling/constants'
import type { MachTotals } from '../scheduling/weekData'
import { fmtISO, isMachineOn, mLabel, resolveShift } from '../scheduling/utils'
import ManualSelectionGrid from './ManualSelectionGrid'

interface Props {
  machines: CuttingMachine[]
  days: Date[]
  manualShiftDays: Map<number, Set<string>>
  toggleManualShift: (machineId: number, dStr: string) => void
  setManualShiftDays: React.Dispatch<React.SetStateAction<Map<number, Set<string>>>>
  shiftHrsDefault: number
  weekSchedule: Map<number, Map<string, MachineDaySched>>
  mTotals: MachTotals[]
  totalShift: number
  lateOrdersSize: number
  baselineLateCount: number
}

export default function ManualShiftGrid({
  machines, days, manualShiftDays, toggleManualShift, setManualShiftDays,
  shiftHrsDefault, weekSchedule, mTotals, totalShift, lateOrdersSize, baselineLateCount,
}: Props) {
  return (
    <ManualSelectionGrid
      machines={machines} days={days}
      accentColor="var(--green)" bgColor="rgba(166,227,161,.04)"
      title="🗓 เลือกเครื่อง + วันที่เปิดกะกลางคืน"
      description="คลิก checkbox เพื่อเพิ่ม/ลบกะในเครื่องและวันนั้น"
      counterChip={totalShift >= 0.05 ? (
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', background: 'rgba(137,180,250,.12)', padding: '2px 8px', borderRadius: 8 }}>
          +{totalShift.toFixed(1)}h/สัปดาห์
        </span>
      ) : undefined}
      summaryLabel="+h/สัปดาห์"
      lateOrdersSize={lateOrdersSize} baselineLateCount={baselineLateCount}
      onClearAll={() => setManualShiftDays(new Map())}
      renderRow={(m, mi2) => {
        const machShiftHrs = resolveShift(m, shiftHrsDefault)
        const machShiftSet = manualShiftDays.get(m.id)
        const selectedCount = days.filter(d => machShiftSet?.has(fmtISO(d)) && isMachineOn(m, d.getDay())).length
        const totalAddedH = selectedCount * machShiftHrs * (m.count || 1)
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
                  {machOff ? (
                    <span title="เครื่องปิดวันนี้" style={{ color: 'var(--txt3)', fontSize: 8, opacity: 0.4 }}>—</span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      {shiftOff ? (
                        <span title="กะปิด" style={{ color: 'var(--txt3)', fontSize: 8, opacity: 0.5 }}>—</span>
                      ) : (
                        <input type="checkbox" checked={checked} onChange={() => toggleManualShift(m.id, dStr)}
                          style={{ cursor: 'pointer', accentColor: 'var(--green)', width: 14, height: 14 }} />
                      )}
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
      }}
    />
  )
}
