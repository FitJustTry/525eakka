import React, { useMemo } from 'react'
import type { CuttingMachine, Order, WCConfig } from '../../../types'
import { getHrsForKva, resolveHours, isMachineOn } from '../scheduling/utils'
import { getWeekRange } from '../scheduling/utils'

interface Props {
  machines: CuttingMachine[]
  orders: Order[]
  wcConfig: Record<string, WCConfig>
  currentWeekOffset: number
  onClose: () => void
}

function fmtDate(d: Date) {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}
function fmtISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function HorizonView({ machines, orders, wcConfig, currentWeekOffset, onClose }: Props) {
  const WEEKS = 4

  const weeks = useMemo(() => {
    return Array.from({ length: WEEKS }, (_, i) => {
      const { mon, sat } = getWeekRange(currentWeekOffset + i)
      const monStr = fmtISO(mon), satStr = fmtISO(sat)
      const days = Array.from({ length: 6 }, (_, j) => {
        const d = new Date(mon); d.setDate(mon.getDate() + j); return d
      })

      // Capacity per machine
      const machCap = machines.map(m => {
        let reg = 0, ot = 0
        for (const d of days) {
          if (!isMachineOn(m, d.getDay())) continue
          const { reg: r, ot: o } = resolveHours(m, wcConfig, d.getDay() === 6, d.getDay())
          reg += r * (m.count || 1)
          ot  += o * (m.count || 1)
        }
        return { m, reg, ot, total: reg + ot }
      })
      const totalReg = machCap.reduce((s, c) => s + c.reg, 0)
      const totalOt  = machCap.reduce((s, c) => s + c.ot, 0)
      const totalCap = totalReg + totalOt

      // Demand: orders with plan_date in this week
      const weekOrders = orders.filter(o => o.plan_date && o.plan_date >= monStr && o.plan_date <= satStr)
      const totalDemand = weekOrders.reduce((s, o) => {
        // Use first machine's hours as approximation
        const m0 = machines[0]
        if (!m0) return s
        return s + o.qty * getHrsForKva(m0, o.kva ?? 0, [], o.item_code, [], false, false)
      }, 0)

      const utilPct = totalCap > 0 ? Math.round((totalDemand / totalCap) * 100) : 0
      const isOver  = totalDemand > totalCap

      return { mon, sat, monStr, satStr, weekOrders, totalReg, totalOt, totalCap, totalDemand, utilPct, isOver, machCap }
    })
  }, [machines, orders, wcConfig, currentWeekOffset])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg)', borderRadius: 12, width: 900, maxWidth: '95vw', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--bord)' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>🔭 แนวโน้ม 4 สัปดาห์ข้างหน้า</span>
          <button onClick={onClose} style={{ fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)' }}>✕</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {weeks.map((w, wi) => (
            <div key={wi} style={{ borderRadius: 8, border: `1px solid ${w.isOver ? 'var(--red)' : 'var(--bord)'}`, padding: 14, background: w.isOver ? 'rgba(224,90,78,.04)' : 'var(--bg2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>
                  {wi === 0 ? '📌 ' : ''}{fmtDate(w.mon)} – {fmtDate(w.sat)}/{String(w.sat.getFullYear() % 100).padStart(2,'0')}
                  {wi === 0 && <span style={{ fontSize: 10, color: 'var(--blue)', marginLeft: 6 }}>สัปดาห์ปัจจุบัน</span>}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: w.isOver ? 'var(--red)' : w.utilPct > 75 ? 'var(--amber)' : 'var(--green)' }}>
                  {w.isOver ? '🔴 Over Capacity' : w.utilPct > 75 ? '🟡 ' : '🟢 '}{w.utilPct}% utilization
                </span>
                <span style={{ fontSize: 10, color: 'var(--txt3)', marginLeft: 'auto' }}>{w.weekOrders.length} orders · {w.totalDemand.toFixed(0)}h demand</span>
              </div>

              {/* Capacity bar */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: 'var(--txt3)', marginBottom: 3 }}>
                  Capacity: Reg {w.totalReg.toFixed(0)}h + OT {w.totalOt.toFixed(0)}h = {w.totalCap.toFixed(0)}h
                </div>
                <div style={{ position: 'relative', height: 16, borderRadius: 6, background: 'var(--bg3)', overflow: 'hidden' }}>
                  {/* OT bar (behind) */}
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, w.totalCap > 0 ? (w.totalReg / w.totalCap) * 100 : 0)}%`, background: 'var(--green)', opacity: 0.5 }} />
                  {/* Demand bar */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${Math.min(110, w.totalCap > 0 ? (w.totalDemand / w.totalCap) * 100 : 0)}%`,
                    background: w.isOver ? 'var(--red)' : w.utilPct > 75 ? 'var(--amber)' : 'var(--blue)',
                    opacity: 0.7, borderRadius: 6,
                  }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', mixBlendMode: 'difference' }}>
                    {w.totalDemand.toFixed(0)}h / {w.totalCap.toFixed(0)}h
                  </div>
                </div>
              </div>

              {/* Per-machine mini bars */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {w.machCap.map(({ m, reg, ot, total }) => {
                  const mOrders = w.weekOrders.filter(o => o.kva && o.kva >= m.min_kva && o.kva <= m.max_kva)
                  const mDemand = mOrders.reduce((s, o) => s + o.qty * getHrsForKva(m, o.kva ?? 0, [], o.item_code, [], false, false), 0)
                  const mUtil = total > 0 ? Math.round((mDemand / total) * 100) : 0
                  return (
                    <div key={m.id} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 6, background: 'var(--bg3)', color: mUtil > 90 ? 'var(--red)' : mUtil > 70 ? 'var(--amber)' : 'var(--txt2)' }}>
                      {m.name} {mUtil}%
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
