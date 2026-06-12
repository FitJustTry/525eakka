import React, { useState } from 'react'
import type { CuttingMachine, Order } from '../../../../types'
import type { MachTotals } from '../scheduling/weekData'
import { resolveHours, resolveShift } from '../scheduling/utils'

interface Props {
  mTotals: MachTotals[]
  machines: CuttingMachine[]
  days: Date[]
  wcConfig: Record<string, { hrs: number; ot: number; sat_hrs: number; sat_ot: number }>
  shiftHrsDefault: number
  weekCarryOrders: Order[]
  weekUnscheduled: Order[]
  weekDoneOrders: Order[]
}

export default function CapacityGapPanel({
  mTotals, machines, days, wcConfig, shiftHrsDefault,
  weekCarryOrders, weekUnscheduled, weekDoneOrders,
}: Props) {
  const [open, setOpen] = useState(false)

  const totalCap  = mTotals.reduce((s, t) => s + t.capHrs, 0)
  const totalUsed = mTotals.reduce((s, t) => s + t.wallHrs, 0)

  const completedCount  = weekDoneOrders.length
  const avgHrsPerOrder  = completedCount > 0 ? totalUsed / completedCount : 0
  const pendingCount    = weekCarryOrders.length + weekUnscheduled.length
  const estPendingHrs   = avgHrsPerOrder > 0 ? pendingCount * avgHrsPerOrder : 0

  const totalNeeded  = totalUsed + estPendingHrs
  const gap          = totalCap - totalNeeded   // positive = slack, negative = deficit
  const deficit      = Math.max(0, -gap)
  const utilizePct   = totalCap > 0 ? (totalUsed / totalCap * 100) : 0

  const workingDays = days.filter(d => d.getDay() !== 0).length || 1

  const dailyOtGain = machines.reduce((s, m) => {
    const { ot } = resolveHours(m, wcConfig, false, 1)
    return s + ot * (m.count || 1)
  }, 0)

  const dailyShiftGain = machines.reduce((s, m) => {
    if (!(m.shift_enabled ?? true)) return s
    return s + resolveShift(m, shiftHrsDefault) * (m.count || 1)
  }, 0)

  const avgMachineCap = machines.length > 0 ? totalCap / machines.length : 0

  const otDaysNeeded    = dailyOtGain > 0    ? Math.ceil(deficit / dailyOtGain)    : null
  const shiftDaysNeeded = dailyShiftGain > 0 ? Math.ceil(deficit / dailyShiftGain) : null
  const machinesNeeded  = avgMachineCap > 0  ? (deficit / avgMachineCap).toFixed(1) : null

  const gapColor = gap >= 0 ? 'var(--green)' : 'var(--red)'

  if (machines.length === 0) return null

  return (
    <div style={{ border: '1px solid var(--bord)', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
      {/* Summary row — always visible */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', cursor: 'pointer', background: 'var(--bg3)', flexWrap: 'wrap' }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt2)' }}>📊 Capacity</span>

        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: gapColor, fontWeight: 700 }}>
          {gap >= 0 ? `+${gap.toFixed(0)}h slack` : `${(-gap).toFixed(0)}h deficit`}
        </span>

        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>
          {totalUsed.toFixed(0)}h / {totalCap.toFixed(0)}h ({utilizePct.toFixed(0)}%)
        </span>

        {pendingCount > 0 && (
          <span style={{ fontSize: 10, color: 'var(--amber)', background: 'rgba(249,226,175,.12)', padding: '1px 7px', borderRadius: 6 }}>
            ⏳ {pendingCount} pending (~{estPendingHrs.toFixed(0)}h est.)
          </span>
        )}

        {deficit > 0 && (
          <span style={{ fontSize: 10, color: 'var(--txt3)', fontStyle: 'italic' }}>
            {otDaysNeeded !== null && otDaysNeeded > 0 && `+${otDaysNeeded} OT วัน`}
            {shiftDaysNeeded !== null && shiftDaysNeeded > 0 && dailyShiftGain > 0 && ` · +${shiftDaysNeeded} กะ`}
            {machinesNeeded && ` · +${machinesNeeded} เครื่อง`}
          </span>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--txt3)' }}>{open ? '▾' : '▸'}</span>
      </div>

      {/* Detail panel */}
      {open && (
        <div style={{ padding: '10px 14px', background: 'var(--bg2)', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Capacity bars per machine */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>เครื่อง</span>
            {machines.map((m, i) => {
              const t = mTotals[i]
              if (!t) return null
              const pct = t.capHrs > 0 ? Math.min(110, t.wallHrs / t.capHrs * 100) : 0
              const col = pct > 100 ? 'var(--red)' : pct > 80 ? 'var(--amber)' : 'var(--green)'
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, minWidth: 90, color: 'var(--txt2)', fontWeight: 600, whiteSpace: 'nowrap' }}>{m.name}</span>
                  <div style={{ flex: 1, height: 6, background: 'var(--bg4)', borderRadius: 3, minWidth: 60 }}>
                    <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: col, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--txt3)', minWidth: 90, textAlign: 'right' }}>
                    {t.wallHrs.toFixed(1)}h / {t.capHrs.toFixed(1)}h ({pct.toFixed(0)}%)
                  </span>
                </div>
              )
            })}
          </div>

          {/* Totals row */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid var(--bord)' }}>
            {[
              { label: 'Need',      val: `${totalNeeded.toFixed(0)}h`,  col: 'var(--txt1)' },
              { label: 'Available', val: `${totalCap.toFixed(0)}h`,     col: 'var(--blue)' },
              { label: 'Gap',       val: gap >= 0 ? `+${gap.toFixed(0)}h` : `${gap.toFixed(0)}h`, col: gapColor },
              { label: 'Working days', val: `${workingDays}`, col: 'var(--txt3)' },
            ].map(({ label, val, col }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 8, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: col }}>{val}</span>
              </div>
            ))}
          </div>

          {/* Recommendations */}
          {deficit > 0 && (
            <div style={{ padding: '8px 10px', background: 'rgba(249,226,175,.07)', border: '1px solid rgba(249,226,175,.25)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--amber)', marginBottom: 5 }}>
                ⚡ To finish on time (cover {deficit.toFixed(0)}h):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {otDaysNeeded !== null && otDaysNeeded > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--txt2)' }}>• +{otDaysNeeded} วัน OT <span style={{ color: 'var(--txt3)' }}>({dailyOtGain.toFixed(1)}h/วัน)</span></span>
                )}
                {shiftDaysNeeded !== null && shiftDaysNeeded > 0 && dailyShiftGain > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--txt2)' }}>• +{shiftDaysNeeded} คืน กะ <span style={{ color: 'var(--txt3)' }}>({dailyShiftGain.toFixed(1)}h/คืน)</span></span>
                )}
                {machinesNeeded && parseFloat(machinesNeeded) > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--txt2)' }}>• +{machinesNeeded} เครื่อง <span style={{ color: 'var(--txt3)' }}>(เฉลี่ย {avgMachineCap.toFixed(0)}h/เครื่อง/สัปดาห์)</span></span>
                )}
                {pendingCount > 0 && avgHrsPerOrder > 0 && (
                  <span style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 2 }}>
                    ประมาณจาก {pendingCount} orders ค้าง · เฉลี่ย {avgHrsPerOrder.toFixed(1)}h/order
                  </span>
                )}
              </div>
            </div>
          )}

          {deficit <= 0 && pendingCount > 0 && (
            <div style={{ fontSize: 10, color: 'var(--green)' }}>
              ✅ Slack เพียงพอรองรับ {pendingCount} orders ค้าง (~{estPendingHrs.toFixed(0)}h)
            </div>
          )}
        </div>
      )}
    </div>
  )
}
