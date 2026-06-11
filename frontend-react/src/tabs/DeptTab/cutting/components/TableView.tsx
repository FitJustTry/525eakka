import React from 'react'
import type { CuttingMachine, CuttingRate, WCConfig } from '../../../../types'
import type { Order } from '../../../../types'
import { decodeItemInfo } from '../../../../utils/itemCodeDecode'
import styles from '../CuttingPage.module.css'
import { DAY_TH } from '../scheduling/constants'
import type { DayWork } from '../scheduling/constants'
import type { DayRow, MachTotals } from '../scheduling/weekData'
import { fmtISO, mLabel, machineTypeLabel, detectWireType, drillPrefers, canMachineCut, getHrsForKva } from '../scheduling/utils'

export interface TableViewProps {
  dayRows: DayRow[]
  weekOrders: Order[]
  machines: CuttingMachine[]
  products: Record<string, { kva?: number }>
  workDisplay: 'order' | 'carry' | 'segment' | 'unit'
  isFastest: boolean
  lateOrders: Set<string>
  showWireData: boolean
  mTotals: MachTotals[]
  totalQtyWeek: number
  bottleneckWall: number
  effectiveGlobalRates: CuttingRate[]
  effectiveGlobalTmcRates: CuttingRate[]
  useRoutingCr: boolean
  routingCrRates: CuttingRate[]
  routingNormalRates: CuttingRate[]
  wcConfig: Record<string, WCConfig>
  selectedCell: { machineId: number; date: string } | null
  setSelectedCell: (cell: { machineId: number; date: string } | null) => void
  handleToggle: (id: number, field: 'laser' | 'm4' | 'drill_8mm' | 'drill_22mm' | 'shift_enabled') => void
  getTimeDebugTitle: (m: CuttingMachine, kva: number, itemCode: string | undefined) => string
  useNearestKva: boolean
  fmtD: (d: Date) => string
  origId: (id: string) => string
}

