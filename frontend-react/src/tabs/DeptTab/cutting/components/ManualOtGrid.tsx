import React from 'react'
import type { CuttingMachine } from '../../../types'
import type { MachineDaySched } from '../scheduling/constants'
import type { MachTotals } from '../scheduling/weekData'
import { fmtISO, isMachineOn, mLabel, resolveHours } from '../scheduling/utils'
import ManualSelectionGrid from './ManualSelectionGrid'

interface Props {
  machines: CuttingMachine[]
  days: Date[]
  manualOtDays: Map<number, Set<string>>
  toggleManualOt: (machineId: number, dStr: string) => void
  setManualOtDays: React.Dispatch<React.SetStateAction<Map<number, Set<string>>>>
  weekSchedule: Map<number, Map<string, MachineDaySched>>
  wcConfig: Record<string, { hrs: number; ot: number; sat_hrs: number; sat_ot: number }>
  mTotals: MachTotals[]
  lateOrdersSize: number
  baselineLateCount: number
}

export default function ManualOtGrid({
  machines, days, manualOtDays, toggleManualOt, setManualOtDays,
  weekSchedule, wcConfig, mTotals, lateOrdersSize, baselineLateCount,
}: Props) {
  const totalOtDays = [...manualOtDays.values()].reduce((s, v) => s + v.size, 0)

  return (
    <ManualSelectionGrid
      machines={machines} days={days}
      accentColor="var(--amber)" bgColor="rgba(249,226,175,.04)"
      title="⚡ เลือกเครื่อง + วันที่เปิด OT"
      description="คลิก checkbox เพื่อเปิด OT ต่อเครื่องต่อวัน — เมื่อมีการเลือก OT จะใช้เฉพาะวันที่เลือก"
      counterChip={totalOtDays > 0 ? (
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--amber)', background: 'rgba(249,226,175,.15)', padding: '2px 8px', borderRadius: 8 }}>
          ⚡ {totalOtDays} วัน
        </span>
      ) : undefined}
      summaryLabel="⚡ วัน"
      lateOrdersSize={lateOrdersSize} baselineLateCount={baselineLateCount}
      onClearAll={() => setManualOtDays(new Map())}
      renderRow={(m, mi2) => {
        const machOtSet = manualOtDays.get(m.id)
        const otDayCount = days.filter(d => machOtSet?.has(fmtISO(d)) && isMachineOn(m, d.getDay())).length
        const t = mTotals[mi2]
        return (
          <tr key={m.id} style={{ background: mi2 % 2 === 0 ? 'transparent' : 'rgba(127,127,127,.03)' }}>
            <td style={{ padding: '4px 10px', fontWeight: 600, color: 'var(--txt)', borderBottom: '0.5px solid var(--bord)', whiteSpace: 'nowrap' }}>
              <div>{mLabel(m)}</div>
              <div style={{ fontSize: 8, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>
                {t.wallHrs.toFixed(1)}h สัปดาห์
                {(() => { const { ot } = resolveHours(m, wcConfig, false, 1); return ot > 0 ? ` · OT ${ot}h/วัน` : '' })()}
              </div>
            </td>
            {days.map(d => {
              const dStr = fmtISO(d)
              const machOff = !isMachineOn(m, d.getDay())
              const { ot } = resolveHours(m, wcConfig, d.getDay() === 6, d.getDay())
              const checked = machOtSet?.has(dStr) ?? false
              const dayWall = weekSchedule.get(m.id)?.get(dStr)
              const otUsed = dayWall?.otHrs ?? 0
              return (
                <td key={dStr} style={{ padding: '4px 6px', textAlign: 'center', borderBottom: '0.5px solid var(--bord)', borderLeft: '0.5px solid var(--bord)' }}>
                  {machOff ? (
                    <span title="เครื่องปิดวันนี้" style={{ color: 'var(--txt3)', fontSize: 8, opacity: 0.4 }}>—</span>
                  ) : ot === 0 ? (
                    <span title="เครื่องนี้ไม่มี OT" style={{ color: 'var(--txt3)', fontSize: 8, opacity: 0.4 }}>—</span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleManualOt(m.id, dStr)}
                        style={{ cursor: 'pointer', accentColor: 'var(--amber)', width: 14, height: 14 }} />
                      {otUsed > 0.01 && (
                        <div title={`OT ใช้ ${otUsed.toFixed(1)}h`} style={{ fontSize: 7, fontFamily: 'var(--mono)', color: 'var(--amber)' }}>
                          {otUsed.toFixed(1)}h
                        </div>
                      )}
                    </div>
                  )}
                </td>
              )
            })}
            <td style={{ padding: '4px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: otDayCount > 0 ? 700 : 400, color: otDayCount > 0 ? 'var(--amber)' : 'var(--txt3)', borderBottom: '0.5px solid var(--bord)', borderLeft: '1px solid var(--bord)', whiteSpace: 'nowrap' }}>
              {otDayCount > 0 ? `${otDayCount}d` : '—'}
            </td>
          </tr>
        )
      }}
    />
  )
}
