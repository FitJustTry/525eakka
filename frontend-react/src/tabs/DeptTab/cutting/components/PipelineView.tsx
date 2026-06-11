import React from 'react'
import type { CuttingMachine, WCConfig, Order } from '../../../../types'
import type { CuttingRate } from '../../../../types'
import { DAY_SHORT } from '../scheduling/constants'
import type { DayWork, MachineDaySched } from '../scheduling/constants'
import type { DayRow, MachTotals } from '../scheduling/weekData'
import { fmtISO, mLabel, resolveHours, isMachineOn } from '../scheduling/utils'

export interface PipelineViewProps {
  dayRows: DayRow[]
  weekOrders: Order[]
  machines: CuttingMachine[]
  products: Record<string, { kva?: number }>
  workDisplay: 'order' | 'carry' | 'segment' | 'unit'
  isFastest: boolean
  lateOrders: Set<string>
  mTotals: MachTotals[]
  weekSchedule: Map<number, Map<string, MachineDaySched>>
  days: Date[]
  wcConfig: Record<string, WCConfig>
  fmtD: (d: Date) => string
  origId: (id: string) => string
}

export default function PipelineView({
  weekOrders,
  machines,
  products,
  workDisplay,
  isFastest,
  lateOrders,
  mTotals,
  weekSchedule,
  days,
  wcConfig,
  fmtD,
  origId,
}: PipelineViewProps) {
  const COLORS = ['#89b4fa','#fab387','#a6e3a1','#cba6f7','#f38ba8','#f9e2af','#94e2d5','#89dceb']
  const orderColor = new Map<string, string>()
  let ci = 0
  weekOrders.forEach(o => { if (!orderColor.has(o.id)) orderColor.set(o.id, COLORS[ci++ % COLORS.length]) })

  const dayRegHrs = days.map(d => {
    const isSat = d.getDay() === 6
    const m0 = machines[0]
    if (!m0) return isSat ? 4 : 8
    return resolveHours(m0, wcConfig, isSat, d.getDay()).reg || (isSat ? 4 : 8)
  })
  const totalHrs = dayRegHrs.reduce((a, h) => a + h, 0) || 1
  const dayStart = dayRegHrs.reduce<number[]>((acc, _h, i) => { acc.push(i === 0 ? 0 : acc[i-1] + dayRegHrs[i-1]); return acc }, [])

  interface Seg { order: Order; start: number; dur: number; isCarryOver: boolean; carriesOver: boolean; isComplete: boolean }
  const machineSegs = machines.map(m => {
    const segs: Seg[] = []
    days.forEach((d, di) => {
      const dStr = fmtISO(d)
      const sched = weekSchedule.get(m.id)?.get(dStr)
      if (!sched) return
      let within = 0
      const workItems = workDisplay === 'order'
        ? (() => {
            const acc: Record<string, DayWork> = {}
            sched.work.filter(w => (w.hrsWorked >= 0.01 || !w.isComplete) && (!w.isCarryOver || w.isComplete)).forEach(w => {
              const key = origId(w.order.id)
              if (!acc[key]) { const orig = weekOrders.find(o => o.id === key); acc[key] = { ...w, order: orig ?? {...w.order, id: key}, hrsWorked: 0 } }
              acc[key].hrsWorked  += w.hrsWorked
              acc[key].isCarryOver = acc[key].isCarryOver || w.isCarryOver
              acc[key].isComplete  = w.isComplete
              acc[key].carriesOver = w.carriesOver
            })
            return Object.values(acc)
          })()
        : workDisplay === 'carry'
        ? (() => {
            const acc: Record<string, DayWork> = {}
            sched.work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete).forEach(w => {
              const key = `${origId(w.order.id)}:${w.isCarryOver ? 'c' : 'n'}`
              if (!acc[key]) { const orig = weekOrders.find(o => o.id === key.split(':')[0]); acc[key] = { ...w, order: orig ?? {...w.order, id: origId(w.order.id)}, hrsWorked: 0 } }
              acc[key].hrsWorked  += w.hrsWorked
              acc[key].isComplete  = w.isComplete
              acc[key].carriesOver = w.carriesOver
            })
            return Object.values(acc)
          })()
        : workDisplay === 'unit'
          ? sched.work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete).flatMap(w =>
              w.order.qty <= 1 ? [w] : isFastest ? [{...w, order: {...w.order, qty: 1}}] : Array.from({length: w.order.qty}, () => ({...w, hrsWorked: w.hrsWorked / w.order.qty, order: {...w.order, qty: 1}}))
            )
          : sched.work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete)
      workItems.forEach(w => {
        segs.push({ order: w.order, start: dayStart[di] + within, dur: w.hrsWorked, isCarryOver: w.isCarryOver, carriesOver: w.carriesOver, isComplete: w.isComplete })
        within += w.hrsWorked
      })
    })
    return { m, segs }
  })

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      {/* Day ruler */}
      <div style={{ display: 'flex', marginLeft: 130, marginBottom: 4 }}>
        {days.map((d, di) => {
          const isSat = d.getDay() === 6
          const off = machines.filter(m => !isMachineOn(m, d.getDay()))
          return (
            <div key={di} style={{ width: `${dayRegHrs[di]/totalHrs*100}%`, flexShrink: 0, textAlign: 'center', fontSize: 9, color: isSat ? 'var(--amber)' : 'var(--txt3)', borderLeft: '1px solid var(--bord)', paddingTop: 2 }}>
              {DAY_SHORT[d.getDay()]} {fmtD(d)}
              {off.length > 0 && <span style={{ color: 'var(--red)', marginLeft: 3 }}>🔴{off.length}</span>}
            </div>
          )
        })}
      </div>

      {/* Machine rows */}
      {machineSegs.map(({ m, segs }) => {
        const t = mTotals[machines.indexOf(m)]
        const col = t.over ? 'var(--red)' : t.ot > 0 ? 'var(--amber)' : 'var(--green)'
        return (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}>
            <div style={{ width: 130, flexShrink: 0, paddingRight: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700 }}>{mLabel(m)}</div>
              <div style={{ fontSize: 8, color: col, fontFamily: 'var(--mono)' }}>{t.qty}ตัว·{t.wallHrs.toFixed(1)}h</div>
            </div>
            <div style={{ flex: 1, position: 'relative', height: 32, background: 'var(--bg3)', borderRadius: 4, border: '1px solid var(--bord)', overflow: 'hidden' }}>
              {days.map((d, di) => (
                <div key={di} style={{ position: 'absolute', left: `${dayStart[di]/totalHrs*100}%`, top: 0, bottom: 0, width: `${dayRegHrs[di]/totalHrs*100}%`,
                  background: !isMachineOn(m, d.getDay()) ? 'rgba(224,90,78,.15)' : undefined,
                  borderLeft: di > 0 ? '1px dashed var(--bord2)' : undefined, zIndex: 1 }}>
                  {!isMachineOn(m, d.getDay()) && <span style={{ fontSize: 7, color: 'var(--red)', position: 'absolute', top: 2, left: 2 }}>🔴</span>}
                </div>
              ))}
              {segs.map((seg, si) => {
                const kva = seg.order.kva ?? products[seg.order.product]?.kva ?? 0
                const color = orderColor.get(seg.order.id) ?? '#89b4fa'
                const left = seg.start / totalHrs * 100
                const width = Math.max(seg.dur / totalHrs * 100, 0.3)
                return (
                  <div key={si} title={`${seg.order.sap_so||seg.order.id.slice(-6)} · ${kva.toLocaleString()}kVA×${seg.order.qty} · ${seg.dur.toFixed(1)}h${seg.isCarryOver?' (↩)':''}${seg.carriesOver?' →':seg.isComplete?' ✓':''}${lateOrders.has(origId(seg.order.id)) && seg.isComplete ? ` 🔴 ส่งช้า (due: ${seg.order.due_so||'?'})` : ''}`}
                    style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: 2, bottom: 2, borderRadius: 3, zIndex: 2,
                      background: color, opacity: seg.isCarryOver ? 0.7 : 0.9,
                      borderLeft: seg.isCarryOver ? '3px solid rgba(0,0,0,.3)' : undefined,
                      borderRight: seg.carriesOver ? '3px solid rgba(0,0,0,.4)' : undefined,
                      borderTop: lateOrders.has(origId(seg.order.id)) && seg.isComplete ? '2px solid #e4405e' : undefined,
                      display: 'flex', alignItems: 'center', overflow: 'hidden', paddingLeft: 2 }}>
                    <span style={{ fontSize: 7, color: '#11111b', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--mono)' }}>
                      {lateOrders.has(origId(seg.order.id)) && seg.isComplete ? '🔴' : ''}{kva >= 1000 ? `${kva/1000}k` : kva}{seg.isComplete ? '✓' : seg.carriesOver ? '→' : ''} {seg.dur.toFixed(1)}h
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      <div style={{ marginLeft: 130, fontSize: 9, color: 'var(--txt3)', marginTop: 4, display: 'flex', gap: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: '#89b4fa', display: 'inline-block' }}/>งานใหม่</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: '#89b4fa', opacity: 0.7, borderLeft: '3px solid rgba(0,0,0,.3)', display: 'inline-block' }}/>ต่อจากเมื่อวาน</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: '#89b4fa', borderRight: '3px solid rgba(0,0,0,.4)', display: 'inline-block' }}/>ยังไม่เสร็จ→</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: 'rgba(224,90,78,.15)', display: 'inline-block' }}/>🔴 ปิด</span>
      </div>
    </div>
  )
}
