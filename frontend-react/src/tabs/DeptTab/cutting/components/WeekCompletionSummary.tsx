import React from 'react'
import type { Order } from '../../../types'
import { fmtISO, origId } from '../scheduling/utils'

interface Props {
  weekDoneOrders: Order[]
  weekCarryOrders: Order[]
  weekUnscheduled: Order[]
  lateOrders: Set<string>
  products: Record<string, { kva: number }>
  days: Date[]
  setWeekOffset: React.Dispatch<React.SetStateAction<number>>
  setIncludePrevCarry: React.Dispatch<React.SetStateAction<boolean>>
  carryOverOrders: Set<string>
  toggleCarryOver: (id: string) => void
}

export default function WeekCompletionSummary({
  weekDoneOrders, weekCarryOrders, weekUnscheduled, lateOrders, products, days,
  setWeekOffset, setIncludePrevCarry, carryOverOrders, toggleCarryOver,
}: Props) {
  const today = fmtISO(new Date())
  const weekEndStr = days.length > 0 ? fmtISO(days[days.length - 1]) : ''
  const doneQty    = weekDoneOrders.reduce((s, o) => s + o.qty, 0)
  const carryQty   = weekCarryOrders.reduce((s, o) => s + o.qty, 0)
  const unschedQty = weekUnscheduled.reduce((s, o) => s + o.qty, 0)

  const selectedCarryCount = [...carryOverOrders].filter(id =>
    weekCarryOrders.some(o => o.id === id) || weekUnscheduled.some(o => o.id === id)
  ).length

  const chip = (label: string, count: number, qty: number, col: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg3)', borderRadius: 8, border: `1px solid ${col}22` }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12, color: col }}>{count} orders</span>
      <span style={{ fontSize: 10, color: 'var(--txt3)' }}>·</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: col }}>{qty} ตัว</span>
    </div>
  )

  const carryBtn = (o: Order) => {
    const flagged = carryOverOrders.has(o.id)
    return (
      <button
        key={`carry-${o.id}`}
        onClick={() => toggleCarryOver(o.id)}
        title={flagged ? 'ยกเลิก carry ไปสัปดาห์หน้า' : 'Carry ไปสัปดาห์หน้า'}
        style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 5, cursor: 'pointer',
          border: `1px solid ${flagged ? 'var(--amber)' : 'var(--bord2)'}`,
          background: flagged ? 'rgba(249,226,175,.2)' : 'var(--bg3)',
          color: flagged ? 'var(--amber)' : 'var(--txt3)',
          fontWeight: flagged ? 700 : 400,
        }}>
        ➡
      </button>
    )
  }

  const orderRow = (o: Order, showCarry = false) => {
    const kva = o.kva ?? products[o.product]?.kva ?? 0
    const due = o.due_so
    const dueCol = !due ? 'var(--txt3)' : due < today ? 'var(--red)' : due <= weekEndStr ? 'var(--amber)' : 'var(--green)'
    const isLate = lateOrders.has(origId(o.id))
    const flagged = carryOverOrders.has(o.id)
    return (
      <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, fontSize: 11, whiteSpace: 'nowrap',
        background: flagged ? 'rgba(249,226,175,.08)' : isLate ? 'rgba(224,90,78,.08)' : 'var(--bg4)',
        border: flagged ? '1px solid rgba(249,226,175,.35)' : isLate ? '1px solid rgba(224,90,78,.3)' : '1px solid transparent' }}>
        {isLate && <span style={{ fontSize: 10 }}>🔴</span>}
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--txt1)' }}>{o.sap_so ?? o.id.slice(-8)}</span>
        <span style={{ color: 'var(--txt3)' }}>{kva.toLocaleString()}kVA</span>
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--txt2)' }}>×{o.qty}</span>
        {o.customer && <span style={{ color: 'var(--txt3)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.customer}</span>}
        {due && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: dueCol, fontWeight: due < today ? 700 : 400 }}>due {due}</span>}
        {showCarry && carryBtn(o)}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {weekDoneOrders.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {chip('✅ เสร็จสัปดาห์นี้', weekDoneOrders.length, doneQty, 'var(--green)')}
          {weekDoneOrders.map(o => orderRow(o, false))}
        </div>
      )}
      {weekCarryOrders.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {chip('⏭ ค้างสัปดาห์หน้า', weekCarryOrders.length, carryQty, 'var(--amber)')}
          <button
            title="ไปสัปดาห์หน้าพร้อมนำงานค้างเข้าแผน"
            onClick={() => { setWeekOffset(w => w + 1); setIncludePrevCarry(true) }}
            style={{ fontSize: 11, padding: '3px 12px', borderRadius: 8, border: '1px solid rgba(249,226,175,.5)', background: 'rgba(249,226,175,.15)', color: 'var(--amber)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            → ดูสัปดาห์หน้า + รวมงานค้าง
          </button>
          {selectedCarryCount > 0 && (
            <span style={{ fontSize: 10, color: 'var(--amber)', background: 'rgba(249,226,175,.15)', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
              ➡ {selectedCarryCount} flagged
            </span>
          )}
          {weekCarryOrders.map(o => orderRow(o, true))}
        </div>
      )}
      {weekUnscheduled.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {chip('❌ ไม่ได้ตั้งแผน', weekUnscheduled.length, unschedQty, 'var(--red)')}
          {weekUnscheduled.map(o => orderRow(o, true))}
        </div>
      )}
    </div>
  )
}
