import React from 'react'
import type { CuttingMachine } from '../../../types'
import type { MachineDaySched } from '../scheduling/constants'
import type { MachTotals } from '../scheduling/weekData'
import { DAY_SHORT } from '../scheduling/constants'
import { fmtISO, isMachineOn, mLabel, resolveHours } from '../scheduling/utils'

interface Props {
  machines: CuttingMachine[]
  days: Date[]
  customShiftHrs: Map<number, Map<string, number>>
  setCustomShiftHrs: React.Dispatch<React.SetStateAction<Map<number, Map<string, number>>>>
  customOtHrs: Map<number, Map<string, number>>
  setCustomOtHrs: React.Dispatch<React.SetStateAction<Map<number, Map<string, number>>>>
  weekSchedule: Map<number, Map<string, MachineDaySched>>
  wcConfig: Record<string, { hrs: number; ot: number; sat_hrs: number; sat_ot: number }>
  mTotals: MachTotals[]
  lateOrdersSize: number
  baselineLateCount: number
}

function setVal(
  prev: Map<number, Map<string, number>>,
  machineId: number,
  dStr: string,
  val: number,
): Map<number, Map<string, number>> {
  const next = new Map(prev)
  const inner = new Map(next.get(machineId) ?? [])
  if (val <= 0) inner.delete(dStr); else inner.set(dStr, val)
  if (inner.size === 0) next.delete(machineId); else next.set(machineId, inner)
  return next
}