export default function TableView({
  dayRows,
  weekOrders,
  machines,
  products,
  workDisplay,
  isFastest,
  lateOrders,
  showWireData,
  mTotals,
  totalQtyWeek,
  bottleneckWall,
  effectiveGlobalRates,
  effectiveGlobalTmcRates,
  useRoutingCr,
  routingCrRates,
  routingNormalRates,
  selectedCell,
  setSelectedCell,
  handleToggle,
  getTimeDebugTitle,
  useNearestKva,
  fmtD,
  origId,
}: TableViewProps) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', minWidth: 110 }}>วัน</th>
            {(() => {
              const utils = mTotals.map(t => t.capHrs > 0 ? (t.wallHrs - t.shift) / t.capHrs : 0)
              const bottleneckIdx = utils.reduce((bi, u, i) => u > utils[bi] ? i : bi, 0)
              return machines.map((m, i) => {
                const t = mTotals[i]
                const col = t.over ? 'var(--red)' : t.ot > 0 ? 'var(--amber)' : 'var(--green)'
                const typeInfo = machineTypeLabel(m)
                const util = Math.round(utils[i] * 100)
                const utilCol = util > 100 ? 'var(--red)' : util > 80 ? 'var(--amber)' : 'var(--green)'
                const isBottleneck = i === bottleneckIdx && utils[i] > 0
                const shiftOn = m.shift_enabled ?? true
                return (
                  <th key={m.id} style={{ textAlign: 'center', minWidth: 150, borderLeft: '1px solid var(--bord)' }}>
                    <div style={{ fontWeight: 700 }}>{mLabel(m)}</div>
                    <div style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, display: 'inline-block', marginTop: 2, background: `${typeInfo.color}22`, color: typeInfo.color, fontWeight: 600 }}>{typeInfo.label}</div>
                    <div style={{ fontSize: 9, color: 'var(--txt3)', fontWeight: 400, marginTop: 2 }}>{m.min_kva}–{m.max_kva >= 9999 ? '∞' : m.max_kva}kVA · {m.hrs_per_unit}h/ตัว</div>
                    <div style={{ fontSize: 9, color: col, fontWeight: 600, marginTop: 2 }}>{t.qty} ตัว · {t.wallHrs.toFixed(1)}h{t.ot > 0 ? ` · OT ${t.ot.toFixed(1)}h` : ''}{t.shift >= 0.05 ? ` · 🌙 ${t.shift.toFixed(1)}h` : ''}</div>
                    {t.capHrs > 0 && (
                      <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <div style={{ width: 60, height: 4, background: 'var(--bord)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(util, 100)}%`, height: '100%', background: utilCol, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: utilCol, fontWeight: 700 }}>{util}%</span>
                        {isBottleneck && <span title="เครื่องคอขวด (โหลดสูงสุด)" style={{ fontSize: 9 }}>🚨</span>}
                      </div>
                    )}
                    <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <button onClick={() => handleToggle(m.id, 'shift_enabled')}
                        title={shiftOn ? 'กะเปิด — คลิกเพื่อปิด' : 'กะปิด — คลิกเพื่อเปิด'}
                        style={{ fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', opacity: shiftOn ? 1 : 0.35, padding: '1px 3px', lineHeight: 1 }}>
                        {shiftOn ? '🌙' : '🌑'}
                      </button>
                      {t.over && !shiftOn && (
                        <span title="โหลดเกิน — เปิดกะเพื่อลด" style={{ fontSize: 9, color: 'var(--amber)', cursor: 'pointer' }}
                          onClick={() => handleToggle(m.id, 'shift_enabled')}>
                          💡 เปิดกะ
                        </span>
                      )}
                    </div>
                  </th>
                )
              })
            })()}
            <th style={{ textAlign: 'center', borderLeft: '2px solid var(--bord2)', whiteSpace: 'nowrap' }}>รวม/วัน</th>
          </tr>
        </thead>
        <tbody>
          {dayRows.map(row => {
            const { dStr, d, isSat, dayOrders, dayScheduledQty, dayCarryQty: _dayCarryQty2, unassigned: _dayUnassigned2, machineCells, dayFinish, dayCapHrs: _dayCapHrs, finishCol } = row
            const isToday = dStr === fmtISO(new Date())
            const dayTotalQty = dayScheduledQty
            return (
              <tr key={dStr} className={isToday ? styles.today : isSat ? styles.saturday : ''}>
                <td>
                  <div style={{ fontWeight: isToday ? 700 : 600, fontSize: 11, color: isToday ? 'var(--blue)' : isSat ? 'var(--txt2)' : 'var(--txt)' }}>
                    {DAY_TH[d.getDay()]} {fmtD(d)}{isToday ? ' ◀' : ''}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--txt3)' }}>{dayOrders.length} orders · {dayOrders.reduce((a, o) => a + o.qty, 0)} ตัว</div>
                  {dayOrders.filter(o => machines.every(m => !canMachineCut(m, o, products))).map((o, i) => (
                    <div key={i} style={{ fontSize: 8, color: 'var(--red)', fontFamily: 'var(--mono)', padding: '1px 4px', borderRadius: 4, background: 'rgba(224,90,78,.1)', marginTop: 2 }}>
                      ⚠ {(o.kva ?? products[o.product]?.kva ?? 0).toLocaleString()}kVA ×{o.qty}
                    </div>
                  ))}
                </td>
                {machineCells.map(({ m, machOff, sched, work, wall, capH }, _mi) => {
                  if (machOff) return (
                    <td key={m.id} style={{ verticalAlign: 'top', borderLeft: '1px solid var(--bord)', background: 'rgba(224,90,78,.04)', textAlign: 'center', color: 'var(--red)', fontSize: 9, fontWeight: 700, padding: 6 }}>
                      🔴 ปิด
                    </td>
                  )
                  const col = work.length === 0 ? 'var(--txt3)' : wall <= capH ? 'var(--green)' : wall <= capH * 2 ? 'var(--amber)' : 'var(--red)'
                  const isSelected = selectedCell?.machineId === m.id && selectedCell?.date === dStr
                  return (
                    <td key={m.id} style={{ verticalAlign: 'top', borderLeft: '1px solid var(--bord)', cursor: work.length > 0 ? 'pointer' : 'default', background: isSelected ? 'rgba(137,180,250,.08)' : undefined }}
                      onClick={() => work.length > 0 && setSelectedCell(isSelected ? null : { machineId: m.id, date: dStr })}>
                      {work.length === 0 ? <span className={styles.dim}>—</span> : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5, flexWrap: 'wrap' }}>
                            {sched?.hasCarryOver && <span style={{ fontSize: 9, color: 'var(--blue)', background: 'rgba(137,180,250,.12)', padding: '1px 4px', borderRadius: 4 }}>↩ ต่อ</span>}
                            <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: col, fontWeight: 700 }}>
                              {wall.toFixed(1)}h / {capH}h
                            </span>
                            {(sched?.otHrs ?? 0) >= 0.05 ? <span style={{ fontSize: 9, color: 'var(--amber)', fontWeight: 600 }}>+OT {sched!.otHrs.toFixed(1)}h</span> : ''}
                            {(sched?.shiftHrs ?? 0) >= 0.05 ? <span style={{ fontSize: 9, color: 'var(--blue)', fontWeight: 600 }}>🌙{sched!.shiftHrs.toFixed(1)}h</span> : ''}
                            {sched?.carriesForward && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 600 }}>→ พรุ่งนี้</span>}
                          </div>
                          {(workDisplay === 'order'
                            ? Object.values(work.filter(w => (w.hrsWorked >= 0.01 || !w.isComplete) && (!w.isCarryOver || w.isComplete)).reduce((acc, w) => {
                                const key = origId(w.order.id)
                                if (!acc[key]) { const orig = weekOrders.find(o => o.id === key); acc[key] = { ...w, order: orig ?? {...w.order, id: key}, hrsWorked: 0 } }
                                acc[key].hrsWorked   += w.hrsWorked
                                acc[key].isCarryOver  = acc[key].isCarryOver || w.isCarryOver
                                acc[key].isComplete   = w.isComplete
                                acc[key].carriesOver  = w.carriesOver
                                return acc
                              }, {} as Record<string, DayWork>)) as DayWork[]
                            : workDisplay === 'carry'
                            ? Object.values(work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete).reduce((acc, w) => {
                                const key = `${origId(w.order.id)}:${w.isCarryOver ? 'c' : 'n'}`
                                if (!acc[key]) { const orig = weekOrders.find(o => o.id === key.split(':')[0]); acc[key] = { ...w, order: orig ?? {...w.order, id: origId(w.order.id)}, hrsWorked: 0 } }
                                acc[key].hrsWorked   += w.hrsWorked
                                acc[key].isComplete   = w.isComplete
                                acc[key].carriesOver  = w.carriesOver
                                return acc
                              }, {} as Record<string, DayWork>)) as DayWork[]
                            : workDisplay === 'unit'
                              ? work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete).flatMap(w =>
                                  w.order.qty <= 1 ? [w] : isFastest ? [{...w, order: {...w.order, qty: 1}}] : Array.from({length: w.order.qty}, () => ({...w, hrsWorked: w.hrsWorked / w.order.qty, order: {...w.order, qty: 1}}))
                                )
                              : work.filter(w => w.hrsWorked >= 0.01 || !w.isComplete)
                          ).map((w, idx) => {
                            const kva = w.order.kva ?? products[w.order.product]?.kva ?? 0
                            const kvaCol = kva <= 400 ? 'var(--blue)' : kva <= 3500 ? 'var(--amber)' : 'var(--red)'
                            const { typeCode: tc } = decodeItemInfo(w.order.item_code ?? '')
                            const typeLabel = tc === '4' ? 'CR' : ['1','2','3'].includes(tc) ? 'Oil' : ''
                            const totalH = w.order.qty * getHrsForKva(m, kva, effectiveGlobalRates, w.order.item_code, effectiveGlobalTmcRates, useNearestKva, useRoutingCr)
                            const wireType = detectWireType(w.order.raw_mat)
                            const wireMatch = wireType === 'laser' ? m.laser : wireType === 'm4' ? m.m4 : true
                            const isCrOrder = w.order.item_code?.[1] === '4'
                            const routingPool = isCrOrder ? routingCrRates : routingNormalRates
                            const routingMiss = useRoutingCr && !routingPool.some(r => r.kva === kva)
                            const debugTitle  = getTimeDebugTitle(m, kva, w.order.item_code)
                            return (
                              <div key={idx} style={{ borderBottom: idx < work.length - 1 ? '1px solid var(--bord)' : 'none', paddingBottom: 4, marginBottom: 4 }}>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10 }}>
                                  {w.isCarryOver && <span style={{ color: 'var(--blue)', fontSize: 9 }}>↩</span>}
                                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt3)', fontSize: 9, minWidth: 80 }}>{w.order.sap_so || w.order.id.slice(-8)}</span>
                                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: kvaCol }}>{kva.toLocaleString()}kVA</span>
                                  <span style={{ color: 'var(--txt3)', fontSize: 9 }}>×{w.order.qty}</span>
                                  {typeLabel && <span style={{ fontSize: 9, padding: '0 3px', borderRadius: 3, background: tc === '4' ? 'rgba(250,179,135,.2)' : 'rgba(137,180,250,.12)', color: tc === '4' ? 'var(--amber)' : 'var(--blue)' }}>{typeLabel}</span>}
                                  {drillPrefers(m, w.order) && <span style={{ fontSize: 10 }}>🔩</span>}
                                  {lateOrders.has(origId(w.order.id)) && w.isComplete && <span title={`ส่งช้า — due: ${w.order.due_so}`} style={{ fontSize: 10 }}>🔴</span>}
                                  {useRoutingCr && (
                                    routingMiss
                                      ? <span title={debugTitle} style={{ fontSize: 9, cursor: 'help', color: 'var(--red)' }}>⚠</span>
                                      : <span title={debugTitle} style={{ fontSize: 9, cursor: 'help', color: 'var(--green)' }}>🏭</span>
                                  )}
                                  <span title={!useRoutingCr ? debugTitle : undefined} style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, cursor: useRoutingCr ? undefined : 'help', color: w.carriesOver ? 'var(--red)' : w.isComplete ? 'var(--green)' : 'var(--amber)' }}>
                                    {w.hrsWorked.toFixed(1)}h{totalH > 0 ? `/${totalH.toFixed(1)}h` : ''}{w.isComplete ? '✓' : '→'}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', gap: 5, fontSize: 9, color: 'var(--txt3)', marginTop: 2, flexWrap: 'wrap' }}>
                                  {w.order.customer && <span style={{ color: 'var(--txt2)', fontWeight: 600 }}>{w.order.customer}</span>}
                                  {showWireData && w.order.raw_mat && w.order.raw_mat !== '—' && (
                                    <span style={{ color: wireType === 'any' ? 'var(--txt3)' : wireMatch ? 'var(--green)' : 'var(--red)', fontWeight: wireType !== 'any' ? 600 : 400 }}>
                                      📐 {w.order.raw_mat}{wireType !== 'any' ? (wireMatch ? ' OK' : ' NG') : ''}
                                    </span>
                                  )}
                                  {showWireData && w.order.lv && w.order.lv !== '—' && <span>LV:<span style={{ fontFamily: 'var(--mono)', color: 'var(--blue)', marginLeft: 2 }}>{w.order.lv}</span></span>}
                                  {showWireData && w.order.hv && w.order.hv !== '—' && <span>HV:<span style={{ fontFamily: 'var(--mono)', color: 'var(--amber)', marginLeft: 2 }}>{w.order.hv}</span></span>}
                                </div>
                              </div>
                            )
                          })}
                          {isSelected && (
                            <div style={{ marginTop: 4, borderTop: '1px solid rgba(137,180,250,.3)', paddingTop: 4, fontSize: 8, color: 'var(--txt3)' }}>
                              {work.filter(w => w.order.comment && w.order.comment !== '-').map((w, idx) => (
                                <div key={idx} style={{ fontStyle: 'italic' }}>{w.order.sap_so}: {w.order.comment}</div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                  )
                })}
                <td style={{ textAlign: 'center', borderLeft: '2px solid var(--bord2)', verticalAlign: 'middle' }}>
                  {dayTotalQty > 0 ? (
                    <>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12 }}>{dayTotalQty} ตัว</div>
                      <div style={{ fontSize: 9, color: finishCol, fontWeight: 600 }}>เสร็จใน {dayFinish.toFixed(1)}h</div>
                    </>
                  ) : <span className={styles.dim}>—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className={styles.footerRow}>
            <td style={{ fontWeight: 700, color: 'var(--txt2)', fontSize: 10 }}>รวมสัปดาห์</td>
            {machines.map((m, i) => {
              const t = mTotals[i]
              const col = t.over ? 'var(--red)' : t.ot > 0 ? 'var(--amber)' : 'var(--green)'
              const pct = Math.min(100, Math.round(t.wallHrs / t.regCap * 100))
              return (
                <td key={m.id} style={{ textAlign: 'center', borderLeft: '1px solid var(--bord)' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: col }}>{t.qty} ตัว</div>
                  <div style={{ fontSize: 9, color: 'var(--txt3)' }}>{t.wallHrs.toFixed(1)}h / {t.regCap}h</div>
                  <div style={{ height: 4, background: 'var(--bg4)', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 3 }} />
                  </div>
                </td>
              )
            })}
            <td style={{ textAlign: 'center', borderLeft: '2px solid var(--bord2)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13 }}>{totalQtyWeek} ตัว</div>
              <div style={{ fontSize: 9, color: 'var(--txt3)' }}>{bottleneckWall.toFixed(1)}h</div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
