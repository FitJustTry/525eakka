import React from 'react'
import type { CuttingMachine, Order } from '../../../../types'
import { decodeItemInfo } from '../../../../utils/itemCodeDecode'
import { DAY_TH } from '../scheduling/constants'
import type { DayWork, MachineDaySched } from '../scheduling/constants'
import type { DayRow } from '../scheduling/weekData'
import { fmtISO, mLabel, detectWireType, drillPrefers, origId } from '../scheduling/utils'

export interface CardViewProps {
  dayRows: DayRow[]
  weekOrders: Order[]
  machines: CuttingMachine[]
  products: Record<string, { kva?: number }>
  workDisplay: 'order' | 'carry' | 'segment' | 'unit'
  isFastest: boolean
  lateOrders: Set<string>
  showWireData: boolean
  weekSchedule: Map<number, Map<string, MachineDaySched>>
  fmtD: (d: Date) => string
  origId: (id: string) => string
}

export default function CardView({
  dayRows,
  weekOrders,
  machines,
  products,
  workDisplay,
  isFastest,
  lateOrders,
  showWireData,
  weekSchedule,
  fmtD,
  origId,
}: CardViewProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {dayRows.map(row => {
        const { dStr, d, isSat, dayOrders, dayScheduledQty, dayKva: _dayKva, dayCarryQty: _dayCarryQty, unassigned, machineCells, dayFinish, dayCapHrs, finishCol, actualQty, actualOrderCount } = row
        const hasActualWork = machineCells.some(mc => mc.work.length > 0)
        if (dayOrders.length === 0 && !hasActualWork) return null
        const isToday = dStr === fmtISO(new Date())
        const showPlanned = actualOrderCount === dayOrders.length || dayOrders.length === 0
        const displayQty = showPlanned ? dayScheduledQty : actualQty
        const displayOrders = showPlanned ? dayOrders.length : actualOrderCount
        const plannedNote = !showPlanned ? ` (แผน ${dayOrders.length} orders)` : ''

        return (
          <div key={dStr} style={{ border: `1px solid ${isToday ? 'var(--blue)' : 'var(--bord)'}`, borderRadius: 8, overflow: 'hidden' }}>
            {/* Day header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', background: isToday ? 'rgba(137,180,250,.08)' : 'var(--bg2)', borderBottom: '1px solid var(--bord)' }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: isToday ? 'var(--blue)' : isSat ? 'var(--txt2)' : 'var(--txt)' }}>
                {DAY_TH[d.getDay()]} {fmtD(d)}{isToday ? ' ◀ วันนี้' : ''}
              </span>
              <span style={{ fontSize: 10, color: 'var(--txt3)' }}>
                {displayQty} ตัว · {displayOrders} orders{plannedNote}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: finishCol, fontFamily: 'var(--mono)', marginLeft: 'auto' }}>
                เสร็จใน {dayFinish.toFixed(1)}h
                {dayFinish > dayCapHrs && <span style={{ fontSize: 9, marginLeft: 4 }}>⚠ OT {(dayFinish - dayCapHrs).toFixed(1)}h</span>}
              </span>
            </div>

            {/* Machine rows */}
            <div style={{ padding: '6px 0' }}>
              {machineCells.map(({ m, machOff, sched, work, wall, capH, grp: _grp }) => {
                if (machOff) return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', padding: '4px 14px', borderBottom: '0.5px solid var(--bord)', gap: 8, opacity: 0.5 }}>
                    <div style={{ minWidth: 140, fontSize: 10, fontWeight: 700, color: 'var(--red)' }}>🔴 {mLabel(m)}</div>
                    <span style={{ fontSize: 9, color: 'var(--txt3)' }}>ปิดวันนี้</span>
                  </div>
                )
                if (!sched || (work.length === 0 && !sched.hasCarryOver)) return null
                const totalH = wall
                const timeCol = sched.carriesForward ? 'var(--red)' : sched.otHrs >= 0.05 ? 'var(--amber)' : 'var(--green)'
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', padding: '6px 14px', borderBottom: '0.5px solid var(--bord)', gap: 0 }}>
                    {/* Machine name + time */}
                    <div style={{ minWidth: 140, flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt)' }}>
                        {mLabel(m)}
                        {sched.hasCarryOver && <span style={{ fontSize: 9, marginLeft: 4, color: 'var(--blue)', background: 'rgba(137,180,250,.15)', padding: '1px 4px', borderRadius: 4 }}>↩ ต่อจากเมื่อวาน</span>}
                      </div>
                      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: timeCol, fontWeight: 600 }}>
                        {totalH.toFixed(1)}h / {capH}h
                        {sched.otHrs >= 0.05 && <span style={{ color: 'var(--amber)', marginLeft: 4 }}>+OT {sched.otHrs.toFixed(1)}h</span>}
                        {sched.shiftHrs >= 0.05 && <span style={{ color: 'var(--blue)', marginLeft: 4 }}>🌙 {sched.shiftHrs.toFixed(1)}h</span>}
                        {sched.carriesForward && <span style={{ color: 'var(--red)', marginLeft: 4 }}>→ พรุ่งนี้</span>}
                      </div>
                    </div>
                    {/* Work items */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {(workDisplay === 'order'
                        ? Object.values(
                            sched.work
                              .filter(w => (w.hrsWorked >= 0.01 || !w.isComplete) && (!w.isCarryOver || w.isComplete))
                              .reduce((acc, w) => {
                                const key = origId(w.order.id)
                                if (!acc[key]) { const orig = weekOrders.find(o => o.id === key); acc[key] = { ...w, order: orig ?? {...w.order, id: key}, hrsWorked: 0 } }
                                acc[key].hrsWorked  += w.hrsWorked
                                acc[key].isCarryOver = acc[key].isCarryOver || w.isCarryOver
                                acc[key].isComplete  = w.isComplete
                                acc[key].carriesOver = w.carriesOver
                                return acc
                              }, {} as Record<string, DayWork>)
                          ) as DayWork[]
                        : workDisplay === 'carry'
                        ? Object.values(
                            sched.work
                              .filter(w => w.hrsWorked >= 0.01 || !w.isComplete)
                              .reduce((acc, w) => {
                                const key = `${origId(w.order.id)}:${w.isCarryOver ? 'c' : 'n'}`
                                if (!acc[key]) { const orig = weekOrders.find(o => o.id === key.split(':')[0]); acc[key] = { ...w, order: orig ?? {...w.order, id: origId(w.order.id)}, hrsWorked: 0 } }
                                acc[key].hrsWorked  += w.hrsWorked
                                acc[key].isComplete  = w.isComplete
                                acc[key].carriesOver = w.carriesOver
                                return acc
                              }, {} as Record<string, DayWork>)
                          ) as DayWork[]
                        : workDisplay === 'unit'
                          ? sched.work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete).flatMap(w =>
                              w.order.qty <= 1 ? [w] : isFastest ? [{...w, order: {...w.order, qty: 1}}] : Array.from({length: w.order.qty}, () => ({...w, hrsWorked: w.hrsWorked / w.order.qty, order: {...w.order, qty: 1}}))
                            )
                          : sched.work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete)
                      ).map((w, wi) => {
                        const kva = w.order.kva ?? products[w.order.product]?.kva ?? 0
                        const { typeCode } = decodeItemInfo(w.order.item_code ?? '')
                        const kvaCol = kva <= 400 ? 'var(--blue)' : kva <= 3500 ? 'var(--amber)' : 'var(--red)'
                        const typeLabel = typeCode === '4' ? 'CR' : ['1','2','3'].includes(typeCode) ? 'Oil' : ''
                        return (
                          <div key={wi}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                              {w.isCarryOver && <span style={{ fontSize: 9, color: 'var(--blue)' }}>↩</span>}
                              <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt3)', fontSize: 10, minWidth: 110 }}>{w.order.sap_so || w.order.id.slice(-10)}</span>
                              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: kvaCol }}>{kva.toLocaleString()}kVA ×{w.order.qty}</span>
                              {typeLabel && <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 4, background: typeCode === '4' ? 'rgba(250,179,135,.2)' : 'rgba(137,180,250,.15)', color: typeCode === '4' ? 'var(--amber)' : 'var(--blue)' }}>{typeLabel}</span>}
                              {typeCode === '4' && <span title={`Cast Resin — uses TMC time: ${(m.tmc_hrs ?? 0) > 0 ? (m.tmc_hrs ?? 0) + 'h' : 'not set (using kVA rate)'}`} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(203,166,247,.2)', color: 'var(--purple)', fontWeight: 700, letterSpacing: '.02em' }}>⏱ TMC</span>}
                              {drillPrefers(m, w.order) && <span style={{ fontSize: 10 }}>🔩</span>}
                              {w.order.customer && <span style={{ fontSize: 10, color: 'var(--txt2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>{w.order.customer}</span>}
                              {lateOrders.has(origId(w.order.id)) && w.isComplete && <span title={`ส่งช้า — due: ${w.order.due_so}`} style={{ fontSize: 10 }}>🔴</span>}
                              {w.order.priority === 'rush' && <span title="Rush" style={{ fontSize: 9, padding: '0 3px', borderRadius: 3, background: 'rgba(224,90,78,.2)', color: 'var(--red)', fontWeight: 700 }}>🔴 RUSH</span>}
                              {w.order.priority === 'high' && <span title="High priority" style={{ fontSize: 9, padding: '0 3px', borderRadius: 3, background: 'rgba(249,226,175,.2)', color: 'var(--amber)', fontWeight: 700 }}>🟡 HIGH</span>}
                              <span style={{ color: 'var(--txt3)', marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10 }}>{w.hrsWorked.toFixed(1)}h{w.isComplete ? ' ✓' : w.carriesOver ? ' →' : ''}</span>
                            </div>
                            {showWireData && (w.order.raw_mat || w.order.lv || w.order.hv) && (
                              <div style={{ display: 'flex', gap: 6, paddingLeft: 16, paddingBottom: 2, fontSize: 8, color: 'var(--txt3)', flexWrap: 'wrap', alignItems: 'center' }}>
                                {w.order.raw_mat && (() => {
                                  const wt = detectWireType(w.order.raw_mat)
                                  const matched = wt === 'laser' ? m.laser : wt === 'm4' ? m.m4 : true
                                  const badge = wt === 'laser' ? '🔆 Laser' : wt === 'm4' ? '⬛ M-4' : ''
                                  return (
                                    <span style={{ fontWeight: 700, color: wt === 'any' ? 'var(--txt2)' : matched ? 'var(--green)' : 'var(--red)',
                                      padding: '1px 5px', borderRadius: 4, background: wt === 'any' ? 'var(--bg3)' : matched ? 'rgba(166,227,161,.15)' : 'rgba(224,90,78,.12)',
                                      border: `1px solid ${wt === 'any' ? 'var(--bord)' : matched ? 'rgba(166,227,161,.4)' : 'rgba(224,90,78,.3)'}` }}>
                                      📐 {w.order.raw_mat}{badge ? ` ${badge}` : ''}{wt !== 'any' ? (matched ? ' OK' : ' NG') : ''}
                                    </span>
                                  )
                                })()}
                                {w.order.lv && w.order.lv !== '—' && <span>LV: <span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{w.order.lv}</span></span>}
                                {w.order.hv && w.order.hv !== '—' && <span>HV: <span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)' }}>{w.order.hv}</span></span>}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {/* Unassigned */}
              {unassigned.map((o, i) => {
                const kva = o.kva ?? products[o.product]?.kva ?? 0
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', fontSize: 10, color: 'var(--red)' }}>
                    <div style={{ minWidth: 140, flexShrink: 0, fontSize: 11, fontWeight: 700 }}>⚠ ไม่มีเครื่อง</div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--txt3)', minWidth: 110 }}>{o.sap_so || o.id.slice(-10)}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{kva.toLocaleString()}kVA ×{o.qty}</span>
                    <span style={{ fontSize: 9, marginLeft: 8, color: 'var(--txt3)' }}>เพิ่ม max_kva ให้เครื่องตัด</span>
                  </div>
                )
              })}
            </div>

            {/* OT recommendation */}
            {(() => {
              const otMachines = machines.filter(m => (weekSchedule.get(m.id)?.get(dStr)?.otNeeded ?? 0) > 0)
              const carryMachines = machines.filter(m => weekSchedule.get(m.id)?.get(dStr)?.carriesForward)
              if (!otMachines.length && !carryMachines.length) return null
              return (
                <div style={{ padding: '5px 14px', background: 'rgba(250,179,135,.06)', borderTop: '1px dashed var(--bord)', fontSize: 10 }}>
                  {otMachines.length > 0 && (
                    <span style={{ color: 'var(--amber)', marginRight: 12 }}>
                      ⚠ OT แนะนำ: {otMachines.map(m => `${mLabel(m)} +${(weekSchedule.get(m.id)!.get(dStr)!.otNeeded).toFixed(1)}h`).join(', ')}
                    </span>
                  )}
                  {carryMachines.length > 0 && (
                    <span style={{ color: 'var(--red)' }}>
                      ↩ งานค้าง: {carryMachines.map(m => mLabel(m)).join(', ')} → ต่อวันถัดไป
                    </span>
                  )}
                </div>
              )
            })()}
          </div>
        )
      })}
    </div>
  )
}