export default function CustomShiftOtGrid({
  machines, days, customShiftHrs, setCustomShiftHrs, customOtHrs, setCustomOtHrs,
  weekSchedule, wcConfig, mTotals, lateOrdersSize, baselineLateCount,
}: Props) {
  const totalCustomShift = [...customShiftHrs.values()].flatMap(m => [...m.values()]).reduce((s, v) => s + v, 0)
  const totalCustomOt = [...customOtHrs.values()].flatMap(m => [...m.values()]).reduce((s, v) => s + v, 0)

  return (
    <div style={{ padding: '8px 16px', background: 'rgba(203,166,247,.04)', borderBottom: '1px solid var(--bord)', overflowX: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple)' }}>✏ กำหนดชั่วโมงกะ + OT ต่อเครื่องต่อวัน</span>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>🌙 กะ (h) · ⚡ OT (h) — 0 หรือว่าง = ปิด</span>
        {totalCustomShift > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', background: 'rgba(137,180,250,.12)', padding: '2px 8px', borderRadius: 8 }}>
            🌙 {totalCustomShift.toFixed(1)}h กะ
          </span>
        )}
        {totalCustomOt > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--amber)', background: 'rgba(249,226,175,.15)', padding: '2px 8px', borderRadius: 8 }}>
            ⚡ {totalCustomOt.toFixed(1)}h OT
          </span>
        )}
        {lateOrdersSize !== baselineLateCount && (
          <span style={{ fontSize: 10, fontWeight: 700, color: baselineLateCount > lateOrdersSize ? 'var(--green)' : 'var(--red)', background: baselineLateCount > lateOrdersSize ? 'rgba(166,227,161,.15)' : 'rgba(224,90,78,.08)', padding: '2px 8px', borderRadius: 8 }}>
            🔴 ส่งช้า {baselineLateCount} → {lateOrdersSize}
            {baselineLateCount > lateOrdersSize ? ` (−${baselineLateCount - lateOrdersSize} ดีขึ้น)` : ` (+${lateOrdersSize - baselineLateCount})`}
          </span>
        )}
        <button
          onClick={() => { setCustomShiftHrs(new Map()); setCustomOtHrs(new Map()) }}
          style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--bord2)', background: 'var(--bg3)', color: 'var(--txt3)', cursor: 'pointer', marginLeft: 'auto' }}>
          ล้างทั้งหมด
        </button>
      </div>
      <table style={{ borderCollapse: 'collapse', fontSize: 10, width: 'auto' }}>
        <thead>
          <tr>
            <th style={{ padding: '3px 10px', textAlign: 'left', color: 'var(--txt3)', fontWeight: 600, minWidth: 120, borderBottom: '1px solid var(--bord)' }}>เครื่อง</th>
            {days.map(d => (
              <th key={fmtISO(d)} style={{ padding: '3px 8px', textAlign: 'center', borderBottom: '1px solid var(--bord)', minWidth: 70 }}>
                <div style={{ color: d.getDay() === 6 ? 'var(--amber)' : 'var(--txt2)', fontWeight: 600 }}>{DAY_SHORT[d.getDay()]}</div>
                <div style={{ color: 'var(--txt3)', fontSize: 9 }}>{String(d.getDate()).padStart(2,'0')}/{String(d.getMonth()+1).padStart(2,'0')}</div>
              </th>
            ))}
            <th style={{ padding: '3px 10px', textAlign: 'right', color: 'var(--purple)', fontWeight: 600, borderBottom: '1px solid var(--bord)', whiteSpace: 'nowrap' }}>รวม</th>
          </tr>
        </thead>
        <tbody>
          {machines.map((m, mi2) => {
            const shiftMap = customShiftHrs.get(m.id)
            const otMap = customOtHrs.get(m.id)
            const weekShiftH = [...(shiftMap?.values() ?? [])].reduce((s, v) => s + v, 0) * (m.count || 1)
            const weekOtH = [...(otMap?.values() ?? [])].reduce((s, v) => s + v, 0) * (m.count || 1)
            const t = mTotals[mi2]
            return (
              <tr key={m.id} style={{ background: mi2 % 2 === 0 ? 'transparent' : 'rgba(127,127,127,.03)' }}>
                <td style={{ padding: '4px 10px', fontWeight: 600, color: 'var(--txt)', borderBottom: '0.5px solid var(--bord)', whiteSpace: 'nowrap' }}>
                  <div>{mLabel(m)}</div>
                  <div style={{ fontSize: 8, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>
                    {t.wallHrs.toFixed(1)}h สัปดาห์
                    {weekShiftH > 0 && <span style={{ color: 'var(--blue)' }}> · +{weekShiftH.toFixed(1)}h🌙</span>}
                    {weekOtH > 0 && <span style={{ color: 'var(--amber)' }}> · +{weekOtH.toFixed(1)}h⚡</span>}
                  </div>
                </td>
                {days.map(d => {
                  const dStr = fmtISO(d)
                  const machOff = !isMachineOn(m, d.getDay())
                  const { ot: defaultOt } = resolveHours(m, wcConfig, d.getDay() === 6, d.getDay())
                  const shiftVal = shiftMap?.get(dStr) ?? 0
                  const otVal = otMap?.get(dStr) ?? 0
                  const dayWall = weekSchedule.get(m.id)?.get(dStr)
                  const wallH = dayWall ? (dayWall.regHrs + dayWall.otHrs + (dayWall.shiftHrs ?? 0)) : 0
                  return (
                    <td key={dStr} style={{ padding: '3px 4px', textAlign: 'center', borderBottom: '0.5px solid var(--bord)', borderLeft: '0.5px solid var(--bord)' }}>
                      {machOff ? (
                        <span style={{ color: 'var(--txt3)', fontSize: 8, opacity: 0.5 }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 2 }} title="ชั่วโมงกะกลางคืน">
                            <span style={{ fontSize: 7, color: 'var(--blue)' }}>🌙</span>
                            <input
                              type="number" min={0} max={24} step={0.5}
                              value={shiftVal || ''}
                              placeholder="0"
                              onChange={e => {
                                const v = Math.max(0, parseFloat(e.target.value) || 0)
                                setCustomShiftHrs(prev => setVal(prev, m.id, dStr, v))
                              }}
                              style={{ width: 36, fontSize: 10, padding: '1px 3px', borderRadius: 4, border: `1px solid ${shiftVal > 0 ? 'var(--blue)' : 'var(--bord2)'}`, background: shiftVal > 0 ? 'rgba(137,180,250,.1)' : 'var(--bg2)', color: shiftVal > 0 ? 'var(--blue)' : 'var(--txt3)', fontWeight: shiftVal > 0 ? 700 : 400, textAlign: 'center' }}
                            />
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 2 }} title={`OT (เครื่องนี้ default ${defaultOt}h)`}>
                            <span style={{ fontSize: 7, color: 'var(--amber)' }}>⚡</span>
                            <input
                              type="number" min={0} max={24} step={0.5}
                              value={otVal || ''}
                              placeholder={String(defaultOt)}
                              onChange={e => {
                                const v = Math.max(0, parseFloat(e.target.value) || 0)
                                setCustomOtHrs(prev => setVal(prev, m.id, dStr, v))
                              }}
                              style={{ width: 36, fontSize: 10, padding: '1px 3px', borderRadius: 4, border: `1px solid ${otVal > 0 ? 'var(--amber)' : 'var(--bord2)'}`, background: otVal > 0 ? 'rgba(249,226,175,.15)' : 'var(--bg2)', color: otVal > 0 ? 'var(--amber)' : 'var(--txt3)', fontWeight: otVal > 0 ? 700 : 400, textAlign: 'center' }}
                            />
                          </label>
                          {wallH > 0 && (
                            <div style={{ fontSize: 7, fontFamily: 'var(--mono)', color: 'var(--txt3)' }}>
                              {wallH.toFixed(1)}h
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  )
                })}
                <td style={{ padding: '4px 10px', textAlign: 'right', fontFamily: 'var(--mono)', borderBottom: '0.5px solid var(--bord)', borderLeft: '1px solid var(--bord)', whiteSpace: 'nowrap' }}>
                  {weekShiftH > 0 && <div style={{ color: 'var(--blue)', fontWeight: 700 }}>🌙+{weekShiftH.toFixed(1)}h</div>}
                  {weekOtH > 0 && <div style={{ color: 'var(--amber)', fontWeight: 700 }}>⚡+{weekOtH.toFixed(1)}h</div>}
                  {weekShiftH === 0 && weekOtH === 0 && <span style={{ color: 'var(--txt3)' }}>—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
